import { createConsola } from "consola";
import type { ConsolaInstance, ConsolaReporter } from "consola";
import yoctoSpinner from "yocto-spinner";
import type { Spinner } from "yocto-spinner";
import { mkdirSync, appendFileSync } from "node:fs";
import { LOGS_DIR, LOG_FILE } from "../config/constants";

export class LoggerService {
  private spinner: Spinner | null = null;
  private consola: ConsolaInstance;

  constructor() {
    try {
      mkdirSync(LOGS_DIR, { recursive: true });
    } catch (error) {
      console.error(`Failed to create logs directory: ${error instanceof Error ? error.message : String(error)}`);
    }

    const fileReporter: ConsolaReporter = {
      log: (logObj) => {
        try {
          const message = logObj.args
            .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
            .join(" ")
            .replace(/\u001b\[.*?m/g, "");
          const ts = logObj.date
            .toISOString()
            .replace("T", " ")
            .slice(0, 19);
          appendFileSync(LOG_FILE, `[${ts}] ${message}\n`, "utf-8");
        } catch (error) {
          console.error(`Failed to write to log file: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    };

    this.consola = createConsola({});
    this.consola.addReporter(fileReporter);
  }

  private pauseSpinner(): void {
    this.spinner?.clear();
  }

  info(message: string): void {
    this.pauseSpinner();
    this.consola.info(message);
  }

  success(message: string): void {
    this.pauseSpinner();
    this.consola.success(message);
  }

  warn(message: string): void {
    this.pauseSpinner();
    this.consola.warn(message);
  }

  error(message: string): void {
    this.pauseSpinner();
    this.consola.error(message);
  }

  log(message: string): void {
    this.pauseSpinner();
    this.consola.log(message);
  }

  startSpinner(text: string): void {
    if (!this.spinner) {
      this.spinner = yoctoSpinner({ text, color: "cyan" }).start();
    } else {
      this.spinner.text = text;
    }
  }

  updateSpinner(text: string): void {
    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  getProgressBar(current: number, total: number, width = 15): string {
    if (total <= 0) total = 100;
    const percent = Math.min(1, current / total);
    const filled = Math.round(width * percent);
    
    // Clean, modern, slim horizontal bar style using Catppuccin-inspired colors (cyan filled, dim gray empty)
    const filledBar = "\u2501".repeat(filled);
    const emptyBar = "\u2500".repeat(width - filled);
    const coloredBar = `\x1b[36m${filledBar}\x1b[90m${emptyBar}\x1b[39m`;
    
    const pct = String(Math.round(percent * 100)).padStart(3);
    return `\x1b[90m▕\x1b[39m${coloredBar}\x1b[90m▏\x1b[39m ${pct}%`;
  }
}
