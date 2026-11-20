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

export interface TransformationRuleResolver {
  resolve(message: PeerMessage): TransformationRule[];
}

export interface TransformationExecutionResult {
  payload: PeerMessage['payload'];
  processedBy: string[];
}

export class TransformationExecutionError extends Error {
  constructor(ruleId: string, message: string) {
    super(`Transformer ${ruleId} failed: ${message}`);
    this.name = 'TransformationExecutionError';
  }
}

/** Business transforms return a NEW payload, never an envelope or routing metadata. */
export class TransformationRegistry implements TransformationRuleResolver {
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

/** Executes the once-resolved rules sequentially against the original envelope match. */
export function executeTransformations(
  registry: TransformationRuleResolver,
  original: PeerMessage
): TransformationExecutionResult | Promise<TransformationExecutionResult> {
  const rules = registry.resolve(original);
  if (!rules.length) return { payload: original.payload, processedBy: [] };
  return executeRules(rules, original);
}

async function executeRules(rules: TransformationRule[], original: PeerMessage): Promise<TransformationExecutionResult> {
  let message = original;
  const processedBy: string[] = [];
  for (const rule of rules) {
    try {
      const next = await rule.transformer.transform(structuredClone(message), { from: original.from, to: original.to });
      if (!next || typeof next.type !== 'string' || !next.type.trim() ||
          typeof next.version !== 'string' || next.data === undefined) throw new Error('Invalid transformed payload');
      message = { ...message, payload: structuredClone(next) };
      processedBy.push(rule.id);
    } catch (error) {
      throw new TransformationExecutionError(rule.id, error instanceof Error ? error.message : 'unknown error');
    }
  }
  return { payload: message.payload, processedBy };
}
