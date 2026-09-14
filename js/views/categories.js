import { apiPost } from '../api.js';
import { state, loadBootstrap } from '../store.js';

const RATE_TYPE_LABELS = {
  nec_daily: 'NEC monthly rate / working days',
  spe_daily: 'SPE monthly rate / working days',
  fixed_rate: 'Fixed rate x quantity',
  direct_amount: 'Direct dollar amount',
  overtime_tier: 'Overtime: NEC hourly rate x multiplier'
};

export function renderCategories(container) {
  container.innerHTML = `
    <div class="card">
      <div class="row-between">
        <h2>Pay Categories & Rates</h2>
        <button id="cat-add">+ Add Category</button>
      </div>
      <p class="muted">These are the day-types, weight/pocket-based categories and overtime tiers workers can be paid under.
        Any category can be used by any payroll group - during data entry, just leave a category blank/zero for workers it doesn't apply to.
        Rows marked <span class="tag placeholder">PLACEHOLDER</span> use a rate I could not confirm from your template - please check them.</p>
      <table id="cat-table">
        <thead><tr><th>Key</th><th>Label</th><th>Unit</th><th>Rate Type</th><th>Rate / Multiplier</th><th>Notes</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div id="cat-form-wrap"></div>
  `;

  const tbody = document.getElementById('cat-table').querySelector('tbody');

  function draw() {
    tbody.innerHTML = '';
    state.categories.forEach((c) => {
      const isPlaceholder = /PLACEHOLDER/i.test(c.Notes || '');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${c.CategoryKey}</code></td>
        <td>${c.Label}${isPlaceholder ? ' <span class="tag placeholder">PLACEHOLDER</span>' : ''}</td>
        <td>${c.Unit}</td>
        <td>${RATE_TYPE_LABELS[c.RateType] || c.RateType}</td>
        <td>${c.FixedRate !== '' && c.FixedRate !== undefined ? c.FixedRate : '-'}</td>
        <td class="muted small">${c.Notes || ''}</td>
        <td><button class="secondary cat-edit" data-key="${c.CategoryKey}">Edit</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.cat-edit').forEach((btn) => {
      btn.addEventListener('click', () => openForm(state.categories.find((c) => c.CategoryKey === btn.dataset.key)));
    });
  }

  document.getElementById('cat-add').addEventListener('click', () => openForm(null));

  function openForm(cat) {
    const wrap = document.getElementById('cat-form-wrap');
    const typeOptions = Object.entries(RATE_TYPE_LABELS)
      .map(([val, label]) => `<option value="${val}" ${cat && cat.RateType === val ? 'selected' : ''}>${label}</option>`).join('');
    const unitOptions = ['days', 'kg', 'pockets', 'hours', 'amount']
      .map((u) => `<option ${cat && cat.Unit === u ? 'selected' : ''}>${u}</option>`).join('');
    wrap.innerHTML = `
      <div class="card">
        <h3>${cat ? 'Edit' : 'Add'} Category</h3>
        <div class="grid-2">
          <div><label>Key (no spaces, used internally)</label><input id="c-key" value="${cat ? cat.CategoryKey : ''}" ${cat ? 'readonly' : ''} /></div>
          <div><label>Label</label><input id="c-label" value="${cat ? escapeAttr(cat.Label) : ''}" /></div>
          <div><label>Unit</label><select id="c-unit">${unitOptions}</select></div>
          <div><label>Rate Type</label><select id="c-type">${typeOptions}</select></div>
          <div><label>Fixed Rate / Multiplier</label><input id="c-rate" type="number" step="0.0001" value="${cat && cat.FixedRate !== '' ? cat.FixedRate : ''}" /></div>
          <div><label>Notes</label><input id="c-notes" value="${cat ? escapeAttr(cat.Notes) : ''}" /></div>
        </div>
        <button id="c-save">Save</button>
        <button id="c-cancel" class="secondary">Cancel</button>
        <span id="c-status" class="muted"></span>
      </div>
    `;
    document.getElementById('c-cancel').addEventListener('click', () => { wrap.innerHTML = ''; });
    document.getElementById('c-save').addEventListener('click', async () => {
      const payload = {
        CategoryKey: document.getElementById('c-key').value.trim(),
        Label: document.getElementById('c-label').value,
        Unit: document.getElementById('c-unit').value,
        RateType: document.getElementById('c-type').value,
        FixedRate: document.getElementById('c-rate').value,
        Notes: document.getElementById('c-notes').value
      };
      if (!payload.CategoryKey) {
        document.getElementById('c-status').textContent = 'Key is required.';
        return;
      }
      document.getElementById('c-status').textContent = 'Saving...';
      try {
        await apiPost('saveCategory', payload);
        await loadBootstrap();
        wrap.innerHTML = '';
        draw();
      } catch (err) {
        document.getElementById('c-status').textContent = 'Failed: ' + err.message;
      }
    });
  }

  draw();
}

function escapeAttr(s) {
  return String(s === undefined || s === null ? '' : s).replace(/"/g, '&quot;');
}
