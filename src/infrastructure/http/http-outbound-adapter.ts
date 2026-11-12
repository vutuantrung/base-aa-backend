import type { MessageEnvelope } from '../../shared/contracts/message.js';
import type { OutboundTransportAdapter } from '../../modules/messaging/message-router.js';
import type { Destination } from '../../modules/messaging/route-registry.js';

export type WebhookEndpoint = { url: string; apiKey?: string };

/**
 * Outbound HTTP delivery uses only trusted server-side endpoint IDs.
 * Never take a URL from a client message (SSRF prevention).
 */
export class HttpOutboundAdapter implements OutboundTransportAdapter {
  readonly transport = 'http' as const;
  constructor(
    private readonly endpoints: Readonly<Record<string, WebhookEndpoint>>,
    private readonly timeoutMs = 5000
  ) {
    for (const endpoint of Object.values(endpoints)) {
      const parsed = new URL(endpoint.url);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Webhook URL must use HTTP(S)');
    }
  }
  async deliver(message: MessageEnvelope, destination: Destination): Promise<void> {
    if (destination.transport !== 'http') throw new Error('Invalid HTTP destination');
    const endpoint = this.endpoints[destination.endpointId];
    if (!endpoint) throw new Error(`Unknown webhook endpoint: ${destination.endpointId}`);
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-message-id': message.id,
        ...(endpoint.apiKey ? { 'x-api-key': endpoint.apiKey } : {})
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`Webhook ${destination.endpointId} failed with HTTP ${response.status}`);
  }
}
