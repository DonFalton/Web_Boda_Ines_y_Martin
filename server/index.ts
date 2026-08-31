import { createApp } from "./app.js";
import { assertProductionConfig, loadConfig } from "./config.js";
import { MicrosoftGraphService } from "./graph.js";
import { createAlbumStore } from "./store-factory.js";

const config = loadConfig();
assertProductionConfig(config);

const store = createAlbumStore(config);
await store.init();

const graph = new MicrosoftGraphService(config, store);
const app = createApp({ config, store, graph });
const server = app.listen(config.port, () => console.info(`[album] API listening on http://localhost:${config.port}`));

async function shutdown() {
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
