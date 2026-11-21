@echo off
rem Starts the local LLM tasks console (normalize / translate / benchmark / publish the comment database).
rem   local_llms_tasks.bat [--db path\to\comments.sqlite] [--port 8777] [--lang en|es] [--no-open]
rem Needs Node 22.5 or newer (it uses the built-in node:sqlite). No installation is needed.
setlocal enabledelayedexpansion
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required ^(https://nodejs.org^). 1>&2
  exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set MAJOR=%%v
for /f %%v in ('node -p "process.versions.node.split('.')[1]"') do set MINOR=%%v
if %MAJOR% LSS 22 goto old
if %MAJOR% EQU 22 if %MINOR% LSS 5 goto old
goto ok
:old
echo Node 22.5 or newer is required. 1>&2
exit /b 1
:ok

set ARGS=--open
:loop
if "%~1"=="" goto run
if "%~1"=="--no-open" (
  set ARGS=
  shift
  goto loop
)
if "%~1"=="--db" ( set ARGS=!ARGS! --db "%~2" & shift & shift & goto loop )
if "%~1"=="--port" ( set ARGS=!ARGS! --port %~2 & shift & shift & goto loop )
if "%~1"=="--lang" ( set ARGS=!ARGS! --lang %~2 & shift & shift & goto loop )
echo Unknown option: %~1 1>&2
exit /b 1

:run
node packages\chess-shared\scripts\llm-console\server.mjs !ARGS!
