export type RequestStatus = "queued" | "accepted" | "running" | "completed" | "failed" | "cancellation_requested" | "cancelled" | "orphaned" | "expired";
export type ConversationStatus = "active" | "archived" | "expired";
export type DeliveryStatus = "pending" | "delivering" | "delivered" | "dead_letter";

export interface Conversation {
  conversationId: string; transport: "matrix" | "signal"; roomId: string; threadRootEventId: string; agentId: string; piSessionId?: string; status: ConversationStatus; createdAt: number; updatedAt: number;
}
export interface RequestRecord {
  requestId: string; conversationId: string; sourceEventId: string; status: RequestStatus; createdAt: number; startedAt?: number; completedAt?: number; errorCode?: string;
}
export interface OutboundDelivery {
  deliveryId: string; requestId: string; transport: "matrix" | "signal"; destination: string; threadId?: string; transactionId: string; status: DeliveryStatus; attempts: number; nextAttemptAt: number; encryptedPayload: string;
}
export interface SessionBinding { piSessionId: string; agentId: string; conversationId: string; connectionStatus: "connected" | "disconnected" | "expired"; lastSeenAt: number; }

export interface StateStore {
  migrate(): void;
  close(): void;
  createConversation(input: Omit<Conversation, "createdAt" | "updatedAt">): Conversation;
  getConversation(id: string): Conversation | undefined;
  findConversation(transport: string, roomId: string, threadRootEventId: string): Conversation | undefined;
  updateConversation(id: string, update: { piSessionId?: string | null; status?: ConversationStatus; agentId?: string }): void;
  listConversations(status?: ConversationStatus): Conversation[];
  acceptInbound(input: { transport: "matrix" | "signal"; eventId: string; conversationId: string; requestId: string; now?: number }): { accepted: boolean; request?: RequestRecord };
  getRequest(id: string): RequestRecord | undefined;
  listRequests(status?: RequestStatus, conversationId?: string): RequestRecord[];
  transitionRequest(id: string, from: RequestStatus | RequestStatus[], to: RequestStatus, errorCode?: string): boolean;
  markUncertainRequestsOrphaned(): number;
  enqueueDelivery(input: Omit<OutboundDelivery, "status" | "attempts" | "nextAttemptAt"> & { nextAttemptAt?: number }): OutboundDelivery;
  completeRequestAndEnqueue(requestId: string, delivery: Omit<OutboundDelivery, "status" | "attempts" | "nextAttemptAt"> & { nextAttemptAt?: number }): boolean;
  claimDueDeliveries(now: number, limit: number): OutboundDelivery[];
  completeDelivery(id: string): void;
  retryDelivery(id: string, attempts: number, nextAttemptAt: number): void;
  deadLetterDelivery(id: string): void;
  listDeliveries(status?: DeliveryStatus): OutboundDelivery[];
  bindSession(binding: SessionBinding): void;
  updateSessionStatus(piSessionId: string, status: SessionBinding["connectionStatus"]): void;
  listSessions(): SessionBinding[];
  hasInbound(transport: string, eventId: string): boolean;
  recordInboundDecision(transport: "matrix" | "signal", eventId: string, now?: number): boolean;
}
