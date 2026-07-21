import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { readSecretFile } from "./secrets.ts";
import type { StateStore } from "./state-store.ts";
import type { ChatTransport } from "./transport.ts";
import { ensurePrivateDirectory } from "./paths.ts";
import { dirname } from "node:path";
export interface DeliveryManagerOptions{store:StateStore;transports:Map<string,ChatTransport>;spoolKeyFile:string;maxAttempts:number;baseRetryMs:number;maxRetryMs:number;onDeadLetter?:(id:string)=>void;}
export class DeliveryManager{
 private readonly key:Buffer;private timer?:ReturnType<typeof setTimeout>;private running=false;
 constructor(private readonly options:DeliveryManagerOptions){ensurePrivateDirectory(dirname(options.spoolKeyFile));if(!existsSync(options.spoolKeyFile)){if(options.store.listDeliveries().some(item=>item.status!=="delivered"))throw new Error("Spool key is missing while undelivered responses exist");writeFileSync(options.spoolKeyFile,randomBytes(32).toString("base64"),{mode:0o600,flag:"wx"});}this.key=Buffer.from(readSecretFile(options.spoolKeyFile,"spool key"),"base64");if(this.key.length!==32)throw new Error("Invalid spool key");}
 enqueue(input:{requestId:string;transport:"matrix"|"signal";destination:string;threadId?:string;text:string}):string{const item=this.deliveryInput(input);this.options.store.enqueueDelivery(item);this.wake();return item.deliveryId;}
 completeRequestAndEnqueue(input:{requestId:string;transport:"matrix"|"signal";destination:string;threadId?:string;text:string}):boolean{const result=this.options.store.completeRequestAndEnqueue(input.requestId,this.deliveryInput(input));if(result)this.wake();return result;}
 start():void{if(this.running)return;this.running=true;this.wake();}
 stop():void{this.running=false;if(this.timer)clearTimeout(this.timer);}
 async drainOnce():Promise<number>{const due=this.options.store.claimDueDeliveries(Date.now(),20);await Promise.all(due.map(async item=>{const transport=this.options.transports.get(item.transport);try{if(!transport)throw new PermanentDeliveryError("transport_disabled");const result=await transport.send({transport:item.transport,roomId:item.destination,...(item.threadId?{threadId:item.threadId}:{})},{text:this.decrypt(item.encryptedPayload),requestId:item.requestId});if(item.transport==="signal"&&result.eventId)this.options.store.recordInboundDecision("signal",result.eventId);this.options.store.completeDelivery(item.deliveryId);}catch(error){const attempts=item.attempts+1;if(error instanceof PermanentDeliveryError||attempts>=this.options.maxAttempts){this.options.store.deadLetterDelivery(item.deliveryId);this.options.onDeadLetter?.(item.deliveryId);}else{const retryAfter=retryAfterMs(error);const delay=retryAfter??Math.min(this.options.maxRetryMs,this.options.baseRetryMs*2**Math.max(0,attempts-1));this.options.store.retryDelivery(item.deliveryId,attempts,Date.now()+jitter(delay));}}}));return due.length;}
 private deliveryInput(input:{requestId:string;transport:"matrix"|"signal";destination:string;threadId?:string;text:string}){return{deliveryId:`delivery-${input.requestId}`,requestId:input.requestId,transport:input.transport,destination:input.destination,...(input.threadId?{threadId:input.threadId}:{}),transactionId:`pi-ng-${input.requestId}`,encryptedPayload:this.encrypt(input.text)};}
 private wake(){if(!this.running)return;if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>void this.drainOnce().finally(()=>this.wake()),1000);this.timer.unref();}
 private encrypt(text:string):string{const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.key,iv);const body=Buffer.concat([cipher.update(text,"utf8"),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString("base64");}
 private decrypt(payload:string):string{const data=Buffer.from(payload,"base64");if(data.length<29)throw new PermanentDeliveryError("corrupt_spool");const decipher=createDecipheriv("aes-256-gcm",this.key,data.subarray(0,12));decipher.setAuthTag(data.subarray(12,28));return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString("utf8");}
}
export class PermanentDeliveryError extends Error{}
function retryAfterMs(error:unknown):number|undefined{const value=(error as any)?.retryAfterMs??(error as any)?.retry_after_ms;return typeof value==="number"&&value>=0?value:undefined;}
function jitter(delay:number):number{return Math.max(100,Math.round(delay*(0.8+Math.random()*0.4)));}
