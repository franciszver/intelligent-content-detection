@echo off
setlocal enabledelayedexpansion
set CMD=%1
shift
if /I "%CMD%"=="build" (
  set DOCKER_BUILDKIT=0
  docker build --platform=linux/amd64 %*
) else (
  docker %CMD% %*
)
exit /b %errorlevel%

