import type { ChatAddress, ChatEvent, ChatTransport, DeliveryResult, OutboundMessage, TransportHealth } from "../transport.ts";
import { threadRoot } from "./conversation-model.ts";
import type { MatrixClientAdapter } from "./matrix-client.ts";
export class MatrixTransport implements ChatTransport{
 readonly kind="matrix" as const;private readonly handlers=new Set<(e:ChatEvent)=>Promise<void>>();private state:TransportHealth={status:"starting",connected:false,encrypted:false,checkedAt:Date.now()};
 constructor(private readonly client:MatrixClientAdapter){}
 async start():Promise<void>{try{this.client.onHealth((healthy,detail)=>{this.state={status:healthy?"healthy":"degraded",connected:healthy,encrypted:healthy,checkedAt:Date.now(),...(detail?{detail}:{})};});await this.client.start(async raw=>{const body=raw.content.body,msgtype=raw.content.msgtype,relation=raw.content["m.relates_to"] as {rel_type?:string}|undefined;if(typeof body!=="string"||msgtype!=="m.text"||relation?.rel_type==="m.replace")return;const root=threadRoot(raw.eventId,raw.content);const event:ChatEvent={transport:"matrix",eventId:raw.eventId,senderId:raw.senderId,roomId:raw.roomId,threadId:root,text:body,timestamp:raw.timestamp,encrypted:true,trusted:raw.trusted};for(const h of this.handlers)await h(event);});this.state={status:"healthy",connected:true,encrypted:true,checkedAt:Date.now()};}catch(error){this.state={status:"failed",connected:false,encrypted:false,detail:error instanceof Error?error.message:String(error),checkedAt:Date.now()};throw error;}}
 async stop():Promise<void>{await this.client.stop();this.state={status:"disabled",connected:false,checkedAt:Date.now()};}
 onEvent(handler:(e:ChatEvent)=>Promise<void>):()=>void{this.handlers.add(handler);return()=>this.handlers.delete(handler);}
 async send(address:ChatAddress,message:OutboundMessage):Promise<DeliveryResult>{if(!address.roomId)throw new Error("Matrix room is required");const transactionId=`pi-ng-${message.requestId??crypto.randomUUID()}`.replace(/[^A-Za-z0-9._~-]/g,"_");const eventId=await this.client.sendEncrypted(address.roomId,address.threadId,message.text,transactionId,message.notice);return{accepted:true,eventId,transactionId};}
 health():TransportHealth{return{...this.state};}
 roomSecurity(roomId:string){return Promise.all([this.client.isRoomEncrypted(roomId),this.client.members(roomId)]).then(([encrypted,members])=>({encrypted,members}));}
 identity(){return this.client.identity();}
}
