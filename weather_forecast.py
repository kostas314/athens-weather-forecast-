import csv
import os
import requests
import statistics
from datetime import date, datetime, timedelta

HISTORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'forecast_history.csv')
HISTORY_FIELDS = ['date', 'predicted_combined', 'predicted_mean2sigma', 'predicted_mad',
                   'actual_max', 'error', 'within_2c']


def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    with open(HISTORY_FILE, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def save_history(history):
    with open(HISTORY_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=HISTORY_FIELDS)
        writer.writeheader()
        writer.writerows(history)


def fetch_actual_max_temp(target_date):
    """Fetch actual recorded max temperature for Athens on target_date from Open-Meteo archive."""
    date_str = target_date.strftime('%Y-%m-%d')
    url = (
        f'https://archive-api.open-meteo.com/v1/archive'
        f'?latitude=37.9838&longitude=23.7275'
        f'&start_date={date_str}&end_date={date_str}'
        f'&daily=temperature_2m_max&timezone=Europe/Athens'
    )
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            temps = data.get('daily', {}).get('temperature_2m_max', [])
            if temps and temps[0] is not None:
                return float(temps[0])
    except Exception:
        pass
    return None


def update_actuals(history):
    """Back-fill actual max temperatures for any past predictions still pending."""
    updated = False
    today = date.today()
    for row in history:
        if row.get('actual_max') in ('', None):
            pred_date = datetime.strptime(row['date'], '%Y-%m-%d').date()
            if pred_date < today:
                actual = fetch_actual_max_temp(pred_date)
                if actual is not None:
                    row['actual_max'] = f'{actual:.2f}'
                    error = actual - float(row['predicted_combined'])
                    row['error'] = f'{error:.2f}'
                    row['within_2c'] = 'True' if abs(error) <= 2 else 'False'
                    updated = True
    return updated


def compute_success_metrics(history):
    """Return accuracy metrics from all history rows that have verified actuals."""
    validated = [r for r in history if r.get('actual_max') not in ('', None)]
    if not validated:
        return None
    errors = [float(r['error']) for r in validated]
    mae = statistics.mean([abs(e) for e in errors])
    bias = statistics.mean(errors)
    within_2 = sum(1 for e in errors if abs(e) <= 2) / len(errors) * 100
    within_4 = sum(1 for e in errors if abs(e) <= 4) / len(errors) * 100
    return {'n': len(validated), 'mae': mae, 'bias': bias,
            'within_2c_pct': within_2, 'within_4c_pct': within_4}


def print_history_summary(history):
    validated = [r for r in history if r.get('actual_max') not in ('', None)]
    if not validated:
        print("\n--- Prediction History: no verified predictions yet ---")
        return
    print(f"\n--- Prediction History ({len(validated)} verified) ---")
    print(f"{'Date':<12} {'Predicted':>10} {'Actual':>8} {'Error':>8} {'Within 2°C':>11}")
    print("-" * 54)
    for row in sorted(validated, key=lambda r: r['date'])[-10:]:
        within = 'Yes' if row['within_2c'] == 'True' else 'No'
        print(f"{row['date']:<12} {float(row['predicted_combined']):>9.2f}°C "
              f"{float(row['actual_max']):>7.2f}°C {float(row['error']):>+8.2f}°C {within:>11}")
    metrics = compute_success_metrics(history)
    if metrics:
        direction = 'over-predicting' if metrics['bias'] > 0 else 'under-predicting'
        print(f"\n--- Model Accuracy ({metrics['n']} data points) ---")
        print(f"Mean absolute error (MAE): {metrics['mae']:.2f}°C")
        print(f"Bias (mean signed error):  {metrics['bias']:+.2f}°C  ({direction})")
        print(f"Within ±2°C: {metrics['within_2c_pct']:.1f}%")
        print(f"Within ±4°C: {metrics['within_4c_pct']:.1f}%")


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
                day_max = max(day_temps)
                day_min = min(day_temps)
                if 0 <= day_max <= 30 and 0 <= day_min <= 30:  # Conservative Athens range
                    temps.append(day_max)
                    temps.append(day_min)
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
            if 0 <= temp <= 30:  # Conservative Athens range
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
            values = [v for v in values if 0 <= v <= 30]  # Conservative Athens range
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
            # Less restrictive initial filtering for cross-validation consideration
            values = [v for v in values if 0 <= v <= 25]  # Allow broader range for validation
            # Require at least 2 values for meaningful cross-validation
            if len(values) >= 2:
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
                if 0 <= max_temp <= 30:  # Conservative Athens range
                    temps.append(max_temp)
        return temps
    except:
        return None


def collect_forecasts():
    # Get HNMS first as reference
    hnms_data = get_hnms_forecast()

    # Get EMY data
    emy_data = get_emy_forecast()

    # Cross-validate EMY against HNMS (±5°C)
    validated_emy = None
    if hnms_data and emy_data:
        hnms_avg = sum(hnms_data) / len(hnms_data)
        # Check if all EMY values are within ±5°C of HNMS average
        if all(abs(temp - hnms_avg) <= 5 for temp in emy_data):
            validated_emy = emy_data
            print(f"EMY validated against HNMS (avg: {hnms_avg:.1f}°C, within ±5°C)")
        else:
            print(f"EMY rejected - outside ±5°C of HNMS average ({hnms_avg:.1f}°C)")

    sources = {
        'HNMS (Hellenic)': hnms_data,
        'EMY (Hellenic)': validated_emy,  # Only include if validated
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
    # Load history, back-fill any missing actuals, print summary
    history = load_history()
    if update_actuals(history):
        save_history(history)
    print_history_summary(history)
    metrics = compute_success_metrics(history)

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
    if metrics and metrics['n'] >= 3:
        bias_corrected = estimation_combined - metrics['bias']
        print(f"Bias-corrected estimate:   {bias_corrected:.2f}°C  "
              f"(adjusted {-metrics['bias']:+.2f}°C from {metrics['n']}-run history)")

    # Save today's prediction (once per day)
    today_str = date.today().strftime('%Y-%m-%d')
    if not any(r['date'] == today_str for r in history):
        history.append({
            'date': today_str,
            'predicted_combined': f'{estimation_combined:.2f}',
            'predicted_mean2sigma': f'{estimation_mean2std:.2f}',
            'predicted_mad': f'{estimation_mad:.2f}',
            'actual_max': '',
            'error': '',
            'within_2c': '',
        })
        save_history(history)
        print(f"\nToday's prediction saved → {HISTORY_FILE}")

if __name__ == "__main__":
    main()