import type { TransformationRegistry } from '../modules/peer-messaging/transformation-registry.js';

/**
 * Demo-only rule, registered from main.ts when ENABLE_TEST_PEERS=1.
 * Keeps production business rules and other peer messages unaffected.
 */
export function registerPServerToAauiDemo(registry: TransformationRegistry): void {
  registry.register({
    id: 'demo-pserver-to-aaui-modified-param',
    from: 'pserver',
    to: 'aaui',
    payloadType: 'demo.modified-param',
    priority: 10,
    transformer: {
      transform(message) {
        const input = message.payload.data as { originalParam: string };
        if (typeof input?.originalParam !== 'string') throw new Error('originalParam must be a string');
        return {
          ...message.payload,
          data: {
            ...input,
            modifiedParam: `AAB modified: ${input.originalParam}`
          }
        };
      }
    }
  });
}
