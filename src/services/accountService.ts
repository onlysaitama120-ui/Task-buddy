import { getConfig } from '../config';
import { RedditAccountRepository, BotConfigRepository } from '../database/repositories';

export class AccountService {
  private redditAccountRepo = new RedditAccountRepository();
  private configRepo = new BotConfigRepository();

  async registerAccount(discordId: string, redditUsername: string, karma: number, accountAgeDays: number) {
    return this.redditAccountRepo.upsert(discordId, redditUsername, karma, accountAgeDays);
  }

  async getAccount(discordId: string) {
    return this.redditAccountRepo.findByUserId(discordId);
  }

  async isVerified(discordId: string, guildId: string): Promise<boolean> {
    const account = await this.redditAccountRepo.findByUserId(discordId);
    if (!account) return false;
    
    const botConfig = await this.configRepo.get(guildId);
    const config = getConfig();
    const minKarma = botConfig?.minKarma ?? config.MIN_REDDIT_KARMA;
    const minAccountAge = botConfig?.minAccountAge ?? config.MIN_REDDIT_ACCOUNT_AGE_DAYS;
    
    return account.karma >= minKarma && account.accountAge >= minAccountAge;
  }

  async updateVerification(discordId: string, karma: number, accountAgeDays: number) {
    return this.redditAccountRepo.update(discordId, {
      karma,
      accountAge: accountAgeDays,
    });
  }
}