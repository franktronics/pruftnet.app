#!/bin/bash
# Package the standalone server with all required files for distribution.
#
# Usage: ./scripts/package-server.sh [arch]
# arch: x64 (default) or arm64
#
# Output: dist/pruftnet-server-linux-{arch}-{version}.tar.gz

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$WEB_DIR")")"

ARCH="${1:-${TARGET_ARCH:-x64}}"
VERSION=$(node -p "require('./package.json').version")
PACKAGE_NAME="pruftnet-server-linux-${ARCH}-${VERSION}"
DIST_DIR="${WEB_DIR}/dist"
PACKAGE_DIR="${DIST_DIR}/${PACKAGE_NAME}"

echo "Packaging Pruftnet Server v${VERSION} for linux-${ARCH}..."

# Ensure standalone server is built
if [ ! -f "${DIST_DIR}/standalone/server.js" ]; then
    echo "Error: Standalone server not built. Run 'pnpm build:standalone' first."
    exit 1
fi

# Ensure client is built
if [ ! -d "${DIST_DIR}/client" ]; then
    echo "Error: Client not built. Run 'pnpm build:client' first."
    exit 1
fi

# Clean and create package directory
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

echo "Copying server bundle..."
cp "${DIST_DIR}/standalone/server.js" "$PACKAGE_DIR/"

echo "Copying client build..."
cp -r "${DIST_DIR}/client" "$PACKAGE_DIR/"

echo "Copying native modules..."
# Copy repo-core.node
CORE_NODE="${ROOT_DIR}/packages/core-cpp/build/Release/repo-core.node"
if [ -f "$CORE_NODE" ]; then
    cp "$CORE_NODE" "$PACKAGE_DIR/"
    echo "  - repo-core.node"
else
    echo "Warning: repo-core.node not found at $CORE_NODE"
fi

# Copy better-sqlite3 native module
SQLITE_NODE="${ROOT_DIR}/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
if [ -f "$SQLITE_NODE" ]; then
    cp "$SQLITE_NODE" "$PACKAGE_DIR/"
    echo "  - better_sqlite3.node"
else
    echo "Warning: better_sqlite3.node not found at $SQLITE_NODE"
fi

echo "Copying assets..."
mkdir -p "$PACKAGE_DIR/assets/protocols"
cp -r "${ROOT_DIR}/packages/core-node/assets/protocols/"* "$PACKAGE_DIR/assets/protocols/"

echo "Creating start script..."
cat > "$PACKAGE_DIR/start.sh" << 'EOF'
#!/bin/bash
# Pruftnet Server Startup Script
#
# Environment variables:
#   PORT          - Server port (default: 3010)
#   HOST          - Server host (default: 127.0.0.1)
#   DATABASE_URL  - SQLite database URL (default: file:./data/pruftnet.db)
#
# Requirements:
#   - Node.js >= 20
#   - libpcap (for packet capture)
#   - CAP_NET_RAW capability on node binary for packet capture without root

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default environment
export NODE_ENV=production
export PORT="${PORT:-3010}"
export HOST="${HOST:-127.0.0.1}"

# Create data directory for database
mkdir -p data

# Set database path if not already set
export DATABASE_URL="${DATABASE_URL:-file:$SCRIPT_DIR/data/pruftnet.db}"

# Set paths for native modules and assets
export RESOURCES_PATH="$SCRIPT_DIR"
export IS_PACKAGED="true"
export USER_DATA_PATH="$SCRIPT_DIR/data"

echo "Starting Pruftnet Server..."
echo "  Port: $PORT"
echo "  Host: $HOST"
echo "  Database: $DATABASE_URL"

exec node server.js
EOF
chmod +x "$PACKAGE_DIR/start.sh"

echo "Creating README..."
cat > "$PACKAGE_DIR/README.md" << EOF
# Pruftnet Server v${VERSION}

## Requirements

- Node.js >= 20
- libpcap (for packet capture)

## Quick Start

\`\`\`bash
# Make start script executable (if needed)
chmod +x start.sh

# Start the server
./start.sh
\`\`\`

The server will be available at http://127.0.0.1:3010

## Configuration

Environment variables:

| Variable      | Default                          | Description              |
|---------------|----------------------------------|--------------------------|
| PORT          | 3010                             | HTTP server port         |
| HOST          | 127.0.0.1                        | Server bind address      |
| DATABASE_URL  | file:./data/pruftnet.db          | SQLite database URL      |

## Packet Capture

For packet capture without root, set capabilities on the Node.js binary:

\`\`\`bash
sudo setcap cap_net_raw,cap_net_admin=eip \$(which node)
\`\`\`

## Files

- \`server.js\`          - Main server bundle
- \`client/\`            - Web frontend (static files)
- \`assets/\`            - Protocol definitions
- \`data/\`              - Created at runtime, contains the SQLite database
- \`repo-core.node\`     - Native C++ addon for packet capture
- \`better_sqlite3.node\` - Native SQLite addon

## Database

The database is created automatically on first start using Drizzle ORM.
No manual migration step is required.
EOF

echo "Creating tarball..."
cd "$DIST_DIR"
tar -czf "${PACKAGE_NAME}.tar.gz" "$PACKAGE_NAME"

echo ""
echo "Package created: ${DIST_DIR}/${PACKAGE_NAME}.tar.gz"
echo "Size: $(du -h "${PACKAGE_NAME}.tar.gz" | cut -f1)"
