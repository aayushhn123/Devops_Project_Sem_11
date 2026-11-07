/* PriceScope front-end. Vanilla JS: every control calls /api/... which runs SQL on PostgreSQL. */
'use strict';

/* ------------------------------------------------------------------ helpers */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const F = {
  money: v => v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  money0: v => v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US'),
  int: v => v == null ? '—' : Math.round(v).toLocaleString('en-US'),
  num: v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 }),
  pct: (v, d = 1) => v == null ? '—' : Number(v).toFixed(d) + '%',
  spct: v => v == null ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(1) + '%',
  compact: v => v == null ? '—' : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v),
  day: s => s ? new Date(s.slice(0, 10) + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
  dayY: s => s ? new Date(s.slice(0, 10) + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
};
const trendHtml = v => v == null ? '<span class="flat">—</span>'
  : `<span class="trend ${v < 0 ? 'down' : v > 0 ? 'up' : 'flat'}">${v < 0 ? '▼' : v > 0 ? '▲' : '●'} ${Math.abs(v).toFixed(1)}%</span>`;

async function api(path, opts = {}) {
  const init = { ...opts };
  if (opts.body && typeof opts.body !== 'string') {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  }
  const r = await fetch(path, init);
  let j = {};
  try { j = await r.json(); } catch { /* empty body */ }
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null && v !== false)).toString();
const runQuery = (name, params = {}) => api(`/api/query/${name}?${qs(params)}`);

function toast(msg, kind = 'good') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.innerHTML = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => { el.style.opacity = 0; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, 3800);
}

/* ------------------------------------------------------------------ icons */
const I = {
  overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  explore: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  tracker: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  deals: '<path d="M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  market: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  watch: '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 003.4 0"/>',
  sql: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  tag: '<path d="M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/>',
  star: '<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.600 5.700 21.100l1.500-7L2 9.300l7-.8z"/>',
  swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  ext: '<path d="M14 3h7v7M10 14L21 3M19 14v6a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1h6"/>',
  bolt: '<path d="M13 2L3 14h8l-1 8 10-12h-8z"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 11-12.8 0"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.500h.01M7 16.500h.01"/>',
  devops: '<path d="M12 3l8 4.500v9L12 21l-8-4.500v-9z"/><path d="M12 12l8-4.500M12 12v9M12 12L4 7.500"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
};
const icon = (n, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${I[n] || ''}</svg>`;

/* ------------------------------------------------------------------ charts */
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let charts = [];
const killCharts = () => { charts.forEach(c => c.destroy()); charts = []; };
const palette = () => [css('--accent'), css('--accent-2'), css('--good'), css('--warn'), css('--bad'), '#f472b6', '#a3e635', '#fb923c'];

function chartDefaults() {
  Chart.defaults.color = css('--muted');
  Chart.defaults.font.family = css('--sans');
  Chart.defaults.font.size = 11.5;
  Chart.defaults.borderColor = css('--line');
}

function gradient(ctx, c1, c2, horizontal) {
  const g = horizontal ? ctx.createLinearGradient(0, 0, ctx.canvas.width, 0) : ctx.createLinearGradient(0, ctx.canvas.height, 0, 0);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  return g;
}

function drawChart(canvas, spec, rows) {
  chartDefaults();
  const horizontal = spec.type === 'hbar';
  const labels = rows.map(r => {
    const v = r[spec.x];
    const s = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? F.day(v) : String(v);
    return s.length > 38 ? s.slice(0, 36) + '…' : s;
  });
  const full = rows.map(r => String(r[spec.x]));
  const vals = rows.map(r => r[spec.y]);
  const isMoney = /price|amount/.test(spec.y), isPct = /pct|index/.test(spec.y);
  const fmt = v => isMoney ? F.money(v) : isPct ? F.num(v) + (spec.y === 'price_index' ? '' : '%') : F.int(v);
  const ctx = canvas.getContext('2d');
  const accent = css('--accent'), accent2 = css('--accent-2');
  let cfg;
  if (spec.type === 'line') {
    cfg = {
      type: 'line',
      data: { labels, datasets: [{ data: vals, borderColor: accent2, borderWidth: 2.5, tension: .3, pointRadius: 4, pointBackgroundColor: accent2, fill: true,
        backgroundColor: gradient(ctx, 'transparent', css('--accent-2') + '55', false) }] },
      options: baseOpts(fmt, full, false),
    };
  } else if (spec.type === 'doughnut') {
    cfg = { type: 'doughnut', data: { labels, datasets: [{ data: vals, backgroundColor: palette(), borderWidth: 0 }] },
      options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right' } } } };
  } else {
    const colors = rows.map((r, i) => {
      if (spec.y === 'change_pct' || spec.y === 'vs_avg_pct' || spec.y === 'avg_change_pct') return r[spec.y] < 0 ? css('--good') : css('--bad');
      return gradient(ctx, accent, accent2, horizontal);
    });
    cfg = {
      type: 'bar',
      data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderRadius: 7, borderSkipped: false, maxBarThickness: horizontal ? 22 : 54 }] },
      options: { ...baseOpts(fmt, full, horizontal), indexAxis: horizontal ? 'y' : 'x' },
    };
  }
  const c = new Chart(canvas, cfg);
  charts.push(c);
  return c;
}

function baseOpts(fmt, full, horizontal) {
  return {
    maintainAspectRatio: false, responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: css('--surface-3'), titleColor: css('--text'), bodyColor: css('--text'), borderColor: css('--line-strong'), borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false,
        callbacks: { title: it => full[it[0].dataIndex], label: it => fmt(it.parsed[horizontal ? 'x' : 'y']) },
      },
    },
    scales: {
      x: { grid: { display: horizontal, color: css('--line') }, border: { display: false }, ticks: { ...(horizontal ? { callback: v => F.compact(v) } : {}), maxRotation: 0, autoSkip: true } },
      y: { grid: { display: !horizontal, color: css('--line') }, border: { display: false }, ticks: horizontal ? {} : { callback: v => F.compact(v) } },
    },
  };
}

/* ------------------------------------------------------------------ SQL highlight + viewer */
const KW = 'SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|USING|AS|AND|OR|NOT|IN|IS|NULL|NULLS|LAST|FIRST|CASE|WHEN|THEN|ELSE|END|WITH|OVER|PARTITION BY|ROWS|BETWEEN|UNBOUNDED|PRECEDING|FOLLOWING|WINDOW|DISTINCT|ON|FILTER|WITHIN|ASC|DESC|ROLLUP|UNION|ALL|EXPLAIN|ANALYZE|CREATE|TABLE|VIEW|MATERIALIZED|INDEX|TRIGGER|FUNCTION|RETURNS|REFRESH|INSERT|INTO|VALUES|UPDATE|DELETE|LIKE|ILIKE|TRUE|FALSE|EXISTS|LATERAL|RETURNING|PRIMARY|KEY|REFERENCES|CHECK|DEFAULT|BEGIN|DECLARE|IF|LOOP|FOR|EACH|ROW|AFTER|BEFORE|EXECUTE|PROCEDURE';
const FN = 'COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|NULLIF|GREATEST|LEAST|ABS|LN|STDDEV_POP|STDDEV|CORR|RANK|DENSE_RANK|ROW_NUMBER|NTILE|LAG|LEAD|FIRST_VALUE|LAST_VALUE|PERCENT_RANK|PERCENTILE_CONT|ARRAY_AGG|GROUPING|CAST|NOW|CLOCK_TIMESTAMP|RANDOM|WIDTH_BUCKET|TO_CHAR|LENGTH|LOWER|UPPER';
const KW_RE = new RegExp(`\\b(${KW})\\b`, 'gi'), FN_RE = new RegExp(`\\b(${FN})(?=\\s*\\()`, 'gi');
function highlightSql(sql) {
  const parts = [];
  const hold = h => { parts.push(h); return `\u0000${parts.length - 1}\u0000`; };
  let s = esc(sql)
    .replace(/(--[^\n]*)/g, m => hold(`<span class="c">${m}</span>`))
    .replace(/(&#39;[^&\n]*?&#39;)/g, m => hold(`<span class="s">${m}</span>`));
  s = s.replace(FN_RE, '<span class="f">$1</span>')
    .replace(KW_RE, '<span class="k">$1</span>')
    .replace(/(%\(\w+\)s)/g, '<span class="p">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b(?![^<]*>)/g, '<span class="n">$1</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[i]);
}
const sqlBlock = sql => `<pre class="sqlblock">${highlightSql(sql)}</pre>`;

function openModal(html, cls = '') {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  $('#modal-root').appendChild(back);
  document.body.style.overflow = 'hidden';
  return back;
}
function closeModal() {
  killModalCharts();
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
}
let modalCharts = [];
function killModalCharts() { modalCharts.forEach(c => c.destroy()); modalCharts = []; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function showSql(title, sql, ms, concepts) {
  const m = openModal(`
    <button class="icon-btn modal-close" data-close>${icon('close')}</button>
    <div class="m-body" style="padding-top:26px">
      <div><div class="sub">SQL executed on PostgreSQL${ms != null ? ` · ${ms} ms` : ''}</div><h2 style="font-size:19px;margin-top:2px">${esc(title)}</h2></div>
      ${concepts?.length ? `<div class="chips">${concepts.map(c => `<span class="chip accent">${esc(c)}</span>`).join('')}</div>` : ''}
      ${sqlBlock(sql)}
      <div><button class="btn sm" id="copySql">Copy SQL</button></div>
    </div>`, 'narrow');
  $('[data-close]', m).onclick = closeModal;
  $('#copySql', m).onclick = () => { navigator.clipboard?.writeText(sql); toast('SQL copied'); };
}

/* ------------------------------------------------------------------ generic table */
const MONEY_COLS = /(^|_)(price|amount|gap|p10|p25|p75|p90|median|stddev|coupon_value_amt)(_|$)|^(min|max|avg|median)$/;
const PCT_COLS = /_pct$/;
const SIGNED_PCT = /(change_pct|vs_avg_pct|vs_own_avg_pct|avg_change_pct|change_vs_prev_day)$/;
const HIDDEN_COLS = new Set(['image_url', 'product_id', 'page_url', 'asin', 'total_count']);
const COL_LABEL = { discount_pct: 'discount', change_pct: 'change', vs_own_avg_pct: 'vs own avg', vs_avg_pct: 'vs avg', avg_discount_pct: 'avg discount', avg_change_pct: 'avg change', unavailable_pct: 'unavailable', sponsored_share_pct: 'sponsored share', volatility_pct: 'volatility', saving_pct: 'saving', share_pct: 'share', purchased_last_month: 'bought last month' };
const label = c => COL_LABEL[c] || c.replace(/_/g, ' ');

function cellHtml(col, v, row) {
  if (col === 'title') {
    const img = row.image_url ? `<img src="${esc(row.image_url)}" loading="lazy" onerror="this.style.visibility='hidden'">` : '';
    return `<div class="tcell">${img}<span>${esc(v)}</span></div>`;
  }
  if (v == null) return '<span class="flat">—</span>';
  if (col === 'event_type') {
    const k = { PRICE_DROP: 'good', PRICE_HIKE: 'bad', TARGET_HIT: 'warn' }[v] || '';
    return `<span class="chip ${k}">${esc(v.replace('_', ' ').toLowerCase())}</span>`;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.length > 10 ? v.slice(0, 16) : v;
  if (typeof v === 'number') {
    if (SIGNED_PCT.test(col)) return trendHtml(v);
    if (col === 'change_amount') return `<span class="trend ${v < 0 ? 'down' : 'up'}">${v < 0 ? '−' : '+'}${F.money(Math.abs(v))}</span>`;
    if (col === 'price_index') return F.num(v);
    if (PCT_COLS.test(col)) return F.pct(v);
    if (col === 'coupon_value') return row.coupon_type === 'percent' ? `${v}%` : F.money(v);
    if (MONEY_COLS.test(col)) return F.money(v);
    return Number.isInteger(v) ? F.int(v) : F.num(v);
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return esc(v);
}

function renderTable(columns, rows, { onRowClick = true, showIds = false } = {}) {
  const cols = columns.filter(c => showIds || !HIDDEN_COLS.has(c));
  const id = 't' + Math.random().toString(36).slice(2, 8);
  let data = rows.slice(), sortCol = null, asc = false;
  const isNum = c => rows.some(r => typeof r[c] === 'number');
  const body = () => data.map(r => {
    const total = Object.values(r).some(v => typeof v === 'string' && v.startsWith('ALL '));
    return `<tr class="${r.product_id && onRowClick ? 'click' : ''} ${total ? 'total-row' : ''}" ${r.product_id ? `data-pid="${r.product_id}"` : ''}>` +
      cols.map(c => `<td class="${c === 'title' ? 'title-cell' : ''} ${isNum(c) ? 'r num' : ''}">${cellHtml(c, r[c], r)}</td>`).join('') + '</tr>';
  }).join('');
  const html = `<div class="table-wrap" id="${id}"><table class="data"><thead><tr>${cols.map(c => `<th class="${isNum(c) ? 'r' : ''}" data-c="${esc(c)}">${esc(label(c))}</th>`).join('')}</tr></thead><tbody>${body()}</tbody></table></div>`;
  return {
    html,
    bind(root) {
      const wrap = $('#' + id, root); if (!wrap) return;
      const refresh = () => { $('tbody', wrap).innerHTML = body(); bindRows(); };
      const bindRows = () => $$('tr[data-pid]', wrap).forEach(tr => { if (onRowClick) tr.onclick = () => openProduct(+tr.dataset.pid); });
      bindRows();
      $$('th', wrap).forEach(th => th.onclick = () => {
        const c = th.dataset.c; asc = sortCol === c ? !asc : false; sortCol = c;
        data.sort((a, b) => {
          const x = a[c], y = b[c]; if (x == null) return 1; if (y == null) return -1;
          return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * (asc ? 1 : -1);
        });
        $$('th', wrap).forEach(t => t.classList.remove('sorted', 'asc'));
        th.classList.add('sorted'); if (asc) th.classList.add('asc');
        refresh();
      });
    },
  };
}

/* ------------------------------------------------------------------ query viewer (used by Tracker / Deals / Market) */
async function mountQueryView(root, qmeta) {
  root.innerHTML = `
    <div class="card fade-in">
      <div class="qv-head">
        <div>
          <h2>${esc(qmeta.title)}</h2>
          <p>${esc(qmeta.description)}</p>
          <div class="chips">${qmeta.concepts.map(c => `<span class="chip accent">${esc(c)}</span>`).join('')}</div>
        </div>
        <div class="qv-params">
          ${qmeta.params.map(p => `<div class="field"><label>${esc(p.name.replace(/_/g, ' '))}</label><input class="input" data-p="${p.name}" type="number" step="${p.type === 'float' ? '0.1' : '1'}" value="${p.default}"></div>`).join('')}
          <button class="btn primary" id="qvRun">${icon('play')} Run</button>
          <button class="sql-btn" id="qvSql">${icon('sql')} SQL</button>
        </div>
      </div>
      <div id="qvOut"><div class="skel" style="height:260px"></div></div>
    </div>`;
  const out = $('#qvOut', root);
  let last = null;
  async function run() {
    const params = {};
    $$('[data-p]', root).forEach(i => params[i.dataset.p] = i.value);
    out.innerHTML = '<div class="skel" style="height:260px"></div>';
    try {
      killCharts();
      const res = last = await runQuery(qmeta.name, params);
      if (!res.rows.length) { out.innerHTML = '<div class="empty"><b>No rows</b>Try relaxing the parameters.</div>'; return; }
      const tbl = renderTable(res.columns, res.rows);
      out.innerHTML = `
        ${res.chart ? `<div class="chart-box ${res.chart.type === 'hbar' && res.rows.length > 12 ? 'tall' : ''}" style="margin-bottom:18px"><canvas></canvas></div>` : ''}
        <div class="qv-meta"><span>${res.rowcount} rows</span><span>${res.ms} ms</span><span>click a column header to sort${res.rows[0]?.product_id ? ' · click a row to open the product' : ''}</span></div>
        ${tbl.html}`;
      if (res.chart) drawChart($('canvas', out), res.chart, res.rows);
      tbl.bind(out);
    } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }
  $('#qvRun', root).onclick = run;
  $$('[data-p]', root).forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') run(); }));
  $('#qvSql', root).onclick = () => showSql(qmeta.title, last?.sql || qmeta.sql, last?.ms, qmeta.concepts);
  await run();
}

/* ------------------------------------------------------------------ pages */
let META = null, QCATALOG = null;
async function ensureMeta() {
  if (!META) META = await api('/api/meta');
  if (!QCATALOG) QCATALOG = await api('/api/queries');
}

const PAGES = {
  overview: { title: 'Overview', icon: 'overview', render: pageOverview },
  explorer: { title: 'Product Explorer', icon: 'explore', render: pageExplorer },
  tracker: { title: 'Price Tracker', icon: 'tracker', render: root => pageGroup(root, 'Price Tracker', 'Price <em>Tracker</em>', 'How prices moved between our scrape days — drops, hikes and volatility, computed with window functions over the price-history views.') },
  deals: { title: 'Deals', icon: 'deals', render: root => pageGroup(root, 'Deals', 'Find the <em>deals</em>', 'Quality-filtered discounts, products cheaper than their own average, coupons and best value per category.') },
  market: { title: 'Market Insights', icon: 'market', render: root => pageGroup(root, 'Market', 'Market <em>insights</em>', 'Brand, category and listing-type analytics: ranking, percentiles, ROLLUP subtotals, correlations.') },
  watchlist: { title: 'Watchlist & Triggers', icon: 'watch', render: pageWatchlist },
  sql: { title: 'SQL Lab', icon: 'sql', render: pageSqlLab },
  devops: { title: 'DevOps Dashboard', icon: 'devops', render: pageDevops },
};

function buildNav() {
  const groups = [['Operations', ['devops']], ['Explore', ['overview', 'explorer']], ['Analyse', ['tracker', 'deals', 'market']], ['Database', ['watchlist', 'sql']]];
  $('#nav').innerHTML = groups.map(([g, items]) => `<div class="nav-label">${g}</div>` +
    items.map(k => `<a href="#/${k}" data-k="${k}">${icon(PAGES[k].icon)}<span>${PAGES[k].title}</span></a>`).join('')).join('');
}

/* ---- overview */
async function pageOverview(root) {
  root.innerHTML = `
    <div class="page-head"><div><h1>Track every price. <em>Know every deal.</em></h1>
    <p>An Amazon electronics price tracker built on PostgreSQL — ${'<span id="ovSub">loading…</span>'}</p></div></div>
    <div class="grid kpis" id="kpis">${'<div class="card skel" style="height:112px"></div>'.repeat(6)}</div>
    <div class="grid two">
      <div class="card span-2"><div class="card-head"><div><h2>Price index of the tracked basket</h2><div class="sub">Products seen on 2+ days, rebased to 100 on their first sighting</div></div><button class="sql-btn" data-sql="price_index_trend">${icon('sql')} SQL</button></div><div class="chart-box short"><canvas id="c_idx"></canvas></div></div>
      <div class="card"><div class="card-head"><div><h2>Products per category</h2><div class="sub">Distinct products in the latest catalog</div></div><button class="sql-btn" data-sql="category_summary">${icon('sql')} SQL</button></div><div class="chart-box tall"><canvas id="c_cat"></canvas></div></div>
      <div class="card"><div class="card-head"><div><h2>Price distribution</h2><div class="sub">Share of products by price band</div></div><button class="sql-btn" data-sql="price_ranges">${icon('sql')} SQL</button></div><div class="chart-box"><canvas id="c_price"></canvas></div></div>
      <div class="card"><div class="card-head"><div><h2>Discount depth</h2><div class="sub">Current price vs. list price</div></div><button class="sql-btn" data-sql="discount_distribution">${icon('sql')} SQL</button></div><div class="chart-box"><canvas id="c_disc"></canvas></div></div>
      <div class="card"><div class="card-head"><div><h2>Scrape coverage</h2><div class="sub">Price observations collected per day</div></div><button class="sql-btn" data-sql="tracking_coverage">${icon('sql')} SQL</button></div><div class="chart-box"><canvas id="c_cov"></canvas></div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-head"><div><h2>Biggest price drops right now</h2><div class="sub">First vs. last day observed · click a row for the full price history</div></div><button class="sql-btn" data-sql="top_price_drops">${icon('sql')} SQL</button></div><div id="ovDrops"></div></div>`;
  killCharts();
  const names = ['category_summary', 'price_ranges', 'discount_distribution', 'price_index_trend', 'tracking_coverage'];
  const [k, ...res] = await Promise.all([api('/api/kpis'), ...names.map(n => runQuery(n)), runQuery('top_price_drops', { limit: 8 })]);
  const R = Object.fromEntries(names.map((n, i) => [n, res[i]])); const drops = res[names.length];
  const x = k.kpis;
  $('#ovSub').textContent = `${F.int(x.observations)} price observations of ${F.int(x.products)} products across ${x.tracking_days} days (${F.day(x.first_day)} – ${F.dayY(x.last_day)}).`;
  const tiles = [
    ['box', 'Products tracked', F.int(x.products), `${x.categories} categories · ${x.brands} brands`],
    ['db', 'Price observations', F.int(x.observations), 'rows in the fact table'],
    ['cal', 'Tracking days', x.tracking_days, `${F.day(x.first_day)} → ${F.day(x.last_day)}`],
    ['swap', 'Products with price moves', F.int(x.products_with_price_moves), 'price changed while tracked'],
    ['tag', 'Average price', F.money(x.avg_price), `median ${F.money(x.median_price)}`],
    ['star', 'Avg rating · discount', `${x.avg_rating}★`, `${F.pct(x.avg_discount_on_sale)} avg discount when on sale`],
  ];
  $('#kpis').innerHTML = tiles.map(([ic, l, v, h]) => `<div class="card kpi fade-in"><div class="label">${icon(ic)}${l}</div><div class="value">${v}</div><div class="hint">${h}</div></div>`).join('');
  drawChart($('#c_idx'), R.price_index_trend.chart, R.price_index_trend.rows);
  drawChart($('#c_cat'), R.category_summary.chart, R.category_summary.rows);
  drawChart($('#c_price'), R.price_ranges.chart, R.price_ranges.rows);
  drawChart($('#c_disc'), R.discount_distribution.chart, R.discount_distribution.rows);
  const cov = R.tracking_coverage;
  drawChart($('#c_cov'), cov.chart, cov.rows);
  const t = renderTable(drops.columns, drops.rows);
  $('#ovDrops').innerHTML = t.html; t.bind(root);
  const lookup = { ...R, top_price_drops: drops };
  $$('[data-sql]', root).forEach(b => b.onclick = () => { const q = lookup[b.dataset.sql]; showSql(q.title, q.sql, q.ms, q.concepts); });
}

/* ---- group pages (Tracker / Deals / Market) */
const groupTab = {};
async function pageGroup(root, group, titleHtml, blurb) {
  await ensureMeta();
  const qs_ = QCATALOG.filter(q => q.group === group);
  const active = groupTab[group] && qs_.find(q => q.name === groupTab[group]) ? groupTab[group] : qs_[0].name;
  root.innerHTML = `<div class="page-head"><div><h1>${titleHtml}</h1><p>${esc(blurb)}</p></div></div>
    <div class="tabs" id="tabs">${qs_.map(q => `<button data-q="${q.name}" class="${q.name === active ? 'active' : ''}">${esc(q.title)}</button>`).join('')}</div>
    <div id="qvRoot"></div>`;
  const show = name => {
    groupTab[group] = name;
    $$('#tabs button', root).forEach(b => b.classList.toggle('active', b.dataset.q === name));
    killCharts();
    mountQueryView($('#qvRoot', root), qs_.find(q => q.name === name));
  };
  $$('#tabs button', root).forEach(b => b.onclick = () => show(b.dataset.q));
  show(active);
}

/* ---- explorer */
const EX = { q: '', category: '', brand: '', min_price: '', max_price: '', min_rating: '', min_discount: '', badge: '', sort: 'popular', page: 1,
  on_sale: false, coupon: false, in_stock: false, tracked: false, moved: false, sponsored: '' };

async function pageExplorer(root, params) {
  await ensureMeta();
  if (params.q != null) { EX.q = params.q; EX.page = 1; }
  root.innerHTML = `
    <div class="page-head"><div><h1>Product <em>Explorer</em></h1><p>Every filter below becomes a <code>WHERE</code> clause; sorting becomes <code>ORDER BY</code>; paging is <code>LIMIT/OFFSET</code>. Hit “View SQL” to see the exact query.</p></div></div>
    <div class="card filters">
      <div class="filter-grid">
        <div class="field wide"><label>Search title</label><input class="input" id="f_q" placeholder="e.g. sony headphones" value="${esc(EX.q)}"></div>
        <div class="field"><label>Category</label><select class="input" id="f_category"><option value="">All categories</option>${META.categories.map(c => `<option value="${c.id}">${esc(c.name)} (${F.int(c.n)})</option>`).join('')}</select></div>
        <div class="field"><label>Brand</label><select class="input" id="f_brand"><option value="">All brands</option>${META.brands.map(b => `<option value="${b.id}">${esc(b.name)} (${F.int(b.n)})</option>`).join('')}</select></div>
        <div class="field"><label>Min price $</label><input class="input" id="f_min_price" type="number" min="0" placeholder="0" value="${EX.min_price}"></div>
        <div class="field"><label>Max price $</label><input class="input" id="f_max_price" type="number" min="0" placeholder="any" value="${EX.max_price}"></div>
        <div class="field"><label>Min rating</label><select class="input" id="f_min_rating"><option value="">Any</option>${[3, 3.5, 4, 4.5].map(v => `<option value="${v}">${v}★ & up</option>`).join('')}</select></div>
        <div class="field"><label>Badge</label><select class="input" id="f_badge"><option value="">Any</option>${META.badges.filter(b => b.name !== 'None').map(b => `<option>${esc(b.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Sort by</label><select class="input" id="f_sort">
          <option value="popular">Most reviewed</option><option value="sales">Bought last month</option><option value="price_asc">Price: low → high</option><option value="price_desc">Price: high → low</option>
          <option value="discount">Biggest discount</option><option value="rating">Top rated</option><option value="drop">Biggest price drop</option><option value="volatile">Most volatile price</option></select></div>
      </div>
      <div class="toggle-row" id="toggles">
        ${[['on_sale', 'On sale'], ['coupon', 'Has coupon'], ['in_stock', 'In stock'], ['tracked', 'Price history (2+ days)'], ['moved', 'Price changed while tracked']].map(([k, t]) => `<span class="toggle" data-t="${k}">${t}</span>`).join('')}
        <span style="margin-left:auto;display:flex;gap:8px"><button class="btn sm" id="exReset">Reset</button><button class="sql-btn" id="exSql">${icon('sql')} View SQL</button></span>
      </div>
    </div>
    <div class="result-bar"><div id="exCount" class="sub"></div></div>
    <div id="exGrid" class="product-grid"></div>
    <div id="exPager" class="pager"></div>`;
  for (const k of ['category', 'brand', 'min_rating', 'badge', 'sort']) $('#f_' + k, root).value = EX[k];
  $$('#toggles [data-t]', root).forEach(t => t.classList.toggle('on', !!EX[t.dataset.t]));
  let lastSql = '';

  async function load() {
    const grid = $('#exGrid', root);
    grid.innerHTML = '<div class="skel" style="height:300px"></div>'.repeat(8);
    const p = { ...EX, min_discount: EX.on_sale ? 0.01 : '', coupon: EX.coupon ? 'yes' : '', in_stock: EX.in_stock ? 'yes' : '', tracked: EX.tracked ? 'yes' : '', moved: EX.moved ? 'yes' : '', page_size: 24 };
    delete p.on_sale;
    try {
      const r = await api('/api/products?' + qs(p));
      lastSql = r.sql;
      $('#exCount', root).innerHTML = `<b style="color:var(--text)">${F.int(r.total)}</b> products match · ${r.ms} ms`;
      grid.innerHTML = r.items.length ? r.items.map(productCard).join('') : '<div class="empty" style="grid-column:1/-1"><b>No products match</b>Loosen a filter or two.</div>';
      $$('.pcard', grid).forEach(c => c.onclick = () => openProduct(+c.dataset.pid));
      renderPager($('#exPager', root), r.page, Math.ceil(r.total / r.page_size));
    } catch (e) { grid.innerHTML = `<div class="err" style="grid-column:1/-1">${esc(e.message)}</div>`; }
  }
  const reload = () => { EX.page = 1; load(); };
  const bindInput = (id, key, ev = 'change') => $('#' + id, root).addEventListener(ev, e => { EX[key] = e.target.value; reload(); });
  $('#f_q', root).addEventListener('input', debounce(e => { EX.q = e.target.value; reload(); }, 300));
  ['category', 'brand', 'min_rating', 'badge', 'sort'].forEach(k => bindInput('f_' + k, k));
  ['min_price', 'max_price'].forEach(k => $('#f_' + k, root).addEventListener('input', debounce(e => { EX[k] = e.target.value; reload(); }, 400)));
  $$('#toggles [data-t]', root).forEach(t => t.onclick = () => { EX[t.dataset.t] = !EX[t.dataset.t]; t.classList.toggle('on'); reload(); });
  $('#exReset', root).onclick = () => { Object.assign(EX, { q: '', category: '', brand: '', min_price: '', max_price: '', min_rating: '', min_discount: '', badge: '', sort: 'popular', page: 1, on_sale: false, coupon: false, in_stock: false, tracked: false, moved: false }); pageExplorer(root, {}); };
  $('#exSql', root).onclick = () => showSql('Product Explorer query (built from your filters)', lastSql, null, ['Dynamic WHERE', 'COUNT(*) OVER ()', 'LEFT JOIN materialized views', 'LIMIT / OFFSET']);
  function renderPager(el, page, pages) {
    if (pages <= 1) { el.innerHTML = ''; return; }
    const set = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2].filter(n => n >= 1 && n <= pages));
    const nums = [...set].sort((a, b) => a - b);
    let h = `<button ${page === 1 ? 'disabled' : ''} data-p="${page - 1}">‹</button>`, prev = 0;
    for (const n of nums) { if (n - prev > 1) h += '<span class="sub">…</span>'; h += `<button class="${n === page ? 'active' : ''}" data-p="${n}">${n}</button>`; prev = n; }
    h += `<button ${page === pages ? 'disabled' : ''} data-p="${page + 1}">›</button>`;
    el.innerHTML = h;
    $$('button', el).forEach(b => b.onclick = () => { EX.page = +b.dataset.p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  load();
  if (params.open) openProduct(+params.open);      // deep link: #/explorer?open=<product_id>
}

function stars(r) { return r == null ? '' : `<span class="stars"><span class="stars-bar"><i style="width:${Math.max(0, Math.min(100, r / 5 * 100))}%"></i></span>${Number(r).toFixed(1)}</span>`; }
function productCard(p) {
  const tags = [];
  if (p.badge === 'Best Seller') tags.push('<span class="tag best">Best Seller</span>');
  else if (p.badge === "Amazon's Choice") tags.push('<span class="tag choice">Amazon’s Choice</span>');
  else if (p.badge === 'Limited Time Deal') tags.push('<span class="tag deal">Limited deal</span>');
  if (p.is_sponsored) tags.push('<span class="tag spons">Ad</span>');
  const moved = p.days_observed >= 2 && p.max_price > p.min_price;
  return `<button class="pcard fade-in" data-pid="${p.product_id}">
    <div class="pimg"><div class="tags">${tags.join('')}</div>${p.image_url ? `<img src="${esc(p.image_url)}" loading="lazy" alt="" onerror="this.style.opacity=.15">` : ''}</div>
    <div class="pbody">
      <div class="pbrand">${esc(p.brand)}</div>
      <div class="ptitle">${esc(p.title)}</div>
      <div class="pmeta">${stars(p.rating)}<span>${p.review_count != null ? F.compact(p.review_count) + ' reviews' : ''}</span></div>
      <div class="pprice"><b>${F.money(p.current_price)}</b>${p.discount_pct > 0 ? `<s>${F.money(p.list_price)}</s><span class="pill">−${Math.round(p.discount_pct)}%</span>` : ''}</div>
      <div class="pmeta"><span>${p.days_observed >= 2 ? (moved ? trendHtml(p.change_pct) + ' tracked' : `${p.days_observed} days · stable`) : '1 day seen'}</span>${p.coupon_type ? '<span class="chip warn">coupon</span>' : ''}</div>
    </div></button>`;
}

/* ---- product modal */
async function openProduct(pid) {
  const back = openModal(`<button class="icon-btn modal-close" data-close>${icon('close')}</button><div class="m-body" style="padding:60px 28px"><div class="skel" style="height:300px"></div></div>`);
  $('[data-close]', back).onclick = closeModal;
  try {
    const d = await api('/api/product/' + pid);
    const p = d.product, st = d.standing, hist = d.history;
    p.current_price = p.current_price ?? 0;
    const hasHist = p.days_observed >= 2;
    const lowest = p.min_price, highest = p.max_price;
    const sinceBest = lowest != null && p.current_price != null && lowest > 0 ? (p.current_price - lowest) / lowest * 100 : null;
    const watch = d.watch[0];
    $('.modal', back).innerHTML = `
      <button class="icon-btn modal-close" data-close>${icon('close')}</button>
      <div class="m-top">
        <div class="m-img">${p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : ''}</div>
        <div class="m-info">
          <div class="chips"><span class="chip accent">${esc(p.brand)}</span><span class="chip">${esc(p.category)}</span>
            ${p.badge !== 'None' ? `<span class="chip warn">${esc(p.badge)}</span>` : ''}${p.is_sponsored ? '<span class="chip">Sponsored</span>' : ''}
            ${p.coupon_type ? `<span class="chip good">Coupon ${p.coupon_type === 'percent' ? p.coupon_value + '%' : F.money(p.coupon_value)}</span>` : ''}
            ${!p.buy_box_available ? '<span class="chip bad">No buy box</span>' : ''}</div>
          <h1>${esc(p.title)}</h1>
          <div class="pmeta" style="justify-content:flex-start;gap:14px">${stars(p.rating)}<span>${p.review_count != null ? F.int(p.review_count) + ' reviews' : 'no reviews'}</span>${p.purchased_last_month ? `<span>🛒 ${F.int(p.purchased_last_month)}+ bought last month</span>` : ''}</div>
          <div class="m-price"><b>${F.money(p.current_price)}</b>${p.discount_pct > 0 ? `<s class="sub" style="font-size:16px">${F.money(p.list_price)}</s><span class="pill" style="font-size:13px">−${p.discount_pct}%</span>` : ''}</div>
          <div class="sub">ASIN <span class="mono">${esc(p.asin)}</span> · last seen ${F.dayY(p.last_seen)} · seen on ${p.days_seen} day${p.days_seen > 1 ? 's' : ''} (${F.int(p.obs_count)} sightings)</div>
          <div class="m-actions">
            <button class="btn primary" id="mWatch">${icon('watch')} Set price alert</button>
            ${p.page_url ? `<a class="btn" href="${esc(p.page_url)}" target="_blank" rel="noopener">${icon('ext')} View on Amazon</a>` : ''}
          </div>
        </div>
      </div>
      <div class="m-body">
        <div class="card" style="padding:16px 18px">
          <div class="card-head" style="margin-bottom:8px"><div><h2>Price history</h2><div class="sub">${hasHist ? `${p.days_observed} days tracked · ${F.day(p.first_day)} → ${F.day(p.last_day)}` : 'Only one day of data for this product'}</div></div>
            <button class="sql-btn" id="mSqlHist">${icon('sql')} SQL</button></div>
          ${hasHist ? '' : '<div class="note info" style="margin-bottom:10px">This product was only captured on one scrape day, so there is a single price point. Use <b>Simulate price change</b> below to see how the trigger and history react.</div>'}
          <div class="chart-box short"><canvas id="mChart"></canvas></div>
        </div>
        <div class="stat-row">
          <div class="stat"><div class="l">Lowest seen</div><div class="v" style="color:var(--good)">${F.money(lowest)}</div></div>
          <div class="stat"><div class="l">Highest seen</div><div class="v" style="color:var(--bad)">${F.money(highest)}</div></div>
          <div class="stat"><div class="l">Average</div><div class="v">${F.money(p.avg_price)}</div></div>
          <div class="stat"><div class="l">Change (first→last)</div><div class="v">${p.change_pct != null ? trendHtml(p.change_pct) : '—'}</div></div>
          <div class="stat"><div class="l">vs lowest</div><div class="v">${sinceBest != null ? (sinceBest < 0.05 ? '<span class="down">at low</span>' : '+' + sinceBest.toFixed(1) + '%') : '—'}</div></div>
          <div class="stat"><div class="l">Volatility σ</div><div class="v">${F.money(p.price_stddev)}</div></div>
        </div>
        ${st ? `<div class="card" style="padding:16px 18px"><div class="card-head" style="margin-bottom:10px"><div><h2>Standing in “${esc(st.category)}”</h2><div class="sub">PERCENT_RANK() and RANK() over ${F.int(st.category_size)} products</div></div><button class="sql-btn" id="mSqlStand">${icon('sql')} SQL</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div><div class="sub" style="margin-bottom:6px">Price percentile — cheaper than <b style="color:var(--text)">${(100 - st.price_percentile).toFixed(0)}%</b> of the category</div><div class="bar-track"><i style="width:${st.price_percentile}%"></i></div></div>
            <div><div class="sub" style="margin-bottom:6px">Popularity (by reviews)</div><div style="font-size:22px;font-weight:700">#${F.int(st.popularity_rank)} <span class="sub">of ${F.int(st.category_size)}</span></div></div>
          </div></div>` : ''}
        <div class="grid two" style="gap:14px">
          <div class="card" style="padding:16px 18px"><h2 style="margin-bottom:10px">Price alert</h2>
            <div id="mWatchState" class="sub" style="margin-bottom:10px">${watch ? `Alert set at <b style="color:var(--text)">${F.money(watch.target_price)}</b> ${p.current_price <= watch.target_price ? '— <span class="down">target reached!</span>' : ''}` : 'Get notified (in the event log) when the price falls to your target.'}</div>
            <div class="inline-form"><input class="input" id="mTarget" type="number" step="0.01" min="0.01" value="${(p.current_price * 0.9).toFixed(2)}"><button class="btn" id="mAddWatch">Add alert</button></div></div>
          <div class="card" style="padding:16px 18px"><h2 style="margin-bottom:10px">Simulate price change</h2>
            <div class="sub" style="margin-bottom:10px">Calls <span class="mono">fn_record_price()</span> → inserts an observation → <b>trigger</b> logs a price event.</div>
            <div class="inline-form"><input class="input" id="mNewPrice" type="number" step="0.01" min="0.01" value="${(p.current_price * 0.85).toFixed(2)}"><button class="btn" id="mSim">Apply</button></div></div>
        </div>
        ${d.events.length ? `<div class="card" style="padding:16px 18px"><h2 style="margin-bottom:6px">Trigger-logged events</h2>${d.events.map(e => `<div class="event-row"><span class="chip ${e.event_type === 'PRICE_DROP' ? 'good' : e.event_type === 'PRICE_HIKE' ? 'bad' : 'warn'}">${e.event_type.replace('_', ' ').toLowerCase()}</span><span class="et" style="cursor:default">${F.money(e.old_price)} → ${F.money(e.new_price)}</span>${trendHtml(e.change_pct)}<span class="sub">${e.created_at.slice(0, 16)}</span></div>`).join('')}</div>` : ''}
        ${d.similar.length ? `<div><div class="card-head"><div><h2>Similar products</h2><div class="sub">Same category, closest price</div></div><button class="sql-btn" id="mSqlSim">${icon('sql')} SQL</button></div>
          <div class="mini-grid">${d.similar.map(s => `<button class="mini" data-pid="${s.product_id}"><div class="mi">${s.image_url ? `<img src="${esc(s.image_url)}" loading="lazy">` : ''}</div><div class="mt">${esc(s.title)}</div><div><b>${F.money(s.current_price)}</b> <span class="sub">${s.rating ?? ''}★</span></div></button>`).join('')}</div></div>` : ''}
      </div>`;
    $('[data-close]', back).onclick = closeModal;
    drawHistory($('#mChart', back), hist, p);
    $('#mSqlHist', back).onclick = () => showSql('Price history of one product', d.sql.history, null, ['Materialized view', 'LAG()']);
    $('#mSqlStand', back)?.addEventListener('click', () => showSql('Product standing in category', d.sql.standing, null, ['PERCENT_RANK', 'RANK', 'PARTITION BY']));
    $('#mSqlSim', back)?.addEventListener('click', () => showSql('Similar products', d.sql.similar, null, ['CTE', 'ABS() distance']));
    $$('.mini', back).forEach(m => m.onclick = () => openProduct(+m.dataset.pid));
    $('#mWatch', back).onclick = () => $('#mTarget', back).focus();
    $('#mAddWatch', back).onclick = async () => {
      try { await api('/api/watchlist', { method: 'POST', body: { product_id: pid, target_price: +$('#mTarget', back).value } }); toast('Price alert added — see it on the Watchlist page'); openProduct(pid); }
      catch (e) { toast(esc(e.message), 'bad'); }
    };
    $('#mSim', back).onclick = async () => {
      const btn = $('#mSim', back); btn.disabled = true;
      try {
        const r = await api('/api/simulate/price', { method: 'POST', body: { product_id: pid, price: +$('#mNewPrice', back).value } });
        const kinds = r.events.slice(0, 2).map(e => e.event_type.replace('_', ' ').toLowerCase()).join(' + ');
        toast(`Price recorded. Trigger fired: <b>${kinds || 'no change'}</b>`);
        openProduct(pid);
      } catch (e) { toast(esc(e.message), 'bad'); btn.disabled = false; }
    };
  } catch (e) {
    $('.modal', back).innerHTML = `<button class="icon-btn modal-close" data-close>${icon('close')}</button><div class="m-body" style="padding:50px 28px"><div class="err">${esc(e.message)}</div></div>`;
    $('[data-close]', back).onclick = closeModal;
  }
}

function drawHistory(canvas, hist, p) {
  chartDefaults();
  const labels = hist.map(h => F.day(h.day));
  const accent = css('--accent'), good = css('--good'), bad = css('--bad');
  const ctx = canvas.getContext('2d');
  const single = hist.length === 1;
  const c = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Price', data: hist.map(h => h.close_price), borderColor: accent, borderWidth: 3, tension: .25, pointRadius: single ? 7 : 4.5, pointHoverRadius: 7, pointBackgroundColor: accent, fill: true, backgroundColor: gradient(ctx, 'transparent', accent + '44', false), order: 1 },
        { label: 'High of day', data: hist.map(h => h.max_price), borderColor: bad + '99', borderDash: [4, 4], borderWidth: 1.4, pointRadius: 0, tension: .25, order: 2, hidden: hist.every(h => h.max_price === h.close_price) },
        { label: 'Low of day', data: hist.map(h => h.min_price), borderColor: good + '99', borderDash: [4, 4], borderWidth: 1.4, pointRadius: 0, tension: .25, order: 3, hidden: hist.every(h => h.min_price === h.close_price) },
        { label: 'List price', data: hist.map(h => h.list_price), borderColor: css('--faint'), borderDash: [2, 5], borderWidth: 1.4, pointRadius: 0, tension: .25, order: 4, hidden: hist.every(h => h.list_price === h.close_price) },
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, boxHeight: 2, usePointStyle: false } },
        tooltip: { backgroundColor: css('--surface-3'), titleColor: css('--text'), bodyColor: css('--text'), borderColor: css('--line-strong'), borderWidth: 1, padding: 10, cornerRadius: 10,
          callbacks: { label: it => `${it.dataset.label}: ${F.money(it.parsed.y)}`, afterBody: it => { const h = hist[it[0].dataIndex]; return h.change_vs_prev != null ? `Δ vs prev day: ${h.change_vs_prev > 0 ? '+' : ''}${h.change_vs_prev}` : ''; } } } },
      scales: { x: { grid: { display: false }, border: { display: false } }, y: { grace: '12%', border: { display: false }, grid: { color: css('--line') }, ticks: { callback: v => '$' + v } } },
    },
  });
  modalCharts.push(c);
}

/* ---- watchlist + trigger lab */
async function pageWatchlist(root) {
  root.innerHTML = `
    <div class="page-head"><div><h1>Watchlist & <em>triggers</em></h1>
    <p>Add price alerts on any product. A PostgreSQL <b>trigger</b> fires on every new price observation, writes price drops / hikes / target hits into <span class="mono">price_events</span>, and the <span class="mono">fn_simulate_market()</span> function lets you demo it live.</p></div></div>
    <div class="grid two">
      <div class="card"><div class="card-head"><div><h2>Your price alerts</h2><div class="sub">View <span class="mono">v_watchlist</span> joined live to the latest prices</div></div><button class="sql-btn" id="wSql">${icon('sql')} SQL</button></div><div id="wList"></div></div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card"><div class="card-head"><div><h2>Trigger lab</h2><div class="sub">Generate a day of price movement and watch the event log fill</div></div></div>
          <div class="inline-form">
            <select class="input" id="simN" style="width:150px"><option value="25">25 products</option><option value="100" selected>100 products</option><option value="300">300 products</option><option value="1000">1000 products</option></select>
            <button class="btn primary" id="simGo">${icon('bolt')} Simulate market day</button>
            <button class="btn danger" id="simReset">${icon('trash')} Reset simulation</button>
          </div>
          <div class="note info" style="margin-top:12px">Random prices move −25% … +10%. Rows are stored as <span class="mono">source='simulated'</span> on the day after the last scrape and removed by <span class="mono">fn_reset_simulation()</span>; the real data is never touched.</div></div>
        <div class="card"><div class="card-head"><div><h2>Event log</h2><div class="sub">Written automatically by <span class="mono">trg_price_event</span></div></div><button class="sql-btn" id="eSql">${icon('sql')} SQL</button></div><div id="eList"></div></div>
      </div>
    </div>`;
  let wsql = '', esql = '', events = null;
  async function load() {
    const [w, e] = await Promise.all([api('/api/watchlist'), runQuery('recent_price_events', { limit: 25 })]);
    wsql = w.sql; esql = e; events = e;
    $('#wList', root).innerHTML = w.items.length ? w.items.map(i => `
      <div class="watch-item"><div class="wi" data-pid="${i.product_id}">${i.image_url ? `<img src="${esc(i.image_url)}">` : ''}</div>
        <div style="min-width:0"><div class="wt" data-pid="${i.product_id}">${esc(i.title)}</div>
          <div class="nums"><span>now <b>${F.money(i.current_price)}</b></span><span>target <b>${F.money(i.target_price)}</b></span><span>${i.target_reached ? '<span class="chip good">target reached</span>' : `<span class="chip">${F.money(i.gap)} to go (${F.pct(i.gap_pct)})</span>`}</span></div></div>
        <button class="btn sm danger" data-del="${i.watch_id}">${icon('trash')}</button></div>`).join('')
      : '<div class="empty"><b>No alerts yet</b>Open any product and use “Set price alert”.</div>';
    $$('[data-pid]', $('#wList', root)).forEach(el => el.onclick = () => openProduct(+el.dataset.pid));
    $$('[data-del]', root).forEach(b => b.onclick = async () => { await api('/api/watchlist/' + b.dataset.del, { method: 'DELETE' }); load(); });
    $('#eList', root).innerHTML = e.rows.length ? e.rows.map(r => `<div class="event-row"><span class="chip ${r.event_type === 'PRICE_DROP' ? 'good' : r.event_type === 'PRICE_HIKE' ? 'bad' : 'warn'}">${r.event_type.replace('_', ' ').toLowerCase()}</span><span class="et" data-pid="${r.product_id}">${esc(r.title)}</span><span class="num">${F.money(r.old_price)} → ${F.money(r.new_price)}</span>${trendHtml(r.change_pct)}</div>`).join('')
      : '<div class="empty"><b>No events yet</b>Run “Simulate market day” or change a product’s price.</div>';
    $$('#eList [data-pid]', root).forEach(el => el.onclick = () => openProduct(+el.dataset.pid));
  }
  $('#wSql', root).onclick = () => showSql('Watchlist view', wsql, null, ['VIEW', 'JOIN materialized view']);
  $('#eSql', root).onclick = () => showSql(esql.title, esql.sql, esql.ms, esql.concepts);
  $('#simGo', root).onclick = async () => {
    const b = $('#simGo', root); b.disabled = true; b.innerHTML = '<span class="spin"></span> Simulating…';
    try { const r = await api('/api/simulate/market', { method: 'POST', body: { n: +$('#simN', root).value } }); toast(`Updated <b>${r.updated}</b> prices — trigger logged the events`); META = null; await load(); }
    catch (e) { toast(esc(e.message), 'bad'); }
    b.disabled = false; b.innerHTML = `${icon('bolt')} Simulate market day`;
  };
  $('#simReset', root).onclick = async () => { const r = await api('/api/simulate/reset', { method: 'POST', body: {} }); toast(`Removed ${r.removed} simulated snapshots`); META = null; load(); };
  load();
}

/* ---- SQL lab */
async function pageSqlLab(root) {
  await ensureMeta();
  const [schema, cat] = await Promise.all([api('/api/schema'), api('/api/queries')]);
  root.innerHTML = `
    <div class="page-head"><div><h1>SQL <em>Lab</em></h1><p>Write your own queries against the live database. Runs as a read-only role (<span class="mono">pt_readonly</span>) inside a <span class="mono">READ ONLY</span> transaction with an 8 s timeout.</p></div></div>
    <div class="lab">
      <div class="card schema" id="schema"></div>
      <div>
        <textarea class="editor" id="sqlIn" spellcheck="false">SELECT category, COUNT(*) AS products, ROUND(AVG(current_price), 2) AS avg_price
FROM mv_catalog
GROUP BY category
ORDER BY avg_price DESC;</textarea>
        <div class="lab-bar">
          <button class="btn primary" id="runSql">${icon('play')} Run <span class="sub" style="color:#fff9">Ctrl+Enter</span></button>
          <button class="btn" id="explainSql">EXPLAIN ANALYZE</button>
          <select class="input" id="examples"><option value="">Load an example from the query library…</option>${cat.map(q => `<option value="${q.name}">${esc(q.group)} · ${esc(q.title)}</option>`).join('')}</select>
          <span class="sub" id="labMeta"></span>
        </div>
        <div id="labOut"></div>
      </div>
    </div>`;
  const ed = $('#sqlIn', root), out = $('#labOut', root);
  const tbls = schema.tables;
  $('#schema', root).innerHTML = ['table', 'materialized view', 'view'].map(kind => {
    const list = tbls.filter(t => t.kind === kind); if (!list.length) return '';
    return `<h4>${kind}s</h4>` + list.map(t => `<details><summary><span style="color:var(--accent)">▸</span>${esc(t.name)}${t.kind !== 'table' ? '' : ''}<span class="rows">${t.rows > 0 ? F.compact(t.rows) : ''}</span></summary>
      ${t.columns.map(c => `<div class="col" data-ins="${esc(c.name)}">${esc(c.name)}${c.pk ? ' <b>PK</b>' : ''}${c.fk ? ` <b title="→ ${esc(c.fk)}">FK</b>` : ''}<span class="t">${esc(c.type)}</span></div>`).join('')}
      <div class="col" data-sel="${esc(t.name)}" style="color:var(--accent)">SELECT * FROM ${esc(t.name)} …</div></details>`).join('');
  }).join('') + `<h4>functions & triggers</h4>` + schema.functions.map(f => `<div class="col" style="cursor:default">${esc(f.name)}<span class="t">${f.kind === 'trigger function' ? 'trigger' : 'fn'}</span></div>`).join('');
  $$('[data-ins]', root).forEach(el => el.onclick = () => insertAtCursor(ed, el.dataset.ins));
  $$('[data-sel]', root).forEach(el => el.onclick = () => { ed.value = `SELECT * FROM ${el.dataset.sel} LIMIT 20;`; });
  function insertAtCursor(t, s) { const a = t.selectionStart, b = t.selectionEnd; t.value = t.value.slice(0, a) + s + t.value.slice(b); t.focus(); t.selectionStart = t.selectionEnd = a + s.length; }
  ed.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); insertAtCursor(ed, '    '); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(false); }
  });
  async function run(explain) {
    out.innerHTML = '<div class="skel" style="height:140px"></div>'; $('#labMeta', root).textContent = '';
    try {
      const r = await api('/api/sql', { method: 'POST', body: { sql: ed.value, explain } });
      $('#labMeta', root).textContent = `${r.rowcount}${r.truncated ? '+' : ''} rows · ${r.ms} ms`;
      if (r.columns.length === 1 && /QUERY PLAN/i.test(r.columns[0])) out.innerHTML = `<pre class="plan">${esc(r.rows.map(x => x[0]).join('\n'))}</pre>`;
      else {
        const t = renderTable(r.columns, r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c + (r.columns.indexOf(c) !== i ? '_' + i : ''), row[i]]))), { onRowClick: false, showIds: true });
        out.innerHTML = r.rows.length ? t.html : '<div class="empty"><b>0 rows</b></div>'; t.bind(out);
      }
    } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }
  $('#runSql', root).onclick = () => run(false);
  $('#explainSql', root).onclick = () => run(true);
  $('#examples', root).onchange = async e => {
    if (!e.target.value) return;
    const q = await api('/api/querysql/' + e.target.value);
    let sql = q.sql;
    for (const p of q.params) sql = sql.replaceAll(`%(${p.name})s`, p.default);
    ed.value = `-- ${q.title}\n-- ${q.description}\n${sql};`;
    e.target.value = '';
  };
}

/* ---- devops dashboard */
const PIPELINE = [
  ['Code', 'Git + GitHub', 'Every change is a tracked commit'],
  ['Test', 'pytest + ruff', 'App is tested against real PostgreSQL'],
  ['Build', 'Docker', 'Multi-stage build makes one small image'],
  ['Scan', 'Trivy', 'Image is checked for known vulnerabilities'],
  ['Publish', 'GHCR', 'Image is stored in a container registry'],
  ['Deploy', 'Kubernetes', 'Rolling update with no downtime'],
  ['Monitor', 'Probes + /metrics', 'Health checks and Prometheus metrics'],
];
const TEAM = [['E007', 'Aayush Nayak'], ['E008', 'Ritwik Shetty'], ['E037', 'Iram Shaikh']];
const fmtAge = s => s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : s < 86400 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : `${Math.floor(s / 86400)}d ${Math.floor(s % 86400 / 3600)}h`;
let devopsTimer = null;

function podsHtml(s) {
  if (s.pods_error) return `<div class="err">${esc(s.pods_error)}</div>`;
  if (!s.pods) return `<p class="sub">Live pod data appears when PriceScope runs on Kubernetes. It is currently running on <b>${esc(s.environment)}</b>.</p>`;
  return `<div class="table-wrap"><table class="data"><thead><tr><th>Pod</th><th>Role</th><th>Status</th><th class="r">Ready</th><th class="r">Restarts</th><th class="r">Age</th><th>Image</th></tr></thead><tbody>
    ${s.pods.map(p => {
    const ok = p.phase === 'Succeeded' || (p.phase === 'Running' && p.ready === p.containers);
    return `<tr class="${p.name === s.host ? 'this-pod' : ''}"><td class="mono">${esc(p.name)}${p.name === s.host ? ' <span class="chip accent">serving you</span>' : ''}</td><td>${esc(p.component)}</td><td><span class="chip ${ok ? 'good' : 'warn'}">${p.phase === 'Succeeded' ? 'Completed' : esc(p.phase)}</span></td><td class="r">${p.ready}/${p.containers}</td><td class="r">${p.restarts}</td><td class="r">${fmtAge(p.age_s)}</td><td class="mono">${esc(p.image)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderDevops(s) {
  const tiles = [
    ['server', 'Running on', s.environment, s.namespace ? `namespace ${s.namespace}` : 'single host'],
    ['box', 'Image version', s.version, `commit ${s.git_sha.slice(0, 7)}`],
    ['clock', 'Uptime', fmtAge(s.uptime_s), 'of the instance serving you'],
    ['db', 'Database', s.db.ok ? 'Healthy' : 'Down', s.db.ok ? `${s.db.ms} ms · ${s.db.size}` : 'not reachable'],
    ['pulse', 'Requests served', F.int(s.traffic.requests), `${s.traffic.server_errors} server errors`],
    ['devops', 'Pods running', s.pods ? s.pods.filter(p => p.phase === 'Running').length : '—', s.pods ? `in ${s.namespace}` : 'Kubernetes only'],
  ];
  $('#doKpis').innerHTML = tiles.map(([ic, l, v, h]) => `<div class="card kpi"><div class="label">${icon(ic)}${l}</div><div class="value do-value">${esc(v)}</div><div class="hint">${esc(h)}</div></div>`).join('');
  $('#doPods').innerHTML = podsHtml(s);
  $('#doServed').textContent = s.host;
  $('#doRuntime').innerHTML = [['Instance', s.host], ['Node', s.node || '—'], ['Build time', s.build_time], ['Python', s.python], ['PostgreSQL', s.db.version || '—'], ['DB connections', s.db.connections ?? '—']]
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b class="mono">${esc(v)}</b></div>`).join('');
}

async function pageDevops(root) {
  root.innerHTML = `
    <div class="page-head"><div><h1>DevOps <em>dashboard</em></h1>
    <p>How PriceScope is built, shipped and kept running. These numbers are live and refresh every 5 seconds. This page was served by <b class="mono" id="doServed">…</b></p></div></div>
    <div class="grid kpis" id="doKpis">${'<div class="card skel" style="height:112px"></div>'.repeat(6)}</div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>CI/CD pipeline</h2><div class="sub">The path every change takes, defined in .github/workflows/ci-cd.yml and k8s/</div></div></div>
      <div class="pipeline">${PIPELINE.map(([n, t, d], i) => `<div class="stage"><div class="stage-num">${i + 1}</div><b>${n}</b><span class="stage-tool">${t}</span><small>${d}</small></div>`).join('')}</div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>Live cluster</h2><div class="sub">Read from the Kubernetes API using the app's limited service account</div></div></div><div id="doPods"></div></div>
    <div class="grid three">
      <div class="card"><div class="card-head"><div><h2>Runtime</h2><div class="sub">Where this instance is running</div></div></div><div id="doRuntime"></div></div>
      <div class="card"><div class="card-head"><div><h2>Health endpoints</h2><div class="sub">What Kubernetes and monitoring tools call</div></div></div>
        <div class="kv"><span>Liveness: is it alive?</span><a class="mono" href="/healthz" target="_blank">/healthz</a></div>
        <div class="kv"><span>Readiness: can it serve?</span><a class="mono" href="/readyz" target="_blank">/readyz</a></div>
        <div class="kv"><span>Prometheus metrics</span><a class="mono" href="/metrics" target="_blank">/metrics</a></div></div>
      <div class="card"><div class="card-head"><div><h2>Team</h2><div class="sub">BTI DS · Semester 11 · DevOps Project</div></div></div>
        ${TEAM.map(([id, n]) => `<div class="kv"><span class="mono">${id}</span><b>${n}</b></div>`).join('')}</div>
    </div>`;
  const refresh = async () => {
    const s = await api('/api/devops/status');
    if ($('#doKpis')) renderDevops(s);
  };
  await refresh();
  devopsTimer = setInterval(() => refresh().catch(() => { }), 5000);
}

/* ---- top bar status + shutdown */
let lastStatus = null;
async function refreshStatus() {
  const pill = $('#statusPill');
  try {
    const s = lastStatus = await api('/api/devops/status');
    pill.className = `status-pill ${s.db.ok ? 'ok' : 'down'}`;
    $('span', pill).textContent = `${s.environment} · ${s.db.ok ? 'Healthy' : 'DB down'}`;
    pill.title = `Served by ${s.host}. Open the DevOps page.`;
    $('#sideEnv').textContent = `${s.environment} · v${s.version}`;
    const btn = $('#shutdownBtn');
    btn.hidden = !s.shutdown_enabled;
    btn.innerHTML = `${icon('power')} Shutdown`;
  } catch {
    pill.className = 'status-pill down';
    $('span', pill).textContent = 'Server unreachable';
  }
}

function confirmShutdown() {
  const env = lastStatus?.environment;
  const effect = env === 'Kubernetes' ? 'This scales the app to 0 pods, so it stops for everyone. The database keeps running.'
    : env === 'Docker Compose' ? 'This stops the app container. The database container keeps running.'
      : 'This stops the Python server process.';
  const m = openModal(`
    <div class="m-body" style="padding-top:26px">
      <div><div class="sub">${esc(env || 'Server')}</div><h2 style="font-size:19px;margin-top:2px">Shut down PriceScope?</h2></div>
      <p class="sub" style="font-size:14px;margin:0">${effect}</p>
      <div class="chips"><button class="btn danger" id="confirmStop">${icon('power')} Yes, shut down</button><button class="btn" data-close>Cancel</button></div>
    </div>`, 'narrow');
  $('[data-close]', m).onclick = closeModal;
  $('#confirmStop', m).onclick = async e => {
    e.currentTarget.disabled = true;
    try {
      const r = await api('/api/admin/shutdown', { method: 'POST', headers: { 'X-PriceScope-Action': 'shutdown' } });
      showStopped(r.restart_hint);
    } catch (err) {
      closeModal();
      toast(esc(err.message), 'bad');
    }
  };
}

function showStopped(hint) {
  clearInterval(devopsTimer);
  clearInterval(statusTimer);
  closeModal();
  const el = document.createElement('div');
  el.className = 'stopped-screen';
  el.innerHTML = `<div class="stopped-card"><div class="stopped-ico">${icon('power')}</div>
    <h1>PriceScope has stopped</h1><p class="sub">Run this command to start it again, then reload this page.</p>
    <pre class="sqlblock">${esc(hint)}</pre>
    <div class="chips" style="justify-content:center"><button class="btn sm" id="copyHint">Copy command</button><button class="btn sm primary" id="reloadPage">Reload page</button></div></div>`;
  document.body.appendChild(el);
  $('#copyHint', el).onclick = () => { navigator.clipboard?.writeText(hint); toast('Command copied'); };
  $('#reloadPage', el).onclick = () => location.reload();
}

/* ------------------------------------------------------------------ router + shell */
const view = $('#view');
let statusTimer = null;
async function route() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const key = PAGES[path] ? path : 'overview';
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.k === key));
  document.title = `${PAGES[key].title} · PriceScope`;
  document.body.classList.remove('nav-open');
  clearInterval(devopsTimer);
  killCharts();
  closeModal();
  view.innerHTML = '<div class="skel" style="height:50vh"></div>';
  try { await PAGES[key].render(view, Object.fromEntries(new URLSearchParams(query))); }
  catch (e) { view.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch { /* private mode */ }
  $('#themeBtn').innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
}

function initShell() {
  buildNav();
  $('#menuBtn').innerHTML = icon('menu');
  $('#searchIco').innerHTML = icon('explore');
  setTheme(document.documentElement.dataset.theme || 'dark');
  $('#themeBtn').onclick = () => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); route(); };
  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#scrim').onclick = () => document.body.classList.remove('nav-open');

  const input = $('#globalSearch'), box = $('#suggest');
  let items = [], hl = -1;
  const hide = () => { box.hidden = true; hl = -1; };
  input.addEventListener('input', debounce(async () => {
    const v = input.value.trim();
    if (v.length < 2) return hide();
    try { items = await api('/api/suggest?q=' + encodeURIComponent(v)); } catch { return; }
    if (!items.length) return hide();
    box.innerHTML = items.map((s, i) => `<button data-i="${i}">${s.image_url ? `<img src="${esc(s.image_url)}">` : '<span style="width:36px"></span>'}<span class="s-title">${esc(s.title)}</span><span class="s-price">${F.money(s.current_price)}</span></button>`).join('');
    box.hidden = false;
    $$('button', box).forEach(b => b.onmousedown = e => { e.preventDefault(); hide(); openProduct(items[+b.dataset.i].product_id); });
  }, 180));
  input.addEventListener('keydown', e => {
    const btns = $$('button', box);
    if (e.key === 'ArrowDown' && btns.length) { hl = (hl + 1) % btns.length; e.preventDefault(); }
    else if (e.key === 'ArrowUp' && btns.length) { hl = (hl - 1 + btns.length) % btns.length; e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (hl >= 0 && btns[hl]) { hide(); openProduct(items[hl].product_id); }
      else { hide(); EX.q = input.value.trim(); EX.page = 1; if (location.hash.startsWith('#/explorer')) pageExplorer(view, {}); else location.hash = '#/explorer'; }
      return;
    } else if (e.key === 'Escape') return hide();
    btns.forEach((b, i) => b.classList.toggle('hl', i === hl));
  });
  input.addEventListener('blur', () => setTimeout(hide, 120));
  window.addEventListener('hashchange', route);
  api('/api/meta').then(m => { META = m; if (m.version) $('#pgver').textContent = m.version; }).catch(() => { });
  $('#shutdownBtn').onclick = confirmShutdown;
  refreshStatus();
  statusTimer = setInterval(refreshStatus, 15000);
}

initShell();
route();
