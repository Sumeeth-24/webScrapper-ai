@echo off
echo === WebContext Setup and Test ===
echo.

cd /d C:\Users\sumeethmoolya\webcontext

echo [1/3] Installing dependencies...
call npm install

echo.
echo [2/3] Building project...
call npx tsc --noEmit 2>nul
if %errorlevel% neq 0 (
    echo TypeScript has some type issues, but we can still run with ts-node...
)

echo.
echo [3/3] Running React Native docs test...
echo.
call npx ts-node test/test-rn-docs.ts

echo.
echo === Done ===
pause
