import { Client, IntentsBitField } from 'discord.js';
import { loadConfig } from './config';
import { registerVerificationInteraction } from './discord/verificationInteraction';
import { startTimeoutWorker } from './cron/timeoutCron';
import { createServer } from 'http';
import { prisma } from './database/prisma/client';

const config = loadConfig();

// ---- Tiny HTTP server for Render port detection ----
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Task-buddy bot is running!');
});
server.listen(PORT, () => {
  console.log(`🌐 HTTP server listening on port ${PORT} (for Render)`);
}

// ---- Discord bot ----
const client = new Client({
  intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages],
});

client.once('ready', async () => {
  console.log(`🤖 Bot logged in as ${client.user?.tag}`);
  
  // Warm up database connection to avoid first-query latency
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('🔌 Database connection warmed up');
  } catch (err) {
    console.error('Failed to warm up database:', err);
  }
  
  registerVerificationInteraction(client);
  startTimeoutWorker();
});

client.login(config.DISCORD_TOKEN).catch((err) => {
  console.error('Failed to login to Discord:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received – shutting down');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  await client.destroy();
});