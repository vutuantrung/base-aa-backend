import { access, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import type { PeerMessage, PeerMessageAck } from '../peer-messaging/contracts.js';
import { AtomicJsonRecordStore, type ReliabilityLimits, type ReliableRecord } from '../../shared/persistence/atomic-json-record-store.js';

export const taskSchema = z.object({
  id: z.string().regex(/^task-[a-zA-Z0-9-]{1,100}$/),
  status: z.enum(['inProgress', 'finished']),
  config: z.string(),
  createdTime: z.number().int().nonnegative(),
  updatedTime: z.number().int().nonnegative()
}).strict();

export type StoredTask = z.infer<typeof taskSchema>;
export type TaskOperationKind = 'F08' | 'F09';

export interface TaskOperationPayload {
  kind: TaskOperationKind;
  task: StoredTask;
  targetId?: string;
  sourceInstanceId?: string;
  outbound: PeerMessage;
}

function isTaskOperationPayload(value: unknown): value is TaskOperationPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<TaskOperationPayload>;
  return (payload.kind === 'F08' || payload.kind === 'F09') && taskSchema.safeParse(payload.task).success &&
    Boolean(payload.outbound && typeof payload.outbound === 'object');
}

function isPeerMessageAck(value: unknown): value is PeerMessageAck {
  if (!value || typeof value !== 'object' || !('ok' in value)) return false;
  return value.ok === true || value.ok === false;
}

export interface TaskFileStore {
  save(task: StoredTask): Promise<void>;
  read(taskId: string): Promise<StoredTask | undefined>;
  saveResult(task: StoredTask): Promise<void>;
  listRecent(limit?: number): Promise<StoredTask[]>;
}

/** Legacy task files remain readable; new receipts and outbox state live in a separate subdirectory. */
export class JsonTaskFileStore implements TaskFileStore {
  private readonly directory: string;
  readonly reliability: AtomicJsonRecordStore<TaskOperationPayload, PeerMessageAck>;

  constructor(directory = process.env.AAB_TASK_STORE_DIR ?? './data/tasks', limits?: ReliabilityLimits) {
    this.directory = resolve(directory);
    this.reliability = new AtomicJsonRecordStore(
      join(this.directory, '.r7.5-outbox'), isTaskOperationPayload, isPeerMessageAck, limits
    );
  }

  private filePath(id: string): string {
    if (!/^task-[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid task ID');
    return join(this.directory, id + '.json');
  }

  async save(task: StoredTask): Promise<void> {
    const parsed = taskSchema.parse(task);
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.filePath(parsed.id), JSON.stringify(parsed, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }

  async saveResult(task: StoredTask): Promise<void> {
    const parsed = taskSchema.parse(task);
    if (parsed.status !== 'finished') throw new Error('Only finished results can be saved');
    const original = await this.read(parsed.id);
    if (!original || original.config !== parsed.config ||
        original.createdTime !== parsed.createdTime ||
        parsed.updatedTime < original.updatedTime) {
      throw new Error('Finished task does not match a persisted request');
    }
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, parsed.id + '.result.json'),
      JSON.stringify(parsed, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }

  async listRecent(limit = 50): Promise<StoredTask[]> {
    let filenames: string[];
    try {
      filenames = (await readdir(this.directory))
        .filter(name => /^task-[a-zA-Z0-9-]{1,100}\.json$/.test(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const candidates = await Promise.all(filenames.map(async name => ({
      name,
      mtime: (await stat(join(this.directory, name))).mtimeMs
    })));
    const results = new Map<string, { task: StoredTask; time: number }>();
    for (const candidate of candidates) {
      const id = candidate.name.slice(0, -'.json'.length);
      const request = await this.readLegacy(id);
      if (!request) continue;
      let task = request;
      try {
        const finished = taskSchema.parse(JSON.parse(await readFile(join(this.directory, id + '.result.json'), 'utf8')));
        if (finished.status === 'finished') task = finished;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      results.set(id, { task, time: candidate.mtime });
    }
    for (const operation of await this.reliability.list()) {
      const current = results.get(operation.payload.task.id);
      const task = operation.payload.kind === 'F09' || !current ? operation.payload.task : current.task;
      results.set(operation.payload.task.id, { task, time: operation.createdAt });
    }
    return [...results.values()].sort((left, right) => right.time - left.time)
      .slice(0, Math.max(0, limit)).map(item => item.task);
  }

  async read(taskId: string): Promise<StoredTask | undefined> {
    const operation = (await this.reliability.list()).find(record =>
      record.payload.kind === 'F08' && record.payload.task.id === taskId);
    return operation?.payload.task ?? this.readLegacy(taskId);
  }

  async hasLegacyOperation(kind: TaskOperationKind, taskId: string): Promise<boolean> {
    const path = join(this.directory, kind === 'F08' ? `${taskId}.json` : `${taskId}.result.json`);
    try { await access(path); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }

  async projectLegacyOperation(payload: TaskOperationPayload): Promise<void> {
    if (payload.kind === 'F08') await this.save(payload.task);
    else await this.saveResult(payload.task);
  }

  private async readLegacy(taskId: string): Promise<StoredTask | undefined> {
    try {
      return taskSchema.parse(JSON.parse(await readFile(this.filePath(taskId), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
}

export type TaskOperationRecord = ReliableRecord<TaskOperationPayload, PeerMessageAck>;
