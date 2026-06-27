@echo off
REM =============================================================================
REM Kuber Player — Windows startup script
REM Double-click this file or run from CMD: start.bat
REM =============================================================================

title Kuber Player

echo.
echo  ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗
echo  ██║ ██╔╝██║   ██║██╔══██╗██╔════╝██╔══██╗
echo  █████╔╝ ██║   ██║██████╔╝█████╗  ██████╔╝
echo  ██╔═██╗ ██║   ██║██╔══██╗██╔══╝  ██╔══██╗
echo  ██║  ██╗╚██████╔╝██████╔╝███████╗██║  ██║
echo  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
echo.
echo  Kuber Player ^| Cross-Platform Video Streaming
echo.

REM ── Check Node.js ─────────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Download it from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do echo [OK] Node.js %%v detected

REM ── Create media folder if missing ────────────────────────────────────────
if not exist "%~dp0media\" (
    mkdir "%~dp0media"
    echo [OK] Created media\ folder
)

REM ── Install frontend dependencies if missing ───────────────────────────────
if not exist "%~dp0frontend\node_modules\" (
    echo [INFO] Installing frontend dependencies...
    pushd "%~dp0frontend"
    call npm install
    popd
)

REM ── Clear Vite cache ───────────────────────────────────────────────────────
if exist "%~dp0frontend\node_modules\.vite\" (
    rmdir /s /q "%~dp0frontend\node_modules\.vite"
    echo [OK] Cleared Vite cache
)

REM ── Start Backend ──────────────────────────────────────────────────────────
echo.
echo [INFO] Starting backend API server on port 8080...
start "Kuber Backend" cmd /k "cd /d "%~dp0backend" && node mock_server.js"

timeout /t 2 /nobreak >nul

REM ── Start Frontend ─────────────────────────────────────────────────────────
echo [INFO] Starting frontend dev server on port 3000...
start "Kuber Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul

REM ── Show access URLs ───────────────────────────────────────────────────────
echo.
echo ================================================================
echo   Kuber Player is running!
echo ================================================================
echo.
echo   Frontend Web UI:
echo     Local:   http://localhost:3000
echo.
echo   Backend API:
echo     Local:   http://localhost:8080
echo.
echo   Media Folder:
echo     Path:    %~dp0media
echo     Drop video files here — they appear in the UI automatically.
echo.
echo   Two CMD windows have opened (Backend + Frontend).
echo   Close those windows to stop the servers.
echo.
echo   For network access from other devices, run as Administrator:
echo     netsh advfirewall firewall add rule name="Kuber Frontend 3000" dir=in action=allow protocol=TCP localport=3000
echo     netsh advfirewall firewall add rule name="Kuber Backend 8080" dir=in action=allow protocol=TCP localport=8080
echo.
echo ================================================================

REM Open the browser automatically
timeout /t 2 /nobreak >nul
start http://localhost:3000

pause
