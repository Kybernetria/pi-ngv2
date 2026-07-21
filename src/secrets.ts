import { chmodSync, lstatSync, readFileSync } from "node:fs";

export function readSecretFile(path: string, label: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} path must be a regular file`);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} file permissions must be 0600 or stricter`);
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error(`${label} file is not owned by the current user`);
  const value = readFileSync(path, "utf8").trim();
  if (!value) throw new Error(`${label} file is empty`);
  return value;
}

export function hardenSecretFile(path: string): void { chmodSync(path, 0o600); }

export function redactSecret(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecret);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    /token|secret|password|recovery|private.?key/i.test(key) ? "[REDACTED]" : redactSecret(child),
  ]));
}
