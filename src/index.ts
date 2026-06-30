import { cac } from "cac";
import { AppService } from "./services/AppService";
import { registerApiCommand } from "./commands/api.command";
import { registerLegacyCommand } from "./commands/legacy.command";
import { registerRequestCommand } from "./commands/request.command";
import { registerStatsCommand } from "./commands/stats.command";
import { registerSyncCommand } from "./commands/sync.command";
import pkg from "../package.json";

const cli = cac("presidenri-scrap");
const app = new AppService();

cli.version(pkg.version);

registerApiCommand(cli, app);
registerLegacyCommand(cli, app);
registerRequestCommand(cli, app);
registerStatsCommand(cli, app);
registerSyncCommand(cli, app);

cli.help();
cli.parse();
