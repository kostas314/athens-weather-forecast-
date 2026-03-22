# Athens Weather Forecast Estimator

This Python program collects temperature forecasts for Athens, Greece from reliable open data sources, applies data validation to ensure accuracy, and provides a statistical estimation for the next day's temperature in Celsius.

## Features

- Fetches weather data from 4-5 open sources (including Hellenic sources with cross-validation):
  - **HNMS (Hellenic)**: Hellenic National Meteorological Service site scraping, fallback to Open-Meteo when unavailable
  - **EMY (Hellenic)**: EMY Hellenic National Meteorological Service forecasts page scraping (only when within ±5°C of HNMS)
  - **Open-Meteo**: Free weather API providing global 5-day hourly forecasts
  - **MET Norway**: Norwegian Meteorological Institute's open weather API with detailed hourly data
  - **ECMWF via Open-Meteo**: Copernicus ECMWF model output accessed through Open-Meteo model parameter
- Applies data validation:
  - Filters temperatures within realistic range (0°C to 50°C)
  - Combines hourly forecasts from multiple sources for robustness
- Aggregates 100+ validated temperature data points
- Computes statistical measures: mean, median, standard deviation, median absolute deviation (MAD), and trimmed mean
- Provides multiple next-day estimations:
  - mean + 2 × standard deviation
  - median + 2 × MAD
  - combined improved estimate (average of the above plus trimmed mean)
- **Prediction history & accuracy tracking** (`forecast_history.csv`):
  - Records each daily prediction automatically
  - Back-fills actual max temperatures from the Open-Meteo archive API the following day
  - Computes MAE, bias, and ±2°C / ±4°C success rates over all verified runs
  - Automatically applies bias correction to the current prediction once ≥ 3 historical runs are available

## Installation

1. Clone or download this repository
2. Install the requests library:
   ```
   pip install requests
   ```

## Usage

**Python:**
```
python weather_forecast.py
```

**Windows (batch file):**
```
run_forecast.bat
```
Double-click `run_forecast.bat` or run it from the command prompt. It will automatically use the virtual environment if a `.venv` folder is present in the parent directory, otherwise fall back to the system Python.

The program will output:
- Per-source status: number of values and temperature range
- Cross-validation result for EMY against HNMS
- Total data points collected
- Mean, median, standard deviation, MAD, and trimmed mean
- Temperature range (min/max)
- Three next-day estimations: mean+2σ, median+2MAD, and a combined improved estimate

## Data Sources

- **HNMS (Hellenic)** (https://www.hnms.gr): Hellenic National Meteorological Service site scraping
- **EMY (Hellenic)** (https://www.emy.gr): EMY Hellenic National Meteorological Service forecasts page scraping
- **Open-Meteo** (https://open-meteo.com): Free weather API with 5-day hourly forecasts (~5 daily max values)
- **MET Norway** (https://api.met.no): Norwegian Meteorological Institute's open API with 120-hour forecasts (~88 hourly values)
- **ECMWF via Open-Meteo**: Copernicus ECMWF weather model accessed through Open-Meteo (~5 daily max values)

Total: Approximately 105 data points per run for enhanced statistical robustness (EMY included only when cross-validated against HNMS).

## Data Quality

The program ensures reliability by:
- Using only open, publicly available APIs (no API keys required)
- Validating temperature values within conservative Athens ranges (0-30°C for most sources, 5-20°C for EMY)
- **Cross-validating EMY against HNMS**: EMY data only included when within ±5°C of HNMS average
- Applying source-specific filtering for Hellenic data with additional validation
- Combining independent sources for cross-verification
- Removing unreliable/intermittent sources and unrealistic outliers

## Statistical Model

The estimation uses the formula: **Next Day Temp = Mean + 2 × Standard Deviation**

This represents approximately the 97.5th percentile of the distribution, providing a conservative upper-bound estimate for planning purposes.

## Firefox Add-on Signing Utility

The repository includes a utility script at `firefox-extension/sign_firefox_addon.ps1` to simplify creating AMO-signed Firefox extension artifacts.

It is provided as a convenience tool for packaging/signing workflows and reduces manual steps during release preparation.