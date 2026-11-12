import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';

export const taskSchema = z.object({
  id: z.string().regex(/^task-[a-zA-Z0-9-]{1,100}$/),
  status: z.enum(['inProgress', 'finished']),
  config: z.string(),
  createdTime: z.number().int().nonnegative(),
  updatedTime: z.number().int().nonnegative()
}).strict();

export type StoredTask = z.infer<typeof taskSchema>;

export interface TaskFileStore {
  save(task: StoredTask): Promise<void>;
  read(taskId: string): Promise<StoredTask | undefined>;
  saveResult(task: StoredTask): Promise<void>;
}

/** One JSON file per task, with exclusive creation to avoid silent overwrites. */
export class JsonTaskFileStore implements TaskFileStore {
  private readonly directory: string;
  constructor(directory = process.env.AAB_TASK_STORE_DIR ?? './data/tasks') {
    this.directory = resolve(directory);
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
    await writeFile(join(this.directory, parsed.id + '.result.json'),
      JSON.stringify(parsed, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }

  async read(taskId: string): Promise<StoredTask | undefined> {
    try {
      return taskSchema.parse(JSON.parse(await readFile(this.filePath(taskId), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
}
