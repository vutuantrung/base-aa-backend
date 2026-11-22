import type { ReliableRecordStore, ReliableRecord } from './atomic-json-record-store.js';

export interface ReliabilityRunnerPolicy {
  readonly maxAttempts: number;
  readonly retryDelaysMs: readonly number[];
  readonly maxAgeMs: number;
  readonly scanBatchSize: number;
  readonly concurrency: number;
  readonly scanIntervalMs: number;
}

export const DEFAULT_RELIABILITY_POLICY: ReliabilityRunnerPolicy = {
  maxAttempts: 6,
  retryDelaysMs: [2_000, 10_000, 60_000, 300_000, 1_800_000],
  maxAgeMs: 24 * 60 * 60 * 1_000,
  scanBatchSize: 100,
  concurrency: 4,
  scanIntervalMs: 1_000
} as const;

export interface RetryableDeliveryError extends Error {
  readonly reliabilityOutcome: 'unsent' | 'failed' | 'uncertain';
}

export interface OutboxRunnerOptions<TPayload, TAck> {
  isReady(payload: TPayload): boolean;
  deliver(payload: TPayload): Promise<void>;
  onState(record: ReliableRecord<TPayload, TAck>): void;
  defer(work: () => Promise<void>): void;
  now?: () => number;
  random?: () => number;
  policy?: ReliabilityRunnerPolicy;
}

/** Bounded scanner and attempt coordinator shared by the domain-owned outboxes. */
export class ReliableOutboxRunner<TPayload, TAck> {
  private readonly pending: string[] = [];
  private readonly scheduled = new Set<string>();
  private readonly active = new Set<string>();
  private readonly executing = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private started = false;
  private closed = false;
  private readonly policy: ReliabilityRunnerPolicy;

  constructor(
    private readonly store: ReliableRecordStore<TPayload, TAck>,
    private readonly options: OutboxRunnerOptions<TPayload, TAck>
  ) {
    this.policy = options.policy ?? DEFAULT_RELIABILITY_POLICY;
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.store.initialize();
    this.started = true;
    for (const record of await this.store.list()) {
      if (record.state === 'attempting') {
        const uncertain = await this.store.transition(record.key, 'uncertain', {
          lastError: 'Process stopped during an attempt; remote outcome is unknown'
        });
        this.options.onState(uncertain);
      }
    }
    await this.scan();
    this.timer = setInterval(() => { void this.scan(); }, this.policy.scanIntervalMs);
    this.timer.unref();
  }

  async enqueue(key: string): Promise<void> {
    const record = await this.store.get(key);
    if (record && (record.state === 'queued' || record.state === 'retryable')) this.schedule(record);
  }

  async wake(): Promise<void> {
    await this.scan();
  }

  private async scan(): Promise<void> {
    if (this.closed || !this.started) return;
    const now = this.now();
    const due = (await this.store.list())
      .filter(record => (record.state === 'queued' || record.state === 'retryable') &&
        (record.nextAttemptAt === undefined || record.nextAttemptAt <= now) &&
        !this.scheduled.has(record.key) && !this.active.has(record.key))
      .slice(0, this.policy.scanBatchSize);
    for (const record of due) this.schedule(record);
  }

  private schedule(record: ReliableRecord<TPayload, TAck>): void {
    if (this.closed || this.scheduled.has(record.key) || this.active.has(record.key)) return;
    this.scheduled.add(record.key);
    this.pending.push(record.key);
    this.pump();
  }

  private pump(): void {
    while (!this.closed && this.active.size < this.policy.concurrency && this.pending.length > 0) {
      const key = this.pending.shift();
      if (!key) return;
      this.scheduled.delete(key);
      this.active.add(key);
      this.options.defer(async () => {
        if (this.closed) {
          this.active.delete(key);
          return;
        }
        this.executing.add(key);
        try { await this.attempt(key); }
        catch (error) { console.error('[AAB] RELIABILITY OUTBOX ATTEMPT FAILED', error instanceof Error ? error.message : 'unknown'); }
        finally {
          this.executing.delete(key);
          this.active.delete(key);
          this.pump();
          void this.scan();
        }
      });
    }
  }

  private async attempt(key: string): Promise<void> {
    if (this.closed) return;
    let record = await this.store.get(key);
    if (!record || (record.state !== 'queued' && record.state !== 'retryable')) return;
    const now = this.now();
    if (now - record.createdAt >= this.policy.maxAgeMs || record.attempts >= this.policy.maxAttempts) {
      record = await this.store.transition(key, 'failed', { lastError: 'Automatic delivery limit reached' });
      this.options.onState(record);
      return;
    }
    if (!this.options.isReady(record.payload)) {
      const nextAttemptAt = now + this.retryDelay(record.attempts);
      record = await this.store.transition(key, 'retryable', { nextAttemptAt, lastError: 'Destination offline before send' });
      this.options.onState(record);
      return;
    }

    const previousAttempts = record.attempts;
    record = await this.store.transition(key, 'attempting', {
      attempts: previousAttempts + 1,
      clearNextAttempt: true,
      lastError: ''
    });
    try {
      await this.options.deliver(record.payload);
      record = await this.store.transition(key, 'delivered', { clearNextAttempt: true, lastError: '' });
    } catch (error) {
      const outcome = this.deliveryOutcome(error);
      if (outcome === 'unsent') {
        record = await this.store.transition(key, 'retryable', {
          nextAttemptAt: this.now() + this.retryDelay(previousAttempts),
          lastError: error instanceof Error ? error.message : 'Delivery was not sent'
        });
      } else {
        record = await this.store.transition(key, outcome === 'failed' ? 'failed' : 'uncertain', {
          lastError: error instanceof Error ? error.message : 'Remote outcome is unknown'
        });
      }
    }
    this.options.onState(record);
  }

  private retryDelay(attemptIndex: number): number {
    const base = this.policy.retryDelaysMs[Math.min(attemptIndex, this.policy.retryDelaysMs.length - 1)] ?? 1_800_000;
    return Math.floor(base / 2 + this.random() * base / 2);
  }

  private deliveryOutcome(error: unknown): 'unsent' | 'failed' | 'uncertain' {
    if (error && typeof error === 'object' && 'reliabilityOutcome' in error) {
      const outcome = (error as RetryableDeliveryError).reliabilityOutcome;
      if (outcome === 'unsent' || outcome === 'failed' || outcome === 'uncertain') return outcome;
    }
    return 'uncertain';
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }
  private random(): number { return Math.min(1, Math.max(0, this.options.random?.() ?? Math.random())); }

  close(): boolean {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.pending.length = 0;
    return this.executing.size > 0;
  }
}
