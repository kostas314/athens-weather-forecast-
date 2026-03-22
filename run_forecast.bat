@echo off
setlocal

:: Determine the script directory
set "SCRIPT_DIR=%~dp0"

:: Look for a .venv in the parent directory (where the venv is kept)
set "VENV_PYTHON=%SCRIPT_DIR%..\\.venv\Scripts\python.exe"

if exist "%VENV_PYTHON%" (
    echo Using virtual environment Python...
    "%VENV_PYTHON%" "%SCRIPT_DIR%weather_forecast.py"
) else (
    echo Virtual environment not found, using system Python...
    python "%SCRIPT_DIR%weather_forecast.py"
)

echo.
echo History file: %SCRIPT_DIR%forecast_history.csv
echo.
pause
endlocal
