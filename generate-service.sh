#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: ./generate-service.sh <broker-name>"
  echo "Example: ./generate-service.sh finance"
  echo ""
  echo "This will generate {broker-name}-mcp-broker.service from the example"
  exit 1
fi

BROKER_NAME="$1"
OUTPUT_FILE="${BROKER_NAME}-mcp-broker.service"

if [ ! -f "mcp-broker.service.example" ]; then
  echo "❌ Error: mcp-broker.service.example not found in current directory"
  exit 1
fi

sed "s/{{BROKER_NAME}}/$BROKER_NAME/g" mcp-broker.service.example > "$OUTPUT_FILE"

echo "✅ Generated $OUTPUT_FILE"
echo ""
echo "Next steps:"
echo "1. Review the file: cat $OUTPUT_FILE"
echo "2. Copy to remote: ssh andrew@COFASV32 'mkdir -p /var/log/mcp/$BROKER_NAME && chown -R oauth-broker:oauth-broker /var/log/mcp/$BROKER_NAME'"
echo "3. Deploy service: scp $OUTPUT_FILE andrew@COFASV32:/tmp/ && ssh andrew@COFASV32 'sudo cp /tmp/$OUTPUT_FILE /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable $BROKER_NAME-mcp-broker && sudo systemctl start $BROKER_NAME-mcp-broker'"
