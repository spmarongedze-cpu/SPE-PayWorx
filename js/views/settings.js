import { getConfig, setConfig, apiGet, apiPost, isConfigured } from '../api.js';
import { state, loadBootstrap } from '../store.js';

export function renderSettings(container) {
  const { url, token } = getConfig();

  container.innerHTML = `
    <div class="card">
      <h2>Connection</h2>
      <p class="muted">Paste in the Web App URL and API token from your Apps Script deployment (see the README for setup steps).</p>
      <label>Web App URL</label>
      <input id="s-url" type="text" placeholder="https://script.google.com/macros/s/.../exec" value="${escapeAttr(url)}" />
      <label>API Token</label>
      <input id="s-token" type="text" placeholder="paste the token logged by the SETUP function" value="${escapeAttr(token)}" />
      <button id="s-connect">Save & Connect</button>
      <span id="s-connect-status" class="muted"></span>
    </div>
    <div id="s-rates-wrap"></div>
  `;

  document.getElementById('s-connect').addEventListener('click', async () => {
    const newUrl = document.getElementById('s-url').value;
    const newToken = document.getElementById('s-token').value;
    setConfig(newUrl, newToken);
    const statusEl = document.getElementById('s-connect-status');
    statusEl.textContent = 'Connecting...';
    try {
      await loadBootstrap();
      statusEl.textContent = 'Connected.';
      renderRateSettings(document.getElementById('s-rates-wrap'));
    } catch (err) {
      statusEl.textContent = 'Failed: ' + err.message;
    }
  });

  if (isConfigured() && state.loaded) {
    renderRateSettings(document.getElementById('s-rates-wrap'));
  }
}

function renderRateSettings(container) {
  const s = state.settings;
  container.innerHTML = `
    <div class="card">
      <h2>Payroll Constants</h2>
      <div class="grid-2">
        <div><label>Working days per month</label><input id="r-days" type="number" step="1" value="${num(s.WorkingDaysPerMonth, 26)}" /></div>
        <div><label>Hours per month (overtime base)</label><input id="r-hours" type="number" step="1" value="${num(s.HoursPerMonth, 234)}" /></div>
        <div><label>NSSA employee rate (e.g. 0.045 = 4.5%)</label><input id="r-nssa-rate" type="number" step="0.001" value="${num(s.NSSA_EmployeeRate, 0.045)}" /></div>
        <div><label>NSSA insurable earnings ceiling ($/month)</label><input id="r-nssa-ceiling" type="number" step="1" value="${num(s.NSSA_Ceiling, 700)}" /></div>
        <div><label>NEC subscription rate (e.g. 0.015 = 1.5%)</label><input id="r-nec-rate" type="number" step="0.001" value="${num(s.NEC_DefaultRate, 0.015)}" /></div>
        <div><label>AIDS levy rate (e.g. 0.03 = 3%)</label><input id="r-aids-rate" type="number" step="0.001" value="${num(s.AidsLevyRate, 0.03)}" /></div>
      </div>
      <button id="r-save">Save Constants</button>
      <span id="r-save-status" class="muted"></span>
      <p class="muted">NSSA's ceiling is gazetted quarterly and NEC subscription rates can vary by industrial council agreement - check both periodically with your auditors.</p>
    </div>

    <div class="card">
      <h2>PAYE Tax Bands (monthly, USD)</h2>
      <p class="muted">From ZIMRA's official table. Formula per band: tax = income &times; Rate &minus; Deduct, then + AIDS levy on the tax.</p>
      <table id="paye-table">
        <thead><tr><th>Lower</th><th>Upper</th><th>Rate</th><th>Deduct</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
      <button id="paye-add-row">+ Add band</button>
      <button id="paye-save">Save PAYE Bands</button>
      <span id="paye-save-status" class="muted"></span>
    </div>
  `;

  document.getElementById('r-save').addEventListener('click', async () => {
    const statusEl = document.getElementById('r-save-status');
    statusEl.textContent = 'Saving...';
    const payload = [
      { Key: 'WorkingDaysPerMonth', Value: document.getElementById('r-days').value },
      { Key: 'HoursPerMonth', Value: document.getElementById('r-hours').value },
      { Key: 'NSSA_EmployeeRate', Value: document.getElementById('r-nssa-rate').value },
      { Key: 'NSSA_Ceiling', Value: document.getElementById('r-nssa-ceiling').value },
      { Key: 'NEC_DefaultRate', Value: document.getElementById('r-nec-rate').value },
      { Key: 'AidsLevyRate', Value: document.getElementById('r-aids-rate').value }
    ];
    try {
      await apiPost('saveSettings', payload);
      await loadBootstrap();
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = 'Failed: ' + err.message;
    }
  });

  const tbody = document.querySelector('#paye-table tbody');
  function addBandRow(band = { Lower: '', Upper: '', Rate: '', Deduct: '' }) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" step="0.01" class="pb-lower" value="${num(band.Lower, '')}" /></td>
      <td><input type="number" step="0.01" class="pb-upper" value="${num(band.Upper, '')}" /></td>
      <td><input type="number" step="0.001" class="pb-rate" value="${num(band.Rate, '')}" /></td>
      <td><input type="number" step="0.01" class="pb-deduct" value="${num(band.Deduct, '')}" /></td>
      <td><button class="pb-remove secondary">Remove</button></td>
    `;
    tr.querySelector('.pb-remove').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  }
  (state.payeBands.length ? state.payeBands : []).forEach(addBandRow);
  document.getElementById('paye-add-row').addEventListener('click', () => addBandRow());

  document.getElementById('paye-save').addEventListener('click', async () => {
    const statusEl = document.getElementById('paye-save-status');
    const rows = [...tbody.querySelectorAll('tr')].map((tr) => ({
      Lower: parseFloat(tr.querySelector('.pb-lower').value) || 0,
      Upper: parseFloat(tr.querySelector('.pb-upper').value) || 0,
      Rate: parseFloat(tr.querySelector('.pb-rate').value) || 0,
      Deduct: parseFloat(tr.querySelector('.pb-deduct').value) || 0
    }));
    statusEl.textContent = 'Saving...';
    try {
      await apiPost('savePayeBands', rows);
      await loadBootstrap();
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = 'Failed: ' + err.message;
    }
  });
}

function num(v, fallback) {
  return (v === undefined || v === null || v === '') ? fallback : v;
}
function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}
