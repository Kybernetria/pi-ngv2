import type { ChatEvent, ChatTransport, ChatAddress, DeliveryResult, OutboundMessage, TransportHealth } from "./transport.ts";
import { SignalRestClient } from "./signal-rest-client.ts";

export interface SignalTransportOptions { restUrl: string; account: string; mode: "notifications" | "legacy-command"; pollIntervalMs: number; client?: SignalRestClient; }
export class SignalTransport implements ChatTransport {
  readonly kind = "signal" as const;
  private readonly client: SignalRestClient;
  private readonly handlers = new Set<(event: ChatEvent) => Promise<void>>();
  private readonly outboundIds=new Set<string>();private timer?: ReturnType<typeof setTimeout>; private running = false; private polling = false; private state: TransportHealth = { status: "starting", connected: false, checkedAt: Date.now() };
  constructor(private readonly options: SignalTransportOptions) { this.client = options.client ?? new SignalRestClient(options); }
  async start(): Promise<void> { if (this.running) return; this.running = true; this.schedule(0); }
  async stop(): Promise<void> { this.running = false; if (this.timer) clearTimeout(this.timer); while (this.polling) await new Promise((r) => setTimeout(r, 10)); }
  onEvent(handler: (event: ChatEvent) => Promise<void>): () => void { this.handlers.add(handler); return () => this.handlers.delete(handler); }
  async send(_address: ChatAddress, message: OutboundMessage): Promise<DeliveryResult> { const result = await this.client.sendNoteToSelf(message.text);if(result.timestamp){this.outboundIds.add(result.timestamp);while(this.outboundIds.size>2000)this.outboundIds.delete(this.outboundIds.values().next().value!);} return { accepted: true, ...(result.timestamp ? { eventId: result.timestamp, transactionId: result.timestamp } : {}) }; }
  health(): TransportHealth { return { ...this.state }; }
  private schedule(delay: number): void { if (!this.running) return; this.timer = setTimeout(() => void this.poll(), delay); this.timer.unref(); }
  private async poll(): Promise<void> {
    if (!this.running || this.polling) return; this.polling = true;
    try {
      const events = await this.client.receiveNoteToSelf(1); this.state = { status: "healthy", connected: true, checkedAt: Date.now() };
      if (this.options.mode === "legacy-command") for (const event of events) if(!this.outboundIds.delete(event.id)) for (const handler of this.handlers) await handler({ transport: "signal", eventId: event.id, senderId: event.source, text: event.text, timestamp: event.timestamp, encrypted: true, trusted: true });
    } catch (error) { this.state = { status: "degraded", connected: false, detail: error instanceof Error ? error.message : String(error), checkedAt: Date.now() }; }
    finally { this.polling = false; this.schedule(this.options.pollIntervalMs); }
  }
}
