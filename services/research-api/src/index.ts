import { closeDb } from "@zepto/research-database";
import { getServerEnv, loadRootEnv } from "@zepto/shared-config";
import { createApp } from "./app.js";

loadRootEnv();
const env = getServerEnv();
const server = createApp(env).listen(env.API_PORT, () => console.log(`Research API listening on http://localhost:${env.API_PORT}`));

function stop(): void {
  server.close(() => { void closeDb(); });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
