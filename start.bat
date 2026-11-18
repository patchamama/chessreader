@echo off
:: start.bat — boots the ChessReader dev stack (PHP API + React web) on Windows
::
:: What it does:
::   0. Installs what Windows lacks with winget (Node, PHP, Composer, Git, GitHub CLI,
::      Stockfish), downloads the Maia nets when lc0 is installed, and downloads the
::      private resources (chessreader-resources) when missing and GitHub access exists
::      (gh login or GITHUB_TOKEN).
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
if "%ADMIN_PASSWORD%"==""  set ADMIN_PASSWORD=changeme
if "%AUTH_DEV_BYPASS%"=="" set AUTH_DEV_BYPASS=1

echo [start] ChessReader dev stack
echo.

:: ── system requirements (winget) ──────────────────────────────────────────
where winget >nul 2>&1 && (
    where node >nul 2>&1      || winget install -e --id OpenJS.NodeJS.LTS --silent
    where php >nul 2>&1       || winget install -e --id PHP.PHP.8.4 --silent
    where composer >nul 2>&1  || winget install -e --id Composer.Composer --silent
    where git >nul 2>&1       || winget install -e --id Git.Git --silent
    where gh >nul 2>&1        || winget install -e --id GitHub.cli --silent
    where stockfish >nul 2>&1 || winget install -e --id Stockfish.Stockfish --silent
)
where pnpm >nul 2>&1 || (where npm >nul 2>&1 && npm install -g pnpm)
where lc0 >nul 2>&1 || echo [info] lc0 not found: for Maia install it from https://github.com/LeelaChessZero/lc0/releases and add it to PATH

:: ── Maia nets (human-like engine) ─────────────────────────────────────────
where lc0 >nul 2>&1 && (
    if not exist "%API_DIR%\storage\maia" mkdir "%API_DIR%\storage\maia"
    for %%R in (1100 1500 1900) do (
        if not exist "%API_DIR%\storage\maia\maia-%%R.pb.gz" curl -sfL -o "%API_DIR%\storage\maia\maia-%%R.pb.gz" "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-%%R.pb.gz"
    )
)

:: ── private resources (commentary DB, game DB, traps) ─────────────────────
if "%RESOURCES_REPO%"=="" set RESOURCES_REPO=patchamama/chessreader-resources
set RES_DIR=%API_DIR%\storage\resources
set TMP_RES=%API_DIR%\storage\.resources-repo
if not exist "%RES_DIR%\books.json" (
    if exist "%TMP_RES%" rmdir /s /q "%TMP_RES%"
    gh auth status >nul 2>&1 && gh repo clone %RESOURCES_REPO% "%TMP_RES%" -- --depth 1 --quiet
    if not exist "%TMP_RES%" if not "%GITHUB_TOKEN%"=="" git clone --depth 1 --quiet https://x-access-token:%GITHUB_TOKEN%@github.com/%RESOURCES_REPO%.git "%TMP_RES%"
    if exist "%TMP_RES%" (
        if not exist "%RES_DIR%" mkdir "%RES_DIR%"
        for %%F in (books games traps ratings) do if exist "%TMP_RES%\%%F.json" copy /y "%TMP_RES%\%%F.json" "%RES_DIR%\" >nul
        if exist "%TMP_RES%\games.sqlite" copy /y "%TMP_RES%\games.sqlite" "%RES_DIR%\" >nul
        for %%G in ("%TMP_RES%\games\*.json") do copy /y "%%G" "%RES_DIR%\games-%%~nxG" >nul
        if exist "%TMP_RES%\comments.sqlite" copy /y "%TMP_RES%\comments.sqlite" "%API_DIR%\storage\comments.sqlite" >nul
        rmdir /s /q "%TMP_RES%"
        echo [ ok ] Private resources installed
    ) else (
        echo [info] Private resources not found and no GitHub access: the app runs without them.
    )
)

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

:: ── shared package ───────────────────────────────────────────────────────
call pnpm --filter @chess-ebook/chess-shared build >nul

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
