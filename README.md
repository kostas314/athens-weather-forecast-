# Athens Weather Forecast Estimator

This Python program collects temperature forecasts for Athens, Greece from multiple open data sources, applies data cleaning to ensure recency and validity, models them using statistical measures (mean and standard deviation), and provides an estimation for the next day's temperature in Celsius.

## Features

- Fetches weather data from 3 open sources:
  - Open-Meteo (open-meteo.com)
  - Hellenic National Meteorological Service (HNMS) XML feed
  - Wttr.in JSON API
- Applies data cleaning:
  - Checks data recency (within 24 hours for most sources, 6 hours for Wttr.in)
  - Filters temperatures within reasonable range (0°C to 50°C)
- Collects and combines valid temperature data from all sources
- Computes mean and standard deviation of collected temperatures
- Provides an estimation for the next day as mean + 2 * standard deviation

## Requirements

- Python 3.6+

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

## Usage

Run the script:
```
python weather_forecast.py
```

The program will output:
- Temperature data from each source (if valid)
- Number of temperature values collected
- Mean temperature
- Standard deviation
- Estimation for next day

## Data Sources

- **Open-Meteo**: Free weather API providing global weather data
- **MET Norway**: Norwegian Meteorological Institute's open weather API (global coverage)
- **HNMS**: Official Greek meteorological service XML bulletins

## Data Cleaning

The program ensures data quality by:
- Verifying timestamps to use only recently updated data
- Filtering out unrealistic temperature values
- Combining data from multiple sources for robustness

## Note

This program uses publicly available open data sources. No API keys are required. For more accurate predictions, consider using historical data and machine learning models.