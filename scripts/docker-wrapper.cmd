@echo off
setlocal enabledelayedexpansion
set CMD=%1
shift
if /I "%CMD%"=="build" (
  REM Force classic Docker build (no BuildKit) to produce Docker V2 manifest Lambda requires
  set DOCKER_BUILDKIT=0
  docker build --platform=linux/amd64 %*
  exit /b %errorlevel%
) else (
  docker %CMD% %*
)
exit /b %errorlevel%

