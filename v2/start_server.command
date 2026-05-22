#!/bin/bash

cd "$(dirname "$0")"

echo "Starting local server..."
echo "Open: http://localhost:8000"
echo "Press CTRL+C to stop"

python3 -m http.server 8000

echo
read -p "Press Enter to close..."