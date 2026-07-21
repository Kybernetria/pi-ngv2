import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kybernetria/pi-protocol";
import { createBrokerClient, type BrokerClient } from "./broker-client.ts";
import { resolvePaths } from "./paths.ts";
import { readSecretFile } from "./secrets.ts";
import { createHandlers } from "./handlers.ts";
const manifest=JSON.parse(readFileSync(fileURLToPath(new URL("../pi.protocol.json",import.meta.url)),"utf8")) as PiProtocolManifest;
export interface ExtensionOptions{broker?:BrokerClient;}
export default function piNgV2(pi:ExtensionAPI,options:ExtensionOptions={}):void{
 const paths=resolvePaths();const broker=options.broker??createBrokerClient({socketPath:paths.brokerSocket,authToken:()=>readSecretFile(paths.brokerKeyFile,"broker key")});const queue:Array<{requestId:string;message:string}>=[];let active:{requestId:string;response:string;cancelled:boolean}|undefined,started=false,idle=false,abortCurrent:(()=>void)|undefined;
 const status=()=>broker.update({status:active||queue.length?"working":"idle"});
 const dispatch=()=>{if(!started||!idle||active||!queue.length)return;const item=queue.shift()!;active={requestId:item.requestId,response:"",cancelled:false};idle=false;broker.respondStarted(item.requestId);status();try{pi.sendUserMessage(item.message);}catch(error){active=undefined;idle=true;broker.respondFailed(item.requestId,"prompt_rejected",error instanceof Error?error.message:undefined);queueMicrotask(dispatch);}};
 const fabric=ensureProtocolFabric();fabric.unregister("pi_ng");registerProtocolManifest(fabric,{manifest,handlers:createHandlers(broker)});
 broker.onPrompt(prompt=>{queue.push({requestId:prompt.requestId,message:prompt.message});status();dispatch();});broker.onCancel(requestId=>{if(active?.requestId===requestId){active.cancelled=true;abortCurrent?.();}else{const index=queue.findIndex(q=>q.requestId===requestId);if(index>=0){queue.splice(index,1);broker.respondFailed(requestId,"cancelled");}}});
 pi.registerCommand("pi_ng.notify",{description:"Send a notification through pi-ng",handler:async(args,ctx)=>{if(!args.trim()){ctx.ui.notify("Usage: /pi_ng.notify <message>","warning");return;}const result=await fabric.invoke({nodeId:"pi_ng",provide:"notify",input:{message:args.trim()},callerNodeId:"pi-chat"});if(!result.ok)throw new Error(result.error.message);ctx.ui.notify("Notification accepted.","info");}});
 pi.on("session_start",(_event,ctx)=>{started=true;idle=ctx.isIdle();const sm=ctx.sessionManager;broker.register({sessionId:sm.getSessionId(),...(sm.getSessionFile()?{sessionFile:sm.getSessionFile()}:{}),...(process.env.PI_NG_AGENT_ID?{agentId:process.env.PI_NG_AGENT_ID}:{}),...(pi.getSessionName()?{name:pi.getSessionName()}:{}),cwd:ctx.cwd,pid:process.pid,...(ctx.model?{model:`${ctx.model.provider}/${ctx.model.id}`}:{ }),status:idle?"idle":"working"});dispatch();});
 pi.on("session_info_changed",event=>broker.update({...((event.name)?{name:event.name}:{})}));pi.on("model_select",event=>broker.update({model:`${event.model.provider}/${event.model.id}`}));
 pi.on("agent_start",(_event,ctx)=>{idle=false;abortCurrent=()=>ctx.abort();status();});pi.on("message_update",event=>{if(active&&event.assistantMessageEvent.type==="text_delta")active.response+=event.assistantMessageEvent.delta;});pi.on("message_end",event=>{if(active&&event.message.role==="assistant"){const text=event.message.content.filter(p=>p.type==="text").map(p=>p.text).join("").trim();if(text)active.response=text;}});
 pi.on("agent_settled",()=>{const done=active;active=undefined;abortCurrent=undefined;idle=true;if(done){if(done.cancelled)broker.respondFailed(done.requestId,"cancelled");else broker.respondCompleted(done.requestId,done.response.trim()||"Pi completed without a text response.");}status();dispatch();});
 pi.on("session_shutdown",()=>{started=false;idle=false;if(active)broker.respondFailed(active.requestId,"session_closed");for(const item of queue)broker.respondFailed(item.requestId,"session_closed");queue.length=0;active=undefined;broker.unregister();broker.dispose();});
}
