// ── Statistics helpers ────────────────────────────────────────────────────────

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mad(arr) {
  const med = median(arr);
  return median(arr.map(v => Math.abs(v - med)));
}

function trimmedMean(arr, pct = 0.1) {
  const s = [...arr].sort((a, b) => a - b);
  const cut = Math.max(1, Math.floor(s.length * pct));
  const trimmed = s.length > cut * 2 ? s.slice(cut, -cut) : s;
  return mean(trimmed);
}

// ── API fetchers ──────────────────────────────────────────────────────────────

async function fetchOpenMeteo() {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=37.9838&longitude=23.7275' +
              '&hourly=temperature_2m&forecast_days=5';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const hourly = data.hourly.temperature_2m;
  const temps = [];
  for (let i = 0; i < hourly.length; i += 24) {
    const day = hourly.slice(i, i + 24);
    if (!day.length) continue;
    const hi = Math.max(...day), lo = Math.min(...day);
    if (hi >= 0 && hi <= 30 && lo >= 0 && lo <= 30) {
      temps.push(hi, lo);
    }
  }
  return temps;
}

async function fetchECMWF() {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=37.9838&longitude=23.7275' +
              '&hourly=temperature_2m&forecast_days=5&model=ecmwf&timezone=auto';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const hourly = (data.hourly || {}).temperature_2m || [];
  const temps = [];
  for (let i = 0; i < hourly.length; i += 24) {
    const day = hourly.slice(i, i + 24);
    if (!day.length) continue;
    const hi = Math.max(...day);
    if (hi >= 0 && hi <= 30) temps.push(hi);
  }
  return temps;
}

async function fetchMETNorway() {
  const url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=37.9838&lon=23.7275';
  const res = await fetch(url, { headers: { 'User-Agent': 'AthensWeatherForecast/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const temps = [];
  for (const item of (data.properties.timeseries || []).slice(0, 120)) {
    const t = item.data.instant.details.air_temperature;
    if (t >= 0 && t <= 30) temps.push(t);
  }
  return temps;
}

async function fetchActualMaxForDate(dateStr) {
  const url = `https://archive-api.open-meteo.com/v1/archive` +
              `?latitude=37.9838&longitude=23.7275` +
              `&start_date=${dateStr}&end_date=${dateStr}` +
              `&daily=temperature_2m_max&timezone=Europe/Athens`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const vals = (data.daily || {}).temperature_2m_max || [];
  return vals[0] != null ? parseFloat(vals[0]) : null;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function loadHistory() {
  return new Promise(resolve => {
    browser.storage.local.get('forecast_history', r => {
      resolve(r.forecast_history || []);
    });
  });
}

async function saveHistory(hist) {
  return new Promise(resolve => {
    browser.storage.local.set({ forecast_history: hist }, resolve);
  });
}

async function backfillActuals(hist) {
  const today = todayStr();
  let changed = false;
  for (const row of hist) {
    if (!row.actual_max && row.date < today) {
      const actual = await fetchActualMaxForDate(row.date);
      if (actual !== null) {
        row.actual_max = actual;
        row.error = actual - row.predicted_combined;
        row.within_2c = Math.abs(row.error) <= 2;
        changed = true;
      }
    }
  }
  if (changed) await saveHistory(hist);
  return hist;
}

// ── Accuracy metrics ──────────────────────────────────────────────────────────

function computeMetrics(hist) {
  const validated = hist.filter(r => r.actual_max != null);
  if (!validated.length) return null;
  const errors = validated.map(r => r.error);
  const absErrors = errors.map(Math.abs);
  return {
    n: validated.length,
    mae: mean(absErrors),
    bias: mean(errors),
    within2: (errors.filter(e => Math.abs(e) <= 2).length / errors.length) * 100,
    within4: (errors.filter(e => Math.abs(e) <= 4).length / errors.length) * 100,
  };
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function fmt(n, d = 2) { return n.toFixed(d); }
function signFmt(n) { return (n >= 0 ? '+' : '') + fmt(n); }

function renderSources(sourcesEl, results) {
  sourcesEl.innerHTML = '';
  for (const [name, info] of Object.entries(results)) {
    const card = document.createElement('div');
    card.className = 'source-card ' + (info.temps ? 'ok' : 'err');
    card.innerHTML = `<div class="src-name">${name}</div>` +
      (info.temps
        ? `<div class="src-val">${info.temps.length} pts &nbsp;` +
          `${fmt(Math.min(...info.temps), 1)}–${fmt(Math.max(...info.temps), 1)}°C</div>`
        : `<div class="src-val" style="color:#e74c3c">Unavailable</div>`);
    sourcesEl.appendChild(card);
  }
}

function renderResults(resultsEl, stats, metrics) {
  const rows = [
    ['Data points', stats.n + ' values'],
    ['Range', `${fmt(stats.min, 1)}°C – ${fmt(stats.max, 1)}°C`],
    ['Mean', `${fmt(stats.mean)}°C`],
    ['Median', `${fmt(stats.median)}°C`],
    ['Std dev (σ)', `${fmt(stats.stdev)}°C`],
    ['MAD', `${fmt(stats.mad)}°C`],
    ['Trimmed mean (10%)', `${fmt(stats.trimmedMean)}°C`],
    null, // separator
    ['Mean + 2σ', `${fmt(stats.est_mean2sigma)}°C`],
    ['Median + 2·MAD', `${fmt(stats.est_mad)}°C`],
  ];

  let html = '<div class="result-box">';
  for (const row of rows) {
    if (!row) { html += '<div style="border-bottom:1px solid #1a2e40;margin:4px 0"></div>'; continue; }
    html += `<div class="result-row"><span class="label">${row[0]}</span><span class="value">${row[1]}</span></div>`;
  }
  // Combined
  html += `<div class="result-row highlight"><span class="label">&#10003; Combined estimate</span>` +
          `<span class="value">${fmt(stats.est_combined)}°C</span></div>`;
  // Bias-corrected
  if (metrics && metrics.n >= 3) {
    const corrected = stats.est_combined - metrics.bias;
    const adjLabel = `Bias-corrected (${signFmt(metrics.bias * -1)}°C adj.)`;
    html += `<div class="result-row bias-row"><span class="label">${adjLabel}</span>` +
            `<span class="value">${fmt(corrected)}°C</span></div>`;
  }
  html += '</div>';
  resultsEl.innerHTML = html;
}

function renderAccuracy(el, metrics) {
  if (!metrics) {
    el.innerHTML = '<div class="status-msg">No verified predictions yet.<br>Run the forecast daily — actuals are fetched automatically.</div>';
    return;
  }
  const biasDir = metrics.bias > 0 ? 'over-predicting' : 'under-predicting';
  const maeClass = metrics.mae <= 2 ? 'good' : metrics.mae <= 4 ? '' : 'bad';
  const biasClass = Math.abs(metrics.bias) <= 1 ? 'good' : Math.abs(metrics.bias) <= 3 ? '' : 'bad';
  el.innerHTML = `
    <div class="accuracy-box">
      <h3>Model Accuracy (${metrics.n} verified predictions)</h3>
      <div class="acc-grid">
        <div class="acc-item"><div class="al">MAE</div><div class="av ${maeClass}">${fmt(metrics.mae)}°C</div></div>
        <div class="acc-item"><div class="al">Bias</div><div class="av ${biasClass}">${signFmt(metrics.bias)}°C <span style="font-weight:400;color:#4a7fa0">(${biasDir})</span></div></div>
        <div class="acc-item"><div class="al">Within ±2°C</div><div class="av ${metrics.within2 >= 60 ? 'good' : 'bad'}">${fmt(metrics.within2, 1)}%</div></div>
        <div class="acc-item"><div class="al">Within ±4°C</div><div class="av ${metrics.within4 >= 80 ? 'good' : ''}">${fmt(metrics.within4, 1)}%</div></div>
      </div>
    </div>`;
}

function renderHistoryTable(el, hist) {
  if (!hist.length) {
    el.innerHTML = '<div class="status-msg">No predictions saved yet.</div>';
    return;
  }
  const sorted = [...hist].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  let html = `<table class="hist-table">
    <thead><tr>
      <th>Date</th><th>Predicted</th><th>Actual</th><th>Error</th><th>±2°C</th>
    </tr></thead><tbody>`;
  for (const r of sorted) {
    const actual = r.actual_max != null ? fmt(r.actual_max) + '°C' : '<span class="tag-pending">pending</span>';
    const errStr = r.error != null
      ? `<span class="${r.error > 0 ? 'err-pos' : 'err-neg'}">${signFmt(r.error)}°C</span>`
      : '–';
    const within = r.within_2c == null ? '–'
      : r.within_2c ? '<span class="tag-yes">Yes</span>' : '<span class="tag-no">No</span>';
    html += `<tr><td>${r.date}</td><td>${fmt(r.predicted_combined)}°C</td>` +
            `<td>${actual}</td><td>${errStr}</td><td>${within}</td></tr>`;
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}

// ── Main forecast logic ───────────────────────────────────────────────────────

async function runForecast() {
  const btn = document.getElementById('refresh-btn');
  const sourcesEl = document.getElementById('sources');
  const resultsEl = document.getElementById('results');
  btn.disabled = true;
  btn.textContent = 'Fetching data…';
  sourcesEl.innerHTML = '';
  resultsEl.innerHTML = '<div class="status-msg">Contacting weather services…</div>';

  const hist = await backfillActuals(await loadHistory());
  const metrics = computeMetrics(hist);

  const fetchers = {
    'Open-Meteo': fetchOpenMeteo,
    'ECMWF (Open-Meteo)': fetchECMWF,
    'MET Norway': fetchMETNorway,
  };
  const sourceResults = {};
  for (const [name, fn] of Object.entries(fetchers)) {
    try { sourceResults[name] = { temps: await fn() }; }
    catch   { sourceResults[name] = { temps: null }; }
  }

  renderSources(sourcesEl, sourceResults);

  const all = Object.values(sourceResults).flatMap(s => s.temps || []);
  if (all.length < 10) {
    resultsEl.innerHTML = `<div class="status-msg">Not enough data (${all.length} values). Check your connection.</div>`;
    btn.disabled = false;
    btn.textContent = '↻ Run Forecast';
    return;
  }

  const m = mean(all), s = stdev(all), med = median(all),
        m_ = mad(all), tm = trimmedMean(all);
  const est_mean2sigma = m + 2 * s;
  const est_mad = med + 2 * m_;
  const est_combined = (est_mean2sigma + tm + est_mad) / 3;

  const stats = {
    n: all.length, min: Math.min(...all), max: Math.max(...all),
    mean: m, stdev: s, median: med, mad: m_, trimmedMean: tm,
    est_mean2sigma, est_mad, est_combined,
  };

  renderResults(resultsEl, stats, metrics);

  // Save today's prediction once per day
  const today = todayStr();
  if (!hist.find(r => r.date === today)) {
    hist.push({
      date: today,
      predicted_combined: est_combined,
      predicted_mean2sigma: est_mean2sigma,
      predicted_mad: est_mad,
      actual_max: null,
      error: null,
      within_2c: null,
    });
    await saveHistory(hist);
  }

  btn.disabled = false;
  btn.textContent = '↻ Run Forecast';
}

// ── History panel refresh ─────────────────────────────────────────────────────

async function refreshHistory() {
  const accEl = document.getElementById('accuracy-section');
  const histEl = document.getElementById('history-table');
  accEl.innerHTML = '<div class="status-msg">Loading…</div>';
  const hist = await backfillActuals(await loadHistory());
  renderAccuracy(accEl, computeMetrics(hist));
  renderHistoryTable(histEl, hist);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(tab.dataset.tab);
    panel.classList.add('active');
    if (tab.dataset.tab === 'history') refreshHistory();
  });
});

document.getElementById('refresh-btn').addEventListener('click', runForecast);

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (!confirm('Delete all prediction history?')) return;
  await saveHistory([]);
  refreshHistory();
});

// Auto-run forecast on open
runForecast();
