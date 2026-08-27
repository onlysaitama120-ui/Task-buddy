import { TaskType, BatchStatus, TaskStatus } from '@prisma/client';
import { TaskBatchRepository, TaskRepository, TaskClaimRepository, TicketRepository, TaskEventRepository, BotConfigRepository } from '../database/repositories';
import { getConfig } from '../config';

export interface CreateBatchData {
  name: string;
  type: TaskType;
  taskCount: number;
  payPerTask: number;
  minKarma: number;
  minAccountAge: number;
  createdBy: string;
  guildId: string;
  tasks: { comment: string; redditLink: string }[];
}

export class TaskService {
  public batchRepo = new TaskBatchRepository();
  public taskRepo = new TaskRepository();
  public claimRepo = new TaskClaimRepository();
  public ticketRepo = new TicketRepository();
  public eventRepo = new TaskEventRepository();
  public configRepo = new BotConfigRepository();

  async createBatch(data: CreateBatchData) {
    const batch = await this.batchRepo.create({
      name: data.name,
      type: data.type,
      taskCount: data.taskCount,
      payPerTask: data.payPerTask,
      minKarma: data.minKarma,
      minAccountAge: data.minAccountAge,
      createdBy: data.createdBy,
      guildId: data.guildId,
    });

    if (data.tasks.length > 0) {
      await this.taskRepo.createMany(batch.id, data.tasks);
    }

    return batch;
  }

  async getActiveBatch(guildId: string) {
    return this.batchRepo.findActive(guildId);
  }

  async getBatchById(id: string) {
    return this.batchRepo.findById(id);
  }

  async getAllBatches(guildId: string) {
    return this.batchRepo.findAll(guildId);
  }

  async updateBatchAnnouncement(batchId: string, announcementId: string, channelId: string) {
    return this.batchRepo.update(batchId, { announcementId, announcementChannelId: channelId });
  }

  async getAvailableTask(batchId: string) {
    return this.taskRepo.findAvailableByBatch(batchId);
  }

  async getAvailableTaskCount(batchId: string) {
    return this.batchRepo.getAvailableTaskCount(batchId);
  }

  async claimTask(batchId: string, userId: string, redditAccountId: string, guildId: string) {
    const botConfig = await this.configRepo.get(guildId);
    const config = getConfig();
    const deadlineMinutes = botConfig?.taskDeadlineMinutes ?? config.TASK_DEADLINE_MINUTES;
    const dueAt = new Date(Date.now() + deadlineMinutes * 60 * 1000);

    // Use a transaction to avoid race conditions when multiple users try to claim the same task
    const result = await prisma.$transaction(async (tx) => {
      // Find the first AVAILABLE task for the batch with a row‑level lock
      const task = await tx.task.findFirst({
        where: { batchId, status: TaskStatus.AVAILABLE },
        orderBy: { createdAt: 'asc' },
        lock: { mode: 'FOR UPDATE' },
      });
      if (!task) return null;

      // Claim the task
      const claimedTask = await tx.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.CLAIMED, assignedTo: userId, claimedAt: new Date(), dueAt },
      });

      // Get the batch (needed for pay amount)
      const batch = await tx.taskBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new Error('Batch not found');

      // Create the claim record
      const claim = await tx.taskClaim.create({
        data: {
          userId,
          redditAccountId,
          taskId: task.id,
          batchId,
          payAmount: Number(batch.payPerTask),
          status: TaskStatus.CLAIMED,
        },
      });

      // Log the claim event
      await tx.taskEvent.create({
        data: {
          claimId: claim.id,
          type: 'CLAIMED',
          description: `Task claimed by user ${userId}`,
          metadata: { taskId: task.id },
        },
      });

      return { claim, task: claimedTask };
    });

    if (!result) {
      throw new Error('No available tasks in this batch or task already claimed');
    }
    return result;
  }

  async getClaimById(claimId: string) {
    return this.claimRepo.findById(claimId);
  }

  async getClaimByTaskId(taskId: string) {
    return this.claimRepo.findByTaskId(taskId);
  }

  async getUserClaimInBatch(userId: string, batchId: string) {
    return this.claimRepo.findByUserAndBatch(userId, batchId);
  }

  async submitProof(claimId: string, proofUrl: string) {
    const claim = await this.claimRepo.findById(claimId);
    if (!claim) {
      throw new Error('Claim not found');
    }

    if (claim.status !== TaskStatus.CLAIMED && claim.status !== TaskStatus.IN_PROGRESS) {
      throw new Error('Cannot submit proof for this task status');
    }

    await this.claimRepo.update(claimId, {
      status: TaskStatus.PROOF_SUBMITTED,
      proofUrl,
      submittedAt: new Date(),
    });

    await this.eventRepo.create(claimId, 'PROOF_SUBMITTED', 'Proof submitted for review', { proofUrl });

    return this.claimRepo.findById(claimId);
  }

  async completeTask(claimId: string, reviewedBy: string) {
    const claim = await this.claimRepo.findById(claimId);
    if (!claim) {
      throw new Error('Claim not found');
    }

    await this.claimRepo.update(claimId, {
      status: TaskStatus.COMPLETED,
      reviewedAt: new Date(),
      reviewedBy,
      completedAt: new Date(),
    });

    await this.eventRepo.create(claimId, 'COMPLETED', `Task completed by moderator ${reviewedBy}`);

    const ticket = await this.ticketRepo.findByClaimId(claimId);
    if (ticket) {
      await this.ticketRepo.close(claimId, reviewedBy);
    }

    return this.claimRepo.findById(claimId);
  }

  async timeoutTask(claimId: string, reviewedBy: string) {
    const claim = await this.claimRepo.findById(claimId);
    if (!claim) {
      throw new Error('Claim not found');
    }

    await this.claimRepo.update(claimId, {
      status: TaskStatus.TIMED_OUT,
      reviewedAt: new Date(),
      reviewedBy,
    });

    await this.eventRepo.create(claimId, 'TIMED_OUT', `Task timed out by moderator ${reviewedBy}`);

    const ticket = await this.ticketRepo.findByClaimId(claimId);
    if (ticket) {
      await this.ticketRepo.close(claimId, reviewedBy);
    }

    return this.claimRepo.findById(claimId);
  }

  async rejectTask(claimId: string, userId: string) {
    const claim = await this.claimRepo.findById(claimId);
    if (!claim) {
      throw new Error('Claim not found');
    }

    if (claim.userId !== userId) {
      throw new Error('You can only reject your own tasks');
    }

    await this.claimRepo.update(claimId, {
      status: TaskStatus.REJECTED,
    });

    // Clear the task assignment so it can be claimed again
    await this.taskRepo.updateStatus(claim.taskId, TaskStatus.AVAILABLE);
    await this.taskRepo.clearAssignment(claim.taskId);

    await this.eventRepo.create(claimId, 'REJECTED', 'Task rejected by user');

    const ticket = await this.ticketRepo.findByClaimId(claimId);
    if (ticket) {
      await this.ticketRepo.close(claimId, userId);
    }

    return this.claimRepo.findById(claimId);
  }

  async getBatchTasks(batchId: string) {
    return this.taskRepo.findByBatch(batchId);
  }
}