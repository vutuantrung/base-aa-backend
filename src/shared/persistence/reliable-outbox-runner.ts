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

let activeAttemptsAcrossProcess = 0;
type AttemptWaiter = { grant: () => void; canceled: boolean };
const waitingAttemptsAcrossProcess: AttemptWaiter[] = [];

function acquireProcessAttemptSlot(): { promise: Promise<(() => void) | undefined>; cancel: () => void } {
  if (activeAttemptsAcrossProcess < DEFAULT_RELIABILITY_POLICY.concurrency) {
    activeAttemptsAcrossProcess += 1;
    return { promise: Promise.resolve(releaseProcessAttemptSlot), cancel() {} };
  }
  let resolveWaiter: (release: (() => void) | undefined) => void = () => {};
  const waiter: AttemptWaiter = {
    canceled: false,
    grant: () => resolveWaiter(releaseProcessAttemptSlot)
  };
  const promise = new Promise<(() => void) | undefined>(resolve => { resolveWaiter = resolve; });
  waitingAttemptsAcrossProcess.push(waiter);
  return {
    promise,
    cancel: () => {
      if (waiter.canceled) return;
      waiter.canceled = true;
      const index = waitingAttemptsAcrossProcess.indexOf(waiter);
      if (index >= 0) waitingAttemptsAcrossProcess.splice(index, 1);
      resolveWaiter(undefined);
    }
  };
}

function releaseProcessAttemptSlot(): void {
  let next: AttemptWaiter | undefined;
  while ((next = waitingAttemptsAcrossProcess.shift()) && next.canceled) { /* discard canceled waiter */ }
  if (next) next.grant();
  else activeAttemptsAcrossProcess -= 1;
}

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
  private activated = false;
  private startupActive = false;
  private scansActive = 0;
  private closed = false;
  private readonly slotWaiters = new Set<() => void>();
  private idleWaiters: Array<() => void> = [];
  private releaseRunner: (() => void) | undefined;
  private readonly policy: ReliabilityRunnerPolicy;

  constructor(
    private readonly store: ReliableRecordStore<TPayload, TAck>,
    private readonly options: OutboxRunnerOptions<TPayload, TAck>
  ) {
    this.policy = options.policy ? validateReliabilityPolicy(options.policy) : DEFAULT_RELIABILITY_POLICY;
  }

  async start(activate = true): Promise<void> {
    if (this.started || this.closed) return;
    this.startupActive = true;
    try {
      await this.store.initialize();
      if (this.closed) return;
      this.releaseRunner = this.store.claimRunner?.();
      this.started = true;
      for (const record of await this.store.list()) {
        if (this.closed) return;
        if (record.state === 'attempting') {
          const uncertain = await this.store.transition(record.key, 'uncertain', {
            lastError: 'Process stopped during an attempt; remote outcome is unknown'
          });
          this.options.onState(uncertain);
        }
      }
      if (this.closed || !activate) return;
      await this.activate();
    } catch (error) {
      this.releaseRunner?.();
      this.releaseRunner = undefined;
      throw error;
    } finally {
      this.startupActive = false;
      this.resolveIdleIfNeeded();
    }
  }

  async activate(): Promise<void> {
    if (this.closed || !this.started || this.activated) return;
    this.activated = true;
    await this.scan();
    if (this.closed) return;
    this.timer = setInterval(() => { this.scanSafely(); }, this.policy.scanIntervalMs);
    this.timer.unref();
  }

  async enqueue(key: string): Promise<void> {
    const record = await this.store.get(key);
    if (record && (record.state === 'queued' || record.state === 'retryable')) this.schedule(record);
  }

  async wake(): Promise<void> {
    try { await this.scan(); }
    catch (error) { this.reportScanFailure(error); }
  }

  private scanSafely(): void {
    void this.scan().catch(error => this.reportScanFailure(error));
  }

  private reportScanFailure(error: unknown): void {
    console.error('[AAB] RELIABILITY OUTBOX SCAN FAILED', error instanceof Error ? error.message : 'unknown');
  }

  private async scan(): Promise<void> {
    if (this.closed || !this.started) return;
    this.scansActive += 1;
    try {
      const now = this.now();
      const due = (await this.store.list())
        .filter(record => (record.state === 'queued' || record.state === 'retryable') &&
          (record.nextAttemptAt === undefined || record.nextAttemptAt <= now) &&
          !this.scheduled.has(record.key) && !this.active.has(record.key))
        .slice(0, this.policy.scanBatchSize);
      for (const record of due) this.schedule(record);
    } finally {
      this.scansActive -= 1;
      this.resolveIdleIfNeeded();
    }
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
        let releaseSlot: (() => void) | undefined;
        let cancelSlot: (() => void) | undefined;
        try {
          const slot = acquireProcessAttemptSlot();
          cancelSlot = slot.cancel;
          this.slotWaiters.add(slot.cancel);
          releaseSlot = await slot.promise;
          this.slotWaiters.delete(slot.cancel);
          cancelSlot = undefined;
          if (releaseSlot && !this.closed) await this.attempt(key);
        }
        catch (error) { console.error('[AAB] RELIABILITY OUTBOX ATTEMPT FAILED', error instanceof Error ? error.message : 'unknown'); }
        finally {
          if (cancelSlot) {
            cancelSlot();
            this.slotWaiters.delete(cancelSlot);
          }
          releaseSlot?.();
          this.executing.delete(key);
          this.active.delete(key);
          this.resolveIdleIfNeeded();
          this.pump();
          this.scanSafely();
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
    if (this.closed) {
      await this.store.transition(key, 'retryable', {
        nextAttemptAt: this.now() + this.retryDelay(previousAttempts),
        lastError: 'Shutdown began before transport invocation'
      });
      return;
    }
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
    this.beginDrain();
    return this.startupActive || this.executing.size > 0;
  }

  beginDrain(): boolean {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.pending.length = 0;
    for (const cancel of this.slotWaiters) cancel();
    this.slotWaiters.clear();
    this.resolveIdleIfNeeded();
    return this.startupActive || this.executing.size > 0;
  }

  async waitForIdle(): Promise<void> {
    if (this.hasOutstandingMutators())
      await new Promise<void>(resolve => this.idleWaiters.push(resolve));
    this.releaseRunnerOwnership();
  }

  workCounts(): Readonly<{ pending: number; active: number; executing: number; slotWaiters: number }> {
    return Object.freeze({ pending: this.pending.length, active: this.active.size,
      executing: this.executing.size, slotWaiters: this.slotWaiters.size });
  }

  private resolveIdleIfNeeded(): void {
    if (this.hasOutstandingMutators()) return;
    if (this.closed) this.releaseRunnerOwnership();
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private hasOutstandingMutators(): boolean {
    return this.startupActive || this.scansActive > 0 || this.executing.size > 0;
  }

  private releaseRunnerOwnership(): void {
    this.releaseRunner?.();
    this.releaseRunner = undefined;
  }
}

function validateReliabilityPolicy(policy: ReliabilityRunnerPolicy): ReliabilityRunnerPolicy {
  const validInteger = (value: number, maximum: number) => Number.isSafeInteger(value) && value > 0 && value <= maximum;
  if (!validInteger(policy.maxAttempts, DEFAULT_RELIABILITY_POLICY.maxAttempts) ||
      policy.maxAgeMs <= 0 || policy.maxAgeMs > DEFAULT_RELIABILITY_POLICY.maxAgeMs || !Number.isFinite(policy.maxAgeMs) ||
      !validInteger(policy.scanBatchSize, DEFAULT_RELIABILITY_POLICY.scanBatchSize) ||
      !validInteger(policy.concurrency, DEFAULT_RELIABILITY_POLICY.concurrency) ||
      !Number.isSafeInteger(policy.scanIntervalMs) || policy.scanIntervalMs < DEFAULT_RELIABILITY_POLICY.scanIntervalMs ||
      policy.retryDelaysMs.length !== DEFAULT_RELIABILITY_POLICY.retryDelaysMs.length ||
      policy.retryDelaysMs.some((delay, index) => delay < (DEFAULT_RELIABILITY_POLICY.retryDelaysMs[index] ?? Infinity) || !Number.isSafeInteger(delay)))
    throw new RangeError('Reliability policy overrides may only retain or lower approved retry, age, batch, and concurrency bounds');
  return Object.freeze({ ...policy, retryDelaysMs: Object.freeze([...policy.retryDelaysMs]) });
}
