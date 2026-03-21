# Athens Weather Forecast Estimator

This Python program collects temperature forecasts for Athens, Greece from reliable open data sources, applies data validation to ensure accuracy, and provides a statistical estimation for the next day's temperature in Celsius.

## Features

- Fetches weather data from 5 open sources (including Hellenic sources):
  - **HNMS (Hellenic)**: Hellenic National Meteorological Service site scraping, fallback to Open-Meteo when unavailable
  - **EMY (Hellenic)**: EMY (Hellenic National Meteorological Service) forecasts page scraping
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

- **HNMS (Hellenic)** (https://www.hnms.gr): Hellenic National Meteorological Service site scraping
- **EMY (Hellenic)** (https://www.emy.gr): EMY Hellenic National Meteorological Service forecasts page scraping
- **Open-Meteo** (https://open-meteo.com): Free weather API with 5-day hourly forecasts (~5 daily max values)
- **MET Norway** (https://api.met.no): Norwegian Meteorological Institute's open API with 120-hour forecasts (~88 hourly values)
- **ECMWF via Open-Meteo**: Copernicus ECMWF weather model accessed through Open-Meteo (~5 daily max values)

Total: Approximately 108 data points per run for enhanced statistical robustness.

## Data Quality

The program ensures reliability by:
- Using only open, publicly available APIs (no API keys required)
- Validating temperature values within conservative Athens ranges (0-30°C for most sources, 5-20°C for EMY)
- Applying source-specific filtering for Hellenic data with additional validation
- Combining independent sources for cross-verification
- Removing unreliable/intermittent sources and unrealistic outliers

## Statistical Model

The estimation uses the formula: **Next Day Temp = Mean + 2 × Standard Deviation**

This represents approximately the 97.5th percentile of the distribution, providing a conservative upper-bound estimate for planning purposes.