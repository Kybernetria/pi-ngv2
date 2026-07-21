import { loadConfig, loadLegacySignalConfig } from "../src/config.ts";
import { verifyNativeCryptoIntegrity } from "../src/native-integrity.ts";
verifyNativeCryptoIntegrity();
const {PiNgDaemon}=await import("../src/daemon.ts");
let config;try{config=loadConfig();}catch(error){config=loadLegacySignalConfig();if(!config)throw error;}
const daemon=new PiNgDaemon(config);let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await daemon.stop();process.exit(0);};process.on("SIGINT",()=>void stop());process.on("SIGTERM",()=>void stop());process.on("SIGHUP",()=>void stop());await daemon.start();
