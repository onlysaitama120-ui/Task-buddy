import { PrismaClient, TaskStatus, BatchStatus, TaskType } from '@prisma/client';
import { prisma } from '../prisma/client';

export class UserRepository {
  async findById(discordId: string) {
    return prisma.user.findUnique({ where: { id: discordId } });
  }

  async upsert(discordId: string, username: string, discriminator: string | null, avatar: string | null) {
    return prisma.user.upsert({
      where: { id: discordId },
      update: { username, discriminator, avatar, updatedAt: new Date() },
      create: { id: discordId, username, discriminator, avatar },
    });
  }

  async ensureExists(discordId: string, username: string, discriminator: string | null, avatar: string | null) {
    return prisma.user.upsert({
      where: { id: discordId },
      update: { username, discriminator, avatar, updatedAt: new Date() },
      create: { id: discordId, username, discriminator, avatar },
    });
  }
}

export class RedditAccountRepository {
  async findByUserId(userId: string) {
    return prisma.redditAccount.findUnique({ where: { userId } });
  }

  async findByUsername(username: string) {
    return prisma.redditAccount.findFirst({ where: { username } });
  }

  async create(userId: string, username: string, karma: number, accountAge: number) {
    return prisma.redditAccount.create({
      data: { userId, username, karma, accountAge },
    });
  }

  async update(userId: string, data: { karma?: number; accountAge?: number; isVerified?: boolean; verifiedAt?: Date }) {
    return prisma.redditAccount.update({
      where: { userId },
      data,
    });
  }

  async upsert(userId: string, username: string, karma: number, accountAge: number) {
    return prisma.redditAccount.upsert({
      where: { userId },
      update: { username, karma, accountAge, updatedAt: new Date() },
      create: { userId, username, karma, accountAge },
    });
  }
}

export class AuthorizedGuildRepository {
  async findByGuildId(guildId: string) {
    return prisma.authorizedGuild.findUnique({ where: { guildId } });
  }

  async isAuthorized(guildId: string): Promise<boolean> {
    const guild = await prisma.authorizedGuild.findUnique({ where: { guildId } });
    return guild?.enabled ?? false;
  }

  async authorize(guildId: string, authorizedBy: string) {
    return prisma.authorizedGuild.upsert({
      where: { guildId },
      update: { enabled: true, authorizedBy, authorizedAt: new Date() },
      create: { guildId, enabled: true, authorizedBy },
    });
  }

  async deauthorize(guildId: string) {
    return prisma.authorizedGuild.update({
      where: { guildId },
      data: { enabled: false },
    });
  }

  async getAllAuthorized() {
    return prisma.authorizedGuild.findMany({
      where: { enabled: true },
    });
  }
}

export class TaskBatchRepository {
  async findById(id: string) {
    return prisma.taskBatch.findUnique({
      where: { id },
      include: { tasks: true },
    });
  }

  async findActive(guildId: string) {
    return prisma.taskBatch.findFirst({
      where: { status: BatchStatus.ACTIVE, guildId },
      include: { tasks: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(guildId: string) {
    return prisma.taskBatch.findMany({
      where: { guildId },
      include: { tasks: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    name: string;
    type: TaskType;
    taskCount: number;
    payPerTask: number;
    minKarma: number;
    minAccountAge: number;
    createdBy: string;
    guildId: string;
    announcementChannelId?: string;
  }) {
    return prisma.taskBatch.create({
      data: {
        ...data,
        payPerTask: data.payPerTask,
      },
    });
  }

  async update(id: string, data: Partial<{
    name: string;
    status: BatchStatus;
    announcementId: string;
    announcementChannelId: string;
  }>) {
    return prisma.taskBatch.update({
      where: { id },
      data,
    });
  }

  async getAvailableTaskCount(batchId: string) {
    return prisma.task.count({
      where: { batchId, status: TaskStatus.AVAILABLE },
    });
  }
}

export class TaskRepository {
  async findById(id: string) {
    return prisma.task.findUnique({ where: { id } });
  }

  async findAvailableByBatch(batchId: string) {
    return prisma.task.findFirst({
      where: { batchId, status: TaskStatus.AVAILABLE },
    });
  }

  async findByBatch(batchId: string) {
    return prisma.task.findMany({
      where: { batchId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMany(batchId: string, tasks: { comment: string; redditLink: string }[]) {
    return prisma.task.createMany({
      data: tasks.map(t => ({ batchId, comment: t.comment, redditLink: t.redditLink })),
    });
  }

  async claim(taskId: string, userId: string, dueAt: Date) {
    return prisma.task.update({
      where: { id: taskId, status: TaskStatus.AVAILABLE },
      data: {
        status: TaskStatus.CLAIMED,
        assignedTo: userId,
        claimedAt: new Date(),
        dueAt,
      },
    });
  }

  async updateStatus(id: string, status: TaskStatus) {
    return prisma.task.update({
      where: { id },
      data: { status },
    });
  }

  async clearAssignment(taskId: string) {
    return prisma.task.update({
      where: { id: taskId },
      data: {
        assignedTo: null,
        claimedAt: null,
        dueAt: null,
      },
    });
  }
}

export class TaskClaimRepository {
  async findById(id: string) {
    return prisma.taskClaim.findUnique({
      where: { id },
      include: { user: true, redditAccount: true, task: true, batch: true, ticket: true },
    });
  }

  async findByUserAndBatch(userId: string, batchId: string) {
    return prisma.taskClaim.findFirst({
      where: { userId, batchId },
    });
  }

  async findByTaskId(taskId: string) {
    return prisma.taskClaim.findUnique({ where: { taskId } });
  }

  async create(data: {
    userId: string;
    redditAccountId: string;
    taskId: string;
    batchId: string;
    payAmount: number;
  }) {
    return prisma.taskClaim.create({ data: { ...data, payAmount: data.payAmount } });
  }

  async update(id: string, data: Partial<{
    status: TaskStatus;
    proofUrl: string;
    submittedAt: Date;
    reviewedAt: Date;
    reviewedBy: string;
    completedAt: Date;
  }>) {
    return prisma.taskClaim.update({ where: { id }, data });
  }

  async findByUserId(userId: string) {
    return prisma.taskClaim.findMany({
      where: { userId },
      include: { task: true, batch: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export class TicketRepository {
  async findByClaimId(claimId: string) {
    return prisma.ticket.findUnique({ where: { claimId } });
  }

  async findByChannelId(channelId: string) {
    return prisma.ticket.findUnique({ where: { channelId } });
  }

  async create(claimId: string, channelId: string) {
    return prisma.ticket.create({ data: { claimId, channelId } });
  }

  async close(claimId: string, closedBy: string) {
    return prisma.ticket.update({
      where: { claimId },
      data: { isClosed: true, closedAt: new Date(), closedBy },
    });
  }
}

export class TaskEventRepository {
  async create(claimId: string, type: string, description: string, metadata?: Record<string, unknown>) {
    return prisma.taskEvent.create({ data: { claimId, type, description, metadata: metadata as any } });
  }

  async findByClaimId(claimId: string) {
    return prisma.taskEvent.findMany({
      where: { claimId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export class UserStatisticsRepository {
  async findByUserId(userId: string) {
    return prisma.userStatistics.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: { completed?: number; rejected?: number; timedOut?: number; totalEarned?: number }) {
    return prisma.userStatistics.upsert({
      where: { userId },
      update: { ...data, lastUpdated: new Date() },
      create: { userId, ...data },
    });
  }

  async incrementCompleted(userId: string, amount: number) {
    return prisma.userStatistics.upsert({
      where: { userId },
      update: { completed: { increment: 1 }, totalEarned: { increment: amount }, lastUpdated: new Date() },
      create: { userId, completed: 1, totalEarned: amount },
    });
  }

  async incrementRejected(userId: string) {
    return prisma.userStatistics.upsert({
      where: { userId },
      update: { rejected: { increment: 1 }, lastUpdated: new Date() },
      create: { userId, rejected: 1 },
    });
  }

  async incrementTimedOut(userId: string) {
    return prisma.userStatistics.upsert({
      where: { userId },
      update: { timedOut: { increment: 1 }, lastUpdated: new Date() },
      create: { userId, timedOut: 1 },
    });
  }
}

export class BotConfigRepository {
  async get(guildId: string) {
    return prisma.botConfig.findUnique({ where: { guildId } });
  }

  async upsert(guildId: string, data: Partial<{
    announcementChannelId: string;
    taskModRoleId: string;
    taskCategoryId: string;
    minKarma: number;
    minAccountAge: number;
    taskDeadlineMinutes: number;
  }>) {
    return prisma.botConfig.upsert({
      where: { guildId },
      update: data,
      create: { guildId, ...data },
    });
  }
}