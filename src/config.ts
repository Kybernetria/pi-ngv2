import { readFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { lstatSync } from "node:fs";
import { z } from "zod";
import { resolvePaths } from "./paths.ts";

const agentSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: z.string().min(1).max(100),
  cwd: z.string().min(1),
  mode: z.enum(["managed", "attached"]).default("managed"),
  model: z.string().min(1).optional(),
  maxConcurrency: z.number().int().min(1).max(16).default(1),
  sessionTtlMinutes: z.number().int().min(1).max(10_080).default(120),
  allowPersistentAttachedSessions: z.boolean().default(false),
  tools: z.array(z.enum(["read", "bash", "edit", "write", "grep", "find", "ls"])).optional(),
}).strict();

const matrixSchema = z.object({
  enabled: z.boolean().default(false),
  shadowMode: z.boolean().default(true),
  conversationMode: z.enum(["thread", "room"]).default("thread"),
  homeserver: z.string().url().optional(),
  userId: z.string().startsWith("@").optional(),
  accessTokenFile: z.string().optional(),
  allowedUsers: z.array(z.string().startsWith("@")).default([]),
  allowedRooms: z.array(z.string().startsWith("!")).default([]),
  administrators: z.array(z.string().startsWith("@")).default([]),
  roomAgents: z.record(z.string(), z.string()).default({}),
  controlRooms: z.array(z.string().startsWith("!")).default([]),
  requireEncryption: z.boolean().default(true),
  requireVerifiedDevices: z.boolean().default(true),
  strictRoomMembership: z.boolean().default(true),
  invitePolicy: z.enum(["deny", "allowlist", "preconfigured"]).default("allowlist"),
  maxRequestsPerUserPerMinute: z.number().int().min(1).max(1000).default(20),
  maxRequestsPerRoomPerMinute: z.number().int().min(1).max(1000).default(60),
});

const signalSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["disabled", "notifications", "legacy-command"]).default("disabled"),
  fallbackPolicy: z.enum(["none", "generic-status-only", "full-content"]).default("generic-status-only"),
  restUrl: z.string().url().default("http://127.0.0.1:8080"),
  account: z.string().optional(),
  pollIntervalMs: z.number().int().min(500).max(300_000).default(5000),
});

export const configSchema = z.object({
  version: z.literal(1),
  primaryTransport: z.enum(["matrix", "signal"]).default("matrix"),
  matrix: matrixSchema.prefault({}),
  signal: signalSchema.prefault({}),
  agents: z.array(agentSchema).default([]),
  broker: z.object({ maxMessageBytes: z.number().int().min(1024).max(10_000_000).default(1_000_000), maxQueueDepth: z.number().int().min(1).max(10_000).default(100), requestTimeoutMs: z.number().int().min(1000).default(300_000) }).prefault({}),
  delivery: z.object({ maxAttempts: z.number().int().min(1).max(100).default(10), baseRetryMs: z.number().int().min(100).default(1000), maxRetryMs: z.number().int().min(1000).default(300_000) }).prefault({}),
}).superRefine((config, ctx) => {
  if (config.matrix.enabled) {
    for (const key of ["homeserver", "userId", "accessTokenFile"] as const) if (!config.matrix[key]) ctx.addIssue({ code: "custom", path: ["matrix", key], message: `required when Matrix is enabled` });
    if (config.matrix.homeserver && new URL(config.matrix.homeserver).protocol !== "https:") ctx.addIssue({ code: "custom", path: ["matrix", "homeserver"], message: "must use HTTPS" });
    if (!config.matrix.allowedRooms.length) ctx.addIssue({ code: "custom", path: ["matrix", "allowedRooms"], message: "at least one room is required" });
    if (!config.matrix.allowedUsers.length) ctx.addIssue({ code: "custom", path: ["matrix", "allowedUsers"], message: "at least one user is required" });
  }
  if (config.signal.enabled && config.signal.mode !== "disabled" && !config.signal.account) ctx.addIssue({ code: "custom", path: ["signal", "account"], message: "required when Signal is enabled" });
  const ids = new Set<string>();
  for (const [index, agent] of config.agents.entries()) {
    if (ids.has(agent.id)) ctx.addIssue({ code: "custom", path: ["agents", index, "id"], message: "duplicate agent id" });
    ids.add(agent.id);
    if (!isAbsolute(agent.cwd)) ctx.addIssue({ code: "custom", path: ["agents", index, "cwd"], message: "must be absolute" });
  }
  for (const [room, agent] of Object.entries(config.matrix.roomAgents)) {
    if (!config.matrix.allowedRooms.includes(room)) ctx.addIssue({ code: "custom", path: ["matrix", "roomAgents", room], message: "room is not allowlisted" });
    if (!ids.has(agent)) ctx.addIssue({ code: "custom", path: ["matrix", "roomAgents", room], message: "unknown agent id" });
  }
});

export type PiNgConfig = z.infer<typeof configSchema>;
export type AgentProfile = PiNgConfig["agents"][number];

export function loadConfig(path = resolvePaths().configFile): PiNgConfig {
  let input: unknown;
  try { const parent=lstatSync(dirname(path));if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o077)!==0)throw new Error("configuration directory must be a private non-symlink directory");if(typeof process.getuid==="function"&&parent.uid!==process.getuid())throw new Error("configuration directory is not owned by the current user");const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("configuration must be a regular non-symlink file");if((stat.mode&0o077)!==0)throw new Error("configuration permissions must be 0600 or stricter");if(typeof process.getuid==="function"&&stat.uid!==process.getuid())throw new Error("configuration is not owned by the current user");input = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { throw new Error(`Cannot read pi-ng configuration at ${path}: ${error instanceof Error ? error.message : String(error)}`); }
  return configSchema.parse(input);
}

export function loadLegacySignalConfig(env: NodeJS.ProcessEnv = process.env): PiNgConfig | undefined {
  const account = env.SIGNAL_ACCOUNT?.trim();
  if (!account) return undefined;
  return configSchema.parse({ version: 1, primaryTransport: "signal", signal: { enabled: true, mode: "legacy-command", account, restUrl: env.SIGNAL_REST_URL }, matrix: { enabled: false }, agents: [] });
}
