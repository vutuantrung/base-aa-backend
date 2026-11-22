import { randomUUID } from 'node:crypto';
import type { MessageEnvelope, MessagePublisher, NewMessage } from '../../shared/contracts/message.js';
import type { Destination } from './route-registry.js';
import { RouteRegistry } from './route-registry.js';
import type { ApplicationAdmission } from '../../shared/contracts/application-admission.js';

/** Infrastructure adapters implement delivery only; they never re-enter the router. */
export interface OutboundTransportAdapter {
  readonly transport: Destination['transport'];
  deliver(message: MessageEnvelope, destination: Destination): Promise<void>;
}

export class MessageRouter implements MessagePublisher {
  private readonly adapters = new Map<Destination['transport'], OutboundTransportAdapter>();
  constructor(readonly routes: RouteRegistry, adapters: readonly OutboundTransportAdapter[],
    private readonly coordinator?: ApplicationAdmission) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.transport)) throw new Error(`Duplicate transport: ${adapter.transport}`);
      this.adapters.set(adapter.transport, adapter);
    }
  }

  async publish(message: NewMessage): Promise<MessageEnvelope> {
    if (this.coordinator) return this.coordinator.run('generic', () => this.publishAdmitted(message));
    return this.publishAdmitted(message);
  }

  private async publishAdmitted(message: NewMessage): Promise<MessageEnvelope> {
    const envelope = this.createEnvelope(message);
    const plan = this.planDispatch(envelope);
    const deliveries = plan.map(({ adapter, destination }) => this.coordinator
      ? this.coordinator.runAdmitted('generic', () => adapter.deliver(envelope, destination))
      : adapter.deliver(envelope, destination));
    // Promise.all keeps the public fail-fast result while tracked siblings continue safely.
    await Promise.all(deliveries);
    return envelope;
  }

  private createEnvelope(message: NewMessage): MessageEnvelope {
    return { id: randomUUID(), ...message, timestamp: new Date().toISOString() };
  }

  /** Resolve destinations and validate all adapter capabilities before the first delivery. */
  private planDispatch(message: MessageEnvelope) {
    return this.routes.resolve(message.channel, message.event).map(destination => {
      const adapter = this.adapters.get(destination.transport);
      if (!adapter) throw new Error(`Missing adapter for transport: ${destination.transport}`);
      return { adapter, destination };
    });
  }
}
