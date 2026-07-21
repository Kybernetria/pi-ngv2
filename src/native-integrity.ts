import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const APPROVED:Record<string,{file:string;sha256:string}>={
  "0.6.1:linux:x64":{file:"matrix-sdk-crypto.linux-x64-gnu.node",sha256:"cb0d2a86bd6721f82d988ae6b0c54cc3c5d364ff59a06f95934eb587dc35c9f4"},
};
export function verifyNativeCryptoIntegrity():void{const packageDir=join(dirname(fileURLToPath(import.meta.url)),"..","node_modules","@matrix-org","matrix-sdk-crypto-nodejs");const packageJson=JSON.parse(readFileSync(join(packageDir,"package.json"),"utf8")) as {version:string};const approved=APPROVED[`${packageJson.version}:${process.platform}:${process.arch}`];if(!approved)throw new Error(`No approved Matrix crypto binary for ${packageJson.version} ${process.platform}/${process.arch}`);const path=join(packageDir,approved.file),stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Matrix crypto binary is not a regular file");const actual=createHash("sha256").update(readFileSync(path)).digest("hex");if(actual!==approved.sha256)throw new Error("Matrix crypto native binary integrity check failed");}
if(import.meta.url===`file://${process.argv[1]}`){verifyNativeCryptoIntegrity();console.log("Matrix crypto native binary integrity verified.");}
