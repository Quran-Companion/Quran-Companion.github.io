@echo off
REM Quran Companion - run the development version (Windows)
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this again. & pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies - first run only...
  call npm install || (echo npm install failed. & pause & exit /b 1)
)
echo Starting dev server. Open http://localhost:5173 in Chrome. Press Ctrl+C to stop.
call npm run dev -- --open
pause
