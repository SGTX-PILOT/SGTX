type LogLevel = "debug" | "info" | "warn" | "error";
interface LogEntry { timestamp: string; level: LogLevel; message: string; [key: string]: any; }
const isProd = process.env.NODE_ENV === "production";
function shouldLog(level: LogLevel): boolean {
  const minLevel = (process.env.SGTX_LOG_LEVEL || (isProd ? "info" : "debug")) as LogLevel;
  const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  return levels[level] >= levels[minLevel];
}
function format(entry: LogEntry): string {
  if (isProd) return JSON.stringify(entry);
  const { timestamp, level, message, ...rest } = entry;
  const restStr = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${restStr}`;
}
function log(level: LogLevel, message: string, meta?: Record<string, any>) {
  if (!shouldLog(level)) return;
  const entry: LogEntry = { timestamp: new Date().toISOString(), level, message, ...meta };
  const output = format(entry);
  if (level === "error") process.stderr.write(output + "\n"); else process.stdout.write(output + "\n");
}
export const logger = {
  debug: (msg: string, meta?: Record<string, any>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, any>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, any>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, any>) => log("error", msg, meta),
};
const SENSITIVE_FIELDS = ["password", "token", "secret", "apiKey", "authorization", "cookie"];
export function redact(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) result[key] = "[REDACTED]";
    else if (typeof value === "object" && value !== null) result[key] = redact(value);
    else result[key] = value;
  }
  return result;
}
