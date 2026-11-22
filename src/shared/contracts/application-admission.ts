export type ApplicationWorkClass = 'http' | 'socket' | 'peer' | 'generic' | 'snapshot';

/** Narrow admission capability supplied by the M02 application composition root. */
export interface ApplicationAdmission {
  run<T>(workClass: ApplicationWorkClass, operation: () => Promise<T> | T): Promise<T>;
  runAdmitted<T>(workClass: ApplicationWorkClass, operation: () => Promise<T> | T): Promise<T>;
  isAccepting(): boolean;
}
