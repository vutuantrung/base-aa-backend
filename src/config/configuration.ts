import { isIP } from 'node:net';
import type { CdcConnectionConfig, VmInfo } from '../modules/cdc/contracts.js';

export type Environment = Readonly<Record<string, string | undefined>>;

export type ResolvedConfiguration = {
  port: number;
  host: string | undefined;
  application: {
    dbPath: string;
    corsOrigin: string;
    apiKey: string | undefined;
    enableSqlite: boolean;
    enableTestPeers: boolean;
    cdc: Omit<CdcConnectionConfig, 'apiKey'> | undefined;
    shutdownTimeoutMs: number;
  };
  enableTestPeers: boolean;
};

export function resolveConfiguration(environment: Environment): ResolvedConfiguration {
  const port = Number(environment.PORT ?? 3000);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const host = resolveHost(environment.HOST);

  const enableTestPeers = environment.ENABLE_TEST_PEERS === '1';
  const shutdownTimeoutMs = Number(environment.SHUTDOWN_TIMEOUT_MS ?? 15_000);
  if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1 || shutdownTimeoutMs > 120_000)
    throw new Error('Invalid SHUTDOWN_TIMEOUT_MS (expected an integer from 1 to 120000)');
  const vmInfo: VmInfo = {
    udid: environment.VM_UDID ?? 'as-demo-vm',
    sdk: environment.VM_SDK ?? '',
    model: environment.VM_MODEL ?? '',
    abi: environment.VM_ABI ?? '',
    forSearch: environment.VM_FOR_SEARCH === 'true',
    platforms: (environment.VM_PLATFORMS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  };
  return {
    port,
    host,
    enableTestPeers,
    application: {
      dbPath: environment.DB_PATH ?? './data/app.db',
      enableSqlite: environment.ENABLE_SQLITE === '1',
      corsOrigin: environment.SOCKET_CORS_ORIGIN ?? 'http://localhost:5173',
      apiKey: environment.API_KEY,
      enableTestPeers,
      cdc: enableTestPeers ? {
        url: environment.CDC_URL ?? 'http://127.0.0.1:3001',
        path: environment.CDC_SOCKET_PATH ?? '/ws',
        vmInfo
      } : undefined,
      shutdownTimeoutMs
    }
  };
}

function resolveHost(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const host = value.trim();
  if (!host || host !== value || !isIpAddress(host)) throw new Error('Invalid HOST');
  return host;
}

function isIpAddress(value: string): boolean {
  // Avoid DNS lookups during configuration resolution. Node accepts IPv4 and
  // IPv6 literals (including IPv6 zone identifiers on supported platforms).
  const withoutZone = value.includes('%') ? value.slice(0, value.indexOf('%')) : value;
  return isIP(withoutZone) !== 0;
}
