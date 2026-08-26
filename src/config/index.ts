import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  OWNER_USER_ID: z.string().min(1, 'OWNER_USER_ID is required'),
  MIN_REDDIT_KARMA: z.coerce.number().int().positive().default(100),
  MIN_REDDIT_ACCOUNT_AGE_DAYS: z.coerce.number().int().positive().default(30),
  TASK_DEADLINE_MINUTES: z.coerce.number().int().positive().default(30),
  REDDIT_CLIENT_ID: z.string().min(1, 'REDDIT_CLIENT_ID is required'),
  REDDIT_CLIENT_SECRET: z.string().min(1, 'REDDIT_CLIENT_SECRET is required'),
  REDDIT_REDIRECT_URI: z.string().min(1, 'REDDIT_REDIRECT_URI is required'),
});

export type Config = z.infer<typeof envSchema>;

let config: Config;

export function loadConfig(): Config {
  if (config) return config;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Configuration validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  config = result.data;
  return config;
}

export function getConfig(): Config {
  if (!config) {
    return loadConfig();
  }
  return config;
}

export function getOwnerUserId(): string {
  return getConfig().OWNER_USER_ID;
}