import { getConfig } from '../config';
import { RedditAccountRepository, BotConfigRepository } from '../database/repositories';

export class VerificationService {
  private redditAccountRepo = new RedditAccountRepository();
  private configRepo = new BotConfigRepository();

  async checkVerification(discordId: string, guildId: string): Promise<{ verified: boolean; reason?: string }> {
    const accounts = await this.redditAccountRepo.findByUserId(discordId);
    const botConfig = await this.configRepo.get(guildId);
    const config = getConfig();

    const minKarma = botConfig?.minKarma ?? config.MIN_REDDIT_KARMA;
    const minAccountAge = botConfig?.minAccountAge ?? config.MIN_REDDIT_ACCOUNT_AGE_DAYS;

    if (accounts.length === 0) {
      return { verified: false, reason: 'No Reddit account registered. Use /register to add your Reddit account.' };
    }

    for (const account of accounts) {
      if (account.karma >= minKarma && account.accountAge >= minAccountAge) {
        if (!account.isVerified) {
          await this.redditAccountRepo.update(discordId, account.username, { isVerified: true, verifiedAt: new Date() });
        }
        return { verified: true };
      }
    }

    return { verified: false, reason: 'No Reddit account meets the verification requirements.' };
  }

  async getVerificationStatus(discordId: string, guildId: string) {
    const accounts = await this.redditAccountRepo.findByUserId(discordId);
    const botConfig = await this.configRepo.get(guildId);
    const config = getConfig();

    const minKarma = botConfig?.minKarma ?? config.MIN_REDDIT_KARMA;
    const minAccountAge = botConfig?.minAccountAge ?? config.MIN_REDDIT_ACCOUNT_AGE_DAYS;

    if (accounts.length === 0) {
      return { registered: false, verified: false, requiredKarma: minKarma, requiredAccountAge: minAccountAge };
    }

    const account = accounts.find(a => a.karma >= minKarma && a.accountAge >= minAccountAge) ?? accounts[0];
    const isVerified = account.karma >= minKarma && account.accountAge >= minAccountAge;

    if (account.isVerified !== isVerified) {
      await this.redditAccountRepo.update(discordId, account.username, {
        isVerified,
        verifiedAt: isVerified ? new Date() : undefined
      });
    }

    return {
      registered: true,
      verified: isVerified,
      username: account.username,
      karma: account.karma,
      accountAge: account.accountAge,
      requiredKarma: minKarma,
      requiredAccountAge: minAccountAge,
    };
  }
}