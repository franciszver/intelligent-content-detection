@echo off
setlocal enabledelayedexpansion
set CMD=%1
shift
if /I "%CMD%"=="build" (
  REM Force classic Docker build (no BuildKit) to produce Docker V2 manifest Lambda requires
  echo [DOCKER-WRAPPER] Intercepting docker build command
  set DOCKER_BUILDKIT=0
  set DOCKER_DEFAULT_PLATFORM=
  docker build %*
  exit /b %errorlevel%
) else if /I "%CMD%"=="buildx" (
  REM Intercept buildx and convert to classic docker build
  echo [DOCKER-WRAPPER] Intercepting docker buildx, converting to classic build
  shift
  if /I "%1"=="build" (
    shift
    REM Remove buildx-specific flags and use classic build
    set DOCKER_BUILDKIT=0
    docker build %*
    exit /b %errorlevel%
  )
  docker buildx %CMD% %*
  exit /b %errorlevel%
) else (
  docker %CMD% %*
)
exit /b %errorlevel%

