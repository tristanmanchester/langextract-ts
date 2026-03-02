#!/usr/bin/env bash

set -euo pipefail

has_root_ts=0
root_scan_paths=()
[ -d scripts ] && root_scan_paths+=("scripts")

if [ "${#root_scan_paths[@]}" -gt 0 ]; then
  if fd -e ts -e tsx . "${root_scan_paths[@]}" \
    --exclude fixtures \
    | head -n 1 \
    | grep -q .; then
    has_root_ts=1
  fi
fi

has_workspace_packages=0
workspace_scan_paths=()
[ -d packages ] && workspace_scan_paths+=("packages")

if [ "${#workspace_scan_paths[@]}" -gt 0 ]; then
  if fd -p package.json "${workspace_scan_paths[@]}" | head -n 1 | grep -q .; then
    has_workspace_packages=1
  fi
fi

if [ "$has_root_ts" -eq 0 ] && [ "$has_workspace_packages" -eq 0 ]; then
  echo "No TypeScript targets found. Skipping typecheck."
  exit 0
fi

if [ "$has_root_ts" -eq 1 ]; then
  pnpm exec tsc --noEmit --project tsconfig.json
else
  echo "No root TypeScript files to check. Skipping root typecheck."
fi

if [ "$has_workspace_packages" -eq 1 ]; then
  pnpm -r --filter "./packages/*" --if-present run typecheck
fi
