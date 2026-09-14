import { apiGet, apiPost, bulkSaveEntriesMulti } from '../api.js';
import { state, activeEmployees } from '../store.js';
import { renderPeriodPicker } from './periodPicker.js';
import { writeSimpleXlsx, readSimpleXlsx } from '../xlsxlite.js';

export function renderEntry(container) {
  container.innerHTML = `
    <div class="card">
      <h2>Data Entry</h2>
      <p class="muted">Enter days worked, weights, pockets and overtime hours for each worker for the selected period. Leave a cell blank/zero if a category doesn't apply.</p>
      <div id="entry-period"></div>
      <div style="margin-top:10px">
        <label>Filter by payroll group</label>
        <select id="entry-group-filter"><option value="">-- all groups --</option>${state.payGroups.map((g) => `<option>${g.GroupName}</option>`).join('')}</select>
        <input id="entry-search" type="text" placeholder="Search name..." style="width:200px" />
      </div>
    </div>
    <div class="card">
      <h2>Bulk Upload</h2>
      <p class="muted">Download a spreadsheet pre-filled with this period's workers and pay categories, fill it in Excel, then upload it back to import everyone at once instead of typing row by row.</p>
      <div class="row-between" style="flex-wrap:wrap;gap:10px">
        <button id="bulk-download" class="secondary">Download Template (.xlsx)</button>
        <label class="file-btn secondary">
          Upload Completed Template
          <input id="bulk-upload-input" type="file" accept=".xlsx" style="display:none" />
        </label>
      </div>
      <div id="bulk-status" style="margin-top:10px"></div>
    </div>
    <div id="entry-table-wrap"></div>
  `;

  let currentPeriodId = null;
  let entriesByEmployee = {}; // { employeeId: { categoryKey: quantity } }

  renderPeriodPicker(document.getElementById('entry-period'), async (periodId) => {
    currentPeriodId = periodId;
    await loadAndDraw();
  });

  document.getElementById('entry-group-filter').addEventListener('change', drawTable);
  document.getElementById('entry-search').addEventListener('input', drawTable);
  document.getElementById('bulk-download').addEventListener('click', downloadTemplate);
  document.getElementById('bulk-upload-input').addEventListener('change', handleUpload);

  async function loadAndDraw() {
    document.getElementById('entry-table-wrap').innerHTML = '<p class="muted">Loading entries...</p>';
    const entries = await apiGet('entries', { periodId: currentPeriodId });
    entriesByEmployee = {};
    entries.forEach((e) => {
      if (!entriesByEmployee[e.EmployeeID]) entriesByEmployee[e.EmployeeID] = {};
      entriesByEmployee[e.EmployeeID][e.CategoryKey] = e.Quantity;
    });
    drawTable();
  }

  function drawTable() {
    if (!currentPeriodId) return;
    const wrap = document.getElementById('entry-table-wrap');
    const groupFilter = document.getElementById('entry-group-filter').value;
    const term = document.getElementById('entry-search').value.trim().toLowerCase();

    const employees = activeEmployees().filter((e) =>
      (!groupFilter || e.PayrollGroup === groupFilter) &&
      (!term || String(e.Name).toLowerCase().includes(term)));

    const categories = state.categories;

    let html = `<div class="card"><div class="table-scroll"><table id="entry-grid"><thead><tr><th class="sticky-col">Employee</th>`;
    categories.forEach((c) => { html += `<th title="${escapeAttr(c.Notes)}">${c.Label}<br><span class="muted small">${c.Unit}</span></th>`; });
    html += `<th></th></tr></thead><tbody>`;

    employees.forEach((emp) => {
      html += `<tr data-emp="${emp.EmployeeID}"><td class="sticky-col">${emp.Name}<br><span class="muted small">${emp.PayrollGroup || ''}</span></td>`;
      categories.forEach((c) => {
        const val = (entriesByEmployee[emp.EmployeeID] && entriesByEmployee[emp.EmployeeID][c.CategoryKey]) || '';
        html += `<td><input type="number" step="0.01" class="qty-input" data-cat="${c.CategoryKey}" value="${val}" /></td>`;
      });
      html += `<td><button class="row-save secondary" data-emp="${emp.EmployeeID}">Save</button></td></tr>`;
    });
    html += `</tbody></table></div>
      <div style="margin-top:10px"><button id="save-all">Save All Rows</button> <span id="entry-status" class="muted"></span></div>
      </div>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll('.row-save').forEach((btn) => {
      btn.addEventListener('click', () => saveRow(btn.dataset.emp));
    });
    document.getElementById('save-all').addEventListener('click', saveAll);
  }

  async function saveRow(employeeId) {
    const tr = document.querySelector(`#entry-grid tbody tr[data-emp="${employeeId}"]`);
    const entries = [...tr.querySelectorAll('.qty-input')]
      .map((input) => ({ CategoryKey: input.dataset.cat, Quantity: parseFloat(input.value) || 0 }))
      .filter((e) => e.Quantity !== 0);
    await apiPost('bulkSaveEntries', { periodId: currentPeriodId, employeeId, entries });
  }

  async function saveAll() {
    const status = document.getElementById('entry-status');
    const rows = [...document.querySelectorAll('#entry-grid tbody tr')];
    status.textContent = `Saving 0/${rows.length}...`;
    for (let i = 0; i < rows.length; i++) {
      await saveRow(rows[i].dataset.emp);
      status.textContent = `Saving ${i + 1}/${rows.length}...`;
    }
    status.textContent = `Saved ${rows.length} rows.`;
  }

  function downloadTemplate() {
    if (!currentPeriodId) { alert('Pick a pay period first.'); return; }
    const employees = activeEmployees();
    const categories = state.categories;
    const headers = ['EmployeeID', 'Name', 'PayrollGroup', ...categories.map((c) => c.Label)];
    const rows = employees.map((emp) => {
      const existing = entriesByEmployee[emp.EmployeeID] || {};
      return [
        emp.EmployeeID, emp.Name, emp.PayrollGroup || '',
        ...categories.map((c) => (existing[c.CategoryKey] !== undefined ? existing[c.CategoryKey] : ''))
      ];
    });
    const blob = writeSimpleXlsx(headers, rows);
    const periodLabel = (state.periods.find((p) => String(p.PeriodID) === String(currentPeriodId)) || {}).Label || currentPeriodId;
    downloadBlob(blob, `DataEntry_${sanitizeFilename(periodLabel)}.xlsx`);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file name after fixing it
    if (!file) return;
    if (!currentPeriodId) { alert('Pick a pay period first.'); return; }

    const status = document.getElementById('bulk-status');
    status.innerHTML = '<p class="muted">Reading file...</p>';

    let parsed;
    try {
      parsed = await readSimpleXlsx(file);
    } catch (err) {
      status.innerHTML = `<p class="login-error">Could not read that file: ${escapeHtml(err.message)}</p>`;
      return;
    }

    const { headers, rows } = parsed;
    if (!headers.includes('EmployeeID')) {
      status.innerHTML = `<p class="login-error">This file doesn't look like the downloaded template — no "EmployeeID" column found. Download a fresh template and edit that copy, rather than building a new file from scratch.</p>`;
      return;
    }

    // Map each category's own Label (the column header in the template) back to its
    // CategoryKey (what the backend stores entries against).
    const labelToKey = {};
    state.categories.forEach((c) => { labelToKey[c.Label] = c.CategoryKey; });
    const categoryColumns = headers.filter((h) => labelToKey[h]);

    const knownIds = new Set(activeEmployees().map((emp) => String(emp.EmployeeID)));
    const byEmployee = {};
    const unknownIds = [];
    let rowsWithData = 0;

    rows.forEach((row) => {
      const empId = String(row.EmployeeID).trim();
      if (!empId) return;
      if (!knownIds.has(empId)) { unknownIds.push(empId); return; }
      const entries = [];
      categoryColumns.forEach((label) => {
        const raw = row[label];
        const qty = parseFloat(raw);
        if (raw !== '' && raw !== undefined && !isNaN(qty) && qty !== 0) {
          entries.push({ CategoryKey: labelToKey[label], Quantity: qty });
        }
      });
      if (entries.length > 0) {
        byEmployee[empId] = entries;
        rowsWithData++;
      }
    });

    if (rowsWithData === 0) {
      status.innerHTML = `<p class="login-error">No rows with any quantities were found in that file — nothing to import.</p>`;
      return;
    }

    status.innerHTML = '<p class="muted">Importing...</p>';
    try {
      await bulkSaveEntriesMulti(currentPeriodId, byEmployee);
    } catch (err) {
      status.innerHTML = `<p class="login-error">Import failed: ${escapeHtml(err.message)}</p>`;
      return;
    }

    const warn = unknownIds.length
      ? ` <span class="muted">(${unknownIds.length} row(s) skipped — EmployeeID not found: ${unknownIds.slice(0, 10).join(', ')}${unknownIds.length > 10 ? ', …' : ''})</span>`
      : '';
    status.innerHTML = `<p><strong>${rowsWithData}</strong> employee(s) imported for this period.${warn}</p>`;
    await loadAndDraw();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(s) {
  return String(s).replace(/[^a-z0-9]+/gi, '_');
}

function escapeAttr(s) {
  return String(s === undefined || s === null ? '' : s).replace(/"/g, '&quot;');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s === undefined || s === null ? '' : String(s);
  return div.innerHTML;
}
