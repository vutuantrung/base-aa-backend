/** Persisted process-usage row. */
export type ProcessUsage = { id: number; pid: number; cpu: number; memory: number };
export type NewProcessUsage = Omit<ProcessUsage, 'id'>;

/** Synchronous application port for process-usage queries and writes. */
export interface ProcessUsageRepository {
  list(pid?: number): ProcessUsage[];
  create(value: NewProcessUsage): ProcessUsage;
}
