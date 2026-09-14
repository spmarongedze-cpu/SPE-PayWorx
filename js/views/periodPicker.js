import { apiPost } from '../api.js';
import { state, loadBootstrap } from '../store.js';

/**
 * Renders a period select + "new period" control into `container`.
 * Calls onChange(periodId) whenever the selection changes (including right after
 * the initial render, with the most recent period pre-selected if one exists).
 */
export function renderPeriodPicker(container, onChange) {
  container.innerHTML = `
    <div class="row-between period-picker">
      <div>
        <label>Pay Period</label>
        <select id="pp-select"></select>
      </div>
      <button id="pp-new" class="secondary">+ New Period</button>
    </div>
  `;

  const select = document.getElementById('pp-select');

  function fillOptions() {
    const sorted = [...state.periods].sort((a, b) => String(b.PeriodID) - String(a.PeriodID));
    select.innerHTML = sorted.map((p) => `<option value="${p.PeriodID}">${p.Label}</option>`).join('');
  }

  fillOptions();
  if (state.periods.length > 0) {
    select.value = select.options[0].value;
    onChange(select.value);
  }

  select.addEventListener('change', () => onChange(select.value));

  document.getElementById('pp-new').addEventListener('click', async () => {
    const label = prompt('Period label (e.g. "August 2026"):');
    if (!label) return;
    try {
      const id = await apiPost('savePeriod', { Label: label, StartDate: '', EndDate: '', Status: 'open' });
      await loadBootstrap();
      fillOptions();
      select.value = id;
      onChange(select.value);
    } catch (err) {
      alert('Could not create period: ' + err.message);
    }
  });
}
