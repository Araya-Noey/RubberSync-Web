@echo off
chcp 65001 >nul
cd /d "%~dp0"
title RubberSync Web
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] ไม่พบ Node.js กรุณาติดตั้ง Node.js 18 หรือใหม่กว่า
  pause
  exit /b 1
)
echo.
echo กำลังเปิด RubberSync Web...
echo.
node Backend\server.js
pause
