export interface RegisteredSession{sessionId:string;agentId:string;conversationId:string;type:"attached"|"managed";status:"connected"|"working"|"disconnected"|"expired";lastSeenAt:number;}
export class SessionRegistry{
 private readonly sessions=new Map<string,RegisteredSession>();
 register(value:RegisteredSession):void{const live=this.sessions.get(value.sessionId);if(live&&live.status!=="disconnected"&&live.conversationId!==value.conversationId)throw new Error("Conflicting live session registration");this.sessions.set(value.sessionId,{...value});}
 get(id:string):RegisteredSession|undefined{const value=this.sessions.get(id);return value?{...value}:undefined;}
 list():RegisteredSession[]{return[...this.sessions.values()].map(v=>({...v}));}
 update(id:string,status:RegisteredSession["status"]):void{const value=this.sessions.get(id);if(value)this.sessions.set(id,{...value,status,lastSeenAt:Date.now()});}
 remove(id:string):void{this.sessions.delete(id);}
}
