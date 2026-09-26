
import { synchronize } from './synchronizer';

const SYNC_INTERVAL = 1000 * 60 * 60; // 1 hour

export function startScheduler(): void {
  console.log('Starting asset registry synchronization scheduler...');

  // Run the synchronization job immediately
  synchronize();

  // Schedule the job to run at a regular interval
  setInterval(synchronize, SYNC_INTERVAL);
}