import type { BrokerServer } from "./broker-server.ts";
import { AgentProfiles } from "./agent-profiles.ts";
import { ManagedSessionRouter } from "./managed-session-router.ts";
import type { Conversation } from "./state-store.ts";
export class AgentManager{
 private readonly managed=new ManagedSessionRouter();private readonly attachedResults=new Map<string,{resolve:(v:string)=>void;reject:(e:Error)=>void}>();
 constructor(private readonly profiles:AgentProfiles,private readonly broker:BrokerServer){broker.onResult((operation,result)=>{const pending=this.attachedResults.get(result.requestId);if(!pending)return;if(operation==="prompt.completed"){this.attachedResults.delete(result.requestId);pending.resolve(result.message??"Pi completed without a text response.");}else if(operation==="prompt.failed"){this.attachedResults.delete(result.requestId);pending.reject(new Error(result.errorCode??"attached_session_failed"));}});}
 async submit(conversation:Conversation,requestId:string,message:string,source:{transport:"matrix"|"signal";eventId:string}):Promise<{response:string;sessionId:string;toolExecutions?:string[]}>{
  const profile=this.profiles.get(conversation.agentId);
  if(profile.mode==="managed")return this.managed.prompt(conversation.conversationId,profile,message);
  const sessionId=conversation.piSessionId;if(!sessionId)throw new Error("attached_session_required");const attached=this.broker.listSessions().find(session=>session.sessionId===sessionId);if(!attached||attached.agentId!==profile.id||attached.cwd!==profile.cwd||(profile.model&&attached.model!==profile.model)||(!profile.allowPersistentAttachedSessions&&attached.sessionFile))throw new Error("attached_session_profile_mismatch");
  const result=await this.broker.submitPrompt({requestId,conversationId:conversation.conversationId,agentId:profile.id,sessionId,message,source});if(!result.accepted)throw new Error(result.reason??"broker_rejected");
  const response=await new Promise<string>((resolve,reject)=>this.attachedResults.set(requestId,{resolve,reject}));return{response,sessionId};
 }
 async cancel(conversation:Conversation,requestId?:string):Promise<boolean>{const profile=this.profiles.get(conversation.agentId);return profile.mode==="managed"?this.managed.cancel(conversation.conversationId):Boolean(requestId&&this.broker.cancel(requestId));}
 close(conversation:Conversation):void{this.managed.close(conversation.conversationId);}
 listManaged(){return this.managed.list();}
 dispose():void{this.managed.dispose();for(const p of this.attachedResults.values())p.reject(new Error("agent_manager_disposed"));this.attachedResults.clear();}
}
