import chalk from "chalk";
import ora, { type Ora } from "ora";

// Catppuccin Mocha Theme
export const THEME = {
  rosewater: "#f5e0dc",
  flamingo: "#f2cdcd",
  pink: "#f5c2e7",
  mauve: "#cba6f7",
  red: "#f38ba8",
  maroon: "#eba0ac",
  peach: "#fab387",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  teal: "#94e2d5",
  sky: "#89dceb",
  sapphire: "#74c7ec",
  blue: "#89b4fa",
  lavender: "#b4befe",
  text: "#cdd6f4",
  subtext1: "#bac2de",
  overlay0: "#6c7086",
};

let spinner: Ora | null = null;

export function log(message: string): void {
  if (spinner) {
    spinner.clear(); // temporarily clear
    console.log(message);
    spinner.render(); // re-render
  } else {
    console.log(message);
  }
}

export function info(message: string): void {
  log(chalk.hex(THEME.blue)("ℹ") + " " + chalk.hex(THEME.text)(message));
}

export function success(message: string): void {
  log(chalk.hex(THEME.green)("✔") + " " + chalk.hex(THEME.text)(message));
}

export function warn(message: string): void {
  log(chalk.hex(THEME.yellow)("⚠") + " " + chalk.hex(THEME.text)(message));
}

export function error(message: string): void {
  log(chalk.hex(THEME.red)("✖") + " " + chalk.hex(THEME.text)(message));
}

export function initSpinner(text: string): void {
  if (!spinner) {
    spinner = ora({
      text: chalk.hex(THEME.text)(text),
      color: "cyan", // ora doesn't support hex color directly for spinner, keeps "cyan" or closest
    }).start();
  } else {
    spinner.text = chalk.hex(THEME.text)(text);
  }
}

export function updateSpinner(text: string): void {
  if (spinner) {
    spinner.text = chalk.hex(THEME.text)(text);
  }
}

export function stopSpinner(): void {
  if (spinner) {
    spinner.stop();
    spinner = null;
  }
}

export function formatStatus(stats: {
  page: number;
  found: number;
  queued: number;
  active: number;
  downloaded: number;
}): string {
  return `${chalk.hex(THEME.mauve)(`Scraping Page ${stats.page}`)} (${chalk.hex(THEME.subtext1)(`Found: ${stats.found}`)}) | Downloads: ${chalk.hex(THEME.yellow)(`${stats.queued} queued`)}, ${chalk.hex(THEME.blue)(`${stats.active} active`)}, ${chalk.hex(THEME.green)(`${stats.downloaded} done`)}`;
}

