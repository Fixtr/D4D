#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' >/dev/null 2>&1; then
  exec python3 "$SCRIPT_DIR/run_ui.py" "$@"
elif command -v python >/dev/null 2>&1 && python -c 'import sys; sys.exit(sys.version_info < (3, 10))' >/dev/null 2>&1; then
  exec python "$SCRIPT_DIR/run_ui.py" "$@"
elif command -v py >/dev/null 2>&1 && py -3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' >/dev/null 2>&1; then
  exec py -3 "$SCRIPT_DIR/run_ui.py" "$@"
else
  echo "Python 3.10+ is required. Install python3 and python3-venv." >&2
  exit 1
fi
