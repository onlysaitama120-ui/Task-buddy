import { getConfig } from '../config';
import { RedditAccountRepository, BotConfigRepository } from '../database/repositories';

export class VerificationService {
  private redditAccountRepo = new RedditAccountRepository();
  private configRepo = new BotConfigRepository();

  async checkVerification(discordId: string, guildId: string): Promise<{ verified: boolean; reason?: string }> {
    const account = await this.redditAccountRepo.findByUserId(discordId);
    const botConfig = await this.configRepo.get(guildId);
    const config = getConfig();

    const minKarma = botConfig?.minKarma ?? config.MIN_REDDIT_KARMA;
    const minAccountAge = botConfig?.minAccountAge ?? config.MIN_REDDIT_ACCOUNT_AGE_DAYS;

    if (!account) {
      return { verified: false, reason: 'No Reddit account registered. Use /register to add your Reddit account.' };
    }

    if (account.karma < minKarma) {
      return { verified: false, reason: `Insufficient karma. Required: ${minKarma}, Current: ${account.karma}` };
    }

    if (account.accountAge < minAccountAge) {
      return { verified: false, reason: `Account too new. Required age: ${minAccountAge} days, Current: ${account.accountAge} days` };
    }

    return { verified: true };
  }

  async getVerificationStatus(discordId: string, guildId: string) {
    const account = await this.redditAccountRepo.findByUserId(discordId);
    const botConfig = await this.configRepo.get(guildId);
    const config = getConfig();

    const minKarma = botConfig?.minKarma ?? config.MIN_REDDIT_KARMA;
    const minAccountAge = botConfig?.minAccountAge ?? config.MIN_REDDIT_ACCOUNT_AGE_DAYS;

    if (!account) {
      return { registered: false, verified: false, requiredKarma: minKarma, requiredAccountAge: minAccountAge };
    }

    return {
      registered: true,
      verified: account.isVerified,
      username: account.username,
      karma: account.karma,
      accountAge: account.accountAge,
      requiredKarma: minKarma,
      requiredAccountAge: minAccountAge,
    };
  }
}