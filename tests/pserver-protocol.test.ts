import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPServerProtocol, DISPATCH_EVENT, SESSION_CONNECT_EVENT, type PServerGatewayCapabilities } from '../src/modules/pserver/pserver-protocol.js';
import type { PServerTransport as LegacyPServerTransport, TransportEventHandler as LegacyTransportEventHandler } from '../src/infrastructure/socket/pserver-transport.js';
import type { PServerTransport, TransportEventHandler } from '../src/modules/pserver/contracts.js';
import type { PeerMessage, PeerMessageAck } from '../src/modules/peer-messaging/contracts.js';

class FakeTransport implements PServerTransport {
  connected = false;
  readonly events = new Map<string, TransportEventHandler>();
  readonly emissions: Array<{ event: string; payload: unknown; timeoutMs: number }> = [];
  registration: { ok?: boolean; session?: { id?: string; vm_udid?: string } } | undefined = {
    ok: true, session: { id: 'session-1', vm_udid: 'test-vm' }
  };
  registrationError: Error | undefined;
  peerAck: { ok: boolean } = { ok: true };

  on(event: string, handler: TransportEventHandler): () => void {
    this.events.set(event, handler);
    return () => this.events.delete(event);
  }

  async emitWithAck<T>(event: string, payload: unknown, timeoutMs: number): Promise<T> {
    this.emissions.push({ event, payload, timeoutMs });
    if (event === SESSION_CONNECT_EVENT && this.registrationError) throw this.registrationError;
    return (event === SESSION_CONNECT_EVENT ? this.registration : this.peerAck) as T;
  }

  connect(): void { this.connected = true; }
  close(): void { this.connected = false; }
  fire(event: string, ...arguments_: unknown[]): void { this.events.get(event)?.(...arguments_); }
}

function makeGateway() {
  let registeredTransport: { isConnected(): boolean; deliver(message: PeerMessage): Promise<void> } | undefined;
  const received: unknown[] = [];
  const gateway: PServerGatewayCapabilities = {
    registerPServerTransport: transport => { registeredTransport = transport; },
    receiveFromPServer: async value => {
      received.push(value);
      return { ok: false, code: 'INVALID_MESSAGE', error: 'test acknowledgement' };
    }
  };
  return { gateway, received, get registeredTransport() { return registeredTransport; } };
}

const config = { vmInfo: { udid: 'test-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: [] } };
const peerMessage: PeerMessage = {
  version: '1.0', kind: 'event', from: 'aaui', to: 'pserver', channel: 'worker', event: 'message',
  payload: { type: 'demo.test', version: '1.0', data: {} }, id: 'message-1', timestamp: 1
};
const tick = () => new Promise(resolve => setImmediate(resolve));

const legacyTransport: LegacyPServerTransport = new FakeTransport();
const canonicalTransport: PServerTransport = legacyTransport;
const legacyHandler: LegacyTransportEventHandler = (...arguments_: unknown[]) => arguments_.length;
const canonicalHandler: TransportEventHandler = legacyHandler;

test('protocol exposes transport connection before session readiness and registers on connect', async () => {
  const transport = new FakeTransport();
  const gateway = makeGateway();
  const protocol = createPServerProtocol(config, transport, gateway.gateway);
  transport.connect();
  transport.fire('connect');
  assert.equal(transport.connected, true);
  assert.equal(protocol.connected, false);
  assert.equal(gateway.registeredTransport?.isConnected(), false);
  await tick();
  assert.equal(protocol.connected, true);
  assert.equal(protocol.sessionId, 'session-1');
  assert.equal(transport.emissions[0]?.event, SESSION_CONNECT_EVENT);
  assert.deepEqual(transport.emissions[0]?.payload, config.vmInfo);
  assert.equal(transport.emissions[0]?.timeoutMs, 10_000);
});

test('protocol delegates connect and close to its transport', () => {
  const transport = new FakeTransport();
  const protocol = createPServerProtocol(config, transport, makeGateway().gateway);
  protocol.connect();
  assert.equal(transport.connected, true);
  protocol.close();
  assert.equal(transport.connected, false);
  assert.ok(canonicalTransport instanceof FakeTransport);
  assert.equal(canonicalHandler, legacyHandler);
});

test('protocol resumes the session after reconnect and clears readiness on disconnect', async () => {
  const transport = new FakeTransport();
  const gateway = makeGateway();
  const protocol = createPServerProtocol(config, transport, gateway.gateway);
  transport.connect();
  transport.fire('connect');
  await tick();
  transport.close();
  transport.fire('disconnect', 'transport close');
  assert.equal(protocol.connected, false);
  assert.equal(protocol.sessionId, 'session-1');
  transport.connect();
  transport.fire('connect');
  await tick();
  assert.deepEqual(transport.emissions[1]?.payload, { session_id: 'session-1' });
  assert.equal(protocol.connected, true);
});

test('protocol preserves task dispatch validation and inbound peer message ACK delivery', async () => {
  const transport = new FakeTransport();
  const gateway = makeGateway();
  const protocol = createPServerProtocol(config, transport, gateway.gateway);
  const logs: unknown[][] = [];
  const warnings: unknown[][] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args: unknown[]) => { logs.push(args); };
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    transport.connect();
    transport.fire('connect');
    await tick();
    transport.fire(DISPATCH_EVENT, { session_id: 'session-1', vm_udid: 'test-vm', task_id: 'valid' });
    transport.fire(DISPATCH_EVENT, { session_id: 'wrong', vm_udid: 'test-vm' });
    await tick();
    assert.ok(logs.some(args => args[0] === '[AAB] ACTIVITY_TASK VALIDATED'));
    assert.ok(warnings.some(args => args[0] === '[AAB] ACTIVITY_TASK Session mismatch'));

    const incoming = { from: 'pserver', to: 'aaui', payload: { type: 'demo.test', data: {} } };
    let acknowledgement: PeerMessageAck | undefined;
    transport.fire('peer:message', incoming, (value: PeerMessageAck) => { acknowledgement = value; });
    await tick();
    assert.deepEqual(gateway.received, [incoming]);
    assert.deepEqual(acknowledgement, { ok: false, code: 'INVALID_MESSAGE', error: 'test acknowledgement' });
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  assert.equal(protocol.connected, true);
});

test('protocol rejects outbound delivery before session registration', async () => {
  const gateway = makeGateway();
  createPServerProtocol(config, new FakeTransport(), gateway.gateway);
  assert.ok(gateway.registeredTransport);
  await assert.rejects(gateway.registeredTransport.deliver(peerMessage), { message: 'PServer session is not registered' });
});

test('protocol returns the pre-ready inbound ACK and does not ingest the message', async () => {
  const transport = new FakeTransport();
  const gateway = makeGateway();
  createPServerProtocol(config, transport, gateway.gateway);
  let acknowledgement: PeerMessageAck | undefined;
  transport.fire('peer:message', { payload: 'ignored' }, (value: PeerMessageAck) => { acknowledgement = value; });
  await tick();
  assert.deepEqual(acknowledgement, { ok: false, code: 'UNSUPPORTED_DESTINATION', error: 'PServer session not ready' });
  assert.deepEqual(gateway.received, []);
});

test('protocol reports missing or negative registration ACK without becoming ready', async () => {
  for (const registration of [undefined, { ok: false, session: { id: 'rejected', vm_udid: 'test-vm' } }]) {
    const transport = new FakeTransport();
    transport.registration = registration;
    const gateway = makeGateway();
    const protocol = createPServerProtocol(config, transport, gateway.gateway);
    const originalError = console.error;
    console.error = () => {};
    try {
      transport.connect();
      transport.fire('connect');
      await tick();
    } finally {
      console.error = originalError;
    }
    assert.equal(protocol.connected, false);
    assert.equal(protocol.sessionId, undefined);
    assert.ok(gateway.registeredTransport);
    await assert.rejects(gateway.registeredTransport.deliver(peerMessage), { message: 'PServer session is not registered' });
  }
});

test('protocol keeps readiness false when registration ACK rejects', async () => {
  const transport = new FakeTransport();
  transport.registrationError = new Error('registration failed');
  const gateway = makeGateway();
  const protocol = createPServerProtocol(config, transport, gateway.gateway);
  const originalError = console.error;
  console.error = () => {};
  try {
    transport.connect();
    transport.fire('connect');
    await tick();
  } finally {
    console.error = originalError;
  }
  assert.equal(protocol.connected, false);
  assert.equal(protocol.sessionId, undefined);
});

test('protocol outbound delivery uses exact ACK timeout and rejects non-ok ACK', async () => {
  const transport = new FakeTransport();
  const gateway = makeGateway();
  createPServerProtocol(config, transport, gateway.gateway);
  transport.connect();
  transport.fire('connect');
  await tick();
  assert.ok(gateway.registeredTransport);
  await gateway.registeredTransport.deliver(peerMessage);
  assert.deepEqual(transport.emissions[1], { event: 'peer:message', payload: peerMessage, timeoutMs: 5000 });
  transport.peerAck = { ok: false };
  await assert.rejects(gateway.registeredTransport.deliver(peerMessage), { message: 'PServer rejected message' });
  assert.equal(transport.emissions[2]?.timeoutMs, 5000);
});

test('ready inbound peer message without ACK callback does not reach gateway', async () => {
  const transport = new FakeTransport();
  const gateway = makeGateway();
  createPServerProtocol(config, transport, gateway.gateway);
  transport.connect();
  transport.fire('connect');
  await tick();
  transport.fire('peer:message', { payload: 'ignored without ACK' });
  await tick();
  assert.deepEqual(gateway.received, []);
});
