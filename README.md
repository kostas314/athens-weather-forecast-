# Athens Weather Forecast Estimator

This Python program collects temperature forecasts for Athens, Greece from reliable open data sources, applies data validation to ensure accuracy, and provides a statistical estimation for the next day's temperature in Celsius.

## Features

- Fetches weather data from 2 reliable open sources:
  - **Open-Meteo**: Free weather API providing global 5-day hourly forecasts
  - **MET Norway**: Norwegian Meteorological Institute's open weather API with detailed hourly data
- Applies data validation:
  - Filters temperatures within realistic range (0°C to 50°C)
  - Combines hourly forecasts from both sources for robustness
- Aggregates 90+ validated temperature data points
- Computes statistical measures: mean, median, standard deviation, and range
- Provides next-day temperature estimation as: **mean + 2 × standard deviation**

## Installation

1. Clone or download this repository
2. Install the requests library:
   ```
   pip install requests
   ```

## Usage

Run the script:
```
python weather_forecast.py
```

The program will output:
- Temperature data from each source (number of values and range)
- Total data points collected
- Mean, median, and standard deviation
- Temperature range (min/max)
- Estimation for next day (mean + 2σ)

## Data Sources

- **Open-Meteo** (https://open-meteo.com): Free weather API with 5-day hourly forecasts (~5 daily max values)
- **MET Norway** (https://api.met.no): Norwegian Meteorological Institute's open API with 120-hour forecasts (~88 hourly values)

Total: Approximately 93 data points per run for statistical robustness.

## Data Quality

The program ensures reliability by:
- Using only open, publicly available APIs (no API keys required)
- Validating temperature values within realistic bounds
- Combining independent sources for cross-verification
- Removing unreliable/intermittent sources

## Statistical Model

The estimation uses the formula: **Next Day Temp = Mean + 2 × Standard Deviation**

This represents approximately the 97.5th percentile of the distribution, providing a conservative upper-bound estimate for planning purposes.