#!/usr/bin/env bash
# RETIRED — this script previously rsync'd dist/ into ~/airwave-empire with --delete,
# which could remove the Node server and user data paths. Do not use.
set -euo pipefail
echo "ERROR: scripts/deploy-production.sh is retired (unsafe)." >&2
echo "" >&2
echo "Use from repo root:" >&2
echo "  ./deploy.sh              # full staging deploy" >&2
echo "  ./deploy.sh --dry-run    # preview rsync only" >&2
echo "  DEPLOY_SKIP_AMPLIFY=1 ./deploy.sh   # API only" >&2
echo "" >&2
echo "See docs/DEPLOY.md" >&2
exit 1
