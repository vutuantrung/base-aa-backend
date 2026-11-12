import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
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
  listRecent(limit?: number): Promise<StoredTask[]>;
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

  async listRecent(limit = 50): Promise<StoredTask[]> {
    let filenames: string[];
    try {
      filenames = (await readdir(this.directory))
        .filter(name => /^task-[a-zA-Z0-9-]{1,100}\\.json$/.test(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const candidates = await Promise.all(filenames.map(async name => ({
      name,
      mtime: (await stat(join(this.directory, name))).mtimeMs
    })));
    candidates.sort((a, b) => b.mtime - a.mtime);
    const results: StoredTask[] = [];
    for (const candidate of candidates.slice(0, Math.max(0, limit))) {
      const id = candidate.name.slice(0, -'.json'.length);
      const result = await this.read(id);
      if (!result) continue;
      // A finished-result file indicates that a later lifecycle event occurred.
      try {
        const finished = taskSchema.parse(JSON.parse(
          await readFile(join(this.directory, id + '.result.json'), 'utf8')));
        results.push(finished.status === 'finished' ? finished : result);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          results.push(result);
        } else {
          throw error;
        }
      }
    }
    return results;
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
