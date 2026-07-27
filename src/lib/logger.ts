/**
 * Structured server logging.
 *
 * Cloud log aggregators (CloudWatch, Azure Monitor, Datadog) index JSON
 * lines and treat free-text `console.log` as an opaque blob. Every
 * server-side log therefore goes through here, which emits one JSON
 * object per line in production and a readable line in development.
 *
 * Two rules this module enforces rather than trusts:
 *
 *   1. **No secrets.** Any context key whose name looks like a secret is
 *      redacted before serialization, so a future caller cannot leak a
 *      token by passing the wrong object.
 *   2. **No PII in the message.** The `message` is a static string; all
 *      variable data goes in `context`, where it can be redacted and
 *      where the aggregator can index it. Callers that interpolate user
 *      data into the message defeat both properties — pass it as
 *      context instead.
 *
 * Errors are unwrapped to `{ name, message, stack }` — never spread, so
 * an error carrying a `config` object (as HTTP client errors do) cannot
 * drag credentials into the log.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Correlates every line emitted while handling one request. */
  requestId?: string;
  /** Safe to log: an opaque uuid, never an email or name. */
  userId?: string;
  route?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Context keys that must never reach a log sink. */
const SECRET_KEY_PATTERN =
  /(password|passwd|secret|token|api[-_]?key|authorization|cookie|session|credential|ciphertext|private[-_]?key)/i;

export const REDACTED = '[redacted]';

function minLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
    return configured;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      // Stacks are for the server sink only; they never reach a client
      // response (SEC-09).
      stack: err.stack,
    };
  }
  return { message: String(err) };
}

/** Deep-redact secret-looking keys; unwrap Errors; bound recursion. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : sanitize(val, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LogRecord {
  level: LogLevel;
  time: string;
  message: string;
  [key: string]: unknown;
}

export function buildRecord(
  level: LogLevel,
  message: string,
  context?: LogContext
): LogRecord {
  const sanitized = (context ? sanitize(context) : {}) as Record<string, unknown>;
  return {
    level,
    time: new Date().toISOString(),
    message,
    ...sanitized,
  };
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;
  const record = buildRecord(level, message, context);

  // The single sanctioned console sink in server code; every other
  // call site goes through this module (see the security test).
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

  if (process.env.NODE_ENV === 'production') {
    sink(JSON.stringify(record));
    return;
  }
  const { time: _time, level: _level, message: msg, ...rest } = record;
  const extras = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  sink(`[${level}] ${msg}${extras}`);
}

export const log = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};

/**
 * Per-request correlation id. Prefers an inbound trace header so a log
 * line can be tied to an upstream load-balancer or CDN request.
 */
export function requestIdFrom(headers: Headers): string {
  return (
    headers.get('x-request-id') ??
    headers.get('x-amzn-trace-id') ??
    headers.get('x-vercel-id') ??
    crypto.randomUUID()
  );
}
