import type { PeerId, PeerMessage } from './contracts.js';

export interface TransformationContext {
  readonly from: PeerId;
  readonly to: PeerId;
}

export interface MessageTransformer {
  transform(message: Readonly<PeerMessage>, context: Readonly<TransformationContext>): Promise<PeerMessage['payload']> | PeerMessage['payload'];
}

export interface TransformationRule {
  id: string;
  from: PeerId | '*';
  to: PeerId | '*';
  payloadType: string;
  priority: number;
  transformer: MessageTransformer;
}

/** Business transforms return a NEW payload, never an envelope or routing metadata. */
export class TransformationRegistry {
  private readonly entries = new Map<string, TransformationRule>();

  register(rule: TransformationRule): void {
    if (!rule.id.trim() || !rule.payloadType.trim() || !Number.isFinite(rule.priority))
      throw new Error('Invalid transformation rule');
    if (this.entries.has(rule.id)) throw new Error(`Duplicate transformer: ${rule.id}`);
    this.entries.set(rule.id, rule);
  }

  unregister(id: string): boolean { return this.entries.delete(id); }

  resolve(message: PeerMessage): TransformationRule[] {
    return [...this.entries.values()]
      .filter(rule =>
        (rule.from === '*' || rule.from === message.from) &&
        (rule.to === '*' || rule.to === message.to) &&
        (rule.payloadType === '*' || rule.payloadType === message.payload.type))
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  }
}
