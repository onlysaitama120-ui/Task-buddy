import { prisma } from '../database/prisma/client';
import { TaskStatus } from '@prisma/client';
import { TaskEventRepository } from '../database/repositories';

export class TaskTimeoutService {
  private eventRepo = new TaskEventRepository();

  /** Scan for claims whose due‑date has passed and time‑out them. */
  async processTimeouts() {
    const now = new Date();
    const overdue = await prisma.taskClaim.findMany({
      where: {
        status: { in: [TaskStatus.CLAIMED, TaskStatus.IN_PROGRESS] },
        dueAt: { lt: now },
      },
    });

    for (const claim of overdue) {
      await prisma.taskClaim.update({
        where: { id: claim.id },
        data: { status: TaskStatus.TIMED_OUT, reviewedAt: now, reviewedBy: 'system' },
      });

      if (claim.ticketId) {
        await prisma.ticket.update({
          where: { id: claim.ticketId },
          data: { isClosed: true, closedAt: now, closedBy: 'system' },
        });
      }

      await this.eventRepo.create(
        claim.id,
        'TIMED_OUT',
        `Task timed out automatically after ${now.toISOString()}`,
        {}
      );
    }
  }
}
