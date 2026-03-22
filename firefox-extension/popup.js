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

function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function createDiv(className, text) {
  const div = document.createElement('div');
  if (className) div.className = className;
  if (text !== undefined) div.textContent = text;
  return div;
}

function setStatusMessage(el, line1, line2) {
  clearElement(el);
  const msg = createDiv('status-msg');
  msg.textContent = line1;
  if (line2) {
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode(line2));
  }
  el.appendChild(msg);
}

function renderSources(sourcesEl, results) {
  clearElement(sourcesEl);
  for (const [name, info] of Object.entries(results)) {
    const card = createDiv('source-card ' + (info.temps ? 'ok' : 'err'));
    const srcName = createDiv('src-name', name);
    const srcVal = createDiv('src-val');
    if (info.temps) {
      srcVal.textContent = `${info.temps.length} pts ${fmt(Math.min(...info.temps), 1)}-${fmt(Math.max(...info.temps), 1)}°C`;
    } else {
      srcVal.textContent = 'Unavailable';
    }
    card.appendChild(srcName);
    card.appendChild(srcVal);
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

  clearElement(resultsEl);
  const box = createDiv('result-box');

  for (const row of rows) {
    if (!row) {
      const separator = document.createElement('div');
      separator.style.borderBottom = '1px solid #1a2e40';
      separator.style.margin = '4px 0';
      box.appendChild(separator);
      continue;
    }

    const resultRow = createDiv('result-row');
    const label = createDiv('label', row[0]);
    const value = createDiv('value', row[1]);
    resultRow.appendChild(label);
    resultRow.appendChild(value);
    box.appendChild(resultRow);
  }

  const combinedRow = createDiv('result-row highlight');
  combinedRow.appendChild(createDiv('label', 'Combined estimate'));
  combinedRow.appendChild(createDiv('value', `${fmt(stats.est_combined)}°C`));
  box.appendChild(combinedRow);

  if (metrics && metrics.n >= 3) {
    const corrected = stats.est_combined - metrics.bias;
    const adjLabel = `Bias-corrected (${signFmt(metrics.bias * -1)}°C adj.)`;
    const correctedRow = createDiv('result-row bias-row');
    correctedRow.appendChild(createDiv('label', adjLabel));
    correctedRow.appendChild(createDiv('value', `${fmt(corrected)}°C`));
    box.appendChild(correctedRow);
  }

  resultsEl.appendChild(box);
}

function renderAccuracy(el, metrics) {
  clearElement(el);
  if (!metrics) {
    setStatusMessage(el, 'No verified predictions yet.', 'Run the forecast daily - actuals are fetched automatically.');
    return;
  }

  const biasDir = metrics.bias > 0 ? 'over-predicting' : 'under-predicting';
  const maeClass = metrics.mae <= 2 ? 'good' : metrics.mae <= 4 ? '' : 'bad';
  const biasClass = Math.abs(metrics.bias) <= 1 ? 'good' : Math.abs(metrics.bias) <= 3 ? '' : 'bad';

  const box = createDiv('accuracy-box');
  const title = document.createElement('h3');
  title.textContent = `Model Accuracy (${metrics.n} verified predictions)`;
  box.appendChild(title);

  const grid = createDiv('acc-grid');
  const items = [
    { label: 'MAE', value: `${fmt(metrics.mae)}°C`, valueClass: maeClass },
    { label: 'Bias', value: `${signFmt(metrics.bias)}°C (${biasDir})`, valueClass: biasClass },
    { label: 'Within +/-2°C', value: `${fmt(metrics.within2, 1)}%`, valueClass: metrics.within2 >= 60 ? 'good' : 'bad' },
    { label: 'Within +/-4°C', value: `${fmt(metrics.within4, 1)}%`, valueClass: metrics.within4 >= 80 ? 'good' : '' },
  ];

  for (const item of items) {
    const accItem = createDiv('acc-item');
    accItem.appendChild(createDiv('al', item.label));
    const val = createDiv(`av ${item.valueClass}`.trim(), item.value);
    accItem.appendChild(val);
    grid.appendChild(accItem);
  }

  box.appendChild(grid);
  el.appendChild(box);
}

function renderHistoryTable(el, hist) {
  clearElement(el);
  if (!hist.length) {
    setStatusMessage(el, 'No predictions saved yet.');
    return;
  }

  const sorted = [...hist].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

  const table = document.createElement('table');
  table.className = 'hist-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const header of ['Date', 'Predicted', 'Actual', 'Error', '+/-2°C']) {
    const th = document.createElement('th');
    th.textContent = header;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (const r of sorted) {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = r.date;
    tr.appendChild(tdDate);

    const tdPred = document.createElement('td');
    tdPred.textContent = `${fmt(r.predicted_combined)}°C`;
    tr.appendChild(tdPred);

    const tdActual = document.createElement('td');
    if (r.actual_max != null) {
      tdActual.textContent = `${fmt(r.actual_max)}°C`;
    } else {
      const pending = createDiv('tag-pending', 'pending');
      tdActual.appendChild(pending);
    }
    tr.appendChild(tdActual);

    const tdErr = document.createElement('td');
    if (r.error != null) {
      const errSpan = document.createElement('span');
      errSpan.className = r.error > 0 ? 'err-pos' : 'err-neg';
      errSpan.textContent = `${signFmt(r.error)}°C`;
      tdErr.appendChild(errSpan);
    } else {
      tdErr.textContent = '-';
    }
    tr.appendChild(tdErr);

    const tdWithin = document.createElement('td');
    if (r.within_2c == null) {
      tdWithin.textContent = '-';
    } else {
      const withinSpan = document.createElement('span');
      withinSpan.className = r.within_2c ? 'tag-yes' : 'tag-no';
      withinSpan.textContent = r.within_2c ? 'Yes' : 'No';
      tdWithin.appendChild(withinSpan);
    }
    tr.appendChild(tdWithin);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  el.appendChild(table);
}

// ── Main forecast logic ───────────────────────────────────────────────────────

async function runForecast() {
  const btn = document.getElementById('refresh-btn');
  const sourcesEl = document.getElementById('sources');
  const resultsEl = document.getElementById('results');
  btn.disabled = true;
  btn.textContent = 'Fetching data…';
  clearElement(sourcesEl);
  setStatusMessage(resultsEl, 'Contacting weather services...');

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
    setStatusMessage(resultsEl, `Not enough data (${all.length} values).`, 'Check your connection.');
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
  setStatusMessage(accEl, 'Loading...');
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
