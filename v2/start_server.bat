@echo off
cd /d "%~dp0"

echo Starting local server...
echo Open: http://localhost:8000
echo Press CTRL+C to stop

python -m http.server 8000

pause