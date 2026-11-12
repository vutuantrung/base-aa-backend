import { randomUUID } from 'node:crypto';
import type { MessageEnvelope, MessagePublisher, NewMessage } from '../../shared/contracts/message.js';
import type { Destination } from './route-registry.js';
import { RouteRegistry } from './route-registry.js';

/** Infrastructure adapters implement delivery only; they never re-enter the router. */
export interface OutboundTransportAdapter {
  readonly transport: Destination['transport'];
  deliver(message: MessageEnvelope, destination: Destination): Promise<void>;
}

export class MessageRouter implements MessagePublisher {
  private readonly adapters = new Map<Destination['transport'], OutboundTransportAdapter>();
  constructor(readonly routes: RouteRegistry, adapters: readonly OutboundTransportAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.transport)) throw new Error(`Duplicate transport: ${adapter.transport}`);
      this.adapters.set(adapter.transport, adapter);
    }
  }

  async publish(message: NewMessage): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      id: randomUUID(),
      ...message,
      timestamp: new Date().toISOString()
    };
    const destinations = this.routes.resolve(message.channel, message.event);
    // Plan and validate the entire dispatch before sending to avoid config-related partial delivery.
    const plan = destinations.map(destination => {
      const adapter = this.adapters.get(destination.transport);
      if (!adapter) throw new Error(`Missing adapter for transport: ${destination.transport}`);
      return { adapter, destination };
    });
    // Runtime failures may cause partial delivery; Phase 5 will add durable retries.
    await Promise.all(plan.map(({ adapter, destination }) => adapter.deliver(envelope, destination)));
    return envelope;
  }
}
