import type { Channel } from '../../shared/contracts/message.js';

export type Destination =
  | { transport: 'socket'; channel: Channel }
  | { transport: 'http'; endpointId: string };

export type RouteRule = {
  id: string;
  source: Channel;
  event: string; // Exact event name, or '*'.
  destinations: readonly Destination[];
};

/** A deliberately small and explicit registry. Wildcard is supported only for event names. */
export class RouteRegistry {
  private readonly rules = new Map<string, RouteRule>();
  constructor(rules: readonly RouteRule[] = []) {
    for (const rule of rules) this.register(rule);
  }
  register(rule: RouteRule): void {
    if (!rule.id.trim() || !rule.event.trim() || !rule.destinations.length) throw new Error('Invalid route rule');
    if (this.rules.has(rule.id)) throw new Error(`Duplicate route: ${rule.id}`);
    this.rules.set(rule.id, { ...rule, destinations: rule.destinations.map(d => ({ ...d })) });
  }
  unregister(id: string): boolean { return this.rules.delete(id); }
  list(): RouteRule[] { return [...this.rules.values()].map(r => ({ ...r, destinations: r.destinations.map(d => ({ ...d })) })); }
  resolve(source: Channel, event: string): Destination[] {
    const targets = new Map<string, Destination>();
    for (const rule of this.rules.values()) {
      if (rule.source !== source || (rule.event !== event && rule.event !== '*')) continue;
      for (const destination of rule.destinations) {
        const key = destination.transport === 'socket' ? `socket:${destination.channel}` : `http:${destination.endpointId}`;
        targets.set(key, destination);
      }
    }
    return [...targets.values()];
  }
}

export function defaultRoutes(): RouteRule[] {
  return [
    { id: 'session-local', source: 'session', event: '*', destinations: [{ transport: 'socket', channel: 'session' }] },
    { id: 'worker-local', source: 'worker', event: '*', destinations: [{ transport: 'socket', channel: 'worker' }] }
  ];
}
