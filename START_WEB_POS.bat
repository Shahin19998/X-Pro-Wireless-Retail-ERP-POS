@echo off
cd /d "%~dp0"
echo ===================================================
echo Starting XPRO STORE POS Web Edition...
echo Opening in default browser at http://localhost:8000
echo ===================================================
start "" http://localhost:8000
python server.py 8000
if errorlevel 1 py -3 server.py 8000
pause
