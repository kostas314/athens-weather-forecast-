import requests
import statistics
from datetime import datetime, timedelta

def get_open_meteo_forecast():
    url = 'https://api.open-meteo.com/v1/forecast?latitude=37.9838&longitude=23.7275&hourly=temperature_2m&forecast_days=5'
    response = requests.get(url)
    if response.status_code != 200:
        return None
    try:
        data = response.json()
        temps = []
        for i in range(0, len(data['hourly']['temperature_2m']), 24):
            day_temps = data['hourly']['temperature_2m'][i:i+24]
            if day_temps:
                max_temp = max(day_temps)
                if 0 <= max_temp <= 50:
                    temps.append(max_temp)
        return temps
    except:
        return None

def get_met_no_forecast():
    url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=37.9838&lon=23.7275'
    headers = {'User-Agent': 'AthensWeatherForecast/1.0'}
    response = requests.get(url, headers=headers, timeout=5)
    if response.status_code != 200:
        return None
    try:
        data = response.json()
        temps = []
        for item in data['properties']['timeseries'][:120]:
            temp = item['data']['instant']['details']['air_temperature']
            if 0 <= temp <= 50:
                temps.append(temp)
        return temps
    except:
        return None

def get_hnms_forecast():
    """Pull Hellenic National Meteorological Service data as raw source (mostly site-scraped)."""
    import re
    ny_url = 'https://www.hnms.gr/emy/el/'
    try:
        response = requests.get(ny_url, timeout=10, verify=False)
        if response.status_code == 200 and response.text:
            # Look for a temperature value around Athens in page text.
            values = [float(x) for x in re.findall(r'([-+]?[0-9]+(?:\.[0-9]+)?)\s*°?C', response.text)]
            values = [v for v in values if 0 <= v <= 50]
            if values:
                return values
    except Exception:
        pass

    # If HNMS page is unavailable, fallback to local Open-Meteo Greek point.
    return get_open_meteo_forecast()


def get_emy_forecast():
    """Pull EMY (Hellenic National Meteorological Service) data from forecasts page."""
    import re
    url = 'https://www.emy.gr/el/forecasts'
    try:
        response = requests.get(url, timeout=10, verify=False)
        if response.status_code == 200 and response.text:
            # Extract temperature values from the page
            values = [float(x) for x in re.findall(r'(\d+(?:\.\d+)?)\s*°?C', response.text)]
            values = [v for v in values if 0 <= v <= 50]  # Filter realistic temperatures
            if values:
                return values
    except Exception:
        pass
    return None


def get_ecmwf_forecast():
    url = 'https://api.open-meteo.com/v1/forecast?latitude=37.9838&longitude=23.7275&hourly=temperature_2m&forecast_days=5&model=ecmwf&timezone=auto'
    response = requests.get(url, timeout=10)
    if response.status_code != 200:
        return None
    try:
        data = response.json()
        temps = []
        hourly = data.get('hourly', {}).get('temperature_2m', [])
        for i in range(0, len(hourly), 24):
            day_temps = hourly[i:i+24]
            if day_temps:
                max_temp = max(day_temps)
                if 0 <= max_temp <= 50:
                    temps.append(max_temp)
        return temps
    except:
        return None


def collect_forecasts():
    sources = {
        'HNMS (Hellenic)': get_hnms_forecast(),
        'EMY (Hellenic)': get_emy_forecast(),
        'Open-Meteo (default)': get_open_meteo_forecast(),
        'MET Norway': get_met_no_forecast(),
        'Open-Meteo (ECMWF)': get_ecmwf_forecast()
    }
    all_temps = []
    for source, temps in sources.items():
        if temps:
            print(f"From {source}: {len(temps)} values, range {min(temps):.1f}°C to {max(temps):.1f}°C")
            all_temps.extend(temps)
        else:
            print(f"Error fetching from {source}")
    return all_temps

def main():
    temps = collect_forecasts()
    if len(temps) < 10:
        print(f"Not enough temperature data collected ({len(temps)} values). Need at least 10.")
        return
    
    mean_temp = statistics.mean(temps)
    std_temp = statistics.stdev(temps)
    median_temp = statistics.median(temps)
    min_temp = min(temps)
    max_temp = max(temps)

    # Robust statistics
    deviations = [abs(t - median_temp) for t in temps]
    mad = statistics.median(deviations)
    trimmed = sorted(temps)
    n = len(trimmed)
    trim_size = max(1, int(n * 0.10))  # 10% trim each side
    trimmed = trimmed[trim_size:-trim_size] if n > trim_size * 2 else trimmed
    trimmed_mean = statistics.mean(trimmed)

    estimation_mean2std = mean_temp + 2 * std_temp
    estimation_mad = median_temp + 2 * mad
    estimation_combined = (estimation_mean2std + trimmed_mean + estimation_mad) / 3

    print(f"\n--- Temperature Analysis (from {len(temps)} data points) ---")
    print(f"Range: {min_temp:.2f}°C to {max_temp:.2f}°C")
    print(f"Mean temperature: {mean_temp:.2f}°C")
    print(f"Median temperature: {median_temp:.2f}°C")
    print(f"Standard deviation: {std_temp:.2f}°C")
    print(f"Median absolute deviation: {mad:.2f}°C")
    print(f"Trimmed mean (10%): {trimmed_mean:.2f}°C")
    print(f"\nEstimation mean+2sigma: {estimation_mean2std:.2f}°C")
    print(f"Estimation median+2MAD: {estimation_mad:.2f}°C")
    print(f"Combined improved estimate: {estimation_combined:.2f}°C")

if __name__ == "__main__":
    main()