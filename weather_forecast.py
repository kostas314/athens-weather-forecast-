import requests
import statistics
import xml.etree.ElementTree as ET
import json
from datetime import datetime, timedelta

def is_recent(timestamp_str, hours=24):
    """Check if timestamp is within the last 'hours' hours."""
    try:
        # Handle different formats
        timestamp_str = timestamp_str.replace(' ', 'T').replace('Z', '+00:00')
        if 'T' not in timestamp_str:
            timestamp_str = timestamp_str[:10] + 'T' + timestamp_str[11:]
        dt = datetime.fromisoformat(timestamp_str)
        return datetime.now(dt.tzinfo) - dt < timedelta(hours=hours)
    except:
        return False

def get_open_meteo_forecast():
    url = 'https://api.open-meteo.com/v1/forecast?latitude=37.9838&longitude=23.7275&hourly=temperature_2m&forecast_days=5'
    response = requests.get(url)
    if response.status_code != 200:
        print(f"Error fetching from Open-Meteo: {response.status_code}")
        return None
    data = response.json()
    # Get daily max temps
    temps = []
    for i in range(0, len(data['hourly']['temperature_2m']), 24):
        day_temps = data['hourly']['temperature_2m'][i:i+24]
        if day_temps:
            max_temp = max(day_temps)
            if 0 <= max_temp <= 50:  # Reasonable temperature range
                temps.append(max_temp)
    return temps

def get_hnms_forecast():
    url = 'https://www.meteo.gr/services/weatherbulletin.xml'
    response = requests.get(url)
    if response.status_code != 200:
        print(f"Error fetching from HNMS: {response.status_code}")
        return None
    root = ET.fromstring(response.content)
    issued = root.find('.//issued')
    if issued is not None and issued.text:
        if not is_recent(issued.text):
            print("HNMS data is not recent")
            return None
    athens = None
    for city in root.findall('.//city'):
        if city.get('name') == 'Αθήνα' or city.get('name') == 'Athens':
            athens = city
            break
    if not athens:
        print("Athens not found in HNMS data")
        return None
    temps = []
    for forecast in athens.findall('.//forecast'):
        temp_str = forecast.find('temperature').text if forecast.find('temperature') is not None else None
        if temp_str:
            try:
                temp = float(temp_str)
                if 0 <= temp <= 50:  # Reasonable temperature range
                    temps.append(temp)
            except ValueError:
                pass
    return temps

def get_met_no_forecast():
    url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=37.9838&lon=23.7275'
    headers = {'User-Agent': 'AthensWeatherForecast/1.0'}  # Required by MET Norway
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print(f"Error fetching from MET Norway: {response.status_code}")
        return None
    data = response.json()
    # Get daily max temps
    temps = []
    daily_max = {}
    for item in data['properties']['timeseries']:
        dt = datetime.fromisoformat(item['time'][:-1])  # Remove Z
        day = dt.date()
        temp = item['data']['instant']['details']['air_temperature']
        if day not in daily_max or temp > daily_max[day]:
            daily_max[day] = temp
    for day in sorted(daily_max.keys())[:5]:  # First 5 days
        temp = daily_max[day]
        if 0 <= temp <= 50:
            temps.append(temp)
    return temps

def collect_forecasts():
    sources = {
        'Open-Meteo': get_open_meteo_forecast(),
        'MET Norway': get_met_no_forecast(),
        'HNMS': get_hnms_forecast()
    }
    all_temps = []
    for source, temps in sources.items():
        if temps:
            print(f"From {source}: {temps}")
            all_temps.extend(temps)
        else:
            print(f"No valid data from {source}")
    return all_temps

def main():
    temps = collect_forecasts()
    if len(temps) < 2:
        print("Not enough temperature data collected.")
        return
    
    mean_temp = statistics.mean(temps)
    std_temp = statistics.stdev(temps)
    estimation = mean_temp + 2 * std_temp
    
    print(f"\nCollected {len(temps)} temperature values from sources.")
    print(f"Mean temperature: {mean_temp:.2f}°C")
    print(f"Standard deviation: {std_temp:.2f}°C")
    print(f"Estimation for next day (mean + 2*std): {estimation:.2f}°C")

if __name__ == "__main__":
    main()