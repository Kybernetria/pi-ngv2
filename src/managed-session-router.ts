import { createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, resolveCliModel, SessionManager, type AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentProfile } from "./config.ts";
interface Entry{session:AgentSession;profile:AgentProfile;lastUsed:number;timer?:ReturnType<typeof setTimeout>;}
export class ManagedSessionRouter{
 private readonly sessions=new Map<string,Entry>();private readonly activeByProfile=new Map<string,number>();private modelRuntime?:ModelRuntime;
 async prompt(conversationId:string,profile:AgentProfile,message:string):Promise<{sessionId:string,response:string;toolExecutions:string[]}>{
  let entry=this.sessions.get(conversationId);if(!entry){entry=await this.create(profile);this.sessions.set(conversationId,entry);}
  if(entry.timer)clearTimeout(entry.timer);entry.lastUsed=Date.now();await this.acquire(profile);try{const result=await collect(entry.session,message);this.expireLater(conversationId,entry);return{sessionId:entry.session.sessionId,...result};}finally{this.release(profile);}
 }
 async cancel(conversationId:string):Promise<boolean>{const entry=this.sessions.get(conversationId);if(!entry||!entry.session.isStreaming)return false;await entry.session.abort();return true;}
 close(conversationId:string):void{const entry=this.sessions.get(conversationId);if(!entry)return;if(entry.timer)clearTimeout(entry.timer);entry.session.dispose();this.sessions.delete(conversationId);}
 dispose():void{for(const id of[...this.sessions.keys()])this.close(id);}
 list(){return[...this.sessions.entries()].map(([conversationId,e])=>({conversationId,sessionId:e.session.sessionId,agentId:e.profile.id,streaming:e.session.isStreaming,lastUsed:e.lastUsed}));}
 private async create(profile:AgentProfile):Promise<Entry>{
  const loader=new DefaultResourceLoader({cwd:profile.cwd,agentDir:getAgentDir(),noExtensions:true});await loader.reload();this.modelRuntime??=await ModelRuntime.create();let model;
  if(profile.model){const resolved=resolveCliModel({cliModel:profile.model,modelRuntime:this.modelRuntime});if(resolved.error||!resolved.model)throw new Error(resolved.error??`Unknown model ${profile.model}`);model=resolved.model;}
  const {session}=await createAgentSession({cwd:profile.cwd,resourceLoader:loader,sessionManager:SessionManager.inMemory(profile.cwd),modelRuntime:this.modelRuntime,...(model?{model}:{}),...(profile.tools?{tools:profile.tools}:{})});return{session,profile,lastUsed:Date.now()};
 }
 private async acquire(profile:AgentProfile):Promise<void>{const deadline=Date.now()+300_000;while((this.activeByProfile.get(profile.id)??0)>=profile.maxConcurrency){if(Date.now()>deadline)throw new Error("agent_concurrency_timeout");await new Promise(r=>setTimeout(r,100));}this.activeByProfile.set(profile.id,(this.activeByProfile.get(profile.id)??0)+1);}
 private release(profile:AgentProfile){this.activeByProfile.set(profile.id,Math.max(0,(this.activeByProfile.get(profile.id)??1)-1));}
 private expireLater(id:string,entry:Entry){entry.timer=setTimeout(()=>{if(this.sessions.get(id)===entry)this.close(id);},entry.profile.sessionTtlMinutes*60_000);entry.timer.unref();}
}
async function collect(session:AgentSession,message:string):Promise<{response:string;toolExecutions:string[]}>{let text="";const before=session.messages.length,toolExecutions:string[]=[];const off=session.subscribe(event=>{if(event.type==="message_update"&&event.assistantMessageEvent.type==="text_delta")text+=event.assistantMessageEvent.delta;if(event.type==="message_end"&&event.message.role==="assistant"){const final=event.message.content.filter(p=>p.type==="text").map(p=>p.text).join("").trim();if(final)text=final;}if(event.type==="tool_execution_start")toolExecutions.push(event.toolName);});try{await session.prompt(message,{source:"extension"});if(!text.trim()){const final=[...session.messages.slice(before)].reverse().find(item=>item.role==="assistant");if(final?.role==="assistant")text=final.content.filter(part=>part.type==="text").map(part=>part.text).join("").trim();}if(!text.trim())throw new Error(toolExecutions.length?"agent_no_text_response":"agent_no_output");return{response:text.trim(),toolExecutions};}finally{off();}}
