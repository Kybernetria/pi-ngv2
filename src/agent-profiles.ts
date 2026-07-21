import type { AgentProfile } from "./config.ts";
export class AgentProfiles{
 private readonly byId:Map<string,AgentProfile>;
 constructor(profiles:AgentProfile[]){this.byId=new Map(profiles.map(profile=>[profile.id,Object.freeze({...profile})]));}
 get(id:string):AgentProfile{const profile=this.byId.get(id);if(!profile)throw new Error(`Unknown approved agent profile: ${id}`);return profile;}
 list():AgentProfile[]{return[...this.byId.values()].map(p=>({...p}));}
}
