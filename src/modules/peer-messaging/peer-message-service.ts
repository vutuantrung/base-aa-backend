import { randomUUID } from 'node:crypto';
import { incomingPeerMessageSchema, type IncomingPeerMessage, type PeerMessage, type PeerId } from './contracts.js';
import { TransformationRegistry } from './transformation-registry.js';

export class PeerMessageError extends Error {
  constructor(readonly code: 'INVALID_MESSAGE' | 'SENDER_MISMATCH' | 'DESTINATION_OFFLINE' | 'TRANSFORMATION_FAILED' | 'DELIVERY_FAILED' | 'UNSUPPORTED_DESTINATION' | 'AMBIGUOUS_DESTINATION', message: string) {
    super(message);
    this.name = 'PeerMessageError';
  }
}

export interface PeerDelivery {
  isConnected(peer: PeerId, toInstanceId?: string): boolean;
  validateDestination?(message: IncomingPeerMessage): void;
  deliver(message: PeerMessage): Promise<void>;
}

export class PeerMessageService {
  constructor(readonly transformations: TransformationRegistry, private readonly delivery: PeerDelivery) {}

  async process(value: unknown, authenticatedFrom: PeerId, authenticatedInstanceId?: string): Promise<PeerMessage> {
    const parsed = incomingPeerMessageSchema.safeParse(value);
    if (!parsed.success) throw new PeerMessageError('INVALID_MESSAGE', 'Invalid message envelope');
    const input: IncomingPeerMessage = parsed.data;
    if (input.from !== authenticatedFrom) throw new PeerMessageError('SENDER_MISMATCH', 'FROM must match authenticated connection');
    if (input.toInstanceId && input.to !== 'eserver')
      throw new PeerMessageError('INVALID_MESSAGE', 'toInstanceId is currently supported only for EServer');
    this.delivery.validateDestination?.(input);
    if (input.to !== 'aab' && !this.delivery.isConnected(input.to, input.toInstanceId))
      throw new PeerMessageError('DESTINATION_OFFLINE', `Destination ${input.to} is offline`);

    const original: PeerMessage = {
      ...input, id: input.id ?? randomUUID(), timestamp: Date.now(),
      ...(authenticatedFrom === 'eserver' && authenticatedInstanceId ? { sourceInstanceId: authenticatedInstanceId } : {}),
      payload: structuredClone(input.payload)
    };
    let message = original;
    const processedBy: string[] = [];
    for (const rule of this.transformations.resolve(original)) {
      try {
        // Clone input before each plugin to prevent accidental mutation of the original message.
        const next = await rule.transformer.transform(structuredClone(message), { from: original.from, to: original.to });
        if (!next || typeof next.type !== 'string' || !next.type.trim() ||
            typeof next.version !== 'string' || next.data === undefined) throw new Error('Invalid transformed payload');
        message = { ...message, payload: structuredClone(next) };
        processedBy.push(rule.id);
      } catch (error) {
        throw new PeerMessageError('TRANSFORMATION_FAILED',
          `Transformer ${rule.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    message = {
      ...message,
      processing: {
        transformed: processedBy.length > 0,
        processedBy,
        timestamp: Date.now()
      }
    };
    if (message.to === 'aab') return message;
    // Validate again after asynchronous transformations (destination may have disconnected).
    if (!this.delivery.isConnected(message.to, message.toInstanceId))
      throw new PeerMessageError('DESTINATION_OFFLINE', `Destination ${message.to} is offline`);
    try {
      await this.delivery.deliver(message);
    } catch (error) {
      throw new PeerMessageError('DELIVERY_FAILED',
        error instanceof Error ? error.message : 'Unable to deliver message');
    }
    return message;
  }
}
