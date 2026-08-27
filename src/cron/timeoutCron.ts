import { TaskTimeoutService } from '../services/taskTimeoutService';

const timeoutService = new TaskTimeoutService();

/**
 * Starts the background worker that processes overdue task claims.
 * Runs once immediately, then every 60 seconds.
 */
export function startTimeoutWorker() {
  // Run now
  timeoutService.processTimeouts().catch(console.error);
  // Schedule recurring run
  setInterval(() => timeoutService.processTimeouts().catch(console.error), 60_000);
}
