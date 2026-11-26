# R7.6 Lifecycle operations

This runbook describes the locally verified R7.6.B lifecycle behavior. It does not establish production filesystem behavior or permit blind lock removal.

## Startup and readiness

The entrypoint installs SIGINT/SIGTERM handlers before resolving and starting the application. M12/M13 stores recover before HTTP binds; runner activation follows successful bind; optional CDC connection begins afterward. Local readiness is internal and becomes true once required local recovery and listener setup complete. It does not mean CDC session-ready, a destination online, SQLite enabled, or outbox capacity available. `/health` remains `{ "status": "ok" }` while the listener serves it, including during drain.

## Shutdown and timeout

The first SIGINT or SIGTERM starts the same application close path. The application stops new admission and scheduler launches, waits for admitted operations and active deliveries/outcome commits, then closes CDC, peer/socket and HTTP resources before SQLite. Queued and future retryable outbox work stays durable. The total monotonic budget defaults to 15 seconds; configure `SHUTDOWN_TIMEOUT_MS` as an integer from 1 through 120000. A timeout causes `close()` rejection and an error diagnostic with active counts. JavaScript cannot preempt a synchronous event-loop stall or undo a remote effect. The process supervisor owns forced termination; a second signal exits nonzero in the entrypoint.

Do not treat timeout as evidence that every dependency released resources. The application retains writer ownership while tracked mutators remain. Diagnose the stopped process and verify the operating-system owner is dead before following the [R7.5 writer-lock recovery procedure](R7_5_RELIABILITY_OUTBOX.md). Preserve canonical files, quarantine artifacts and dedupe keys. Never remove a lock based only on its recorded PID or while a process may still be mutating state.

## Diagnostics and limits

M02 logs drain start, work counts by class, completion or failure, timeout and a `preserveWriterLocks` indication. Logs omit message payloads and credentials. No readiness endpoint or new peer protocol field exists. Verify local behavior on the deployment filesystem before relying on its sync/rename semantics; the R7.5 crash evidence used Linux `/tmp` (`tmpfs`) and is not power-loss or receiver-deduplication evidence.
