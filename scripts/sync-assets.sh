#!/usr/bin/env bash
# Copy runtime-served assets (the blank form + the sample W-2) into public/,
# which is the Worker's static-assets directory. The canonical copies live in
# assets/; public/ is generated.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$here/public/forms" "$here/public/fixtures"
cp "$here/assets/forms/f1040_2025.pdf" "$here/public/forms/f1040_2025.pdf"
cp "$here/assets/fixtures/w2_sample.png" "$here/public/fixtures/w2_sample.png"
cp "$here/assets/fixtures/w2_sample.pdf" "$here/public/fixtures/w2_sample.pdf"
echo "synced assets into public/"
