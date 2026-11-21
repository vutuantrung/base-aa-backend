import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { analyzeDependencies } from '../scripts/check-architecture.js';

async function analyzeFixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'aab-architecture-'));
  try {
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', strict: true } }));
    for (const [path, contents] of Object.entries(files)) {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    return analyzeDependencies(root, Object.keys(files));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('legal type-only import is recorded as erased and NodeNext resolves .js specifiers to TypeScript', async () => {
  const graph = await analyzeFixture({
    'src/modules/messaging/messaging.ts': "import type { Contract } from './route-registry.js'; export type Consumer = Contract;",
    'src/modules/messaging/route-registry.ts': 'export type Contract = { value: string };'
  });
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]?.kind, 'type');
  assert.equal(graph.edges[0]?.target, 'src/modules/messaging/route-registry.ts');
});

test('named type-only exports remain erased and unresolved relative specifiers fail', async () => {
  const graph = await analyzeFixture({
    'src/modules/messaging/messaging.ts': "export { type Contract } from './route-registry.js'; import { type Contract as Alias } from './route-registry.js'; export type Consumer = Alias;",
    'src/modules/messaging/route-registry.ts': 'export type Contract = { value: string };'
  });
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.edges.length, 2);
  assert.ok(graph.edges.every(edge => edge.kind === 'type'));
  const unresolved = await analyzeFixture({
    'src/modules/messaging/messaging.ts': "import type { Missing } from './missing.js'; export type Consumer = Missing;"
  });
  assert.ok(unresolved.errors.some(error => error.includes("unresolved relative specifier './missing.js'")));
});

test('M01 and M04 infrastructure imports are prohibited even when type-only', async () => {
  const graph = await analyzeFixture({
    'src/config/configuration.ts': "import type { Server } from '../infrastructure/http/http-server.js'; export type Config = Server;",
    'src/modules/pserver/contracts.ts': "import type { Server } from '../../infrastructure/http/http-server.js'; export type Port = Server;",
    'src/infrastructure/http/http-server.ts': 'export type Server = { close(): void };'
  });
  assert.equal(graph.errors.filter(error => error.includes('prohibits')).length, 2);
});

test('neutral shared contracts cannot import infrastructure', async () => {
  const graph = await analyzeFixture({
    'src/shared/contracts/message.ts': "export { HttpMessageClient } from '../../infrastructure/integration-clients/index.js';",
    'src/infrastructure/integration-clients/index.ts': 'export class HttpMessageClient {}'
  });
  assert.ok(graph.errors.some(error => error.includes('neutral shared contract files')));
});

test('M08 can depend on neutral shared client contracts only through type-only edges', async () => {
  const typeOnly = await analyzeFixture({
    'src/infrastructure/integration-clients/http-message-client.ts': "import type { ConnectableMessageClient } from '../../shared/transport/connectable-message-client.js'; export type Client = ConnectableMessageClient;",
    'src/shared/transport/connectable-message-client.ts': 'export interface ConnectableMessageClient { close(): void }'
  });
  assert.deepEqual(typeOnly.errors, []);
  const runtime = await analyzeFixture({
    'src/infrastructure/integration-clients/http-message-client.ts': "import { ConnectableMessageClient } from '../../shared/transport/connectable-message-client.js'; export const client = new ConnectableMessageClient();",
    'src/shared/transport/connectable-message-client.ts': 'export class ConnectableMessageClient { close(): void {} }'
  });
  assert.ok(runtime.errors.some(error => error.includes('M08 may use neutral shared client contracts only through type-only edges')));
});

test('only the exact R5-D08 legacy re-export is allowed', async () => {
  const legal = await analyzeFixture({
    'src/shared/transport/connectable-client.ts': "export { HttpMessageClient, SocketMessageClient } from '../../infrastructure/integration-clients/index.js';",
    'src/infrastructure/integration-clients/index.ts': 'export class HttpMessageClient {} export class SocketMessageClient {}'
  });
  assert.deepEqual(legal.errors, []);
  const wrongSymbol = await analyzeFixture({
    'src/shared/transport/connectable-client.ts': "export { HttpMessageClient, SomethingElse } from '../../infrastructure/integration-clients/index.js';",
    'src/infrastructure/integration-clients/index.ts': 'export class HttpMessageClient {} export class SomethingElse {}'
  });
  assert.ok(wrongSymbol.errors.some(error => error.includes('not the approved R5-D08')));
  const wrongPath = await analyzeFixture({
    'src/shared/transport/connectable-client.ts': "export { HttpMessageClient, SocketMessageClient } from '../../infrastructure/integration-clients/http-message-client.js';",
    'src/infrastructure/integration-clients/http-message-client.ts': 'export class HttpMessageClient {} export class SocketMessageClient {}'
  });
  assert.ok(wrongPath.errors.some(error => error.includes('not the approved R5-D08')));
});

test('runtime cycles fail while type-only cycles do not', async () => {
  const runtime = await analyzeFixture({
    'src/modules/messaging/messaging.ts': "import { b } from './message-router.js'; export const a = b;",
    'src/modules/messaging/message-router.ts': "import { a } from './messaging.js'; export const b = a;"
  });
  assert.ok(runtime.errors.some(error => error.includes('runtime file cycle')));
  const types = await analyzeFixture({
    'src/modules/messaging/messaging.ts': "import type { B } from './message-router.js'; export type A = B;",
    'src/modules/messaging/message-router.ts': "import type { A } from './messaging.js'; export type B = A;"
  });
  assert.deepEqual(types.errors, []);
  assert.equal(types.runtimeSccs.length, 0);
});

test('unmapped source files fail with an ownership diagnostic', async () => {
  const graph = await analyzeFixture({ 'src/new-place/file.ts': 'export const value = 1;' });
  assert.ok(graph.errors.some(error => error.includes('source ownership is unmapped')));
});

test('side-effect imports are runtime edges and dynamic imports are explicitly rejected', async () => {
  const graph = await analyzeFixture({
    'src/modules/messaging/messaging.ts': "import './message-router.js'; import {} from './route-registry.js'; export {} from './route-registry.js'; export async function load() { return import('./message-router.js'); }",
    'src/modules/messaging/route-registry.ts': 'export const route = 1;',
    'src/modules/messaging/message-router.ts': 'export const value = 1;'
  });
  assert.equal(graph.edges.filter(edge => edge.kind === 'runtime' && edge.symbols.length === 0).length, 3);
  assert.ok(graph.errors.some(error => error.includes('dynamic import()/require() is unsupported')));
});

test('require calls are explicitly rejected as unanalyzed dependency syntax', async () => {
  const graph = await analyzeFixture({
    'src/modules/messaging/messaging.ts': "const dependency = require('./route-registry.js'); export { dependency };",
    'src/modules/messaging/route-registry.ts': 'export const value = 1;'
  });
  assert.ok(graph.errors.some(error => error.includes('dynamic import()/require() is unsupported')));
});
