@echo off
setlocal
cd /d "%~dp0"
where bun >nul 2>nul
if errorlevel 1 (
  echo Bun was not found. Install Bun from https://bun.sh, reopen this window, and run this file again.
  pause
  exit /b 1
)
echo Initializing the optional Vesper Kokonut UI workspace...
bunx --bun shadcn@latest init
if errorlevel 1 (
  echo.
  echo The UI workspace was not initialized. Re-run this file after answering the shadcn prompts.
  pause
  exit /b 1
)
echo.
echo Done. Add Kokonut components with:
echo bunx --bun shadcn@latest add @kokonutui/COMPONENT_NAME
pause
