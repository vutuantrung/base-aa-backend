import type { MessageEnvelope } from '../../shared/contracts/message.js';
import type { ConnectableMessageClient } from '../../shared/transport/connectable-message-client.js';
import type { NewMessage } from '../../shared/contracts/message.js';

/** Reusable HTTP client for submitting messages to this application's API. */
export class HttpMessageClient implements ConnectableMessageClient {
  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}
  async send(message: NewMessage): Promise<MessageEnvelope> {
    const response = await fetch(new URL('/api/messages', this.baseUrl), {
      method: 'POST', headers: { 'content-type': 'application/json', ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}) }, body: JSON.stringify(message)
    });
    if (!response.ok) throw new Error(`HTTP message request failed: ${response.status}`);
    return await response.json() as MessageEnvelope;
  }
  async close(): Promise<void> {}
}
