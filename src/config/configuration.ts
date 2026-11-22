import type { PServerConnectionConfig, VmInfo } from '../modules/pserver/contracts.js';

export type Environment = Readonly<Record<string, string | undefined>>;

export type ResolvedConfiguration = {
  port: number;
  application: {
    dbPath: string;
    corsOrigin: string;
    apiKey: string | undefined;
    enableSqlite: boolean;
    enableTestPeers: boolean;
    pserver: Omit<PServerConnectionConfig, 'apiKey'> | undefined;
    shutdownTimeoutMs: number;
  };
  enableTestPeers: boolean;
};

export function resolveConfiguration(environment: Environment): ResolvedConfiguration {
  const port = Number(environment.PORT ?? 3000);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');

  const enableTestPeers = environment.ENABLE_TEST_PEERS === '1';
  const shutdownTimeoutMs = Number(environment.SHUTDOWN_TIMEOUT_MS ?? 15_000);
  if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1 || shutdownTimeoutMs > 120_000)
    throw new Error('Invalid SHUTDOWN_TIMEOUT_MS (expected an integer from 1 to 120000)');
  const vmInfo: VmInfo = {
    udid: environment.VM_UDID ?? 'aab-demo-vm',
    sdk: environment.VM_SDK ?? '',
    model: environment.VM_MODEL ?? '',
    abi: environment.VM_ABI ?? '',
    forSearch: environment.VM_FOR_SEARCH === 'true',
    platforms: (environment.VM_PLATFORMS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  };
  return {
    port,
    enableTestPeers,
    application: {
      dbPath: environment.DB_PATH ?? './data/app.db',
      enableSqlite: environment.ENABLE_SQLITE === '1',
      corsOrigin: environment.SOCKET_CORS_ORIGIN ?? 'http://localhost:5173',
      apiKey: environment.API_KEY,
      enableTestPeers,
      pserver: enableTestPeers ? {
        url: environment.PSERVER_URL ?? 'http://127.0.0.1:3001',
        path: environment.PSERVER_SOCKET_PATH ?? '/ws',
        vmInfo
      } : undefined,
      shutdownTimeoutMs
    }
  };
}
