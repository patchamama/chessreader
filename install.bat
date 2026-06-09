@echo off
:: install.bat — clone ChessReader and set up all dependencies (Windows)
::
:: Usage:
::   install.bat [target-directory]
::
:: After this script finishes, cd into the directory and run:
::   start.bat

setlocal EnableDelayedExpansion

set REPO_URL=https://github.com/patchamama/chessreader.git
set TARGET=%~1
if "%TARGET%"=="" set TARGET=chessreader

echo [install] ChessReader installer for Windows
echo.

:: ── prerequisite checks ────────────────────────────────────────────────────
where git >nul 2>&1
if errorlevel 1 (
    echo [fail] git is not installed. Download from https://git-scm.com
    exit /b 1
)

where php >nul 2>&1
if errorlevel 1 (
    echo [fail] PHP is not installed. Download from https://windows.php.net
    exit /b 1
)

where composer >nul 2>&1
if errorlevel 1 (
    echo [fail] Composer is not installed. Download from https://getcomposer.org
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [fail] Node.js is not installed. Download from https://nodejs.org
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [install] pnpm not found - installing via npm...
    call npm install -g pnpm
    if errorlevel 1 (
        echo [fail] Could not install pnpm
        exit /b 1
    )
    echo [ ok ] pnpm installed
)

:: ── clone ──────────────────────────────────────────────────────────────────
if exist "%TARGET%\.git" (
    echo [install] Directory '%TARGET%' already exists - pulling latest changes...
    git -C "%TARGET%" pull --ff-only
) else (
    echo [install] Cloning %REPO_URL% into '%TARGET%'...
    git clone %REPO_URL% %TARGET%
    if errorlevel 1 (
        echo [fail] Clone failed
        exit /b 1
    )
)
echo [ ok ] Repository ready at .\%TARGET%

cd /d "%TARGET%"

:: ── PHP dependencies ───────────────────────────────────────────────────────
echo [install] Installing PHP dependencies...
composer install --working-dir=apps\api --no-interaction --prefer-dist
if errorlevel 1 (
    echo [fail] composer install failed
    exit /b 1
)
echo [ ok ] PHP dependencies installed

:: ── JS dependencies ────────────────────────────────────────────────────────
echo [install] Installing JS dependencies...
call pnpm install
if errorlevel 1 (
    echo [fail] pnpm install failed
    exit /b 1
)
echo [ ok ] JS dependencies installed

:: ── done ───────────────────────────────────────────────────────────────────
echo.
echo   ChessReader is ready!
echo.
echo   Start the app:
echo     cd %TARGET%
echo     start.bat
echo.
echo   Optional env overrides (set before running start.bat):
echo     set API_PORT=8080
echo     set WEB_PORT=5173
echo     set ADMIN_EMAIL=you@example.com
echo     set ADMIN_PASSWORD=secret
echo.

endlocal
