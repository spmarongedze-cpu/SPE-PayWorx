import { apiGet, apiPost } from '../api.js';
import { state, activeEmployees } from '../store.js';
import { renderPeriodPicker } from './periodPicker.js';
import { computePayroll } from '../payrollEngine.js';

export function renderPayroll(container) {
  container.innerHTML = `
    <div class="card">
      <h2>Run Payroll</h2>
      <div id="run-period"></div>
      <div style="margin-top:10px">
        <select id="run-group-filter"><option value="">-- all payroll groups --</option>${state.payGroups.map((g) => `<option>${g.GroupName}</option>`).join('')}</select>
        <button id="run-compute">Compute</button>
        <button id="run-save" class="secondary" disabled>Save Results to Sheet</button>
        <button id="run-csv" class="secondary" disabled>Export CSV</button>
        <span id="run-status" class="muted"></span>
      </div>
    </div>
    <div id="run-summary-wrap"></div>
    <div id="run-table-wrap"></div>
  `;

  let currentPeriodId = null;
  let lastResults = [];

  renderPeriodPicker(document.getElementById('run-period'), (periodId) => {
    currentPeriodId = periodId;
    document.getElementById('run-save').disabled = true;
    document.getElementById('run-csv').disabled = true;
    document.getElementById('run-table-wrap').innerHTML = '';
    document.getElementById('run-summary-wrap').innerHTML = '';
  });

  document.getElementById('run-compute').addEventListener('click', compute);
  document.getElementById('run-save').addEventListener('click', saveResults);
  document.getElementById('run-csv').addEventListener('click', exportCsv);

  async function compute() {
    if (!currentPeriodId) { alert('Select a pay period first.'); return; }
    const status = document.getElementById('run-status');
    status.textContent = 'Computing...';

    const [entries, deductions] = await Promise.all([
      apiGet('entries', { periodId: currentPeriodId }),
      apiGet('deductions', { periodId: currentPeriodId })
    ]);

    const groupFilter = document.getElementById('run-group-filter').value;
    const employees = activeEmployees().filter((e) => !groupFilter || e.PayrollGroup === groupFilter);

    const entriesByEmployee = {};
    entries.forEach((e) => {
      if (!entriesByEmployee[e.EmployeeID]) entriesByEmployee[e.EmployeeID] = {};
      entriesByEmployee[e.EmployeeID][e.CategoryKey] = parseFloat(e.Quantity) || 0;
    });
    const deductionsByEmployee = {};
    deductions.forEach((d) => {
      deductionsByEmployee[d.EmployeeID] = (deductionsByEmployee[d.EmployeeID] || 0) + (parseFloat(d.Amount) || 0);
    });

    lastResults = employees.map((emp) => computePayroll(
      emp,
      entriesByEmployee[emp.EmployeeID] || {},
      state.categories,
      state.settings,
      state.payeBands,
      deductionsByEmployee[emp.EmployeeID] || 0
    ));

    drawSummary();
    drawTable();
    document.getElementById('run-save').disabled = false;
    document.getElementById('run-csv').disabled = false;
    status.textContent = `Computed ${lastResults.length} employees.`;
  }

  function drawSummary() {
    const totals = lastResults.reduce((acc, r) => {
      acc.gross += r.grossTaxablePay; acc.paye += r.paye; acc.nssa += r.nssa;
      acc.nec += r.nec; acc.other += r.otherDeductions; acc.net += r.netPay;
      return acc;
    }, { gross: 0, paye: 0, nssa: 0, nec: 0, other: 0, net: 0 });

    document.getElementById('run-summary-wrap').innerHTML = `
      <div class="card">
        <div class="summary-grid">
          <div><span class="muted small">Gross Taxable Pay</span><br><strong>$${totals.gross.toFixed(2)}</strong></div>
          <div><span class="muted small">PAYE</span><br><strong>$${totals.paye.toFixed(2)}</strong></div>
          <div><span class="muted small">NSSA</span><br><strong>$${totals.nssa.toFixed(2)}</strong></div>
          <div><span class="muted small">NEC</span><br><strong>$${totals.nec.toFixed(2)}</strong></div>
          <div><span class="muted small">Other Deductions</span><br><strong>$${totals.other.toFixed(2)}</strong></div>
          <div><span class="muted small">Net Pay</span><br><strong>$${totals.net.toFixed(2)}</strong></div>
        </div>
      </div>
    `;
  }

  function drawTable() {
    let html = `<div class="card"><div class="table-scroll"><table><thead><tr>
      <th>Employee</th><th>Group</th><th>Days</th><th>Basic Pay</th><th>Incentive</th><th>Overtime</th>
      <th>Gross</th><th>PAYE</th><th>NSSA</th><th>NEC</th><th>Other Ded.</th><th>Net Pay</th><th></th>
    </tr></thead><tbody>`;
    lastResults.forEach((r, idx) => {
      html += `<tr>
        <td>${r.name}</td><td>${r.payrollGroup || ''}</td><td>${r.totalDays}</td>
        <td>${r.totalBasicPay.toFixed(2)}</td><td>${r.incentiveBonus.toFixed(2)}</td><td>${r.overtimeAmount.toFixed(2)}</td>
        <td>${r.grossTaxablePay.toFixed(2)}</td><td>${r.paye.toFixed(2)}</td><td>${r.nssa.toFixed(2)}</td>
        <td>${r.nec.toFixed(2)}</td><td>${r.otherDeductions.toFixed(2)}</td><td><strong>${r.netPay.toFixed(2)}</strong></td>
        <td><button class="secondary detail-btn" data-idx="${idx}">Detail</button></td>
      </tr>`;
    });
    html += `</tbody></table></div></div><div id="run-detail-wrap"></div>`;
    document.getElementById('run-table-wrap').innerHTML = html;
    document.querySelectorAll('.detail-btn').forEach((btn) => {
      btn.addEventListener('click', () => showDetail(lastResults[parseInt(btn.dataset.idx, 10)]));
    });
  }

  function showDetail(r) {
    const wrap = document.getElementById('run-detail-wrap');
    let rows = r.categoryBreakdown.map((c) => `<tr><td>${c.label}</td><td>${c.quantity}</td><td>${c.rate.toFixed(4)}</td><td>${c.amount.toFixed(2)}</td></tr>`).join('');
    wrap.innerHTML = `
      <div class="card">
        <h3>${r.name} - Payslip Detail</h3>
        <table><thead><tr><th>Category</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
        <table style="margin-top:10px">
          <tr><td>Incentive Bonus</td><td>${r.incentiveBonus.toFixed(2)}</td></tr>
          <tr><td>Overtime Amount</td><td>${r.overtimeAmount.toFixed(2)}</td></tr>
          <tr><td><strong>Gross Taxable Pay</strong></td><td><strong>${r.grossTaxablePay.toFixed(2)}</strong></td></tr>
          <tr><td>PAYE (incl. AIDS levy)</td><td>-${r.paye.toFixed(2)}</td></tr>
          <tr><td>NSSA</td><td>-${r.nssa.toFixed(2)}</td></tr>
          <tr><td>NEC</td><td>-${r.nec.toFixed(2)}</td></tr>
          <tr><td>Other Deductions</td><td>-${r.otherDeductions.toFixed(2)}</td></tr>
          <tr><td><strong>Net Pay</strong></td><td><strong>${r.netPay.toFixed(2)}</strong></td></tr>
        </table>
      </div>
    `;
  }

  async function saveResults() {
    const status = document.getElementById('run-status');
    status.textContent = 'Saving...';
    const payload = {
      periodId: currentPeriodId,
      results: lastResults.map((r) => ({
        EmployeeID: r.employeeId, Name: r.name, PayrollGroup: r.payrollGroup,
        TotalDays: r.totalDays, TotalBasicPay: r.totalBasicPay, IncentiveBonus: r.incentiveBonus,
        OvertimeAmount: r.overtimeAmount, GrossTaxablePay: r.grossTaxablePay, PAYE: r.paye,
        NSSA: r.nssa, NEC: r.nec, OtherDeductions: r.otherDeductions, NetPay: r.netPay
      }))
    };
    try {
      await apiPost('savePayrollResults', payload);
      status.textContent = 'Saved to PayrollResults sheet.';
    } catch (err) {
      status.textContent = 'Failed: ' + err.message;
    }
  }

  function exportCsv() {
    const headers = ['Employee', 'Group', 'Days', 'BasicPay', 'Incentive', 'Overtime', 'Gross', 'PAYE', 'NSSA', 'NEC', 'OtherDeductions', 'NetPay'];
    const lines = [headers.join(',')];
    lastResults.forEach((r) => {
      lines.push([r.name, r.payrollGroup, r.totalDays, r.totalBasicPay, r.incentiveBonus, r.overtimeAmount,
        r.grossTaxablePay, r.paye, r.nssa, r.nec, r.otherDeductions, r.netPay].map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const periodLabel = (state.periods.find((p) => String(p.PeriodID) === String(currentPeriodId)) || {}).Label || currentPeriodId;
    a.download = `payroll-${periodLabel}.csv`.replace(/\s+/g, '-');
    a.click();
  }

  function csvEscape(v) {
    const s = String(v);
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
}
