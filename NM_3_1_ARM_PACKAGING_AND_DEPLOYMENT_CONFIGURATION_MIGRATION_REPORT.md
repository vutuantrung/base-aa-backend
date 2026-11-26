# NM.3.1 ARM Packaging & Deployment Configuration Migration Report

## 1. Baseline and worktree protection

- Branch `main`; committed HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7`.
- Verification toolchain: Node `v22.23.5`, npm `10.9.9`.
- The entry worktree was already dirty with the NM.2.1–NM.2.3 source, test, demo, documentation and tooling migration; renamed old paths were deleted and migrated paths were untracked. NM reports and R8 planning documents were also untracked. These were preserved. No reset, stash, stage or commit occurred.
- Existing `dist/` build output contained obsolete compiled paths. The final packaging build now uses the script's temporary staging directory and does not consume or clean that existing output. Runtime and ARM data were not inspected or changed.
- The related ARM checkout is available at `../base-arm-app`, branch `arm-supervisor`, HEAD `4e887715d4576e6fa64644778f0072bc94c018b4`. It has a pre-existing modification to `docs/Note.txt`; that change was inspected only as context and left untouched.

## 2. Packaging dependency audit

- `scripts/package-for-arm.sh` previously referenced the old AS/CDC/SPA application IDs and demo source names, and copied the repository's possibly stale `dist/src` tree. It also wrote to repository-local `arm-packages/` by default.
- It now maps AS to application ID `as`, CDC to `cdc`, SPA to `spa`, while keeping `eserver-1` and `eserver-2`. The two EServer archives both package the migrated `testing/eserver.mjs` and shared utilities.
- `ARM_PACKAGE_OUTPUT` optionally selects an output directory. The default remains `arm-packages/`. Each existing archive is still protected from overwrite by an explicit existence check.
- The AS build uses `tsc` with an isolated temporary `--outDir`; only this fresh output is copied into its archive. This prevents stale `dist` files from entering a release without deleting or modifying the repository's existing build tree.
- Peer packages copy the matching migrated entrypoint and `testing/shared/`, generate a `main.js`, `package.json` and lockfile. AA Electron is not packaged.

## 3. Application ID and artifact mapping

| Previous ID/source | Current ID/source | Generated archive |
|---|---|---|
| `aab` | `as`, backend `dist/src/main.js` from isolated build | `as-1.0.0.zip` |
| `pserver` | `cdc`, `testing/cdc.mjs` | `cdc-1.0.0.zip` |
| `eserver-1` | unchanged ID, migrated `testing/eserver.mjs` | `eserver-1-1.0.0.zip` |
| `eserver-2` | unchanged ID, migrated `testing/eserver.mjs` | `eserver-2-1.0.0.zip` |
| `sserver` | `spa`, `testing/spa.mjs` | `spa-1.0.0.zip` |

Version remains `VERSION` with default `1.0.0`; ZIP naming is `<applicationId>-<version>.zip`. Root npm package identity remains `base-aa-backend` (NP-01). No old-ID compatibility archives were generated.

## 4. Manifest, entrypoint and dependency evidence

- Each archive passed `unzip -t`. Each contains `app.manifest.json`, `package.json`, `package-lock.json`, and its declared entrypoint.
- All five manifests validate the existing schema and values: `schemaVersion: "1.0"`, the target application ID, version `1.0.0`, Node runtime `>=22`, `npm-ci` install strategy, `buildRequired: false`, `arm.enabled: false`, `autoStart: false`, restart policy `on-failure`, three maximum restarts and 10,000 ms stop timeout. No schema or installation/activation semantics changed.
- AS entry is `dist/src/main.js`; peer entry is `main.js`, importing the correspondingly packaged migrated `.mjs` file. Peer packages include shared helpers. EServer packages were checked separately and contain distinct application IDs with the same migrated consumer implementation.
- Each final extracted package passed the supervisor's install mode: `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` (five of five). Installation took place only under `/tmp/nm31-packages.btIlmq/final-install-check/`; no ARM install occurred.
- Final archive audit found no old service identities in archive paths or JavaScript/JSON contents. The obsolete `pserver` compiled paths found in the first package attempt were excluded by switching the final build to isolated staging.

## 5. Configuration and persistent state boundary

- AS reads `CDC_URL` (default `http://127.0.0.1:3001`), `CDC_SOCKET_PATH` (default `/ws`), `AS_TASK_STORE_DIR` (default `./data/tasks`) and `AS_SELECTION_STORE_DIR` (default `./data/resource-selections`). Each durable store has its `.r7.5-outbox` subdirectory.
- AS SQLite configuration remains generic: `ENABLE_SQLITE` and `DB_PATH` (default `./data/app.db`). Peer consumers use `AS_URL`; EServer port selection remains `PORT`/`ESERVER_PORT`, allowing distinct ports for both EServer IDs. Existing ports and feature-gate semantics were not changed.
- The ARM checkout stores operator-controlled per-application environment in `ApplicationConfigurationStore`, at `<storageRoot>/applications/<applicationId>/application-config.json` with an `environment` object (`../base-arm-app/packages/adapter-process/src/application-configuration-store.ts:7-19`). New application IDs therefore need their own explicit configuration; changing IDs does not transfer old app configuration.
- A fresh deployment operator must choose new isolated task, selection and SQLite paths through these existing settings before installation. Defaults and record formats are preserved. No state directory was created, migrated, deleted or replayed here.

## 6. ARM compatibility and external providers

- The related ARM repository validates the existing manifest ID/schema, Node runtime, `npm-ci` strategy and relative JavaScript entrypoint (`../base-arm-app/packages/package-manager/src/application-package-validator.ts:42-50`). Its application storage and release APIs key by `applicationId`; per-app configuration uses the path above. These contracts are compatible with the generated schema and IDs on source inspection.
- ARM code was not changed, and no live installation/activation was performed. Cross-repository operational compatibility remains unverified until NM.3.3.
- External configuration providers requiring operator update are the ARM per-application configuration records for `as`, `cdc`, `spa`, `eserver-1`, and `eserver-2`. AS requires the CDC and state settings above; CDC/SPA/EServer peer connections use `AS_URL`; EServer instances need their existing distinct port settings. Values must be supplied by the deployment operator; this task did not alter deployed configuration.
- The locally present, pre-modified `../base-arm-app/docs/Note.txt` still contains an old `APP_NAME=aab` example in its existing dirty content. It was not modified; it is a deployment-documentation follow-up for NM.3.3/review, not a package artifact or ARM source change.

## 7. Documentation and changed files

- `scripts/package-for-arm.sh`: application IDs/source paths migrated, isolated output override added, AS build output isolated from stale `dist`.
- `README.md`: current package command/names, configuration variables/defaults, persistent subdirectories, operator-controlled fresh-state requirement and pending ARM verification documented.
- `docs/architecture/PROJECT_STATE.md`: narrow NM.3.1 checkpoint added at the top; earlier checkpoints retained.
- This report records the generated artifacts and evidence. No source application, test, ARM repository or deployment configuration was changed.

## 8. Verification commands and results

- `bash -n scripts/package-for-arm.sh` — PASS.
- `PATH=/home/parker/.nvm/versions/node/v22.23.5/bin:$PATH VERSION=1.0.0 ARM_PACKAGE_OUTPUT=/tmp/nm31-packages.btIlmq/final bash scripts/package-for-arm.sh` — PASS, exit 0. Embedded `npm run typecheck` and `npm run build -- --outDir <temporary staging>/build` both passed; five archives generated. Peer lockfile generation completed with npm 10.9.9.
- Archive ZIP integrity, manifest schema/fields, app IDs, version, entrypoints, required metadata and obsolete service-name scan — PASS for all five archives.
- `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` — PASS for all five final extracted archives.
- `npm run check:architecture` on Node 22.23.5 — PASS, 59 files / 145 edges, zero runtime file SCCs; existing module SCCs/warning retained.
- `npm run test:manifest` on Node 22.23.5 — PASS, 55/55 entries and discovered tests (fast 11, integration 16, full 55).
- `git diff --check` and final shell syntax check — PASS.
- Full test suites were not repeated; no application behavior or test code changed. No ARM installation, activation, process launch or runtime interoperability is claimed.

## 9. Generated artifact inventory and checksums

All final archives are under `/tmp/nm31-packages.btIlmq/final/`; SHA-256:

| Artifact | SHA-256 |
|---|---|
| `as-1.0.0.zip` | `7a1427532fa7c2cb84dcaf2e7fdf35dc413f0756b8958149be230ae31aec5e42` |
| `cdc-1.0.0.zip` | `5c949cd65abf03e3cef13d017154bd975cb35c747f9096e99725df40eaee58b3` |
| `eserver-1-1.0.0.zip` | `55d74977afcfc0f05b6a928237450231d4970af187340999bf555e8585f55197` |
| `eserver-2-1.0.0.zip` | `0c04309f10cec6caef326484867f228fce8962214c46028c6a26dfbf01c15d8e` |
| `spa-1.0.0.zip` | `d987590e5425c9ab93b2ea2f10a0f22a479a0dae9a9ba916248b5f8c50aca7a4` |

The repository-local default `arm-packages/` was not written. The first isolated package attempt exposed stale old-path build output and was superseded; final artifacts were generated from a fresh isolated build and are the artifacts listed above.

## 10. Residual naming inventory

- `scripts/package-for-arm.sh` and current README deployment section: no `PServer`, standalone `AAB`, `SServer`, or `AAUI` occurrence remains (targeted case-insensitive scan returned no matches).
- Final package paths and JavaScript/JSON content: no obsolete service identity found.
- Preserved exceptions: root package/repository name `base-aa-backend`; historical reports/prompts and older architecture evidence under NP-02; AA domain terms and generic protocol names. The pre-existing ARM `docs/Note.txt` old ID example is identified above and was left untouched.

## 11. Preservation, remaining dependencies and acceptance

- Existing migration worktree changes and the ARM checkout's pre-existing `docs/Note.txt` modification remain preserved. No staging, commit, release overwrite, runtime data access/mutation, application install or activation occurred.
- **NM.3.2:** operator-controlled fresh-state path selection and preparation remains pending.
- **NM.3.3:** ARM supervisor installation/activation validation, new per-ID application configuration, operational-doc update/review and actual ARM compatibility remain pending.
- No package generation blocker remains. Source-inspection compatibility is not a substitute for target ARM runtime verification.

**Acceptance recommendation: PASS for NM.3.1 local packaging and configuration migration.** The generated artifacts pass structural, dependency-install and residual-name checks. Actual ARM deployment and controlled state preparation remain explicit later gates, not claims of this checkpoint.
