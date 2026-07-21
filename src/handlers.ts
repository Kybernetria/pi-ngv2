import type { BrokerClient } from "./broker-client.ts";
type Handler=(input:unknown)=>Promise<unknown>;
export function createHandlers(broker:BrokerClient):Record<string,Handler>{return{
 notify:async input=>{const value=parse(input,100_000);const urgency=isRecord(input)&&(input.urgency==="low"||input.urgency==="high")?input.urgency:"normal";const deliveryId=crypto.randomUUID();await broker.publishNotification(value,urgency);return{accepted:true,deliveryId};},
 send:async input=>{const value=parse(input,8_000);const deliveryId=crypto.randomUUID();await broker.publishNotification(value,"normal",true);return{accepted:true,deliveryId};},
};}
function parse(input:unknown,max:number){if(!isRecord(input)||typeof input.message!=="string"||!input.message.trim())throw new Error("message must be non-empty");const value=input.message.trim();if(value.length>max)throw new Error(`message exceeds ${max} characters`);return value;}
function isRecord(v:unknown):v is Record<string,unknown>{return Boolean(v)&&typeof v==="object";}
