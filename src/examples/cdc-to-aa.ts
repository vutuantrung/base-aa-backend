import type { TransformationRegistry } from '../modules/peer-messaging/transformation-registry.js';

/**
 * Demo-only rule, registered from main.ts when ENABLE_TEST_PEERS=1.
 * Keeps production business rules and other peer messages unaffected.
 */
export function registerCdcToAaDemo(registry: TransformationRegistry): void {
  registry.register({
    id: 'demo-cdc-to-aa-modified-param',
    from: 'cdc',
    to: 'aa',
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
            modifiedParam: `AS modified: ${input.originalParam}`
          }
        };
      }
    }
  });
}
