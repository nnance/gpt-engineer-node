export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warning = 2,
  Error = 3,
}

export class Logging {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.Error) {
    this.level = level;
  }

  debug(...args: any[]): void {
    if (this.level <= LogLevel.Debug) {
      console.debug(...args);
    }
  }

  info(...args: any[]): void {
    if (this.level <= LogLevel.Info) {
      console.info(...args);
    }
  }

  warning(...args: any[]): void {
    if (this.level <= LogLevel.Warning) {
      console.warn(...args);
    }
  }

  error(...args: any[]): void {
    if (this.level <= LogLevel.Error) {
      console.error(...args);
    }
  }

  log(...args: any[]): void {
    this.info(...args);
  }

  logLevel() {
    console.log(`Logging Level: ${LogLevel[this.level]}`);
  }
}
