@echo off
chcp 65001 >nul
where node >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 22 or newer: https://nodejs.org/en/download
  pause
  exit /b 1
)
node "%~dp0server.cjs"
pause
