import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPServerProtocol, DISPATCH_EVENT, SESSION_CONNECT_EVENT, type PServerGatewayCapabilities } from '../src/modules/pserver/pserver-protocol.js';
import type { PServerTransport, TransportEventHandler } from '../src/infrastructure/socket/pserver-transport.js';
import type { PeerMessage, PeerMessageAck } from '../src/modules/peer-messaging/contracts.js';

class FakeTransport implements PServerTransport {
  connected = false;
  readonly events = new Map<string, TransportEventHandler>();
  readonly emissions: Array<{ event: string; payload: unknown; timeoutMs: number }> = [];
  registration: { ok: boolean; session: { id: string; vm_udid: string } } = {
    ok: true, session: { id: 'session-1', vm_udid: 'test-vm' }
  };
  peerAck: { ok: boolean } = { ok: true };

  on(event: string, handler: TransportEventHandler): () => void {
    this.events.set(event, handler);
    return () => this.events.delete(event);
  }

  async emitWithAck<T>(event: string, payload: unknown, timeoutMs: number): Promise<T> {
    this.emissions.push({ event, payload, timeoutMs });
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
const tick = () => new Promise(resolve => setImmediate(resolve));

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
