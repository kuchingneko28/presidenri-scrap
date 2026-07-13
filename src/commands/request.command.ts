import type { CAC } from "cac";
import type { AppService } from "../services/AppService";

export function registerRequestCommand(cli: CAC, app: AppService): void {
  cli
    .command("request", "Create storage/browser-request.curl if needed")
    .action(() => app.runAndExit(async () => {
      await app.initRequestFile();
    }));
}
