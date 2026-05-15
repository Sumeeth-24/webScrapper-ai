@echo off
echo === WebContext Test ===
echo.

cd /d C:\Users\sumeethmoolya\webcontext

if "%~1"=="" (
    set URL=https://tanstack.com/query/latest/docs/overview
) else (
    set URL=%~1
)

echo [1/3] Installing dependencies...
call npm install

echo.
echo [2/3] Building project...
call npm run build

echo.
echo [3/3] Testing with: %URL%
echo.
call npx ts-node test/test.ts %URL%

echo.
echo === Done ===
pause
