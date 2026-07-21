export interface MatrixRelation { rel_type?: string; event_id?: string; "m.in_reply_to"?: {event_id?:string}; }
export function threadRoot(eventId:string,content:Record<string,unknown>):string{
 const relates=content["m.relates_to"] as MatrixRelation|undefined;
 return relates?.rel_type==="m.thread"&&typeof relates.event_id==="string"?relates.event_id:eventId;
}
export function threadMessageContent(text:string,rootEventId:string):Record<string,unknown>{
 return{msgtype:"m.text",body:text,"m.relates_to":{rel_type:"m.thread",event_id:rootEventId,is_falling_back:true,"m.in_reply_to":{event_id:rootEventId}}};
}
