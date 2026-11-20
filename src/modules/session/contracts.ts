/** Application-facing generic session data. */
export type Session = { id: number; name: string };

/** Synchronous application port for the supported session operations. */
export interface SessionRepository {
  list(): Session[];
  get(id: number): Session | undefined;
  create(name: string): Session;
}
