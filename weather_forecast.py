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

def collect_forecasts():
    sources = {
        'Open-Meteo': get_open_meteo_forecast(),
        'MET Norway': get_met_no_forecast()
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
    estimation = mean_temp + 2 * std_temp
    
    print(f"\n--- Temperature Analysis (from {len(temps)} data points) ---")
    print(f"Range: {min_temp:.2f}°C to {max_temp:.2f}°C")
    print(f"Mean temperature: {mean_temp:.2f}°C")
    print(f"Median temperature: {median_temp:.2f}°C")
    print(f"Standard deviation: {std_temp:.2f}°C")
    print(f"\nEstimation for next day (mean + 2*std): {estimation:.2f}°C")

if __name__ == "__main__":
    main()