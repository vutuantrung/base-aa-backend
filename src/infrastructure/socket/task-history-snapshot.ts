import type { TaskHistorySnapshot } from '../../modules/task-workflow/task-workflow.js';

export interface TaskHistoryConnection {
  readonly connected: boolean;
  emit(event: string, payload: unknown): void;
}

export interface TaskHistoryReader {
  createHistorySnapshot(): Promise<TaskHistorySnapshot>;
}

/** Infrastructure owns current-connection guards and snapshot event delivery. */
export async function sendTaskHistorySnapshot(
  connection: TaskHistoryConnection,
  isCurrent: () => boolean,
  workflow: TaskHistoryReader
): Promise<void> {
  if (!isCurrent()) return;
  try {
    const snapshot = await workflow.createHistorySnapshot();
    if (!connection.connected || !isCurrent()) return;
    connection.emit('task:lifecycle:snapshot', snapshot);
  } catch (error) {
    console.error('[AS] TASK SNAPSHOT ERROR', error);
    if (connection.connected && isCurrent()) {
      connection.emit('task:lifecycle:snapshot', {
        timestamp: Date.now(), tasks: [], error: 'Unable to load persisted task history'
      });
    }
  }
}
