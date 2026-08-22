#!/usr/bin/env bash
# Read-only acceptance check against a real Starboard (Javelin firmware).
#
# Web Serial is browser-only, so the automated suite cannot cover the serial
# path. This talks to the CDC device directly and runs the reply through the
# app's own parser, which catches a broken handshake or a broken parser
# without a browser. It sends only `list_dictionaries` — nothing is written
# to the keyboard.
#
# Usage: scripts/hardware-check.sh [/dev/cu.usbmodemXXXX]
set -euo pipefail

DEV="${1:-$(ls /dev/cu.usbmodem* 2>/dev/null | head -1)}"
if [ -z "${DEV:-}" ] || [ ! -e "$DEV" ]; then
  echo "no keyboard found (looked for /dev/cu.usbmodem*)" >&2
  exit 2
fi

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

# The firmware drops the console when DTR goes low, so keep it asserted.
stty -f "$DEV" raw 115200 clocal -hupcl

cat "$DEV" > "$OUT" &
CAT_PID=$!
trap 'kill $CAT_PID 2>/dev/null || true; rm -f "$OUT"' EXIT

sleep 1
# Javelin discards all serial input until it sees this exact sequence.
printf 'start_javelin_console\n' > "$DEV"
sleep 1
printf 'list_dictionaries\n' > "$DEV"
sleep 3

kill $CAT_PID 2>/dev/null || true
wait $CAT_PID 2>/dev/null || true

echo "=== raw reply ($(wc -c < "$OUT" | tr -d ' ') bytes) ==="
cat "$OUT"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$OUT" REPO_ROOT="$REPO_ROOT" node --input-type=module -e '
import { readFileSync } from "node:fs";
const { parseDictionaryList } = await import(
  process.env.REPO_ROOT + "/public/js/serial-protocol.js"
);
const raw = readFileSync(process.env.OUT, "utf8");
const names = parseDictionaryList(raw.replace(/\n+$/, ""));
console.log("\n=== parseDictionaryList() ===");
console.log(JSON.stringify(names, null, 2));
if (names.length === 0) { console.error("\nFAIL: parser returned nothing"); process.exit(1); }
if (names.some((n) => n.startsWith("{") || n === "[" || n === "]")) {
  console.error("\nFAIL: parser leaked raw record syntax"); process.exit(1);
}
console.log("\nPASS: handshake answered and " + names.length + " dictionaries parsed");
'
