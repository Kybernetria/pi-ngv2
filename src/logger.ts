import { createHash } from "node:crypto";
import { redactSecret } from "./secrets.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";
export interface Logger { log(level: LogLevel, event: string, fields?: Record<string, unknown>): void; }

export function opaqueId(value: string | undefined): string | undefined {
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : undefined;
}

export class JsonLogger implements Logger {
  constructor(private readonly minimum: LogLevel = "info") {}
  log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
    if (["debug", "info", "warn", "error"].indexOf(level) < ["debug", "info", "warn", "error"].indexOf(this.minimum)) return;
    const safe = { ...fields };
    for (const key of ["roomId", "userId", "senderId", "eventId", "conversationId"]) {
      if (typeof safe[key] === "string") safe[key] = opaqueId(safe[key] as string);
    }
    const line = JSON.stringify(redactSecret({ timestamp: new Date().toISOString(), level, event, ...safe }));
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(`${line}\n`);
  }
}
