// index.ts – Minimal bot entry point for Render deployment
// This stub starts the Discord client, registers the verification modal, and runs the timeout worker.
// All other command handling can be added later via separate modules.

import { Client, IntentsBitField } from 'discord.js';
import { loadConfig } from './config';
import { registerVerificationInteraction } from './discord/verificationInteraction';
import { startTimeoutWorker } from './cron/timeoutCron';
import { PrismaClient } from '@prisma/client';

// Load env config (will exit if required vars missing)
const config = loadConfig();

// Initialise Discord client (only the intents we need)
const client = new Client({
  intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages],
});

client.once('ready', async () => {
  console.log(`🤖 Bot logged in as ${client.user?.tag}`);

  // Register the Verify‑Reddit button handler (shows modal)
  registerVerificationInteraction(client);

  // Start the background timeout worker (runs every minute)
  startTimeoutWorker();
});

client.login(config.DISCORD_TOKEN).catch((err) => {
  console.error('Failed to login to Discord:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received – shutting down');
  await client.destroy();
  process.exit(0);
});
