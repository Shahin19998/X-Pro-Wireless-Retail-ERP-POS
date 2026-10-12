@echo off
setlocal
cd /d "%~dp0"
echo ===========================================
echo XPRO STORE POS - PYTHON SETUP AND START
 echo ===========================================
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import tkinter, sqlite3; import sys; assert sys.version_info >= (3,10)" >nul 2>&1
  if not errorlevel 1 goto launch_py
)
where python >nul 2>&1
if not errorlevel 1 (
  python -c "import tkinter, sqlite3; import sys; assert sys.version_info >= (3,10)" >nul 2>&1
  if not errorlevel 1 goto launch_python
)
echo Python 3.10+ with Tkinter is required and was not found.
echo This setup requires internet access to download the official Python installer.
echo Official source: https://www.python.org/downloads/windows/
set "PYINSTALLER=%TEMP%\xpro-python-3.12.10-amd64.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $u='https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe'; Invoke-WebRequest -Uri $u -OutFile '%PYINSTALLER%'"
if errorlevel 1 goto download_error
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=Get-AuthenticodeSignature '%PYINSTALLER%'; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'Python Software Foundation') { Write-Error 'Installer signature verification failed'; exit 1 }"
if errorlevel 1 goto signature_error
echo Starting official Python installer. Check Add Python to PATH when prompted.
start /wait "" "%PYINSTALLER%"
where py >nul 2>&1
if not errorlevel 1 goto launch_py
where python >nul 2>&1
if not errorlevel 1 goto launch_python
echo Restart this setup after installing Python.
pause
exit /b 1
:launch_py
py -3 xpro_store.py
pause
exit /b %errorlevel%
:launch_python
python xpro_store.py
pause
exit /b %errorlevel%
:download_error
echo Download failed. Connect to the internet or manually install Python from python.org.
pause
exit /b 1
:signature_error
echo Downloaded file could not be verified. It will NOT be run.
pause
exit /b 1
