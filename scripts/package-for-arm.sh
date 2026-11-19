
#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$ROOT/arm-packages"
VERSION="${VERSION:-1.0.0}"

mkdir -p "$OUTPUT"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

create_manifest() {
    local directory="$1"
    local app_id="$2"
    local entry="$3"

    cat > "$directory/app.manifest.json" <<EOF
{
  "schemaVersion": "1.0",
  "applicationId": "$app_id",
  "version": "$VERSION",
  "runtime": {
    "type": "nodejs",
    "nodeVersion": ">=22",
    "entry": "$entry"
  },
  "install": {
    "strategy": "npm-ci",
    "buildRequired": false
  },
  "arm": {
    "enabled": false
  },
  "lifecycle": {
    "autoStart": false,
    "restartPolicy": "on-failure",
    "maxRestarts": 3,
    "stopTimeoutMs": 10000
  }
}
EOF
}

create_zip() {
    local directory="$1"
    local app_id="$2"
    local archive="$OUTPUT/$app_id-$VERSION.zip"

    if [[ -e "$archive" ]]; then
        echo "Archive already exists: $archive"
        exit 1
    fi

    (
        cd "$directory"
        zip -qr "$archive" .
    )

    echo "Created: $archive"
}

package_peer() {
    local app_id="$1"
    local server="$2"
    local directory="$STAGING/$app_id"

    mkdir -p "$directory"

    cp "$ROOT/testing/$server.mjs" "$directory/"
    cp -r "$ROOT/testing/shared" "$directory/"

    echo "import './$server.mjs';" \
        > "$directory/main.js"

    cat > "$directory/package.json" <<EOF
{
  "name": "$app_id",
  "version": "$VERSION",
  "private": true,
  "type": "module",
  "dependencies": {
    "express": "^5.1.0",
    "socket.io": "^4.8.1",
    "socket.io-client": "^4.8.1"
  }
}
EOF

    (
        cd "$directory"
        npm install --package-lock-only --ignore-scripts
    )

    create_manifest "$directory" "$app_id" "main.js"
    create_zip "$directory" "$app_id"
}

# Build AAB
cd "$ROOT"

npm run typecheck
npm run build

test -f "$ROOT/dist/src/main.js"

# Package AAB
AAB_DIR="$STAGING/aab"

mkdir -p "$AAB_DIR/dist"

cp -r "$ROOT/dist/src" "$AAB_DIR/dist/"
cp "$ROOT/package.json" "$AAB_DIR/"

# ARM Supervisor installs this package with npm ci. Remove the optional native
# SQLite addon from the deployment manifest and regenerate its matching lockfile.
(
    cd "$AAB_DIR"
    npm pkg delete optionalDependencies.better-sqlite3
)

if [[ -f "$ROOT/package-lock.json" ]]; then
    cp "$ROOT/package-lock.json" "$AAB_DIR/"
fi

(
    cd "$AAB_DIR"
    npm install --package-lock-only --ignore-scripts
)

create_manifest "$AAB_DIR" "aab" "dist/src/main.js"
create_zip "$AAB_DIR" "aab"

# Package other servers
package_peer "pserver" "pserver"
package_peer "eserver-1" "eserver"
package_peer "eserver-2" "eserver"
package_peer "sserver" "sserver"

echo "All packages created."
