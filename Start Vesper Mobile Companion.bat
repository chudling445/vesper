@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo VESPER MOBILE COMPANION
 echo This exposes Vesper only to devices on your current local network.
 echo Keep the password private and stop this window when you are finished.
 echo.
set "VESPER_LAN_PASSWORD="
set /p "VESPER_LAN_PASSWORD=Choose a LAN password (16+ characters): "
if not defined VESPER_LAN_PASSWORD (
  echo A password is required.
  pause
  exit /b 1
)
set "VESPER_ACCESS_PASSWORD=%VESPER_LAN_PASSWORD%"
set "VESPER_LAN_MODE=true"
set "HOST=0.0.0.0"
set "NODE_ENV="
set "VESPER_PUBLIC_MODE="
set "VESPER_TRUST_PROXY="
set "URL=http://127.0.0.1:3174"
set "NODE_EXE=%~dp0runtime\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
if /I "%NODE_EXE%"=="node" where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist ".env" copy /y ".env.example" ".env" >nul

start "Vesper LAN server" /min "%NODE_EXE%" server.mjs
for /l %%I in (1,1,25) do (
  powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3174/api/health' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)
echo Vesper could not start. Check the minimized server window.
pause
exit /b 1

:ready
for /f "delims=" %%I in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp | Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*'} | Select-Object -First 1 -ExpandProperty IPAddress)"') do set "LAN_IP=%%I"
echo.
echo Open this address on your phone while it is on the same Wi-Fi:
echo   http://%LAN_IP%:3174
 echo Then install Vesper from your browser menu with Add to Home screen.
echo.
start "" "http://%LAN_IP%:3174"
echo Leave this window open while using Vesper from your phone.
pause
endlocal
