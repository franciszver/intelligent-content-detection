#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-}"
shift || true

if [[ "${CMD}" == "build" ]]; then
  # Force classic Docker build (no BuildKit) to produce Docker V2 manifest Lambda requires
  # Remove --platform flag if present to avoid BuildKit, CDK handles platform via Platform enum
  export DOCKER_BUILDKIT=0
  unset DOCKER_DEFAULT_PLATFORM
  exec docker build "$@"
else
  exec docker "${CMD}" "$@"
fi

