# Naming Migration Deployment Runbook

This runbook separates preparation from deployment. The NM.3.2 work completed only documentary preparation. No ARM package installation, release activation, process operation, runtime data inspection or state change has been performed.

## Preparation complete in NM.3.2

- AS source baseline: `main` at `72b31e54e266743fbfd18b6169e4a85c843ddeb7`; pre-existing migration changes were preserved.
- ARM source baseline inspected: `arm-supervisor` at `4e887715d4576e6fa64644778f0072bc94c018b4`; its pre-existing `docs/Note.txt` edit remains untouched.
- For the inspected ARM checkout, start the management `SupervisorHost` with `npm run dev:management` (`examples/supervisor/src/management-api.ts`). `npm run dev:supervisor` launches the example ProcessManager (`examples/supervisor/src/index.ts`) and is example-only; it is not the management API. Confirm the actual `package.json` mapping before any startup.
- NM-D05 deployment evidence uses the persistent isolated root `/home/parker/nm-verification/naming-migration-v1.1.0/`. ARM storage, AS task/selection stores, secrets and logs are separate owner-only subdirectories there. See the [NM.3.3.B report](../../NM_3_3_B_ARM_FRESH_DEPLOYMENT_AND_RUNTIME_VERIFICATION_REPORT.md) for the exact foreground startup/shutdown procedure and the AS bind/EServer port blockers; keep migrated applications stopped until those findings are resolved.
- AS accepts optional `HOST` as an unpadded IPv4/IPv6 literal; unset preserves the previous `server.listen(port)` behavior. Empty/whitespace-only values fail validation. Standalone loopback mode uses `HOST=127.0.0.1`; under ARM omit HOST from the app config because ARM supplies trusted `HOST=127.0.0.1`.
- Fixed-port ARM templates use `PORT=3000` (AS), `PORT=3001` (CDC), `PORT=3002` (EServer 1), `PORT=3012` (EServer 2), `PORT=3003` (SPA). The EServer source keeps `PORT`-before-`ESERVER_PORT` precedence; omit redundant `ESERVER_PORT` from ARM templates. `PORT` requests a fixed assignment; without it ARM assigns a dynamic port. ARM `process.port` means ASSIGNED, not verified as bound or ready. NM.3.3.V must compare the assigned value with the actual OS listener and bind address.
- AS RF-22 requires the new immutable AS candidate release `1.1.1` because listener source changed. Version availability is not yet confirmed against isolated ARM inventory; verify it in NM.3.3.V. Never replace installed `1.1.0`. CDC, EServers and SPA stay on `1.1.0`.
- Application mapping: `aab` → `as`; `pserver` → `cdc`; `sserver` → `spa`; `eserver-1` and `eserver-2` IDs unchanged, but both need migrated packages.
- ARM per-app config is `<storageRoot>/applications/<applicationId>/application-config.json` with `{"schemaVersion":1,"environment":{"KEY":"string"}}`. NM.3.3.D templates (not installed config) are in [NM.3.3.D ARM application templates](NM_3_3_D_ARM_APPLICATION_CONFIGURATION_TEMPLATES.md).
- AS fresh paths are configured with `AS_TASK_STORE_DIR`, `AS_SELECTION_STORE_DIR`, `ENABLE_SQLITE`, and `DB_PATH`. Choose three distinct absolute paths outside old state and ARM storage/staging; no state conversion or replay is allowed by this runbook.
- Current listeners: AS configurable `PORT` (default 3000), CDC fixed 3001, EServer configurable (example 3002/3012), SPA fixed 3003, standalone AA fixed 3004. Peer URLs use `AS_URL`; AS CDC client uses `CDC_URL` and `/ws`.
- Release `(applicationId, version)` is immutable: same checksum is already installed; different checksum at that version is rejected. Choose a new version for changed package bytes.
- NM.3.3.D generated AS candidate `1.1.1` at `../../arm-packages/nm33d-v1.1.1-verified/as-1.1.1.zip`; it is not installed. Confirm version availability from authenticated isolated release inventory before use. Keep apps stopped until NM.3.3.V validates loopback binding and every assigned port against actual OS listeners.
- Full JSON templates, permissions, evidence limits and detailed rollback steps are in [NM.3.2 report](../../NM_3_2_CONTROLLED_FRESH_STATE_PREPARATION_REPORT.md).

## Deployment steps not yet executed

Proceed only in the separately authorized NM.3.3 checkpoint. These are planned operator actions, not evidence that they have occurred.

1. Inventory applications, active releases/checksums, process states and prior configuration. Identify old state locations from configuration/metadata without reading runtime records.
2. Confirm pending work is handled under existing system policy. If not, stop; do not clean, migrate or replay records.
3. Confirm ARM availability/storage root, package availability, SHA-256 checksums, release-version availability, external configuration access, network/port allocation and required filesystem permissions.
4. Stop incompatible old applications in a coordinated window; preserve old apps, releases, configurations and state.
5. Select and validate fresh, empty/nonexistent AS state locations. Configure absolute paths and intended `ENABLE_SQLITE` value.
6. Prepare the five per-app environment objects using the report templates. Keep shared API keys consistent when enabled; never place credentials in logs or reports. Configure EServers with distinct ports and logical IDs.
7. Install migrated package archives without overwriting releases. Check ARM-reported IDs, versions and checksums.
8. Activate the five migrated releases as a coordinated cutover. For unchanged EServer IDs, preserve the prior release for rollback.
9. Verify injected configuration without disclosing secrets, then process startup/ports. Start CDC before AS; start SPA and EServers after AS is listening; start standalone AA after AS.
10. Verify migrated peer identities, CDC Socket.IO `/ws` connection, and approved task, result, selection and peer business flows. Preserve current ACK, retry, delivery, lifecycle and persistence semantics.

## Rollback outline (not executed)

Stop migrated applications and AA. Avoid concurrent old/new naming contracts. Preserve all new AS state unchanged. Restore prior compatible releases and configuration for old IDs; restore previous compatible EServer releases/configuration under their unchanged IDs. Use old persistent state only with its compatible old release. Keep the new application IDs, releases and state for investigation. New business operations may not exist in old state, so rollback may not be lossless; do not replay or merge automatically. The operator must explicitly decide how to handle operations created during the migrated window. See the report for the ordered rollback procedure and limitations.

## NM.3.3 gate checklist

- [ ] ARM runtime/version, access, storage root and configuration provider confirmed.
- [ ] Five package artifacts and independent SHA-256 checksums verified.
- [ ] Existing IDs, active releases and immutable version conflicts inventoried.
- [ ] New version selected where required; no release overwrite planned.
- [ ] Old state paths and preservation owner identified without opening record contents.
- [ ] Pending operations addressed under current policy.
- [ ] New AS absolute state paths confirmed fresh, distinct and outside old/ARM staging roots.
- [ ] Target permissions and distinct ports confirmed, including fixed CDC 3001 and SPA 3003.
- [ ] External CDC compatibility confirmed if applicable; API key provider ready if enabled.
- [ ] Maintenance window, process operators, activation authorization and rollback decision owner confirmed.
- [ ] Installation and activation explicitly authorized for NM.3.3.
