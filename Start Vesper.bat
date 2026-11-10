@echo off
cd /d "%~dp0"
where uv >nul 2>nul
if errorlevel 1 (
  echo Install uv first. See the Quick start section in README.md.
  pause
  exit /b 1
)
if not exist .env copy /Y .env.example .env >nul
uv run main.py
pause
