@echo off
cd /d "%~dp0"
start python main.py
timeout /t 3 /nobreak
start http://localhost:8000