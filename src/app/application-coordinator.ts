import { AsyncLocalStorage } from 'node:async_hooks';
import type { ApplicationAdmission, ApplicationWorkClass } from '../shared/contracts/application-admission.js';
import { performance } from 'node:perf_hooks';

export class MonotonicDeadline {
  private readonly expiresAt: number;
  constructor(timeoutMs: number, private readonly now: () => number = () => performance.now()) {
    this.expiresAt = now() + timeoutMs;
  }
  remainingMs(): number { return Math.max(0, this.expiresAt - this.now()); }
}

export class ApplicationDrainingError extends Error {
  constructor() {
    super('APPLICATION_DRAINING');
    this.name = 'ApplicationDrainingError';
  }
}

type AdmissionContext = { coordinator: ApplicationCoordinator; active: boolean };

/** M02-owned admission gate and in-flight operation tracker. */
export class ApplicationCoordinator implements ApplicationAdmission {
  private readonly context = new AsyncLocalStorage<AdmissionContext>();
  private readonly active = new Map<ApplicationWorkClass, number>();
  private idleWaiters: Array<() => void> = [];
  private accepting = true;
  private locallyReady = false;

  get ready(): boolean { return this.locallyReady && this.accepting; }

  setReady(): void {
    if (this.accepting) this.locallyReady = true;
  }

  beginDrain(): void {
    this.locallyReady = false;
    this.accepting = false;
  }

  isAccepting(): boolean { return this.accepting; }

  run<T>(workClass: ApplicationWorkClass, operation: () => Promise<T> | T): Promise<T> {
    const inherited = this.context.getStore();
    if (inherited?.coordinator === this && inherited.active)
      return this.runTracked(workClass, operation);
    if (!this.accepting) return Promise.reject(new ApplicationDrainingError());
    return this.runTracked(workClass, operation);
  }

  /** Track fan-out that is synchronously created by an already admitted operation. */
  runAdmitted<T>(workClass: ApplicationWorkClass, operation: () => Promise<T> | T): Promise<T> {
    const inherited = this.context.getStore();
    if (inherited?.coordinator !== this || !inherited.active)
      return Promise.reject(new ApplicationDrainingError());
    return this.runTracked(workClass, operation);
  }

  private runTracked<T>(workClass: ApplicationWorkClass, operation: () => Promise<T> | T): Promise<T> {
    this.active.set(workClass, (this.active.get(workClass) ?? 0) + 1);
    const context: AdmissionContext = { coordinator: this, active: true };
    return this.context.run(context, async () => {
      try { return await operation(); }
      finally { context.active = false; this.release(workClass); }
    });
  }

  async waitForIdle(): Promise<void> {
    if (this.totalActive() === 0) return;
    await new Promise<void>(resolve => this.idleWaiters.push(resolve));
  }

  counts(): Readonly<Record<ApplicationWorkClass, number>> {
    return Object.freeze({
      http: this.active.get('http') ?? 0,
      socket: this.active.get('socket') ?? 0,
      peer: this.active.get('peer') ?? 0,
      generic: this.active.get('generic') ?? 0,
      snapshot: this.active.get('snapshot') ?? 0
    });
  }

  private release(workClass: ApplicationWorkClass): void {
    const remaining = (this.active.get(workClass) ?? 1) - 1;
    if (remaining === 0) this.active.delete(workClass);
    else this.active.set(workClass, remaining);
    if (this.totalActive() === 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  private totalActive(): number {
    let total = 0;
    for (const count of this.active.values()) total += count;
    return total;
  }
}
