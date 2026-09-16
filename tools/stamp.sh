#!/bin/sh
# Re-stamp preview/index.html with the current commit, so returning visitors
# never get a stale mix of app.js, style.css and demo-content.js.
# Run before committing a change to any of them.
set -e
cd "$(dirname "$0")/.."
V=$(git rev-parse --short HEAD)
sed -i -E "s/(style\.css|config\.js|demo-content\.js|app\.js)\?v=[^\"]*/\1?v=$V/g" preview/index.html
echo "preview stamped $V"
