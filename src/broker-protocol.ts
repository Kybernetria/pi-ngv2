import { z } from "zod";
export const BROKER_PROTOCOL_VERSION = 2;
export const BROKER_CAPABILITIES = ["session.register", "session.update", "prompt.submit", "prompt.cancel", "notification.publish", "delivery.ack"] as const;
export type BrokerOperation = "hello" | "hello.ack" | "health.query" | "health.result" | "session.register" | "session.update" | "session.unregister" | "session.list" | "session.list.result" | "prompt.submit" | "prompt.accepted" | "prompt.started" | "prompt.completed" | "prompt.failed" | "prompt.cancel" | "notification.publish" | "delivery.ack" | "error";
export interface BrokerEnvelope<T = unknown> { protocolVersion: 2; messageId: string; operation: BrokerOperation; correlationId?: string; payload: T; }
export interface BrokerSession { sessionId: string; agentId?: string; sessionFile?: string; name?: string; cwd: string; pid: number; model?: string; status: "idle" | "working"; connectedAt: number; lastSeenAt: number; }
export interface PromptSubmit { requestId: string; conversationId: string; agentId: string; sessionId?: string; message: string; source: { transport: "matrix" | "signal"; eventId: string }; }
export interface PromptResult { requestId: string; sessionId: string; message?: string; errorCode?: string; }

const operation = z.enum(["hello","hello.ack","health.query","health.result","session.register","session.update","session.unregister","session.list","session.list.result","prompt.submit","prompt.accepted","prompt.started","prompt.completed","prompt.failed","prompt.cancel","notification.publish","delivery.ack","error"]);
const base = z.object({ protocolVersion: z.literal(2), messageId: z.string().min(1).max(200), operation, correlationId: z.string().min(1).max(200).optional(), payload: z.unknown() });
export const sessionRegistrationSchema = z.object({ sessionId:z.string().min(1).max(200),agentId:z.string().max(64).optional(),sessionFile:z.string().max(4096).optional(),name:z.string().max(200).optional(),cwd:z.string().min(1).max(4096),pid:z.number().int().positive(),model:z.string().max(200).optional(),status:z.enum(["idle","working"]) });
export const promptSubmitSchema = z.object({requestId:z.string().min(1).max(200),conversationId:z.string().min(1).max(200),agentId:z.string().min(1).max(64),sessionId:z.string().min(1).max(200).optional(),message:z.string().min(1).max(500_000),source:z.object({transport:z.enum(["matrix","signal"]),eventId:z.string().min(1).max(500)})});
export function parseEnvelope(value: unknown): BrokerEnvelope { return base.parse(value) as BrokerEnvelope; }
export function envelope<T>(operation: BrokerOperation, payload: T, correlationId?: string): BrokerEnvelope<T> { return {protocolVersion:2,messageId:crypto.randomUUID(),operation,...(correlationId?{correlationId}:{}),payload}; }
export function validatePayload(message: BrokerEnvelope): unknown {
  switch(message.operation){
    case "hello": return z.object({capabilities:z.array(z.string()).max(100),clientName:z.string().max(100).optional(),authToken:z.string().min(32).max(500)}).parse(message.payload);
    case "session.register": return sessionRegistrationSchema.parse(message.payload);
    case "session.update": return sessionRegistrationSchema.partial().omit({sessionId:true}).parse(message.payload);
    case "prompt.submit": return promptSubmitSchema.parse(message.payload);
    case "prompt.started": case "prompt.completed": case "prompt.failed": return z.object({requestId:z.string(),sessionId:z.string(),message:z.string().max(500_000).optional(),errorCode:z.string().max(100).optional()}).parse(message.payload);
    case "prompt.cancel": return z.object({requestId:z.string().min(1)}).parse(message.payload);
    case "notification.publish": return z.object({message:z.string().min(1).max(100_000),urgency:z.enum(["low","normal","high"]).default("normal"),compatibilitySignal:z.boolean().optional()}).parse(message.payload);
    default:return message.payload;
  }
}
