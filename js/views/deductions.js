import { apiGet, apiPost } from '../api.js';
import { state, activeEmployees } from '../store.js';
import { renderPeriodPicker } from './periodPicker.js';

export function renderDeductions(container) {
  container.innerHTML = `
    <div class="card">
      <h2>Deductions</h2>
      <p class="muted">Ad-hoc deductions for a period - mealie meal, meat, milk, vineyard produce, moonlight, GAPWUZ union dues, loan repayments, etc. NSSA and NEC subscription are calculated automatically and don't need to be entered here.</p>
      <div id="ded-period"></div>
    </div>
    <div id="ded-form-wrap"></div>
    <div id="ded-list-wrap"></div>
  `;

  let currentPeriodId = null;

  renderPeriodPicker(document.getElementById('ded-period'), async (periodId) => {
    currentPeriodId = periodId;
    drawForm();
    await loadList();
  });

  function drawForm() {
    const options = activeEmployees().map((e) => `<option value="${e.EmployeeID}">${e.Name}</option>`).join('');
    document.getElementById('ded-form-wrap').innerHTML = `
      <div class="card">
        <h3>Add Deduction</h3>
        <div class="grid-3">
          <div><label>Employee</label><select id="d-emp">${options}</select></div>
          <div><label>Description</label><input id="d-desc" placeholder="e.g. Mealie Meal, Loan, GAPWUZ" /></div>
          <div><label>Amount ($)</label><input id="d-amount" type="number" step="0.01" /></div>
        </div>
        <button id="d-add">Add</button>
        <span id="d-status" class="muted"></span>
      </div>
    `;
    document.getElementById('d-add').addEventListener('click', async () => {
      const payload = {
        PeriodID: currentPeriodId,
        EmployeeID: document.getElementById('d-emp').value,
        Description: document.getElementById('d-desc').value,
        Amount: parseFloat(document.getElementById('d-amount').value) || 0
      };
      document.getElementById('d-status').textContent = 'Saving...';
      try {
        await apiPost('saveDeduction', payload);
        document.getElementById('d-desc').value = '';
        document.getElementById('d-amount').value = '';
        document.getElementById('d-status').textContent = 'Added.';
        await loadList();
      } catch (err) {
        document.getElementById('d-status').textContent = 'Failed: ' + err.message;
      }
    });
  }

  async function loadList() {
    const wrap = document.getElementById('ded-list-wrap');
    wrap.innerHTML = '<p class="muted">Loading...</p>';
    const rows = await apiGet('deductions', { periodId: currentPeriodId });
    const byName = (id) => (state.employees.find((e) => String(e.EmployeeID) === String(id)) || {}).Name || id;

    let html = `<div class="card"><table><thead><tr><th>Employee</th><th>Description</th><th>Amount</th><th></th></tr></thead><tbody>`;
    rows.forEach((r) => {
      html += `<tr><td>${byName(r.EmployeeID)}</td><td>${r.Description}</td><td>${Number(r.Amount).toFixed(2)}</td>
        <td><button class="secondary d-del" data-id="${r.DeductionID}">Delete</button></td></tr>`;
    });
    html += `</tbody></table></div>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll('.d-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiPost('deleteDeduction', { DeductionID: btn.dataset.id });
        await loadList();
      });
    });
  }
}
