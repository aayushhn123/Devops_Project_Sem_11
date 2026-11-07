@echo off
rem Starts PriceScope. Double-click and pick a mode, or run: start.bat compose  /  start.bat k8s
title PriceScope - Start
setlocal
cd /d "%~dp0"

set "MODE=%~1"
if not "%MODE%"=="" goto ensure_docker
echo.
echo   PriceScope - how do you want to run it?
echo.
echo     1. Kubernetes      http://localhost:8081   (2 pods, live cluster on the DevOps page)
echo     2. Docker Compose  http://localhost:5000   (simplest)
echo.
choice /c 12 /n /m "  Press 1 or 2: "
if errorlevel 2 (set "MODE=compose") else (set "MODE=k8s")

:ensure_docker
where docker >nul 2>nul
if errorlevel 1 (
  echo.
  echo Docker is not installed. Install Docker Desktop, then run this again.
  goto fail
)
docker info >nul 2>nul
if not errorlevel 1 goto docker_ready

echo.
echo Starting Docker Desktop. This can take a minute or two...
docker desktop start >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if errorlevel 1 if exist "%LocalAppData%\Programs\DockerDesktop\Docker Desktop.exe" start "" "%LocalAppData%\Programs\DockerDesktop\Docker Desktop.exe"

set /a TRIES=0
:wait_docker
docker info >nul 2>nul
if not errorlevel 1 goto docker_ready
set /a TRIES+=1
if %TRIES% geq 60 (
  echo Docker did not start within 5 minutes. Open Docker Desktop, check it for errors, then try again.
  goto fail
)
timeout /t 5 /nobreak >nul
goto wait_docker

:docker_ready
if /i "%MODE%"=="compose" goto start_compose
if /i "%MODE%"=="k8s" goto start_k8s
echo Unknown mode "%MODE%". Use compose or k8s.
goto fail

:start_compose
set "URL=http://localhost:5000"
echo.
echo Starting with Docker Compose...
for /f %%i in ('git rev-parse --short HEAD 2^>nul') do set "GIT_SHA=%%i"
for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')"') do set "BUILD_TIME=%%i"
docker compose up -d --build
if errorlevel 1 goto fail
goto wait_app

:start_k8s
set "URL=http://localhost:8081"
echo.
echo Waiting for Kubernetes to be ready...
set /a TRIES=0
:wait_k8s
kubectl get nodes 2>nul | findstr /r /c:" Ready " >nul
if not errorlevel 1 goto deploy_k8s
set /a TRIES+=1
if %TRIES% geq 36 (
  echo Kubernetes is not ready. In Docker Desktop, open Settings, then Kubernetes, and turn it on.
  echo Or run this again and pick Docker Compose.
  goto fail
)
timeout /t 5 /nobreak >nul
goto wait_k8s

:deploy_k8s
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-k8s.ps1"
if errorlevel 1 goto fail

:wait_app
echo.
echo Waiting for PriceScope to answer...
set /a TRIES=0
:wait_ready
curl -s -f -o nul --max-time 3 "%URL%/readyz"
if not errorlevel 1 goto running
set /a TRIES+=1
if %TRIES% geq 60 (
  echo PriceScope did not become ready within 3 minutes.
  goto fail
)
timeout /t 3 /nobreak >nul
goto wait_ready

:running
echo.
echo   PriceScope is running at %URL%
echo   To stop it, use stop.bat or the Shutdown button in the app.
echo.
start "" "%URL%"
if "%~1"=="" pause
exit /b 0

:fail
echo.
echo PriceScope did not start.
if "%~1"=="" pause
exit /b 1
