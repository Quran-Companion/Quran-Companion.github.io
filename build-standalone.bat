@echo off
REM Quran Companion - rebuild QuranCompanion.html (single file you can double-click)
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this again. & pause & exit /b 1)
if not exist node_modules call npm install || (echo npm install failed. & pause & exit /b 1)
call npm run build:standalone || (echo Build failed. & pause & exit /b 1)
copy /Y "standalone\index.html" "QuranCompanion.html" >nul
echo Done. Double-click QuranCompanion.html to open the app.
pause
