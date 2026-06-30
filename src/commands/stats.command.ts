import type { CAC } from "cac";
import type { AppService } from "../services/AppService";

export function registerStatsCommand(cli: CAC, app: AppService): void {
  cli.command("stats", "Show database article count").action(() => {
    app.showStats();
    app.shutdown();
    process.exit(0);
  });
}
