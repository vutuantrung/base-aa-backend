import { randomUUID } from 'node:crypto';
import type { Channel, MessageEnvelope, MessagePublisher, MessageConsumer, NewMessage } from '../contracts/message.js';

/** Transport-neutral local fanout. One inbound message is emitted exactly once. */
export class MessageBus implements MessagePublisher, MessageConsumer {
  private readonly handlers = new Map<Channel, Set<(message: MessageEnvelope) => void | Promise<void>>>();

  async publish(message: NewMessage): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      id: randomUUID(), ...message, timestamp: new Date().toISOString()
    };
    await Promise.all([...this.handlers.get(envelope.channel) ?? []].map(handler => Promise.resolve().then(() => handler(envelope))));
    return envelope;
  }

  subscribe(channel: Channel, handler: (message: MessageEnvelope) => void | Promise<void>): () => void {
    const handlers = this.handlers.get(channel) ?? new Set();
    handlers.add(handler);
    this.handlers.set(channel, handlers);
    return () => { handlers.delete(handler); if (!handlers.size) this.handlers.delete(channel); };
  }
}
