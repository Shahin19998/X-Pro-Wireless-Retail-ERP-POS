@echo off
cd /d "%~dp0"
py -m pip install pyinstaller
py -m PyInstaller --noconfirm --onefile --windowed --name XProStorePOS xpro_store.py
if errorlevel 1 (
 echo Build failed. Verify Python and PyInstaller are installed.
 pause
 exit /b 1
)
echo Your Windows EXE is in dist\XProStorePOS.exe
pause
