import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PeerId, PeerMessageAck } from '../src/modules/peer-messaging/contracts.js';
import { createPeerMessageHandler, type PeerMessageHandlerCapabilities } from '../src/infrastructure/socket/peer-gateway.js';

function createRecorder() {
  const calls: Array<{ name: string; value: unknown; peer?: PeerId; instanceId?: string }> = [];
  const acknowledgements: Record<string, PeerMessageAck> = {
    selection: { ok: false, code: 'INVALID_MESSAGE', error: 'selection path' },
    request: { ok: false, code: 'INVALID_MESSAGE', error: 'request path' },
    result: { ok: false, code: 'INVALID_MESSAGE', error: 'result path' },
    generic: { ok: false, code: 'INVALID_MESSAGE', error: 'generic path' }
  };
  const record = (name: string) => async (value: unknown, peer?: PeerId, instanceId?: string): Promise<PeerMessageAck> => {
    calls.push({ name, value, peer, instanceId });
    const acknowledgement = acknowledgements[name];
    if (!acknowledgement) throw new Error(`Missing acknowledgement fixture for ${name}`);
    return acknowledgement;
  };
  const capabilities: PeerMessageHandlerCapabilities = {
    receiveResourceSelection: record('selection'),
    receiveTaskRequest: record('request'),
    receiveTaskResult: (value, instanceId) => record('result')(value, 'eserver', instanceId),
    processGenericMessage: (value, peer, instanceId) => record('generic')(value, peer, instanceId)
  };
  return { handler: createPeerMessageHandler(capabilities), calls, acknowledgements };
}

test('authenticated special operations select one workflow in the established precedence', async () => {
  const recorder = createRecorder();
  const messages = [
    { payload: { type: 'demo.resource-selection' } },
    { payload: { type: 'demo.task.request' } },
    { payload: { type: 'demo.task.result' } }
  ];

  assert.equal(await recorder.handler(messages[0], 'aa'), recorder.acknowledgements.selection);
  assert.equal(await recorder.handler(messages[1], 'cdc'), recorder.acknowledgements.request);
  assert.equal(await recorder.handler(messages[2], 'eserver', 'worker-authenticated'), recorder.acknowledgements.result);
  assert.deepEqual(recorder.calls.map(({ name }) => name), ['selection', 'request', 'result']);
  assert.equal(recorder.calls[2]?.instanceId, 'worker-authenticated');
  assert.deepEqual(recorder.calls.map(({ value }) => value), messages);
});

test('wrong sender, unknown and malformed input preserve raw selection and generic fallback behavior', async () => {
  const recorder = createRecorder();
  const spoofedEnvelope = { from: 'aa', payload: { type: 'demo.resource-selection' } };
  const malformedMatchingEnvelope = { payload: { type: 'demo.task.result' } };
  const ordinaryEnvelope = { payload: { type: 'ordinary.message' } };

  assert.equal(await recorder.handler(spoofedEnvelope, 'eserver', 'worker-real'), recorder.acknowledgements.generic);
  assert.equal(await recorder.handler(ordinaryEnvelope, 'aa'), recorder.acknowledgements.generic);
  assert.equal(await recorder.handler(malformedMatchingEnvelope, 'eserver', 'worker-real'), recorder.acknowledgements.result);
  assert.equal(await recorder.handler(null, 'cdc'), recorder.acknowledgements.generic);

  assert.deepEqual(recorder.calls.map(({ name }) => name), ['generic', 'generic', 'result', 'generic']);
  assert.equal(recorder.calls[0]?.peer, 'eserver');
  assert.equal(recorder.calls[0]?.instanceId, 'worker-real');
  assert.equal(recorder.calls[2]?.value, malformedMatchingEnvelope);
});
