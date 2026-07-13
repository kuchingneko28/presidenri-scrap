import { log, spinner } from "@clack/prompts";
import { mkdirSync, appendFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { LOGS_DIR, LOG_FILE, TIMESTAMP_LENGTH, LOG_FLUSH_INTERVAL_MS } from "../config/constants";

export class LoggerService {
  private spinnerInstance: ReturnType<typeof spinner> | null = null;
  private writeBuffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    try {
      mkdirSync(LOGS_DIR, { recursive: true });
    } catch (error) {
      console.error(`Failed to create logs directory: ${error instanceof Error ? error.message : String(error)}`);
    }

    // File logger — captures all log output for persistent storage
    this.setupFileLogging();
  }

  private setupFileLogging(): void {
    // Monkey-patch the log methods to also write to file
    const original = {
      info: log.info.bind(log),
      success: log.success.bind(log),
      warn: log.warn.bind(log),
      error: log.error.bind(log),
    };

    const writeToFile = (level: string, message: string) => {
      const clean = message.replace(/\u001b\[.*?m/g, "");
      const ts = new Date().toISOString().replace("T", " ").slice(0, TIMESTAMP_LENGTH);
      this.writeBuffer.push(`[${ts}] [${level}] ${clean}\n`);
      this.scheduleFlush();
    };

    log.info = (message: string) => {
      writeToFile("INFO", message);
      return original.info(message);
    };

    log.success = (message: string) => {
      writeToFile("SUCCESS", message);
      return original.success(message);
    };

    log.warn = (message: string) => {
      writeToFile("WARN", message);
      return original.warn(message);
    };

    log.error = (message: string) => {
      writeToFile("ERROR", message);
      return original.error(message);
    };
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), LOG_FLUSH_INTERVAL_MS);
    if (this.flushTimer?.unref) {
      this.flushTimer.unref();
    }
  }

  private async flush(): Promise<void> {
    if (this.writeBuffer.length === 0) return;
    const data = this.writeBuffer.join("");
    this.writeBuffer = [];
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      await appendFile(LOG_FILE, data, "utf-8");
    } catch (error) {
      console.error(`Failed to flush log file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  info(message: string): void {
    log.info(message);
  }

  success(message: string): void {
    log.success(message);
  }

  warn(message: string): void {
    log.warn(message);
  }

  error(message: string): void {
    log.error(message);
  }

  log(message: string): void {
    log.message(message);
  }

  flushSync(): void {
    this.stopSpinner();
    if (this.writeBuffer.length === 0) return;
    const data = this.writeBuffer.join("");
    this.writeBuffer = [];
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      appendFileSync(LOG_FILE, data, "utf-8");
    } catch {
      // Best-effort on process exit — nothing we can do if this fails
    }
  }

  startSpinner(text: string): void {
    if (!this.spinnerInstance) {
      this.spinnerInstance = spinner();
      this.spinnerInstance.start(text);
    } else {
      this.spinnerInstance.stop(text);
      this.spinnerInstance = spinner();
      this.spinnerInstance.start(text);
    }
  }

  updateSpinner(text: string): void {
    if (this.spinnerInstance) {
      this.spinnerInstance.stop(text);
      this.spinnerInstance = spinner();
      this.spinnerInstance.start(text);
    }
  }

  stopSpinner(): void {
    if (this.spinnerInstance) {
      this.spinnerInstance.stop();
      this.spinnerInstance = null;
    }
  }
}
