@echo off
:: start.bat — boots the ChessReader dev stack (PHP API + React web) on Windows
::
:: What it does:
::   1. Installs PHP (composer) and JS (pnpm) dependencies if missing.
::   2. Runs DB migrations and seeds an initial admin user (idempotent).
::   3. Starts the PHP backend on :8080 and the Vite frontend on :5173.
::   4. Vite proxies /api -> the backend, so the app works out of the box.
::
:: Override defaults:
::   set API_PORT=8080 & set WEB_PORT=5173 & start.bat
::   set ADMIN_EMAIL=you@example.com & set ADMIN_PASSWORD=secret & start.bat

setlocal EnableDelayedExpansion

set ROOT_DIR=%~dp0
set API_DIR=%ROOT_DIR%apps\api

if "%API_PORT%"==""       set API_PORT=8080
if "%WEB_PORT%"==""       set WEB_PORT=5173
if "%ADMIN_EMAIL%"==""    set ADMIN_EMAIL=admin@chess.local
if "%ADMIN_PASSWORD%"=""  set ADMIN_PASSWORD=changeme
if "%AUTH_DEV_BYPASS%"="" set AUTH_DEV_BYPASS=1

echo [start] ChessReader dev stack
echo.

:: ── prerequisites ──────────────────────────────────────────────────────────
where php >nul 2>&1      || (echo [fail] php not found & exit /b 1)
where composer >nul 2>&1 || (echo [fail] composer not found & exit /b 1)
where pnpm >nul 2>&1     || (echo [fail] pnpm not found - run: npm i -g pnpm & exit /b 1)

:: ── dependencies ──────────────────────────────────────────────────────────
if not exist "%API_DIR%\vendor" (
    echo [start] Installing PHP dependencies...
    composer install --working-dir="%API_DIR%" --no-interaction
    echo [ ok ] PHP dependencies installed
) else (
    echo [ ok ] PHP dependencies present
)

if not exist "%ROOT_DIR%node_modules" (
    echo [start] Installing JS dependencies...
    call pnpm install
    echo [ ok ] JS dependencies installed
) else (
    echo [ ok ] JS dependencies present
)

:: ── database ───────────────────────────────────────────────────────────────
echo [start] Running database migrations...
php "%API_DIR%\bin\migrate.php"
echo [ ok ] Migrations applied

echo [start] Seeding admin user (%ADMIN_EMAIL%)...
set ADMIN_EMAIL=%ADMIN_EMAIL%
set ADMIN_PASSWORD=%ADMIN_PASSWORD%
php "%API_DIR%\bin\seed-admin.php" %ADMIN_EMAIL% %ADMIN_PASSWORD%

:: ── start servers ──────────────────────────────────────────────────────────
echo [start] Starting PHP API on http://127.0.0.1:%API_PORT% ...
start "ChessReader API" /B php -S 127.0.0.1:%API_PORT% -t "%API_DIR%\public"

echo [start] Starting Vite web on http://127.0.0.1:%WEB_PORT% ...
set VITE_API_TARGET=http://127.0.0.1:%API_PORT%
start "ChessReader Web" /B pnpm --filter @chess-ebook/web dev --port %WEB_PORT% --host 127.0.0.1

echo.
echo [ ok ] Stack up.
echo.
echo     Web:    http://127.0.0.1:%WEB_PORT%
echo     API:    http://127.0.0.1:%API_PORT%/api/health
echo     Admin:  %ADMIN_EMAIL% / %ADMIN_PASSWORD%
echo.
echo   Both servers are running in background windows.
echo   Close those windows (or Ctrl-C inside them) to stop.
echo.

endlocal
