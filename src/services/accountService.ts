import { getConfig } from '../config';
import { RedditAccountRepository, BotConfigRepository } from '../database/repositories';

export class AccountService {
  private redditAccountRepo = new RedditAccountRepository();
  private configRepo = new BotConfigRepository();

  async registerAccount(discordId: string, redditUsername: string, karma: number, accountAgeDays: number, redditId?: string) {
    return this.redditAccountRepo.upsert(discordId, redditUsername, karma, accountAgeDays, redditId);
  }

  async getAccounts(discordId: string) {
    return this.redditAccountRepo.findByUserId(discordId);
  }

  async getAccount(discordId: string) {
    const accounts = await this.redditAccountRepo.findByUserId(discordId);
    return accounts[0] ?? null;
  }

  async getVerifiedAccounts(discordId: string, guildId: string) {
    const accounts = await this.redditAccountRepo.findByUserId(discordId);
    if (accounts.length === 0) return [];

    const botConfig = await this.configRepo.get(guildId);
    const config = getConfig();
    const minKarma = botConfig?.minKarma ?? config.MIN_REDDIT_KARMA;
    const minAccountAge = botConfig?.minAccountAge ?? config.MIN_REDDIT_ACCOUNT_AGE_DAYS;

    return accounts.filter(a => a.karma >= minKarma && a.accountAge >= minAccountAge);
  }

  async isVerified(discordId: string, guildId: string): Promise<boolean> {
    const accounts = await this.redditAccountRepo.findByUserId(discordId);
    if (accounts.length === 0) return false;
    
    const botConfig = await this.configRepo.get(guildId);
    const config = getConfig();
    const minKarma = botConfig?.minKarma ?? config.MIN_REDDIT_KARMA;
    const minAccountAge = botConfig?.minAccountAge ?? config.MIN_REDDIT_ACCOUNT_AGE_DAYS;
    
    return accounts.some(a => a.karma >= minKarma && a.accountAge >= minAccountAge);
  }

  async updateVerification(discordId: string, username: string, karma: number, accountAgeDays: number) {
    return this.redditAccountRepo.update(discordId, username, {
      karma,
      accountAge: accountAgeDays,
    });
  }

  async updateOAuthTokens(discordId: string, username: string, data: { redditId?: string; accessToken?: string; refreshToken?: string; tokenExpiresAt?: Date }) {
    return this.redditAccountRepo.update(discordId, username, data);
  }
}