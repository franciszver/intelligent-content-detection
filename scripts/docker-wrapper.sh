#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-}"
shift || true

if [[ "${CMD}" == "build" ]]; then
  export DOCKER_DEFAULT_PLATFORM=linux/amd64
  export BUILDX_NO_DEFAULT_ATTESTATIONS=1
  # Build with buildx but force Docker v2 manifest by loading through docker load
  docker buildx build --platform=linux/amd64 --provenance=false --sbom=false "$@" --output=type=docker,dest=- | docker load
  exit "${PIPESTATUS[0]}"
else
  exec docker "${CMD}" "$@"
fi

