@echo off
setlocal EnableExtensions
title ReachInbox Email Job Scheduler

rem =========================================================================
rem  start_all.bat - one-shot launcher for the ReachInbox assignment
rem
rem  Usage:
rem    start_all.bat              start the stack and open the dashboard
rem    start_all.bat --no-browser start the stack without opening a browser
rem    start_all.bat --test       start the stack, then run the E2E smoke test
rem    start_all.bat --install    reinstall dependencies, then start
rem    start_all.bat --stop       stop a previously started instance
rem
rem  Frontend and backend run in ONE Node process on http://localhost:3000 :
rem    Express REST API + queue worker (delayed jobs / rate limiter) +
rem    Vite dev middleware serving the React dashboard.
rem =========================================================================

set "ROOT=%~dp0"
rem Auto-detect the app folder (the one containing server.ts) so the launcher
rem keeps working if the assignment folder is renamed.
set "APP_DIR="
for /d %%D in ("%ROOT%*") do (
  if exist "%%~fD\server.ts" set "APP_DIR=%%~fD"
)
if not defined APP_DIR set "APP_DIR=%ROOT%OUBOX_LAB_ASSISGNMENT"
set "PORT=3000"
set "BASE_URL=http://localhost:%PORT%"
rem Probe via IPv4: "localhost" tries ::1 first and stalls ~2.2s on this machine
rem (server binds 0.0.0.0), which used to blow the 2s health timeout.
set "HEALTH_URL=http://127.0.0.1:%PORT%/api/health"
set "PID_FILE=%APP_DIR%\data\.server.pid"
set "OPEN_BROWSER=1"
set "RUN_TEST=0"
set "FORCE_INSTALL=0"
set "ACTION=start"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--no-browser" set "OPEN_BROWSER=0"
if /i "%~1"=="--test"       set "RUN_TEST=1"
if /i "%~1"=="--install"    set "FORCE_INSTALL=1"
if /i "%~1"=="--stop"       set "ACTION=stop"
shift
goto parse_args
:args_done

if /i "%ACTION%"=="stop" goto stop_instance

echo.
echo  ============================================================
echo    ReachInbox Email Job Scheduler - starting all services
echo  ============================================================
echo.

if not exist "%APP_DIR%" (
  echo  [ERROR] Application folder not found under: "%ROOT%"
  echo  Keep start_all.bat next to the folder that contains server.ts.
  goto fail
)

cd /d "%APP_DIR%" || goto fail

rem ---------------- Node availability ----------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js is not on PATH. Install Node 18+ from https://nodejs.org
  goto fail
)
for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo  [1/5] Node.js %NODE_VER% found

rem ---------------- Dependencies ----------------
if not exist "node_modules" goto install_deps
if "%FORCE_INSTALL%"=="1" goto install_deps
echo  [2/5] Dependencies already installed - skipping npm install
goto deps_done

:install_deps
echo  [2/5] Installing dependencies (this can take a minute on first run)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo  [ERROR] npm install failed
  goto fail
)
:deps_done

rem ---------------- Stop a previous instance ----------------
call :kill_server

rem ---------------- Start the server ----------------
echo  [3/5] Starting server (API + queue worker + web UI) on port %PORT%...
if not exist "%APP_DIR%\logs" mkdir "%APP_DIR%\logs"
rem Spawn through PowerShell Start-Process (works even when this shell has no
rem interactive desktop) and tee all output to logs\server.log for debugging.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npx tsx server.ts ^> \"%APP_DIR%\logs\server.log\" 2^>^&1' -WorkingDirectory '%APP_DIR%' -WindowStyle Minimized"

rem ---------------- Wait for health ----------------
echo  [4/5] Waiting for %HEALTH_URL% ...
set /a "TRIES=0"
:health_loop
ping -n 2 127.0.0.1 >nul
set /a "TRIES+=1"
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%HEALTH_URL%' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } ; exit 1 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto healthy
if %TRIES% geq 45 goto health_timeout
goto health_loop

:healthy
echo  [5/5] Backend is UP and healthy.
echo.
echo  ------------------------------------------------------------
echo   Dashboard : %BASE_URL%
echo   Health    : %BASE_URL%/api/health
echo   Tabs      : Scheduled ^(queue^) / Sent ^(Ethereal previews^) / Queue / Slack
echo   Data file : %APP_DIR%\data\db.json
echo   Stop with : start_all.bat --stop
echo  ------------------------------------------------------------
echo.

if "%OPEN_BROWSER%"=="1" start "" "%BASE_URL%"

if "%RUN_TEST%"=="1" (
  echo  Running end-to-end smoke test...
  node scripts\smoke-test.mjs "%BASE_URL%"
  if errorlevel 1 goto fail
)

echo  Server is running in the background. Log: %APP_DIR%\logs\server.log
echo.
goto end

rem =========================================================================
rem  Stop an instance started earlier
rem =========================================================================
:stop_instance
echo  Stopping ReachInbox server...
call :kill_server
echo  Done.
goto end

rem =========================================================================
rem  Helpers
rem =========================================================================
:kill_server
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "if (Test-Path -LiteralPath '%PID_FILE%') {" ^
  "  $pidValue = (Get-Content -LiteralPath '%PID_FILE%' -Raw).Trim();" ^
  "  if ($pidValue -match '^\d+$') {" ^
  "    $p = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue;" ^
  "    if ($p) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; Write-Host \"  stopped pid $pidValue\" }" ^
  "  }" ^
  "  Remove-Item -LiteralPath '%PID_FILE%' -Force -ErrorAction SilentlyContinue;" ^
  "}" ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue |" ^
  "  Where-Object { $_.CommandLine -like '*server.ts*' -and $_.CommandLine -like '*tsx*' } |" ^
  "  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
ping -n 2 127.0.0.1 >nul
exit /b 0

:health_timeout
echo  [ERROR] Server did not become healthy within ~45 seconds.
echo          Last lines of %APP_DIR%\logs\server.log :
if exist "%APP_DIR%\logs\server.log" powershell -NoProfile -Command "Get-Content '%APP_DIR%\logs\server.log' -Tail 20"
call :kill_server
goto fail

:fail
echo.
echo  START FAILED - see the message above.
echo.
exit /b 1

:end
endlocal
exit /b 0
