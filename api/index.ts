import { loadConfig } from '../backend/config.js';
import { createApp } from '../backend/server.js';
import { AppContext } from '../backend/services/appContext.js';

const config = loadConfig();
const ctx = new AppContext(config);
ctx.current().recover();
const app = createApp(ctx);

export default app;
