import { apiPost, apiGet } from '../api.js';
import { state, loadBootstrap } from '../store.js';

export function renderEmployees(container) {
  container.innerHTML = `
    <div class="card">
      <div class="row-between">
        <h2>Employees (${state.employees.length})</h2>
        <div>
          <input id="emp-search" type="text" placeholder="Search name..." style="width:220px;display:inline-block" />
          <button id="emp-add">+ Add Employee</button>
        </div>
      </div>
      <table id="emp-table">
        <thead><tr>
          <th>ID</th><th>Name</th><th>National ID</th><th>Payroll Group</th><th>Grade</th>
          <th>SPE Rate</th><th>NEC Rate</th><th>Active</th><th></th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div id="emp-form-wrap"></div>
  `;

  const tbody = document.getElementById('emp-table').querySelector('tbody');

  function draw(filterText = '') {
    tbody.innerHTML = '';
    const term = filterText.trim().toLowerCase();
    state.employees
      .filter((e) => !term || String(e.Name).toLowerCase().includes(term))
      .forEach((e) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${e.EmployeeID}</td><td>${e.Name}</td><td>${e.NationalID || ''}</td>
          <td>${e.PayrollGroup || ''}</td><td>${e.Grade || ''}</td>
          <td>${e.SPEMonthlyRate}</td><td>${e.NECMonthlyRate}</td>
          <td>${String(e.Active).toUpperCase() === 'FALSE' ? 'No' : 'Yes'}</td>
          <td><button class="secondary emp-edit" data-id="${e.EmployeeID}">Edit</button></td>
        `;
        tbody.appendChild(tr);
      });
    tbody.querySelectorAll('.emp-edit').forEach((btn) => {
      btn.addEventListener('click', () => openForm(state.employees.find((e) => String(e.EmployeeID) === btn.dataset.id)));
    });
  }

  document.getElementById('emp-search').addEventListener('input', (e) => draw(e.target.value));
  document.getElementById('emp-add').addEventListener('click', () => openForm(null));

  function openForm(employee) {
    const wrap = document.getElementById('emp-form-wrap');
    const groupOptions = state.payGroups.map((g) => `<option ${employee && employee.PayrollGroup === g.GroupName ? 'selected' : ''}>${g.GroupName}</option>`).join('');
    wrap.innerHTML = `
      <div class="card">
        <h3>${employee ? 'Edit' : 'Add'} Employee</h3>
        <div class="grid-2">
          <div><label>Full Name</label><input id="f-name" value="${employee ? escapeAttr(employee.Name) : ''}" /></div>
          <div><label>National ID</label><input id="f-nid" value="${employee ? escapeAttr(employee.NationalID) : ''}" /></div>
          <div><label>Payroll Group</label><select id="f-group"><option value="">-- select --</option>${groupOptions}</select></div>
          <div><label>Grade</label><input id="f-grade" value="${employee ? escapeAttr(employee.Grade) : ''}" placeholder="e.g. A1, B2" /></div>
          <div><label>SPE Monthly Rate ($)</label><input id="f-spe" type="number" step="0.01" value="${employee ? employee.SPEMonthlyRate : ''}" /></div>
          <div><label>NEC Monthly Rate ($)</label><input id="f-nec" type="number" step="0.01" value="${employee ? employee.NECMonthlyRate : ''}" /></div>
          <div><label>Active</label><select id="f-active"><option value="TRUE" ${!employee || employee.Active !== false ? 'selected' : ''}>Yes</option><option value="FALSE" ${employee && String(employee.Active).toUpperCase() === 'FALSE' ? 'selected' : ''}>No</option></select></div>
          <div><label>Notes</label><input id="f-notes" value="${employee ? escapeAttr(employee.Notes) : ''}" /></div>
        </div>
        <button id="f-save">Save</button>
        <button id="f-cancel" class="secondary">Cancel</button>
        <span id="f-status" class="muted"></span>
      </div>
    `;
    document.getElementById('f-cancel').addEventListener('click', () => { wrap.innerHTML = ''; });
    document.getElementById('f-save').addEventListener('click', async () => {
      const payload = {
        EmployeeID: employee ? employee.EmployeeID : '',
        Name: document.getElementById('f-name').value,
        NationalID: document.getElementById('f-nid').value,
        PayrollGroup: document.getElementById('f-group').value,
        Grade: document.getElementById('f-grade').value,
        SPEMonthlyRate: parseFloat(document.getElementById('f-spe').value) || 0,
        NECMonthlyRate: parseFloat(document.getElementById('f-nec').value) || 0,
        Active: document.getElementById('f-active').value,
        Notes: document.getElementById('f-notes').value
      };
      document.getElementById('f-status').textContent = 'Saving...';
      try {
        await apiPost('saveEmployee', payload);
        await loadBootstrap();
        wrap.innerHTML = '';
        draw(document.getElementById('emp-search').value);
        document.querySelector('#emp-table').closest('.card').querySelector('h2').textContent = `Employees (${state.employees.length})`;
      } catch (err) {
        document.getElementById('f-status').textContent = 'Failed: ' + err.message;
      }
    });
  }

  draw();
}

function escapeAttr(s) {
  return String(s === undefined || s === null ? '' : s).replace(/"/g, '&quot;');
}
