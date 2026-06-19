import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { mkdirSync, appendFileSync } from 'node:fs';
import { LOGS_DIR, LOG_FILE } from '../config/constants';
import { THEME } from '../config/theme';

export class LoggerService {
  private spinner: Ora | null = null;
  private lastUpdate = 0;
  private readonly THROTTLE_MS = 100;

  constructor() {
    try {
      mkdirSync(LOGS_DIR, { recursive: true });
    } catch (error) { /* ignore */ }
  }

  private writeToFile(message: string): void {
    try {
      const cleanMessage = message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      appendFileSync(LOG_FILE, `[${timestamp}] ${cleanMessage}\n`, 'utf-8');
    } catch (error) { /* ignore */ }
  }

  log(message: string): void {
    if (this.spinner) {
      this.spinner.clear();
      console.log(message);
      this.spinner.render();
    } else {
      console.log(message);
    }
    this.writeToFile(message);
  }

  private logWithIcon(icon: string, color: string, message: string): void {
    this.log(chalk.hex(color)(icon) + ' ' + chalk.hex(THEME.text)(message));
  }

  info(message: string): void {
    this.logWithIcon('ℹ', THEME.blue, message);
  }
  success(message: string): void {
    this.logWithIcon('✔', THEME.green, message);
  }
  warn(message: string): void {
    this.logWithIcon('⚠', THEME.yellow, message);
  }
  error(message: string): void {
    this.logWithIcon('✖', THEME.red, message);
  }

  startSpinner(text: string): void {
    if (!this.spinner) {
      this.spinner = ora({
        text: chalk.hex(THEME.text)(text),
        color: 'cyan',
      }).start();
    } else {
      this.spinner.text = chalk.hex(THEME.text)(text);
    }
  }

  updateSpinner(text: string): void {
    if (this.spinner) {
      const now = Date.now();
      if (now - this.lastUpdate >= this.THROTTLE_MS) {
        this.spinner.text = chalk.hex(THEME.text)(text);
        this.lastUpdate = now;
      }
    }
  }

  stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  getProgressBar(current: number, total: number, width: number = 15): string {
    if (total <= 0) total = 100;
    const percent = Math.min(1, current / total);
    const progress = Math.round(width * percent);

    // Catppuccin Mocha Style
    const tail = '-'.repeat(Math.max(0, progress));
    const dots = '·'.repeat(Math.max(0, width - progress));

    const isMouthOpen = Math.floor(Date.now() / 250) % 2 === 0;
    const pacmanChar = isMouthOpen ? 'C' : 'c';
    const pacman =
      percent === 1 ? chalk.hex(THEME.green)('C') : chalk.hex(THEME.yellow)(pacmanChar);

    const bar = `[${chalk.hex(THEME.mauve)(tail)}${pacman}${chalk.hex(THEME.surface2)(dots)}]`;
    const percentStr = Math.round(percent * 100)
      .toString()
      .padStart(3, ' ');

    return `${bar} ${percentStr}%`;
  }
}
