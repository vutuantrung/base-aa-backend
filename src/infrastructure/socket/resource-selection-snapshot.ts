import type { ResourceSelectionSnapshot } from '../../modules/resource-selection/resource-selection-workflow.js';

export interface ResourceSelectionSnapshotConnection {
  readonly connected: boolean;
  emit(event: string, payload: unknown): void;
}

export interface ResourceSelectionSnapshotReader {
  createSnapshot(): Promise<ResourceSelectionSnapshot>;
}

/** Infrastructure guards the original AAUI connection around M13 history reads. */
export async function sendResourceSelectionSnapshot(
  connection: ResourceSelectionSnapshotConnection,
  isCurrent: () => boolean,
  workflow: ResourceSelectionSnapshotReader
): Promise<void> {
  if (!isCurrent()) return;
  try {
    const snapshot = await workflow.createSnapshot();
    if (!connection.connected || !isCurrent()) return;
    connection.emit('resource-selection:snapshot', snapshot);
  } catch (error) {
    console.error('[AAB] RESOURCE SELECTION SNAPSHOT FAILED', error);
    if (connection.connected && isCurrent()) {
      connection.emit('resource-selection:snapshot', {
        records: [], timestamp: Date.now(), error: 'Could not load saved selections'
      });
    }
  }
}
