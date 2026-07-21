import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { Conversation, ConversationStatus, DeliveryStatus, OutboundDelivery, RequestRecord, RequestStatus, SessionBinding, StateStore } from "./state-store.ts";
import { ensurePrivateDirectory } from "./paths.ts";

const migrationPath = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "001_initial.sql");
export class SqliteStateStore implements StateStore {
  readonly db: DatabaseSync;
  constructor(path: string) { ensurePrivateDirectory(dirname(path)); this.db = new DatabaseSync(path); this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;"); }
  migrate(): void { this.db.exec(readFileSync(migrationPath, "utf8")); this.db.exec("UPDATE outbound_deliveries SET status='pending' WHERE status='delivering'; PRAGMA user_version=1"); }
  close(): void { this.db.close(); }
  createConversation(input: Omit<Conversation, "createdAt" | "updatedAt">): Conversation {
    const now = Date.now();
    this.db.prepare(`INSERT INTO conversations(conversation_id,transport,room_id,thread_root_event_id,agent_id,pi_session_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(input.conversationId, input.transport, input.roomId, input.threadRootEventId, input.agentId, input.piSessionId ?? null, input.status, now, now);
    return { ...input, createdAt: now, updatedAt: now };
  }
  getConversation(id: string): Conversation | undefined { return conversation(this.db.prepare("SELECT * FROM conversations WHERE conversation_id=?").get(id)); }
  findConversation(transport: string, roomId: string, root: string): Conversation | undefined { return conversation(this.db.prepare("SELECT * FROM conversations WHERE transport=? AND room_id=? AND thread_root_event_id=?").get(transport, roomId, root)); }
  updateConversation(id: string, update: { piSessionId?: string | null; status?: ConversationStatus; agentId?: string }): void {
    const current = this.getConversation(id); if (!current) throw new Error("unknown conversation");
    const piSessionId = Object.hasOwn(update, "piSessionId") ? update.piSessionId ?? null : current.piSessionId ?? null;
    this.db.prepare("UPDATE conversations SET pi_session_id=?,status=?,agent_id=?,updated_at=? WHERE conversation_id=?").run(piSessionId, update.status ?? current.status, update.agentId ?? current.agentId, Date.now(), id);
  }
  listConversations(status?: ConversationStatus): Conversation[] { const rows = status ? this.db.prepare("SELECT * FROM conversations WHERE status=? ORDER BY updated_at DESC").all(status) : this.db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC").all(); return rows.map(conversation).filter(Boolean) as Conversation[]; }
  acceptInbound(input: { transport: "matrix" | "signal"; eventId: string; conversationId: string; requestId: string; now?: number }): { accepted: boolean; request?: RequestRecord } {
    const now = input.now ?? Date.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.hasInbound(input.transport, input.eventId)) { this.db.exec("ROLLBACK"); return { accepted: false }; }
      this.db.prepare("INSERT INTO requests(request_id,conversation_id,source_event_id,status,created_at) VALUES(?,?,?,?,?)").run(input.requestId, input.conversationId, input.eventId, "queued", now);
      this.db.prepare("INSERT INTO inbound_events(transport,event_id,processed_at,request_id) VALUES(?,?,?,?)").run(input.transport, input.eventId, now, input.requestId);
      this.db.exec("COMMIT"); return { accepted: true, request: { requestId: input.requestId, conversationId: input.conversationId, sourceEventId: input.eventId, status: "queued", createdAt: now } };
    } catch (error) { try { this.db.exec("ROLLBACK"); } catch {} throw error; }
  }
  hasInbound(transport: string, eventId: string): boolean { return Boolean(this.db.prepare("SELECT 1 AS found FROM inbound_events WHERE transport=? AND event_id=?").get(transport, eventId)); }
  recordInboundDecision(transport: "matrix" | "signal", eventId: string, now=Date.now()): boolean { const result=this.db.prepare("INSERT OR IGNORE INTO inbound_events(transport,event_id,processed_at,request_id) VALUES(?,?,?,NULL)").run(transport,eventId,now);return Number(result.changes)===1; }
  getRequest(id: string): RequestRecord | undefined { return request(this.db.prepare("SELECT * FROM requests WHERE request_id=?").get(id)); }
  listRequests(status?: RequestStatus, conversationId?: string): RequestRecord[] {
    let rows: Record<string, unknown>[];
    if (status && conversationId) rows = this.db.prepare("SELECT * FROM requests WHERE status=? AND conversation_id=? ORDER BY created_at").all(status, conversationId) as Record<string, unknown>[];
    else if (status) rows = this.db.prepare("SELECT * FROM requests WHERE status=? ORDER BY created_at").all(status) as Record<string, unknown>[];
    else if (conversationId) rows = this.db.prepare("SELECT * FROM requests WHERE conversation_id=? ORDER BY created_at").all(conversationId) as Record<string, unknown>[];
    else rows = this.db.prepare("SELECT * FROM requests ORDER BY created_at").all() as Record<string, unknown>[];
    return rows.map(request).filter(Boolean) as RequestRecord[];
  }
  transitionRequest(id: string, from: RequestStatus | RequestStatus[], to: RequestStatus, errorCode?: string): boolean {
    const allowed = Array.isArray(from) ? from : [from]; if (!allowed.length) return false;
    const started = to === "running" ? Date.now() : null; const completed = ["completed", "failed", "cancelled", "orphaned", "expired"].includes(to) ? Date.now() : null;
    const marks = allowed.map(() => "?").join(",");
    const result = this.db.prepare(`UPDATE requests SET status=?,started_at=COALESCE(started_at,?),completed_at=COALESCE(completed_at,?),error_code=? WHERE request_id=? AND status IN (${marks})`).run(to, started, completed, errorCode ?? null, id, ...allowed);
    return Number(result.changes) === 1;
  }
  markUncertainRequestsOrphaned(): number { const result = this.db.prepare("UPDATE requests SET status='orphaned',completed_at=?,error_code='daemon_restart' WHERE status IN ('queued','accepted','running','cancellation_requested')").run(Date.now()); return Number(result.changes); }
  enqueueDelivery(input: Omit<OutboundDelivery, "status" | "attempts" | "nextAttemptAt"> & { nextAttemptAt?: number }): OutboundDelivery {
    const item: OutboundDelivery = { ...input, status: "pending", attempts: 0, nextAttemptAt: input.nextAttemptAt ?? Date.now() };
    this.db.prepare("INSERT OR IGNORE INTO outbound_deliveries(delivery_id,request_id,transport,destination,thread_id,transaction_id,status,attempts,next_attempt_at,encrypted_payload) VALUES(?,?,?,?,?,?,?,?,?,?)").run(item.deliveryId, item.requestId, item.transport, item.destination, item.threadId ?? null, item.transactionId, item.status, item.attempts, item.nextAttemptAt, item.encryptedPayload);
    return item;
  }
  completeRequestAndEnqueue(requestId: string, input: Omit<OutboundDelivery, "status" | "attempts" | "nextAttemptAt"> & { nextAttemptAt?: number }): boolean {
    const item: OutboundDelivery={...input,status:"pending",attempts:0,nextAttemptAt:input.nextAttemptAt??Date.now()};this.db.exec("BEGIN IMMEDIATE");try{const changed=this.db.prepare("UPDATE requests SET status='completed',completed_at=? WHERE request_id=? AND status='running'").run(Date.now(),requestId);if(Number(changed.changes)!==1){this.db.exec("ROLLBACK");return false;}this.db.prepare("INSERT INTO outbound_deliveries(delivery_id,request_id,transport,destination,thread_id,transaction_id,status,attempts,next_attempt_at,encrypted_payload) VALUES(?,?,?,?,?,?,?,?,?,?)").run(item.deliveryId,item.requestId,item.transport,item.destination,item.threadId??null,item.transactionId,item.status,item.attempts,item.nextAttemptAt,item.encryptedPayload);this.db.exec("COMMIT");return true;}catch(error){try{this.db.exec("ROLLBACK");}catch{}throw error;}
  }
  claimDueDeliveries(now: number, limit: number): OutboundDelivery[] {
    this.db.exec("BEGIN IMMEDIATE");
    try { const rows = this.db.prepare("SELECT * FROM outbound_deliveries WHERE status='pending' AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT ?").all(now, limit); for (const row of rows) this.db.prepare("UPDATE outbound_deliveries SET status='delivering' WHERE delivery_id=? AND status='pending'").run((row as any).delivery_id); this.db.exec("COMMIT"); return rows.map(delivery); }
    catch (error) { try { this.db.exec("ROLLBACK"); } catch {} throw error; }
  }
  completeDelivery(id: string): void { this.db.prepare("UPDATE outbound_deliveries SET status='delivered' WHERE delivery_id=?").run(id); }
  retryDelivery(id: string, attempts: number, next: number): void { this.db.prepare("UPDATE outbound_deliveries SET status='pending',attempts=?,next_attempt_at=? WHERE delivery_id=?").run(attempts, next, id); }
  deadLetterDelivery(id: string): void { this.db.prepare("UPDATE outbound_deliveries SET status='dead_letter' WHERE delivery_id=?").run(id); }
  listDeliveries(status?: DeliveryStatus): OutboundDelivery[] { const rows = status ? this.db.prepare("SELECT * FROM outbound_deliveries WHERE status=? ORDER BY next_attempt_at").all(status) : this.db.prepare("SELECT * FROM outbound_deliveries ORDER BY next_attempt_at").all(); return rows.map(delivery); }
  bindSession(value: SessionBinding): void { this.db.prepare("INSERT INTO session_bindings(pi_session_id,agent_id,conversation_id,connection_status,last_seen_at) VALUES(?,?,?,?,?) ON CONFLICT(pi_session_id) DO UPDATE SET agent_id=excluded.agent_id,conversation_id=excluded.conversation_id,connection_status=excluded.connection_status,last_seen_at=excluded.last_seen_at").run(value.piSessionId,value.agentId,value.conversationId,value.connectionStatus,value.lastSeenAt); }
  updateSessionStatus(id: string, status: SessionBinding["connectionStatus"]): void { this.db.prepare("UPDATE session_bindings SET connection_status=?,last_seen_at=? WHERE pi_session_id=?").run(status, Date.now(), id); }
  listSessions(): SessionBinding[] { return this.db.prepare("SELECT * FROM session_bindings ORDER BY last_seen_at DESC").all().map((r: any) => ({ piSessionId:r.pi_session_id,agentId:r.agent_id,conversationId:r.conversation_id,connectionStatus:r.connection_status,lastSeenAt:r.last_seen_at })); }
}
function conversation(row: unknown): Conversation | undefined { const r = row as any; return r ? { conversationId:r.conversation_id,transport:r.transport,roomId:r.room_id,threadRootEventId:r.thread_root_event_id,agentId:r.agent_id,...(r.pi_session_id ? {piSessionId:r.pi_session_id}:{}),status:r.status,createdAt:r.created_at,updatedAt:r.updated_at } : undefined; }
function request(row: unknown): RequestRecord | undefined { const r=row as any; return r ? {requestId:r.request_id,conversationId:r.conversation_id,sourceEventId:r.source_event_id,status:r.status,createdAt:r.created_at,...(r.started_at?{startedAt:r.started_at}:{}),...(r.completed_at?{completedAt:r.completed_at}:{}),...(r.error_code?{errorCode:r.error_code}:{})}:undefined; }
function delivery(row: any): OutboundDelivery { return {deliveryId:row.delivery_id,requestId:row.request_id,transport:row.transport,destination:row.destination,...(row.thread_id?{threadId:row.thread_id}:{}),transactionId:row.transaction_id,status:row.status,attempts:row.attempts,nextAttemptAt:row.next_attempt_at,encryptedPayload:row.encrypted_payload}; }
