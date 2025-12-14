/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Simple logger with log levels
 */
export class Logger {
  private level: LogLevel;
  private context: string;
  
  constructor(levelStr: string = 'info', context: string = 'UniPass') {
    this.level = LogLevel[levelStr.toUpperCase() as keyof typeof LogLevel] || LogLevel.INFO;
    this.context = context;
  }
  
  private format(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${this.context}] ${message}`;
  }
  
  debug(message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this.format('DEBUG', message), ...args);
    }
  }
  
  info(message: string, ...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      console.log(this.format('INFO', message), ...args);
    }
  }
  
  warn(message: string, ...args: any[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.format('WARN', message), ...args);
    }
  }
  
  error(message: string, ...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.format('ERROR', message), ...args);
    }
  }
  
  /**
   * Create a child logger with a different context
   */
  child(context: string): Logger {
    return new Logger(LogLevel[this.level], `${this.context}:${context}`);
  }
}
