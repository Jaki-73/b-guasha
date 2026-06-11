@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   B's Guasha - one-time Git setup
echo ============================================================
echo.

echo [1/4] Cleaning up the partial repo from assistant setup...
rmdir /s /q ".git" 2>nul
rmdir /s /q ".gitseed" 2>nul
del /q "_wtest_root" 2>nul
if exist ".git\config.lock" del /q ".git\config.lock" 2>nul
if exist ".git\index.lock" del /q ".git\index.lock" 2>nul

echo [2/4] Checking that Git is installed...
where git >nul 2>nul
if errorlevel 1 goto NOGIT

echo [3/4] Creating a fresh repository and first commit...
git init
git add -A
git commit -m "Initial commit: B's Guasha website, booking app, docs, and Pages workflow"
git branch -M main

echo [4/4] Done.
echo.
echo ============================================================
echo   Local repo ready. To publish the website on GitHub (free):
echo.
echo   1. Create an EMPTY repo at https://github.com/new
echo      Suggested name: bs-guasha   (do not add a README)
echo.
echo   2. Run these two commands - replace YOURNAME:
echo        git remote add origin https://github.com/YOURNAME/bs-guasha.git
echo        git push -u origin main
echo.
echo   3. On GitHub, open:  Settings  ^>  Pages
echo      Set "Source" to:  GitHub Actions
echo.
echo   Your site will be live at:
echo        https://YOURNAME.github.io/bs-guasha/
echo ============================================================
echo.
pause
exit /b 0

:NOGIT
echo.
echo   Git is not installed yet.
echo   Download it from:  https://git-scm.com/download/win
echo   Install it, then double-click this file again.
echo.
pause
exit /b 1
