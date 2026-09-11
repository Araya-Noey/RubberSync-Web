@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo คำสั่งนี้จะลบข้อมูลทั้งหมดและคืนบัญชีตัวอย่าง
set /p CONFIRM=พิมพ์ YES เพื่อยืนยัน: 
if /I not "%CONFIRM%"=="YES" exit /b 0
if exist data\db.json del /q data\db.json
if exist public\uploads\* del /q public\uploads\*
echo รีเซ็ตข้อมูลเรียบร้อย ครั้งถัดไปที่เปิด server จะสร้างข้อมูลใหม่
pause
