@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=%~dp0runtime\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
if /I "%NODE_EXE%"=="node" (
  where node >nul 2>nul
  if errorlevel 1 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
      set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
      set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    ) else if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
      set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    ) else (
      echo Node.js was not found. Use the Vesper setup, or install Node.js and reopen this file.
      pause
      exit /b 1
    )
  )
)

if not exist ".env" copy /y ".env.example" ".env" >nul

set "URL=http://127.0.0.1:3174"
set "OLLAMA_MODELS=%~dp0llm-models"
set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA_EXE%" (
  set "OLLAMA_EXE="
  for /f "delims=" %%O in ('where ollama.exe 2^>nul') do if not defined OLLAMA_EXE set "OLLAMA_EXE=%%O"
)
if defined OLLAMA_EXE if exist "%OLLAMA_EXE%" (
  powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:11434/api/tags' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
  if errorlevel 1 (
    start "Vesper local model" /min "%OLLAMA_EXE%" serve
    powershell -NoProfile -Command "for ($i=0; $i -lt 20; $i++) { try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:11434/api/tags' -TimeoutSec 1 | Out-Null; exit 0 } catch { Start-Sleep -Seconds 1 } }; exit 1" >nul 2>nul
  )
)

set "READY="
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '%URL%/api/health' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 set "READY=1"

if not defined READY (
  start "Vesper local server" /min "%NODE_EXE%" server.mjs
  for /l %%I in (1,1,25) do (
    powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '%URL%/api/health' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 (
      set "READY=1"
      goto serverReady
    )
    timeout /t 1 /nobreak >nul
  )
)

:serverReady
if not defined READY (
  echo Vesper could not start. Another app may be using port 3174.
  echo Check the minimized server window for details.
  pause
  exit /b 1
)

if /I "%~1"=="desktop" goto desktopMode

set "BROWSER1=%ProgramFiles%\LibreWolf\librewolf.exe"
set "BROWSER2=%LOCALAPPDATA%\Programs\LibreWolf\librewolf.exe"
set "BROWSER3=%LOCALAPPDATA%\LibreWolf\librewolf.exe"
set "BROWSER4=F:\LibreWolf\librewolf.exe"
if exist "%BROWSER1%" (
  start "" "%BROWSER1%" "%URL%"
) else if exist "%BROWSER2%" (
  start "" "%BROWSER2%" "%URL%"
) else if exist "%BROWSER3%" (
  start "" "%BROWSER3%" "%URL%"
) else if exist "%BROWSER4%" (
  start "" "%BROWSER4%" "%URL%"
) else (
  start "" "%URL%"
)
goto launchDone

:desktopMode
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%URL% --user-data-dir="%~dp0desktop-profile" --no-first-run --start-maximized
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=%URL% --user-data-dir="%~dp0desktop-profile" --no-first-run --start-maximized
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --app=%URL% --user-data-dir="%~dp0desktop-profile" --no-first-run --start-maximized
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%URL% --user-data-dir="%~dp0desktop-profile" --no-first-run --start-maximized
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=%URL% --user-data-dir="%~dp0desktop-profile" --no-first-run --start-maximized
) else if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" --app=%URL% --user-data-dir="%~dp0desktop-profile" --no-first-run --start-maximized
) else (
  call "%~dp0Start Vesper.bat"
)

:launchDone
endlocal
