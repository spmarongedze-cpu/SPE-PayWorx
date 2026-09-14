import { isConfigured } from './api.js';
import { loadBootstrap } from './store.js';
import { getCurrentUser, logout } from './session.js';

import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderSettings } from './views/settings.js';
import { renderEmployees } from './views/employees.js';
import { renderCategories } from './views/categories.js';
import { renderEntry } from './views/entry.js';
import { renderDeductions } from './views/deductions.js';
import { renderPayroll } from './views/payroll.js';
import { renderGrossUp } from './views/grossup.js';

const routes = {
  '#/dashboard': { label: 'Dashboard', render: renderDashboard, needsData: true },
  '#/employees': { label: 'Employees', render: renderEmployees, needsData: true },
  '#/rates': { label: 'Pay Categories & Rates', render: renderCategories, needsData: true },
  '#/entry': { label: 'Data Entry', render: renderEntry, needsData: true },
  '#/deductions': { label: 'Deductions', render: renderDeductions, needsData: true },
  '#/payroll': { label: 'Run Payroll', render: renderPayroll, needsData: true },
  '#/grossup': { label: 'Gross-Up Calculator', render: renderGrossUp, needsData: true },
  '#/settings': { label: 'Settings', render: renderSettings, needsData: false }
};

const nav = document.getElementById('nav');
const main = document.getElementById('main');
const statusEl = document.getElementById('conn-status');
const userBadge = document.getElementById('user-badge');

function buildNav() {
  nav.innerHTML = '';
  Object.entries(routes).forEach(([hash, route]) => {
    const a = document.createElement('a');
    a.href = hash;
    a.textContent = route.label;
    a.className = 'nav-link';
    nav.appendChild(a);
  });
}

function setNavVisible(visible) {
  nav.style.display = visible ? '' : 'none';
}

function renderUserBadge() {
  const user = getCurrentUser();
  if (!user) { userBadge.innerHTML = ''; return; }
  userBadge.innerHTML = `<span class="user-name">${escapeHtml(user.Name)}</span><button id="logout-btn" class="link-btn">Log out</button>`;
  document.getElementById('logout-btn').addEventListener('click', () => {
    logout();
    router();
  });
}

async function router() {
  setNavVisible(true);

  const hash = location.hash || (isConfigured() ? '#/dashboard' : '#/settings');
  if (!routes[hash]) {
    location.hash = isConfigured() ? '#/dashboard' : '#/settings';
    return;
  }
  const route = routes[hash];

  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === hash);
  });

  if (route.needsData && !isConfigured()) {
    userBadge.innerHTML = '';
    main.innerHTML = `<div class="card"><h2>Not connected</h2>
      <p>Open <a href="#/settings">Settings</a> and enter your Google Apps Script Web App URL and API token first.</p></div>`;
    setStatus(false);
    return;
  }

  // The login gate sits behind Settings: a route that needs data also needs a logged-in
  // user, but Settings itself (needsData:false) always stays reachable, even mid-login
  // or with a broken connection, so a wrong token or forgotten PIN can always be fixed.
  if (route.needsData && !getCurrentUser()) {
    userBadge.innerHTML = '';
    setStatus(true);
    document.querySelectorAll('.nav-link').forEach((a) => a.classList.remove('active'));
    await renderLogin(main, () => {
      renderUserBadge();
      location.hash = '#/dashboard';
      router();
    });
    return;
  }

  renderUserBadge();

  if (route.needsData) {
    main.innerHTML = '<p class="muted">Loading...</p>';
    try {
      await loadBootstrap();
      setStatus(true);
    } catch (err) {
      main.innerHTML = `<div class="card error"><h2>Could not load data</h2><p>${escapeHtml(err.message)}</p></div>`;
      setStatus(false);
      return;
    }
  }

  main.innerHTML = '';
  route.render(main);
}

function setStatus(connected) {
  statusEl.textContent = connected ? 'Connected' : 'Not connected';
  statusEl.className = connected ? 'status ok' : 'status bad';
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  buildNav();
  router();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
