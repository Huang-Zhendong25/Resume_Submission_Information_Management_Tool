@echo off
cd /d "%~dp0"
python -c "import openpyxl" >nul 2>nul
if errorlevel 1 (
  echo [Delivery Tracker] Installing dependency openpyxl...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo Install failed. Please run: python -m pip install -r requirements.txt
    pause
    exit /b 1
  )
)
start "" pythonw app.py