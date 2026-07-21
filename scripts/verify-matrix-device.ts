import { join } from "node:path";
import { DeviceId, OlmMachine, StoreType, UserId } from "@matrix-org/matrix-sdk-crypto-nodejs";
import { loadConfig } from "../src/config.ts";
import { resolvePaths } from "../src/paths.ts";
import { readSecretFile } from "../src/secrets.ts";

const config=loadConfig();
if(!config.matrix.enabled||!config.matrix.homeserver||!config.matrix.userId||!config.matrix.accessTokenFile)throw new Error("Matrix is not fully configured");
const paths=resolvePaths();
const enrollment=JSON.parse(readSecretFile(join(paths.matrixDir,"enrollment.json"),"Matrix enrollment marker")) as {userId:string;deviceId:string};
const token=readSecretFile(config.matrix.accessTokenFile,"Matrix access token");
const passphrase=readSecretFile(join(paths.matrixDir,"crypto-store.key"),"Matrix crypto store key");
const machine=await OlmMachine.initialize(new UserId(enrollment.userId),new DeviceId(enrollment.deviceId),join(paths.matrixDir,"crypto"),passphrase,StoreType.Sqlite);

try{
 const before=await machine.crossSigningStatus();
 const reset=!(before.hasMaster&&before.hasSelfSigning&&before.hasUserSigning);
 const bootstrap=await machine.bootstrapCrossSigning(reset);
 if(bootstrap.uploadKeysReq){const response=await matrixRequest("POST","/_matrix/client/v3/keys/upload",JSON.parse(bootstrap.uploadKeysReq.body));await machine.markRequestAsSent(bootstrap.uploadKeysReq.id,bootstrap.uploadKeysReq.type,JSON.stringify(response));}
 const signingBody=JSON.parse(bootstrap.uploadSigningKeysReq);
 let response=await rawRequest("POST","/_matrix/client/v3/keys/device_signing/upload",signingBody);
 if(response.status===401){const challenge=await response.json() as {session?:string;flows?:Array<{stages?:string[]}>;params?:Record<string,{url?:string}>};const stages=challenge.flows?.flatMap(flow=>flow.stages??[])??[];const stage=stages.includes("m.oauth")?"m.oauth":stages.includes("org.matrix.cross_signing_reset")?"org.matrix.cross_signing_reset":stages.includes("m.login.sso")?"m.login.sso":undefined;if(!challenge.session||!stage)throw new Error("Homeserver did not offer browser authorization for cross-signing");
  const provided=challenge.params?.[stage]?.url;const fallback=provided?new URL(provided):new URL(`/_matrix/client/v3/auth/m.login.sso/fallback/web`,config.matrix.homeserver);if(!provided)fallback.searchParams.set("session",challenge.session);console.log("Open this URL and authorize the bot's cross-signing reset:");console.log(fallback.toString());console.log("Waiting up to five minutes for authorization…");
  const deadline=Date.now()+300_000;while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,2000));response=await rawRequest("POST","/_matrix/client/v3/keys/device_signing/upload",{...signingBody,auth:{type:stage,session:challenge.session}});if(response.ok)break;if(response.status!==401)throw await responseError(response);}if(!response.ok)throw new Error("Cross-signing browser authorization timed out");
 }else if(!response.ok)throw await responseError(response);
 const signatures=bootstrap.uploadSignaturesReq;const wrappedSignatures=JSON.parse(signatures.body);const signatureResponse=await matrixRequest("POST","/_matrix/client/v3/keys/signatures/upload",wrappedSignatures.signed_keys??wrappedSignatures);await machine.markRequestAsSent(signatures.id,signatures.type,JSON.stringify(signatureResponse));
 console.log(`Cross-signing complete for ${enrollment.userId} device ${enrollment.deviceId}.`);
}finally{machine.close();}

async function matrixRequest(method:"POST",path:string,body:unknown):Promise<unknown>{const response=await rawRequest(method,path,body);if(!response.ok)throw await responseError(response);return response.json();}
async function rawRequest(method:"POST",path:string,body:unknown):Promise<Response>{return fetch(`${config.matrix.homeserver!.replace(/\/+$/,"")}${path}`,{method,headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)});}
async function responseError(response:Response):Promise<Error>{let code="M_UNKNOWN";try{const value=await response.json() as {errcode?:string};if(value.errcode)code=value.errcode;}catch{}return new Error(`Matrix request failed: HTTP ${response.status} ${code}`);}
