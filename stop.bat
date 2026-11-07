@echo off
rem Stops PriceScope everywhere it is running. Your data is kept for the next start.
title PriceScope - Stop
setlocal
cd /d "%~dp0"

docker info >nul 2>nul
if errorlevel 1 (
  echo Docker is not running, so PriceScope is already stopped.
  goto done
)

echo Stopping Docker Compose containers...
docker compose stop

echo.
echo Stopping Kubernetes pods...
kubectl get namespace pricescope >nul 2>nul
if errorlevel 1 (
  echo Nothing is deployed on Kubernetes.
) else (
  kubectl scale deployment pricescope-app -n pricescope --replicas=0
  kubectl scale statefulset postgres -n pricescope --replicas=0
  kubectl wait --for=delete pod -l app=pricescope-app -n pricescope --timeout=60s >nul 2>nul
  kubectl wait --for=delete pod/postgres-0 -n pricescope --timeout=60s >nul 2>nul
)

echo.
echo PriceScope is stopped. Docker Desktop is still open; you can quit it from its tray icon.
echo Run start.bat to start again.

:done
echo.
if "%~1"=="" pause
exit /b 0
