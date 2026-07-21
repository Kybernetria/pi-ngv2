export type TransportKind = "matrix" | "signal";

export interface ChatAddress {
  transport: TransportKind;
  roomId?: string;
  threadId?: string;
}

export interface ChatEvent {
  transport: TransportKind;
  eventId: string;
  senderId: string;
  roomId?: string;
  threadId?: string;
  threaded?: boolean;
  text: string;
  timestamp: number;
  encrypted: boolean;
  trusted: boolean;
  historical?: boolean;
}

export interface OutboundMessage {
  text: string;
  requestId?: string;
  notice?: boolean;
}

export interface DeliveryResult {
  accepted: boolean;
  eventId?: string;
  transactionId?: string;
  retryAfterMs?: number;
}

export interface TransportHealth {
  status: "disabled" | "starting" | "healthy" | "degraded" | "failed";
  connected: boolean;
  encrypted?: boolean;
  detail?: string;
  checkedAt: number;
}

export interface ChatTransport {
  readonly kind: TransportKind;
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (event: ChatEvent) => Promise<void>): () => void;
  send(address: ChatAddress, message: OutboundMessage): Promise<DeliveryResult>;
  health(): TransportHealth;
}

export class DisabledTransport implements ChatTransport {
  readonly kind: TransportKind;
  constructor(kind: TransportKind) { this.kind = kind; }
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  onEvent(): () => void { return () => undefined; }
  async send(): Promise<DeliveryResult> { throw new Error(`${this.kind} transport is disabled`); }
  health(): TransportHealth { return { status: "disabled", connected: false, checkedAt: Date.now() }; }
}
