import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpOutboundAdapter } from '../src/infrastructure/http/http-outbound-adapter.js';
import type { MessageEnvelope } from '../src/shared/contracts/message.js';

const message: MessageEnvelope = {
  id: 'message-1', channel: 'worker', event: 'created',
  payload: { url: 'http://untrusted.example/override' }, timestamp: '2026-01-01T00:00:00.000Z'
};

test('webhook adapter sends only to trusted endpoint IDs with existing security options', async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  let requestUrl: string | undefined;
  let requestInit: RequestInit | undefined;
  let timeoutMs: number | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(null, { status: 204 });
  };
  AbortSignal.timeout = milliseconds => {
    timeoutMs = milliseconds;
    return new AbortController().signal;
  };
  try {
    assert.throws(() => new HttpOutboundAdapter({ bad: { url: 'file:///etc/passwd' } }), { message: 'Webhook URL must use HTTP(S)' });
    const adapter = new HttpOutboundAdapter({ trusted: { url: 'https://hooks.example/receive', apiKey: 'webhook-key' } });
    await adapter.deliver(message, { transport: 'http', endpointId: 'trusted' });
    assert.equal(requestUrl, 'https://hooks.example/receive');
    assert.equal(timeoutMs, 5000);
    assert.equal(requestInit?.redirect, 'error');
    assert.equal(new Headers(requestInit?.headers).get('x-api-key'), 'webhook-key');
    assert.equal(new Headers(requestInit?.headers).get('x-message-id'), 'message-1');
    assert.equal(requestInit?.body, JSON.stringify(message));
    await assert.rejects(adapter.deliver(message, { transport: 'http', endpointId: 'untrusted' }), { message: 'Unknown webhook endpoint: untrusted' });
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});

test('webhook adapter preserves non-success response errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  try {
    const adapter = new HttpOutboundAdapter({ target: { url: 'http://hooks.example/receive' } });
    await assert.rejects(adapter.deliver(message, { transport: 'http', endpointId: 'target' }), { message: 'Webhook target failed with HTTP 503' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
