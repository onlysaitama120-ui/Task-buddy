import { prisma } from '../database/prisma/client';
import { TaskStatus } from '@prisma/client';
import { TaskEventRepository } from '../database/repositories';

export class TaskTimeoutService {
  private eventRepo = new TaskEventRepository();

  /** Scan for claims whose due‑date has passed and time‑out them. */
  async processTimeouts() {
    const now = new Date();
    
    // Find overdue claims by joining with Task to check dueAt
    const overdueClaims = await prisma.taskClaim.findMany({
      where: {
        status: { in: [TaskStatus.CLAIMED, TaskStatus.IN_PROGRESS] },
        task: {
          dueAt: { lt: now },
        },
      },
      include: {
        task: true,
        ticket: true,
      },
    });

    for (const claim of overdueClaims) {
      await prisma.taskClaim.update({
        where: { id: claim.id },
        data: { status: TaskStatus.TIMED_OUT, reviewedAt: now, reviewedBy: 'system' },
      });

      // Close associated ticket if exists
      if (claim.ticket) {
        await prisma.ticket.update({
          where: { id: claim.ticket.id },
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