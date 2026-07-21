import type { ChatEvent } from "../transport.ts";
export type PiCommand={kind:"help"|"agents"|"sessions"|"status"|"detach"|"close"|"cancel"}|{kind:"new";agentId:string;prompt?:string}|{kind:"attach";sessionId:string}|{kind:"retry";confirmed:boolean};
export function parsePiCommand(text:string):PiCommand|undefined{
 if(!text.startsWith("!pi")||(!/^!pi(?:\s|$)/.test(text)))return;const parts=text.trim().split(/\s+/);const command=(parts[1]??"help").toLowerCase();
 if(["help","agents","sessions","status","detach","close","cancel"].includes(command))return{kind:command as "help"};
 if(command==="new"&&parts[2])return{kind:"new",agentId:parts[2],...(parts.length>3?{prompt:parts.slice(3).join(" ")}:{})};
 if(command==="attach"&&parts[2])return{kind:"attach",sessionId:parts[2]};
 if(command==="retry")return{kind:"retry",confirmed:parts.includes("--confirm")};return{kind:"help"};
}
export function isIgnoredMatrixEvent(event:ChatEvent):boolean{return !event.text.trim();}
