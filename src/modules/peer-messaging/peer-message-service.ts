import { randomUUID } from 'node:crypto';
import { incomingPeerMessageSchema, type IncomingPeerMessage, type PeerMessage, type PeerMessageAck, type PeerId } from './contracts.js';
import { executeTransformations, TransformationExecutionError, TransformationRegistry } from './transformation-registry.js';
import { ProvenUnsentDeliveryError } from '../../shared/contracts/reliable-delivery.js';

export class PeerMessageError extends Error {
  constructor(
    readonly code: 'INVALID_MESSAGE' | 'SENDER_MISMATCH' | 'DESTINATION_OFFLINE' | 'TRANSFORMATION_FAILED' | 'DELIVERY_FAILED' | 'UNSUPPORTED_DESTINATION' | 'AMBIGUOUS_DESTINATION',
    message: string,
    readonly reliabilityOutcome?: 'unsent' | 'failed' | 'uncertain'
  ) {
    super(message);
    this.name = 'PeerMessageError';
  }
}

export interface PeerDelivery {
  isConnected(peer: PeerId, toInstanceId?: string, context?: PeerDeliveryContext): boolean;
  validateDestination?(message: IncomingPeerMessage): void;
  bindDestination?(message: IncomingPeerMessage): PeerDeliveryContext | undefined;
  deliver(message: PeerMessage, context?: PeerDeliveryContext): Promise<void>;
  beforeDeliver?(message: PeerMessage): Promise<void>;
}

/** Opaque, per-message routing state; never copied into the public message envelope. */
export type PeerDeliveryContext = object;

export class PeerMessageService {
  constructor(readonly transformations: TransformationRegistry, private readonly delivery: PeerDelivery) {}

  async process(value: unknown, authenticatedFrom: PeerId, authenticatedInstanceId?: string): Promise<PeerMessage> {
    const prepared = await this.prepare(value, authenticatedFrom, authenticatedInstanceId, true);
    if (prepared.message.to === 'as') return prepared.message;
    await this.deliverPreparedMessage(prepared.message, prepared.deliveryContext);
    return prepared.message;
  }

  /** Prepare once before durable receipt commit; subsequent attempts reuse this exact payload. */
  async prepareForDurableDelivery(value: unknown, authenticatedFrom: PeerId, authenticatedInstanceId?: string): Promise<PeerMessage> {
    return (await this.prepare(value, authenticatedFrom, authenticatedInstanceId, false)).message;
  }

  async deliverPreparedMessage(message: PeerMessage, retainedContext?: PeerDeliveryContext): Promise<void> {
    const { timestamp: _timestamp, processing: _processing, sourceInstanceId: _sourceInstanceId, ...inputValue } = message;
    const payload = message.payload;
    if (!payload || typeof payload !== 'object' ||
        typeof Reflect.get(payload, 'type') !== 'string' || !Reflect.get(payload, 'type').trim() ||
        typeof Reflect.get(payload, 'version') !== 'string' || Reflect.get(payload, 'data') === undefined)
      throw new PeerMessageError('INVALID_MESSAGE', 'Invalid prepared message payload', 'failed');
    // Validate only the original envelope contract here. Transformer output follows the
    // R7.3 D02 rules and may contain blank versions, null data, or additional fields.
    const parsed = incomingPeerMessageSchema.safeParse({ ...inputValue, payload: { type: 'prepared', version: '1.0', data: null } });
    if (!parsed.success) throw new PeerMessageError('INVALID_MESSAGE', 'Invalid prepared message envelope', 'failed');
    const input = { ...parsed.data, payload: message.payload };
    if (!retainedContext) this.delivery.validateDestination?.(input);
    const deliveryContext = retainedContext ?? this.delivery.bindDestination?.(input);
    if (input.to !== 'as' && !this.delivery.isConnected(input.to, input.toInstanceId, deliveryContext))
      throw new PeerMessageError('DESTINATION_OFFLINE', `Destination ${input.to} is offline`, 'unsent');
    try {
      await this.delivery.beforeDeliver?.(message);
    } catch (error) {
      throw new PeerMessageError('DELIVERY_FAILED', error instanceof Error ? error.message : 'Unable to deliver message', 'failed');
    }
    try {
      await this.delivery.deliver(message, deliveryContext);
    } catch (error) {
      if (error instanceof PeerMessageError) throw error;
      if (error instanceof ProvenUnsentDeliveryError)
        throw new PeerMessageError('DELIVERY_FAILED', error.message, 'unsent');
      throw new PeerMessageError('DELIVERY_FAILED', error instanceof Error ? error.message : 'Unable to deliver message', 'uncertain');
    }
  }

  private async prepare(
    value: unknown,
    authenticatedFrom: PeerId,
    authenticatedInstanceId: string | undefined,
    requireInitialConnectivity: boolean
  ): Promise<{ message: PeerMessage; deliveryContext: PeerDeliveryContext | undefined }> {
    const parsed = incomingPeerMessageSchema.safeParse(value);
    if (!parsed.success) throw new PeerMessageError('INVALID_MESSAGE', 'Invalid message envelope');
    const input: IncomingPeerMessage = parsed.data;
    if (input.from !== authenticatedFrom) throw new PeerMessageError('SENDER_MISMATCH', 'FROM must match authenticated connection');
    if (input.toInstanceId && input.to !== 'eserver')
      throw new PeerMessageError('INVALID_MESSAGE', 'toInstanceId is currently supported only for EServer');
    this.delivery.validateDestination?.(input);
    const deliveryContext = this.delivery.bindDestination?.(input);
    if (requireInitialConnectivity && input.to !== 'as' && !this.delivery.isConnected(input.to, input.toInstanceId, deliveryContext))
      throw new PeerMessageError('DESTINATION_OFFLINE', `Destination ${input.to} is offline`);

    const original: PeerMessage = {
      ...input, id: input.id ?? randomUUID(), timestamp: Date.now(),
      ...(authenticatedFrom === 'eserver' && authenticatedInstanceId ? { sourceInstanceId: authenticatedInstanceId } : {}),
      payload: structuredClone(input.payload)
    };
    const execution = executeTransformations(this.transformations, original);
    let result;
    try {
      result = execution instanceof Promise ? await execution : execution;
    } catch (error) {
      if (error instanceof TransformationExecutionError)
        throw new PeerMessageError('TRANSFORMATION_FAILED', error.message);
      throw error;
    }
    const message: PeerMessage = {
      ...original,
      payload: result.payload,
      processing: {
        transformed: result.processedBy.length > 0,
        processedBy: result.processedBy,
        timestamp: Date.now()
      }
    };
    return { message, deliveryContext };
  }
}

/** Maps generic M10 processing to the existing peer:message ACK and diagnostics contract. */
export async function processPeerMessageForAck(
  service: Pick<PeerMessageService, 'process'>,
  value: unknown,
  authenticatedFrom: PeerId,
  authenticatedInstanceId?: string
): Promise<PeerMessageAck> {
  try {
    const message = await service.process(value, authenticatedFrom, authenticatedInstanceId);
    console.log(`[AS] PROCESSED id=${message.id} from=${message.from} sourceInstance=${message.sourceInstanceId ?? '-'} to=${message.to} type=${message.payload.type} transformers=${message.processing?.processedBy.join(',') || 'none'}`);
    return { ok: true, data: message };
  } catch (error) {
    const code = error instanceof PeerMessageError ? error.code : 'TRANSFORMATION_FAILED';
    console.error(`[AS] MESSAGE ERROR from=${authenticatedFrom} instance=${authenticatedInstanceId ?? '-'} code=${code}`, error);
    return { ok: false, code, error: error instanceof Error ? error.message : 'Internal message error' };
  }
}
