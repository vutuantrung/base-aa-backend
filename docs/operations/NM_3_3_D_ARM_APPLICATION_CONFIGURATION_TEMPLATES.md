# NM.3.3.D ARM Application Configuration Templates

Templates only. Do not copy into installed configuration until the separately authorized NM.3.3.V verification step. Root: `/home/parker/nm-verification/naming-migration-v1.1.0/arm-storage/applications/<id>/application-config.json`.

Use the existing protected shared `API_KEY`; the placeholder below is not a credential. ARM supplies trusted `HOST=127.0.0.1`, so HOST is omitted from application config.

## as

```json
{"schemaVersion":1,"environment":{"PORT":"3000","ENABLE_TEST_PEERS":"1","ENABLE_SQLITE":"0","CDC_URL":"http://127.0.0.1:3001","CDC_SOCKET_PATH":"/ws","AS_TASK_STORE_DIR":"/home/parker/nm-verification/naming-migration-v1.1.0/as-state/tasks","AS_SELECTION_STORE_DIR":"/home/parker/nm-verification/naming-migration-v1.1.0/as-state/resource-selections","API_KEY":"<existing protected shared key>"}}
```

## cdc

```json
{"schemaVersion":1,"environment":{"PORT":"3001","API_KEY":"<existing protected shared key>"}}
```

## eserver-1

```json
{"schemaVersion":1,"environment":{"PORT":"3002","AS_URL":"http://127.0.0.1:3000","ESERVER_INSTANCE_ID":"e-1","API_KEY":"<existing protected shared key>"}}
```

## eserver-2

```json
{"schemaVersion":1,"environment":{"PORT":"3012","AS_URL":"http://127.0.0.1:3000","ESERVER_INSTANCE_ID":"e-2","API_KEY":"<existing protected shared key>"}}
```

## spa

```json
{"schemaVersion":1,"environment":{"PORT":"3003","AS_URL":"http://127.0.0.1:3000","API_KEY":"<existing protected shared key>"}}
```

EServers retain source-level `PORT`-before-`ESERVER_PORT` precedence; these ARM templates omit the redundant `ESERVER_PORT` key.
