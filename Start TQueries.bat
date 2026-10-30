@echo off
rem TQueries launcher for Windows - double-click. Runs fully offline on this PC.
rem Opens in its own window (Edge app mode); no Edge -> default browser. AI runs locally via Ollama.
cd /d "%~dp0"
if "%PORT%"=="" set PORT=4321
set "URL=http://127.0.0.1:%PORT%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it once from nodejs.org ^(LTS^), then double-click this file again.
  pause
  exit /b 1
)
set "EDGE="
for %%E in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%LocalAppData%\Microsoft\Edge\Application\msedge.exe") do if not defined EDGE if exist "%%~E" set "EDGE=%%~E"
if "%~1"==":openapp" goto openapp
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing %URL%/api/state -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo TQueries is already running - %URL%
  call :openapp
  exit /b 0
)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & "%~f0" :openapp"
echo TQueries is running at %URL% - close this window to stop it.
node app\server.js
pause
exit /b 0

:openapp
if defined EDGE (
  start "" "%EDGE%" --app=%URL% --window-size=1320,900
) else (
  start "" %URL%
)
exit /b 0
