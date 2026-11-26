# Naming Migration Deployment Runbook

This runbook records the reusable install/configure/activate/start procedure and current NM deployment facts. Naming Migration was closed by operator decision; this is not authorization to resume deployment. The latest isolated runtime attempt remains blocked before app startup by the host network-isolation restriction. See [current project state](../architecture/PROJECT_STATE.md) and [Naming Migration closure](../../NAMING_MIGRATION_CLOSURE.md).

## Preparation complete in NM.3.2

- Original AS source baseline: `main` at `72b31e54e266743fbfd18b6169e4a85c843ddeb7`; Naming Migration is now committed at `b8311c3` on `main`. See closure for task-entry worktree status.
- ARM source baseline inspected: `arm-supervisor` at `4e887715d4576e6fa64644778f0072bc94c018b4`; its pre-existing `docs/Note.txt` edit remains untouched.
- For the inspected ARM checkout, start the management `SupervisorHost` with `npm run dev:management` (`examples/supervisor/src/management-api.ts`). `npm run dev:supervisor` launches the example ProcessManager (`examples/supervisor/src/index.ts`) and is example-only; it is not the management API. Confirm the actual `package.json` mapping before any startup.
- NM-D05 persistent isolated root is `/home/parker/nm-verification/naming-migration-v1.1.0/`; ARM storage, AS task/selection stores, secrets and logs are separate owner-only subdirectories. AS 1.1.1 and peer releases 1.1.0 remain installed/selected, with all five apps stopped in the last authenticated inventory. V-R.2 startup was deferred because host-level network isolation could not be verified without prohibited root/system changes. Preserve this environment and do not start apps under the current host conditions.
- AS accepts optional `HOST` as an unpadded IPv4/IPv6 literal; unset preserves the previous `server.listen(port)` behavior. Empty/whitespace-only values fail validation. Standalone loopback mode uses `HOST=127.0.0.1`; under ARM omit HOST from the app config because ARM supplies trusted `HOST=127.0.0.1`.
- Fixed-port ARM templates use `PORT=3000` (AS), `PORT=3001` (CDC), `PORT=3002` (EServer 1), `PORT=3012` (EServer 2), `PORT=3003` (SPA). The EServer source keeps `PORT`-before-`ESERVER_PORT` precedence; omit redundant `ESERVER_PORT` from ARM templates. `PORT` requests a fixed assignment; without it ARM assigns a dynamic port. ARM `process.port` means ASSIGNED, not verified as bound or ready. NM.3.3.V must compare the assigned value with the actual OS listener and bind address.
- AS 1.1.1 is installed and active after the HOST source remediation. Its actual runtime bind address has not been verified; do not fall back to AS 1.1.0, which has the known wildcard-bind behavior. CDC, EServers and SPA remain on 1.1.0.
- Application mapping: `aab` → `as`; `pserver` → `cdc`; `sserver` → `spa`; `eserver-1` and `eserver-2` IDs unchanged, but both need migrated packages.
- ARM per-app config is `<storageRoot>/applications/<applicationId>/application-config.json` with `{"schemaVersion":1,"environment":{"KEY":"string"}}`. NM.3.3.D templates (not installed config) are in [NM.3.3.D ARM application templates](NM_3_3_D_ARM_APPLICATION_CONFIGURATION_TEMPLATES.md).
- AS fresh paths are configured with `AS_TASK_STORE_DIR`, `AS_SELECTION_STORE_DIR`, `ENABLE_SQLITE`, and `DB_PATH`. Choose three distinct absolute paths outside old state and ARM storage/staging; no state conversion or replay is allowed by this runbook.
- Configured port contracts: AS configurable `PORT` (default 3000), CDC 3001, EServer 3002/3012 for the approved fixed-instance deployment, SPA 3003, standalone AA loopback 3004. These values do not prove current listeners. Peer URLs use `AS_URL`; AS CDC client uses `CDC_URL` and `/ws`.
- Release `(applicationId, version)` is immutable: same checksum is already installed; different checksum at that version is rejected. Choose a new version for changed package bytes.
- NM.3.3.D artifact `../../arm-packages/nm33d-v1.1.1-verified/as-1.1.1.zip` was verified and installed as AS 1.1.1 in the approved isolated environment. Preserve immutable releases. Keep apps stopped until an authorized future runtime attempt can establish permitted network isolation and verify loopback binding and each assigned port against actual OS listeners.
- Full JSON templates, permissions, evidence limits and detailed rollback steps are in [NM.3.2 report](../../NM_3_2_CONTROLLED_FRESH_STATE_PREPARATION_REPORT.md).

## Reusable deployment sequence (historical NM.3.3 execution completed with runtime verification deferred)

These steps describe the order and separation of deployment operations. They are not a request to rerun the closed Naming Migration. Any future deployment is a separate authorized task.

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

## Reusable deployment readiness checklist

This checklist is for a future, separately authorized deployment; current NM.3.3 status and limitations are recorded in [PROJECT_STATE](../architecture/PROJECT_STATE.md).

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
