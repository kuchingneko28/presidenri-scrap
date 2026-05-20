import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export const THEME = {
  rosewater: '#f5e0dc',
  flamingo: '#f2cdcd',
  pink: '#f5c2e7',
  mauve: '#cba6f7',
  red: '#f38ba8',
  maroon: '#eba0ac',
  peach: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  teal: '#94e2d5',
  sky: '#89dceb',
  sapphire: '#74c7ec',
  blue: '#89b4fa',
  lavender: '#b4befe',
  text: '#cdd6f4',
  subtext1: '#bac2de',
  subtext0: '#a6adc8',
  overlay2: '#9399b2',
  overlay1: '#7f849c',
  overlay0: '#6c7086',
  surface2: '#585b70',
  surface1: '#45475a',
  surface0: '#313244',
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',
};

export class LoggerService {
  private spinner: Ora | null = null;
  private lastUpdate = 0;
  private readonly THROTTLE_MS = 100;

  log(message: string): void {
    if (this.spinner) {
      this.spinner.clear();
      console.log(message);
      this.spinner.render();
    } else {
      console.log(message);
    }
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

    const pacmanChar = current % 2 === 0 ? 'C' : 'c';
    const pacman =
      percent === 1 ? chalk.hex(THEME.green)('C') : chalk.hex(THEME.yellow)(pacmanChar);

    const bar = `[${chalk.hex(THEME.mauve)(tail)}${pacman}${chalk.hex(THEME.surface2)(dots)}]`;
    const percentStr = Math.round(percent * 100)
      .toString()
      .padStart(3, ' ');

    return `${bar} ${percentStr}%`;
  }
}
