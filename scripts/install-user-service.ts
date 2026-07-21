import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadConfig } from "../src/config.ts";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const target=join(homedir(),".config","systemd","user","pi-ngv2.service");
mkdirSync(dirname(target),{recursive:true,mode:0o700});
const template=readFileSync(join(root,"systemd","pi-ngv2.service"),"utf8");
const tsx=resolve(root,"node_modules","tsx","dist","loader.mjs");
const config=loadConfig();
const writable=[...new Set(config.agents.filter(agent=>agent.mode==="managed").map(agent=>realpathSync(agent.cwd)))];
const agentWritePaths=writable.map(path=>`ReadWritePaths=${quoteUnitPath(path)}`).join("\n");
const service=template
 .replaceAll("@NODE@",process.execPath)
 .replaceAll("@TSX@",tsx)
 .replaceAll("@ROOT@",root)
 .replaceAll("@AGENT_WRITE_PATHS@",agentWritePaths);
writeFileSync(target,service,{mode:0o600});
execFileSync("systemctl",["--user","daemon-reload"],{stdio:"inherit"});
console.log(`Installed ${target}`);
console.log(`Writable managed-agent roots: ${writable.join(", ")||"none"}`);
console.log("Configuration was not modified. Enable with: systemctl --user enable --now pi-ngv2");

function quoteUnitPath(path:string):string{
 if(/[\r\n\0]/.test(path))throw new Error("Agent path contains unsupported control characters");
 return `"${path.replaceAll("\\","\\\\").replaceAll('"','\\"').replaceAll("%","%%")}"`;
}
