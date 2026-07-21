import type { ChatEvent } from "../transport.ts";
export interface MatrixPolicyConfig { botUserId:string;allowedUsers:string[];allowedRooms:string[];requireEncryption:boolean;requireVerifiedDevices:boolean;strictRoomMembership:boolean; }
export interface RoomSecurity { encrypted:boolean;members:string[];decrypted:boolean;deviceTrusted:boolean;historical?:boolean; }
export type PolicyDecision={allowed:true}|{allowed:false;reason:"bot_event"|"room_unauthorized"|"sender_unauthorized"|"room_unencrypted"|"decryption_failed"|"device_untrusted"|"unexpected_member"|"historical"};
export function authorizeMatrixEvent(event:ChatEvent,room:RoomSecurity,config:MatrixPolicyConfig):PolicyDecision{
 if(event.senderId===config.botUserId)return{allowed:false,reason:"bot_event"};
 if(!event.roomId||!config.allowedRooms.includes(event.roomId))return{allowed:false,reason:"room_unauthorized"};
 if(!config.allowedUsers.includes(event.senderId))return{allowed:false,reason:"sender_unauthorized"};
 if(config.requireEncryption&&(!room.encrypted||!event.encrypted))return{allowed:false,reason:"room_unencrypted"};
 if(!room.decrypted)return{allowed:false,reason:"decryption_failed"};
 if(config.requireVerifiedDevices&&(!room.deviceTrusted||!event.trusted))return{allowed:false,reason:"device_untrusted"};
 if(config.strictRoomMembership&&room.members.some(member=>member!==config.botUserId&&!config.allowedUsers.includes(member)))return{allowed:false,reason:"unexpected_member"};
 if(event.historical||room.historical)return{allowed:false,reason:"historical"};
 return{allowed:true};
}
