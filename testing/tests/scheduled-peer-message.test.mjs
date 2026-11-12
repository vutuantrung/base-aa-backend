import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startScheduledPeerMessages } from '../shared/scheduled-peer-message.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('scheduled sender sends repeatedly with ACK and stops cleanly', async () => {
  const sent = [];
  const socket = {
    connected: true,
    timeout() {
      return { emitWithAck: async (_event, payload) => {
        sent.push(payload);
        return { ok: true, data: { id: 'message-1' } };
      } };
    }
  };
  let count = 0;
  const scheduler = startScheduledPeerMessages({
    socket, intervalMs: 15,
    createMessage: () => ({ payload: { data: { sequence: ++count } } }),
    log: () => {}
  });
  try {
    await delay(65);
    assert.ok(sent.length >= 2);
    assert.ok(sent.every((item, i) => item.payload.data.sequence === i + 1));
  } finally {
    scheduler.stop();
  }
  const before = sent.length;
  await delay(40);
  assert.equal(sent.length, before);
});

test('offline EServer skips ticks; overlapping send is prevented', async () => {
  let resolveAck;
  let sends = 0;
  const socket = {
    connected: false,
    timeout() {
      return { emitWithAck: () => {
        sends++;
        return new Promise(resolve => { resolveAck = resolve; });
      } };
    }
  };
  const scheduler = startScheduledPeerMessages({
    socket, intervalMs: 12,
    createMessage: () => ({ payload: { data: { sequence: 1 } } }),
    log: () => {}
  });
  try {
    await delay(35);
    assert.equal(sends, 0);
    socket.connected = true;
    await delay(35);
    assert.equal(sends, 1);
    resolveAck({ ok: true });
    await delay(25);
    assert.ok(sends >= 2);
  } finally {
    scheduler.stop();
    resolveAck?.({ ok: true });
  }
});
