export interface SignalClientOptions { restUrl: string; account: string; fetchImpl?: typeof fetch; httpTimeoutMs?:number; }
export interface SignalEnvelope { id: string; source: string; text: string; timestamp: number; }
const MAX_RESPONSE_BYTES=2_000_000;
export class SignalRestClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly options: SignalClientOptions) { this.fetchImpl = options.fetchImpl ?? fetch; }
  async sendNoteToSelf(message: string): Promise<{ timestamp?: string }> {
    const body=await this.fetchJson(`${trim(this.options.restUrl)}/v2/send`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({number:this.options.account,recipients:[this.options.account],message})},this.options.httpTimeoutMs??30_000);
    return { timestamp: stringValue(body, "timestamp") ?? stringValue(body, "sendTimestamp") };
  }
  async receiveNoteToSelf(timeoutSeconds = 1): Promise<SignalEnvelope[]> {
    const url = new URL(`${trim(this.options.restUrl)}/v1/receive/${encodeURIComponent(this.options.account)}`);
    url.searchParams.set("timeout", String(timeoutSeconds)); url.searchParams.set("max_messages", "100"); url.searchParams.set("ignore_attachments", "true");
    const body=await this.fetchJson(url,{},Math.max(this.options.httpTimeoutMs??30_000,(timeoutSeconds+5)*1000));
    const items = Array.isArray(body) ? body : record(body)?.envelopes;
    return (Array.isArray(items) ? items.slice(0,100) : [body]).flatMap((value) => normalize(value, this.options.account) ?? []);
  }
  private async fetchJson(url:string|URL,init:RequestInit,timeoutMs:number):Promise<unknown>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await this.fetchImpl(url,{...init,signal:controller.signal});const declared=Number(response.headers.get("content-length")??0);if(declared>MAX_RESPONSE_BYTES)throw new Error("Signal response exceeds size limit");const text=await readLimited(response,MAX_RESPONSE_BYTES,controller);if(!response.ok)throw new Error(`Signal REST API returned ${response.status}: ${text.slice(0,200)}`);return text?JSON.parse(text):undefined;}catch(error){if(controller.signal.aborted)throw new Error("Signal REST API timeout");throw error;}finally{clearTimeout(timer);}}
}
function normalize(input: unknown, account: string): SignalEnvelope | undefined {
  const wrapper = record(input); const envelope = record(wrapper?.envelope) ?? wrapper; if (!envelope) return;
  const sync = record(envelope.syncMessage); const data = record(sync?.sentMessage) ?? record(envelope.dataMessage); if (!data) return;
  const source = stringValue(envelope, "sourceNumber") ?? stringValue(envelope, "source") ?? (sync ? account : undefined);
  const destination = stringValue(data, "destinationNumber") ?? stringValue(envelope, "destinationNumber");
  if (source !== account || (destination && destination !== account) || data.groupInfo || data.groupV2) return;
  const text = stringValue(data, "message"); if (!text?.trim()) return;
  const rawTimestamp = data.timestamp ?? envelope.timestamp; const timestamp = Number(rawTimestamp ?? Date.now());
  return { id: String(data.id ?? envelope.id ?? rawTimestamp ?? `${source}:${timestamp}`), source, text, timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() };
}
async function readLimited(response:Response,maximum:number,controller:AbortController){if(!response.body)return"";const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const{done,value}=await reader.read();if(done)break;if(value){size+=value.byteLength;if(size>maximum){controller.abort();throw new Error("Signal response exceeds size limit");}chunks.push(value);}}}finally{reader.releaseLock();}return Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))).toString("utf8");}
function trim(value: string): string { return value.replace(/\/+$/, ""); }
function record(value: unknown): Record<string, any> | undefined { return value && typeof value === "object" ? value as Record<string, any> : undefined; }
function stringValue(value: unknown, key: string): string | undefined { const child = record(value)?.[key]; return typeof child === "string" ? child : typeof child === "number" ? String(child) : undefined; }
