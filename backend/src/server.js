import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp();

const server = app.listen(config.API_PORT, () => {
  console.log(`ElonMealsDB API listening on ${config.API_PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
