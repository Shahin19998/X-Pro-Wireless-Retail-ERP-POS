@echo off
cd /d "%~dp0"
py -3 xpro_store.py
if errorlevel 1 python xpro_store.py
pause
