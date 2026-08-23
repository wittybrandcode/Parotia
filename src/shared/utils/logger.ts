export type LogContext = Record<string, string | number | boolean | undefined>;

const enabled = typeof process === "undefined" || process.env.NODE_ENV !== "test";

function write(level: "debug" | "warn" | "error", event: string, context?: LogContext, cause?: unknown): void {
  if (!enabled) return;
  const payload = context ? { event, ...context } : { event };
  console[level]("[parotia]", payload, cause ?? "");
}

export const logger = {
  debug: (event: string, context?: LogContext, cause?: unknown) => write("debug", event, context, cause),
  warn: (event: string, context?: LogContext, cause?: unknown) => write("warn", event, context, cause),
  error: (event: string, context?: LogContext, cause?: unknown) => write("error", event, context, cause),
};
