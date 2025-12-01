#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-}"
shift || true

if [[ "${CMD}" == "build" ]]; then
  export DOCKER_BUILDKIT=0
  exec docker build --platform=linux/amd64 "$@"
else
  exec docker "${CMD}" "$@"
fi

