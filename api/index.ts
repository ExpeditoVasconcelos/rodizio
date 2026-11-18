import { loadConfig } from '../backend/config.js';
import { createApp } from '../backend/server.js';
import { AppContext } from '../backend/services/appContext.js';

const config = loadConfig();
const ctx = new AppContext(config);
void ctx.current().recover();
void ctx.current().maintain();
const app = createApp(ctx);

export default app;
