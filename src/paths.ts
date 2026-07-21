import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface PiNgPaths {
  configFile: string;
  dataDir: string;
  stateDir: string;
  runtimeDir: string;
  matrixDir: string;
  databaseFile: string;
  spoolKeyFile: string;
  brokerSocket: string;
  brokerKeyFile: string;
  signalCursorFile: string;
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): PiNgPaths {
  const configHome = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const dataHome = env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  const stateHome = env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  const runtimeHome = env.XDG_RUNTIME_DIR || join(tmpdir(), `pi-ngv2-${process.getuid?.() ?? "user"}`);
  const dataDir = join(dataHome, "pi-ngv2");
  const stateDir = join(stateHome, "pi-ngv2");
  const runtimeDir = join(runtimeHome, "pi-ngv2");
  return {
    configFile: env.PI_NG_CONFIG || join(configHome, "pi-ng", "config.json"),
    dataDir,
    stateDir,
    runtimeDir,
    matrixDir: join(dataDir, "matrix"),
    databaseFile: join(stateDir, "state.sqlite"),
    spoolKeyFile: join(dataDir, "spool.key"),
    brokerSocket: env.PI_NG_SOCKET_PATH || join(runtimeDir, "broker.sock"),
    brokerKeyFile: join(runtimeDir, "broker.key"),
    signalCursorFile: join(stateDir, "signal-cursor.json"),
  };
}

export function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${path} is not a real directory`);
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error(`${path} is not owned by the current user`);
  chmodSync(path, 0o700);
}

export function ensurePathParents(paths: PiNgPaths): void {
  for (const path of [dirname(paths.configFile), paths.dataDir, paths.stateDir, paths.runtimeDir]) ensurePrivateDirectory(path);
}
