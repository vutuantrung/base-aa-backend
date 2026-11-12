import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMockVmInfo,
  SUPPORTING_FEATURES,
  PARSER_TYPES,
  PLATFORMS
} from '../shared/mock-vm-info.mjs';
import { startScheduledPeerMessages } from '../shared/scheduled-peer-message.mjs';

test('mock VM list follows requested array format with supported enum values', () => {
  const list = createMockVmInfo('eserver-1');
  assert.ok(Array.isArray(list));
  assert.equal(list.length, 2);
  for (const vm of list) {
    assert.deepEqual(Object.keys(vm).sort(), ['id', 'browserId', 'version', 'supportingPlatforms'].sort());
    assert.match(vm.id, /^eserver-1-vm-/);
    assert.ok(vm.browserId);
    assert.ok(vm.version);
    assert.ok(vm.supportingPlatforms.length >= 2);
    assert.equal(new Set(vm.supportingPlatforms.map(item => item.platform)).size, vm.supportingPlatforms.length);
    for (const entry of vm.supportingPlatforms) {
      assert.deepEqual(Object.keys(entry).sort(), ['platform', 'supportingFeatures', 'parserInfo'].sort());
      assert.ok(PLATFORMS.includes(entry.platform));
      assert.ok(entry.supportingFeatures.length);
      assert.ok(entry.supportingFeatures.every(feature => SUPPORTING_FEATURES.includes(feature)));
      assert.deepEqual(Object.keys(entry.parserInfo).sort(), ['version', 'type'].sort());
      assert.ok(entry.parserInfo.version);
      assert.ok(entry.parserInfo.type.length);
      assert.ok(entry.parserInfo.type.every(type => PARSER_TYPES.includes(type)));
    }
  }
});

test('mock VM identity stays instance-specific across independent EServers', () => {
  const first = createMockVmInfo('eserver-1', () => 0.5);
  const second = createMockVmInfo('eserver-2', () => 0.5);
  assert.notEqual(first[0].id, second[0].id);
  assert.notEqual(first[0].browserId, second[0].browserId);
  assert.deepEqual(first[0].supportingPlatforms, second[0].supportingPlatforms);
});

test('scheduled sender forwards an array payload without assuming a sequence field', async () => {
  const sent = [];
  const logs = [];
  const socket = {
    connected: true,
    timeout() {
      return {
        emitWithAck: async (event, message) => {
          sent.push({ event, message });
          return { ok: true, data: { id: 'message-1' } };
        }
      };
    }
  };
  const scheduler = startScheduledPeerMessages({
    socket,
    intervalMs: 10,
    createMessage: () => ({
      from: 'eserver',
      to: 'aaui',
      payload: { type: 'eserver.vm-info', data: createMockVmInfo('e-1') }
    }),
    log: (...values) => logs.push(values)
  });
  try {
    await new Promise(resolve => setTimeout(resolve, 45));
  } finally {
    scheduler.stop();
  }
  assert.ok(sent.length > 0);
  assert.equal(sent[0].event, 'peer:message');
  assert.ok(Array.isArray(sent[0].message.payload.data));
  assert.ok(logs.some(values => String(values[0]).includes('SCHEDULE DELIVERED')));
});
