@echo off
title B's Guasha - local server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Download the LTS version from https://nodejs.org and install it,
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)
start "" "http://localhost:3000"
node server.js
pause
