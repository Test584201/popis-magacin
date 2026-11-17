@echo off
chcp 65001 >nul
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py serve.py
  goto kraj
)
where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py
  goto kraj
)
echo.
echo Python nije pronadjen na ovom racunaru.
echo Instalirajte ga sa https://www.python.org/downloads/
echo (u instalaciji ukljucite opciju "Add python.exe to PATH"), pa ponovo pokrenite ovaj fajl.
:kraj
echo.
pause
