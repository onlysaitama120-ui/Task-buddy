import { UserStatisticsRepository, TaskClaimRepository } from '../database/repositories';

export class StatisticsService {
  private statsRepo = new UserStatisticsRepository();
  private claimRepo = new TaskClaimRepository();

  async getUserStatistics(userId: string) {
    const stats = await this.statsRepo.findByUserId(userId);
    const claims = await this.claimRepo.findByUserId(userId);

    const completed = claims.filter(c => c.status === 'COMPLETED').length;
    const rejected = claims.filter(c => c.status === 'REJECTED').length;
    const timedOut = claims.filter(c => c.status === 'TIMED_OUT').length;
    const totalEarned = claims
      .filter(c => c.status === 'COMPLETED')
      .reduce((sum, c) => sum + Number(c.payAmount), 0);

    return {
      completed: stats?.completed ?? completed,
      rejected: stats?.rejected ?? rejected,
      timedOut: stats?.timedOut ?? timedOut,
      totalEarned: Number(stats?.totalEarned ?? totalEarned),
    };
  }

  async recordCompletion(userId: string, amount: number) {
    return this.statsRepo.incrementCompleted(userId, amount);
  }

  async recordRejection(userId: string) {
    return this.statsRepo.incrementRejected(userId);
  }

  async recordTimeout(userId: string) {
    return this.statsRepo.incrementTimedOut(userId);
  }
}