export type LogLevel = 'info' | 'warn' | 'error'

export interface StructuredLogEntry {
  readonly timestamp: string
  readonly level: LogLevel
  readonly event: string
  readonly message: string
  readonly context: Record<string, unknown>
  readonly error?: {
    readonly name: string
    readonly message: string
    readonly stack?: string
  }
}

export interface SentryPort {
  captureException(error: Error, context: Record<string, unknown>): void | Promise<void>
}

export interface StructuredLogger {
  info(event: string, message: string, context?: Record<string, unknown>): Promise<void>
  warn(event: string, message: string, context?: Record<string, unknown>): Promise<void>
  error(
    event: string,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): Promise<void>
}

interface CreateStructuredLoggerOptions {
  readonly sink?: (entry: StructuredLogEntry) => void | Promise<void>
  readonly sentry?: SentryPort
  readonly clock?: () => Date
}

function serializeError(error: Error | undefined): StructuredLogEntry['error'] | undefined {
  if (!error) return undefined
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
}

export function createStructuredLogger(
  options: CreateStructuredLoggerOptions = {},
): StructuredLogger {
  const sink = options.sink ?? (async () => {})
  const clock = options.clock ?? (() => new Date())

  async function write(
    level: LogLevel,
    event: string,
    message: string,
    context: Record<string, unknown> = {},
    error?: Error,
  ): Promise<void> {
    const entry: StructuredLogEntry = {
      timestamp: clock().toISOString(),
      level,
      event,
      message,
      context,
      error: serializeError(error),
    }
    await sink(entry)

    if (level === 'error' && error && options.sentry) {
      await options.sentry.captureException(error, {
        event,
        ...context,
      })
    }
  }

  return {
    info: async (event, message, context) => write('info', event, message, context),
    warn: async (event, message, context) => write('warn', event, message, context),
    error: async (event, message, context, error) => write('error', event, message, context, error),
  }
}
