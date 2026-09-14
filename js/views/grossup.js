import { state, activeEmployees } from '../store.js';
import { solveGrossUp } from '../payrollEngine.js';

export function renderGrossUp(container) {
  const options = activeEmployees().map((e) => `<option value="${e.EmployeeID}">${e.Name}</option>`).join('');
  container.innerHTML = `
    <div class="card">
      <h2>Gross-Up Calculator</h2>
      <p class="muted">Given a net pay you want a worker to actually receive, this works backward through NSSA, NEC and PAYE
        to find the basic pay (and resulting gross) you need to run through payroll to achieve it. Overtime, incentive and
        any other fixed earnings/deductions you enter are held constant while the basic pay is solved for.</p>
      <div class="grid-2">
        <div><label>Employee (optional - fills in NEC/SPE rate context, not required)</label><select id="gu-emp"><option value="">-- none --</option>${options}</select></div>
        <div><label>Target Net Pay ($)</label><input id="gu-target" type="number" step="0.01" /></div>
        <div><label>Other fixed earnings already known (incentive + overtime + direct amounts, $)</label><input id="gu-other-earn" type="number" step="0.01" value="0" /></div>
        <div><label>Other fixed deductions (loans, mealie meal, etc, $)</label><input id="gu-other-ded" type="number" step="0.01" value="0" /></div>
      </div>
      <button id="gu-solve">Solve</button>
    </div>
    <div id="gu-result-wrap"></div>
  `;

  document.getElementById('gu-solve').addEventListener('click', () => {
    const target = parseFloat(document.getElementById('gu-target').value) || 0;
    const otherEarn = parseFloat(document.getElementById('gu-other-earn').value) || 0;
    const otherDed = parseFloat(document.getElementById('gu-other-ded').value) || 0;

    if (target <= 0) { alert('Enter a target net pay greater than 0.'); return; }

    const result = solveGrossUp(target, otherEarn, otherDed, state.settings, state.payeBands);

    document.getElementById('gu-result-wrap').innerHTML = `
      <div class="card">
        <h3>Result</h3>
        <table>
          <tr><td>Required Basic Pay</td><td><strong>$${result.requiredBasicPay.toFixed(2)}</strong></td></tr>
          <tr><td>+ Other fixed earnings</td><td>$${otherEarn.toFixed(2)}</td></tr>
          <tr><td><strong>= Gross Taxable Pay</strong></td><td><strong>$${result.grossTaxablePay.toFixed(2)}</strong></td></tr>
          <tr><td>- NSSA</td><td>-$${result.nssa.toFixed(2)}</td></tr>
          <tr><td>- NEC</td><td>-$${result.nec.toFixed(2)}</td></tr>
          <tr><td>- PAYE (incl. AIDS levy)</td><td>-$${result.paye.toFixed(2)}</td></tr>
          <tr><td>- Other fixed deductions</td><td>-$${otherDed.toFixed(2)}</td></tr>
          <tr><td><strong>= Net Pay (check)</strong></td><td><strong>$${result.netPay.toFixed(2)}</strong></td></tr>
        </table>
        <p class="muted">NSSA and NEC are calculated on the Required Basic Pay only, matching how the payroll engine treats regular runs.</p>
      </div>
    `;
  });
}
