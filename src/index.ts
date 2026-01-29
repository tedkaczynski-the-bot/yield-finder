console.log('Loading agent module...');
import { app } from './lib/agent';
console.log('Agent module loaded');

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

console.log(`Starting agent server on port ${port}...`);

export default {
  port,
  fetch: app.fetch,
};
