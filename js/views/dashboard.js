import { fetchDashboard } from '../api.js';

export async function renderDashboard(container) {
  container.innerHTML = '<p class="muted">Loading dashboard...</p>';

  let data;
  try {
    data = await fetchDashboard();
  } catch (err) {
    container.innerHTML = `<div class="card error"><h2>Could not load dashboard</h2><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const { employeeCount, categoryCount, periodCount, periodTotals } = data;
  const latest = periodTotals.length ? periodTotals[periodTotals.length - 1] : null;

  container.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-tile">
        <div class="kpi-label">Active Employees</div>
        <div class="kpi-value">${employeeCount}</div>
      </div>
      <div class="kpi-tile">
        <div class="kpi-label">Pay Categories</div>
        <div class="kpi-value">${categoryCount}</div>
      </div>
      <div class="kpi-tile">
        <div class="kpi-label">Periods Run</div>
        <div class="kpi-value">${periodCount}</div>
      </div>
      <div class="kpi-tile">
        <div class="kpi-label">Latest Net Pay</div>
        <div class="kpi-value">${latest ? money(latest.TotalNetPay) : '—'}</div>
        <div class="kpi-sub">${latest ? escapeHtml(latest.Label) : 'No payroll run yet'}</div>
      </div>
    </div>
    <div class="card">
      <h2>Net Pay Trend</h2>
      <div class="desc">Total net pay per period, from payroll actually run in this system (Run Payroll tab).</div>
      ${periodTotals.length >= 2
        ? `<div class="trend-wrap">${trendSVG(periodTotals)}</div>`
        : `<p class="muted" style="margin-top:12px">Run payroll for at least two periods to see a trend here. ${periodTotals.length === 1 ? `So far: <strong>${escapeHtml(periodTotals[0].Label)}</strong> — ${money(periodTotals[0].TotalNetPay)}.` : ''}</p>`}
    </div>
  `;
}

function money(v) {
  const n = Number(v) || 0;
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s === undefined || s === null ? '' : String(s);
  return div.innerHTML;
}

// A small, dependency-free line chart. Kept intentionally simple (one series, no
// external charting library) since this is a single embedded trend, not a full report.
function trendSVG(points) {
  const W = 640, H = 220, PAD = 36;
  const values = points.map((p) => p.TotalNetPay);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const x = (i) => PAD + (i * (W - 2 * PAD)) / Math.max(points.length - 1, 1);
  const y = (v) => H - PAD - ((v - min) / range) * (H - 2 * PAD);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.TotalNetPay).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z`;

  const dots = points.map((p, i) => `
    <circle cx="${x(i).toFixed(1)}" cy="${y(p.TotalNetPay).toFixed(1)}" r="4" fill="#1f6f4a" stroke="white" stroke-width="1.5">
      <title>${escapeHtml(p.Label)}: ${money(p.TotalNetPay)}</title>
    </circle>`).join('');

  const labels = points.map((p, i) => `
    <text x="${x(i).toFixed(1)}" y="${H - 10}" font-size="10" fill="#6b746c" text-anchor="middle">${escapeHtml(shortLabel(p.Label))}</text>`).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net pay trend" style="width:100%;height:auto;max-width:${W}px">
      <path d="${areaPath}" fill="#1f6f4a" opacity="0.08" />
      <path d="${linePath}" fill="none" stroke="#1f6f4a" stroke-width="2" />
      ${dots}
      ${labels}
    </svg>
  `;
}

function shortLabel(label) {
  return String(label).length > 10 ? String(label).slice(0, 10) + '…' : String(label);
}
