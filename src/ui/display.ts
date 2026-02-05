import chalk from "chalk";
import ora, { type Ora } from "ora";

let spinner: Ora | null = null;

export function log(message: string): void {
  if (spinner) {
    spinner.stop();
    console.log(message);
    spinner.start();
  } else {
    console.log(message);
  }
}

export function info(message: string): void {
  log(chalk.blue("ℹ") + " " + message);
}

export function success(message: string): void {
  log(chalk.green("✔") + " " + message);
}

export function warn(message: string): void {
  log(chalk.yellow("⚠") + " " + message);
}

export function error(message: string): void {
  if (spinner) spinner.stop();
  console.error(chalk.red("✖") + " " + message);
  if (spinner) spinner.start();
}

export function startSpinner(text: string): void {
  if (spinner) {
    spinner.text = text;
  } else {
    spinner = ora(text).start();
  }
}

export function stopSpinner(symbol: string = "✔", text?: string): void {
  if (spinner) {
    spinner.stopAndPersist({ symbol, text });
    spinner = null;
  }
}

export function failSpinner(text?: string): void {
  if (spinner) {
    spinner.fail(text);
    spinner = null;
  }
}

export function updateSpinner(text: string): void {
  if (spinner) {
    spinner.text = text;
  }
}
