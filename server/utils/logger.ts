// PATCH: 2025-11-02 - Add structured logging with ISO timestamps and consistent format
// Fixes: Observability and debugging - all logs now include timestamp, level, function, and context

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

interface LogMeta {
  socketId?: string;
  userId?: string;
  roomId?: string;
  [key: string]: any;
}

function formatLog(
  level: LogLevel,
  functionName: string,
  message: string,
  meta?: LogMeta
): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta
    ? ` ${Object.entries(meta)
        .map(([k, v]) => `${k}=${typeof v === "string" ? `"${v}"` : v}`)
        .join(" ")}`
    : "";
  return `[${timestamp}] [${level}] [${functionName}]${metaStr} msg="${message}"`;
}

export function logger(functionName: string, message: string, meta?: LogMeta): void {
  const logLine = formatLog("INFO", functionName, message, meta);
  console.log(logLine);
}

logger.info = (functionName: string, message: string, meta?: LogMeta) => {
  console.log(formatLog("INFO", functionName, message, meta));
};

logger.warn = (functionName: string, message: string, meta?: LogMeta) => {
  console.warn(formatLog("WARN", functionName, message, meta));
};

logger.error = (functionName: string, message: string, meta?: LogMeta, error?: Error) => {
  const errorMeta = error
    ? { ...meta, error: error.message, stack: error.stack }
    : meta;
  console.error(formatLog("ERROR", functionName, message, errorMeta));
};

logger.debug = (functionName: string, message: string, meta?: LogMeta) => {
  if (process.env.DEBUG === "true") {
    console.log(formatLog("DEBUG", functionName, message, meta));
  }
};
