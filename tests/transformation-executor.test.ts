import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeTransformations, TransformationExecutionError, TransformationRegistry,
  type TransformationRule, type TransformationRuleResolver
} from '../src/modules/peer-messaging/transformation-registry.js';
import type { PeerMessage } from '../src/modules/peer-messaging/contracts.js';

const original: PeerMessage = {
  version: '1.0', kind: 'event', from: 'pserver', to: 'aaui', channel: 'worker', event: 'message',
  correlationId: 'correlation-1', causationId: 'cause-1',
  payload: { type: 'original.type', version: '1.0', data: { nested: { count: 1 } } },
  id: 'efc7d1b2-38e3-42b3-9b14-b35620f27a77', timestamp: 10, sourceInstanceId: 'source-1'
};

function rule(id: string, transform: TransformationRule['transformer']['transform'], priority = 1): TransformationRule {
  return { id, from: '*', to: '*', payloadType: '*', priority, transformer: { transform } };
}

function addCount(data: unknown, count: number): void {
  if (data !== null && typeof data === 'object') Object.assign(data, { count });
}

test('registry validates registration, unregisters by ID, and resolves wildcards by priority then ID', () => {
  const registry = new TransformationRegistry();
  registry.register(rule('z-tie', message => message.payload, 5));
  registry.register(rule('b-first', message => message.payload, 1));
  registry.register(rule('a-tie', message => message.payload, 5));
  assert.deepEqual(registry.resolve(original).map(entry => entry.id), ['b-first', 'a-tie', 'z-tie']);
  assert.throws(() => registry.register(rule(' ', message => message.payload)), /Invalid transformation rule/);
  assert.throws(() => registry.register({ ...rule('bad-type', message => message.payload), payloadType: '  ' }), /Invalid transformation rule/);
  assert.throws(() => registry.register({ ...rule('bad-priority', message => message.payload), priority: Number.NaN }), /Invalid transformation rule/);
  assert.throws(() => registry.register(rule('a-tie', message => message.payload)), /Duplicate transformer: a-tie/);
  assert.equal(registry.unregister('missing'), false);
  assert.equal(registry.unregister('b-first'), true);
  assert.deepEqual(registry.resolve(original).map(entry => entry.id), ['a-tie', 'z-tie']);
});

test('registry keeps the registered rule object by reference and observes later field and transformer mutations', async () => {
  const registry = new TransformationRegistry();
  const calls: string[] = [];
  const mutableRule = rule('mutable', message => {
    calls.push('original-transformer');
    return message.payload;
  }, 10);
  const secondRule = rule('second', message => {
    calls.push('second');
    return message.payload;
  }, 5);
  registry.register(mutableRule);
  registry.register(secondRule);

  mutableRule.from = 'pserver';
  mutableRule.to = 'aaui';
  mutableRule.payloadType = 'original.type';
  mutableRule.priority = 1;
  mutableRule.transformer.transform = message => {
    calls.push('mutated-transformer');
    return message.payload;
  };

  assert.deepEqual(registry.resolve(original).map(entry => entry.id), ['mutable', 'second']);
  const result = await executeTransformations(registry, original);
  assert.deepEqual(calls, ['mutated-transformer', 'second']);
  assert.deepEqual(result.processedBy, ['mutable', 'second']);
});

test('matching uses original envelope fields even after an earlier transform changes payload type', async () => {
  const registry = new TransformationRegistry();
  const executed: string[] = [];
  registry.register({ ...rule('change-type', message => {
    executed.push('change-type');
    return { ...message.payload, type: 'replacement.type' };
  }), from: 'pserver', to: 'aaui', payloadType: 'original.type', priority: 1 });
  registry.register({ ...rule('still-matches-original', message => {
    executed.push('still-matches-original');
    return message.payload;
  }), from: 'pserver', to: 'aaui', payloadType: 'original.type', priority: 2 });
  registry.register({ ...rule('matches-output-only', () => {
    executed.push('matches-output-only');
    return { type: 'unexpected', version: '1.0', data: {} };
  }), payloadType: 'replacement.type', priority: 3 });

  const result = await executeTransformations(registry, original);
  assert.deepEqual(executed, ['change-type', 'still-matches-original']);
  assert.equal(result.payload.type, 'replacement.type');
  assert.deepEqual(result.processedBy, ['change-type', 'still-matches-original']);
});

test('executor awaits async rules sequentially with fresh context and isolated envelope clones', async () => {
  const registry = new TransformationRegistry();
  const order: string[] = [];
  registry.register(rule('first', async (message, context) => {
    order.push('first-start');
    await Promise.resolve();
    Object.assign(message, { from: 'sserver', to: 'aab' });
    if (message.payload.data !== null && typeof message.payload.data === 'object')
      Object.assign(message.payload.data, { nested: { count: 99 } });
    order.push('first-end');
    assert.deepEqual(context, { from: 'pserver', to: 'aaui' });
    return { ...message.payload, type: 'changed.type', data: { nested: { count: 2 } } };
  }, 1));
  registry.register(rule('second', async (message, context) => {
    order.push('second-start');
    assert.equal(message.from, 'pserver');
    assert.equal(message.to, 'aaui');
    assert.equal(message.payload.type, 'changed.type');
    assert.deepEqual(context, { from: 'pserver', to: 'aaui' });
    await Promise.resolve();
    order.push('second-end');
    return message.payload;
  }, 2));

  const result = await executeTransformations(registry, original);
  assert.deepEqual(order, ['first-start', 'first-end', 'second-start', 'second-end']);
  assert.deepEqual(original.payload.data, { nested: { count: 1 } });
  assert.equal(result.payload.type, 'changed.type');
  assert.deepEqual(result.processedBy, ['first', 'second']);
});

test('returned payloads are cloned before becoming the next rule input', async () => {
  const registry = new TransformationRegistry();
  let returnedPayload: PeerMessage['payload'] | undefined;
  registry.register(rule('return-reference', message => {
    returnedPayload = { ...message.payload, data: { count: 2 } };
    return returnedPayload;
  }, 1));
  registry.register(rule('next-rule', message => {
    addCount(message.payload.data, 3);
    return message.payload;
  }, 2));

  const result = await executeTransformations(registry, original);
  assert.deepEqual(result.payload.data, { count: 3 });
  assert.deepEqual(returnedPayload?.data, { count: 2 });
  if (returnedPayload) addCount(returnedPayload.data, 4);
  assert.deepEqual(result.payload.data, { count: 3 });
});

test('unmatched resolution is synchronous and returns no processed rules', () => {
  const registry = new TransformationRegistry();
  const execution = executeTransformations(registry, original);
  assert.equal(execution instanceof Promise, false);
  assert.deepEqual(execution, { payload: original.payload, processedBy: [] });
});

test('executor preserves accepted blank version and null data, and rejects invalid transformed payloads', async () => {
  const accepted = new TransformationRegistry();
  accepted.register(rule('blank-version-null-data', () => ({ type: 'valid', version: '', data: null })));
  const result = await executeTransformations(accepted, original);
  assert.deepEqual(result.payload, { type: 'valid', version: '', data: null });

  const malformed: unknown[] = [
    { type: ' ', version: '1.0', data: {} },
    { type: 'valid', version: 1, data: {} },
    { type: 'valid', version: '1.0' },
    null,
    false
  ];
  for (const value of malformed) {
    const registry = new TransformationRegistry();
    registry.register(rule('invalid', () => value as PeerMessage['payload']));
    await assert.rejects(Promise.resolve(executeTransformations(registry, original)), (error: unknown) =>
      error instanceof TransformationExecutionError && error.message === 'Transformer invalid failed: Invalid transformed payload');
  }
});

test('rule errors preserve exact failure text and stop later rules', async () => {
  for (const failure of [new Error('custom failure'), 'string failure']) {
    const registry = new TransformationRegistry();
    let laterRan = false;
    registry.register(rule('a-fails', () => { throw failure; }, 1));
    registry.register(rule('z-later', message => {
      laterRan = true;
      return message.payload;
    }, 2));
    await assert.rejects(Promise.resolve(executeTransformations(registry, original)), (error: unknown) =>
      error instanceof TransformationExecutionError && error.message === `Transformer a-fails failed: ${failure instanceof Error ? failure.message : 'unknown error'}`);
    assert.equal(laterRan, false);
  }
});

test('resolution occurs once and already-resolved rule references survive unregister during execution', async () => {
  const registry = new TransformationRegistry();
  const executed: string[] = [];
  const laterRule = rule('second', message => {
    executed.push('second');
    return message.payload;
  }, 2);
  registry.register(rule('first', async message => {
    await Promise.resolve();
    registry.unregister('second');
    executed.push('first');
    return message.payload;
  }, 1));
  registry.register(laterRule);
  let resolveCalls = 0;
  const resolver: TransformationRuleResolver = {
    resolve(message) {
      resolveCalls += 1;
      return registry.resolve(message);
    }
  };
  await executeTransformations(resolver, original);
  assert.equal(resolveCalls, 1);
  assert.deepEqual(executed, ['first', 'second']);
  assert.equal(registry.resolve(original).length, 1);
});

test('wildcard matching applies independently to sender, destination, and payload type', () => {
  const registry = new TransformationRegistry();
  registry.register({ ...rule('any-from', message => message.payload), from: '*', to: 'aaui', payloadType: 'original.type' });
  registry.register({ ...rule('any-to', message => message.payload), from: 'pserver', to: '*', payloadType: 'original.type' });
  registry.register({ ...rule('any-type', message => message.payload), from: 'pserver', to: 'aaui', payloadType: '*' });
  registry.register({ ...rule('no-match', message => message.payload), from: 'eserver', to: 'aaui', payloadType: 'original.type' });
  assert.deepEqual(registry.resolve(original).map(entry => entry.id), ['any-from', 'any-to', 'any-type']);
});
