@echo off
chcp 65001 >nul 2>&1
title Parotia - Installation
color 0B

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║           PAROTIA - Extension Installer          ║
echo  ║         clean the stage. keep the story.         ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: Check if Chrome is installed
set "CHROME_PATH="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

if "%CHROME_PATH%"=="" (
    echo  [ERROR] Google Chrome not found!
    echo  Please install Chrome from: https://www.google.com/chrome/
    echo.
    pause
    exit /b 1
)

echo  [OK] Chrome found
echo.

:: Define install location
set "INSTALL_DIR=%LOCALAPPDATA%\Parotia"

:: Detect dist folder (works when run from project root or from dist)
set "DIST_DIR="
if exist "%~dp0dist\manifest.json" (
    set "DIST_DIR=%~dp0dist"
) else if exist "%~dp0manifest.json" (
    set "DIST_DIR=%~dp0"
)

if "%DIST_DIR%"=="" (
    echo  [ERROR] dist folder not found!
    echo  Make sure this script is in the Parotia project folder.
    echo.
    pause
    exit /b 1
)

echo  [OK] Extension files found
echo.

:: Create install directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy extension files
echo  Installing to: %INSTALL_DIR%
xcopy "%DIST_DIR%" "%INSTALL_DIR%" /E /Y /Q >nul 2>&1

if errorlevel 1 (
    echo  [ERROR] Failed to copy files.
    echo  Try running this script as Administrator.
    echo.
    pause
    exit /b 1
)

echo  [OK] Extension files copied
echo.

:: Open Chrome extensions page
echo  Opening Chrome extensions page...
start "" "%CHROME_PATH%" "chrome://extensions"

timeout /t 2 /nobreak >nul

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║              INSTALLATION STEPS                 ║
echo  ╠══════════════════════════════════════════════════╣
echo  ║                                                  ║
echo  ║  1. Turn ON "Developer mode" (top right)         ║
echo  ║                                                  ║
echo  ║  2. Click "Load unpacked" (top left)             ║
echo  ║                                                  ║
echo  ║  3. Paste this path and press Enter:             ║
echo  ║                                                  ║
echo  ║     %INSTALL_DIR%
echo  ║                                                  ║
echo  ║  4. Click "Select Folder"                        ║
echo  ║                                                  ║
echo  ║  Done! The Parotia icon appears in your toolbar  ║
echo  ║                                                  ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: Copy path to clipboard for convenience
echo %INSTALL_DIR%| clip
echo  [OK] Path copied to clipboard — just paste it in the folder dialog!
echo.

:: Open the install folder
explorer "%INSTALL_DIR%"

pause
