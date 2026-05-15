#!/bin/bash

set -e

if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh <broker-name>"
  echo "Example: ./deploy.sh finance"
  exit 1
fi

BROKER_NAME="$1"
REMOTE_HOST="andrew@COFASV32"
REMOTE_PATH="/opt/oauth-brokers/${BROKER_NAME}-mcp-broker"
SERVICE_NAME="${BROKER_NAME}-mcp-broker"

echo "🔨 Building application..."
npm run build

if [ ! -d "dist" ]; then
  echo "❌ Build failed: dist directory not found"
  exit 1
fi

echo "📦 Deploying to $REMOTE_HOST:$REMOTE_PATH..."

# Create remote directory and ensure proper ownership and permissions
ssh "$REMOTE_HOST" "sudo mkdir -p $REMOTE_PATH && sudo chown oauth-broker:oauth-broker $REMOTE_PATH && sudo chmod 775 $REMOTE_PATH"

# Copy dist directory
echo "  → Syncing dist..."
rsync -avz --delete dist/ "$REMOTE_HOST:$REMOTE_PATH/dist/"

# Copy package.json
echo "  → Copying package.json..."
scp package.json "$REMOTE_HOST:$REMOTE_PATH/"

# Ensure files are owned by oauth-broker with correct permissions
ssh "$REMOTE_HOST" "sudo chown -R oauth-broker:oauth-broker $REMOTE_PATH/dist $REMOTE_PATH/package.json && sudo chmod -R u+rw,g+rw,o-w $REMOTE_PATH/dist $REMOTE_PATH/package.json"

echo "🔄 Restarting service on remote host..."
ssh "$REMOTE_HOST" "sudo systemctl restart $SERVICE_NAME"

echo "✅ Deployment complete!"
echo "Service status:"
ssh "$REMOTE_HOST" "sudo systemctl status $SERVICE_NAME --no-pager"
