@echo off
setlocal enabledelayedexpansion
set CMD=%1
shift
if /I "%CMD%"=="build" (
  set DOCKER_DEFAULT_PLATFORM=linux/amd64
  set BUILDX_NO_DEFAULT_ATTESTATIONS=1
  cmd /c "docker buildx build --platform=linux/amd64 --provenance=false --sbom=false %* --output type=docker,dest=- | docker load"
  exit /b %errorlevel%
) else (
  docker %CMD% %*
)
exit /b %errorlevel%

