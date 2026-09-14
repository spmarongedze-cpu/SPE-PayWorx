import { fetchUsers, login } from '../api.js';
import { setCurrentUser } from '../session.js';

/**
 * Renders a full-screen login card into `container` (replacing whatever's there -
 * the nav bar is hidden while this is showing, see app.js). Calls onLoggedIn() once a
 * correct PIN is entered.
 */
export async function renderLogin(container, onLoggedIn) {
  container.innerHTML = `<div class="login-shell"><div class="login-card"><p class="muted">Loading users...</p></div></div>`;

  let users = [];
  try {
    users = await fetchUsers();
  } catch (err) {
    container.innerHTML = `<div class="login-shell"><div class="login-card">
      <img class="login-mark" src="./icons/logo.png" alt="" />
      <h1>Sherwood Park</h1>
      <div class="login-tagline">Payroll</div>
      <p class="login-error">Could not load the user list: ${escapeHtml(err.message)}</p>
      <p class="login-hint">If the Web App URL or API token is wrong, fix it in <a href="#/settings">Settings</a>.</p>
    </div></div>`;
    return;
  }

  if (users.length === 0) {
    container.innerHTML = `<div class="login-shell"><div class="login-card">
      <img class="login-mark" src="./icons/logo.png" alt="" />
      <h1>Sherwood Park</h1>
      <div class="login-tagline">Payroll</div>
      <p class="login-error">No users are set up yet. Add rows to the Users tab in the Google Sheet, then reload.</p>
    </div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="login-shell"><div class="login-card">
      <img class="login-mark" src="./icons/logo.png" alt="Sherwood Park Estate" />
      <h1>Sherwood Park</h1>
      <div class="login-tagline">Payroll</div>
      <label for="login-user">User</label>
      <select id="login-user">
        ${users.map((u) => `<option value="${escapeAttr(u.Name)}">${escapeHtml(u.Name)}</option>`).join('')}
      </select>
      <label for="login-pin">PIN</label>
      <input id="login-pin" class="pin-input" type="password" inputmode="numeric" maxlength="8" placeholder="****" autocomplete="off" />
      <div class="login-error" id="login-error"></div>
      <button id="login-btn" style="width:100%">Log In</button>
    </div></div>
  `;

  const select = document.getElementById('login-user');
  const pinInput = document.getElementById('login-pin');
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  async function tryLogin() {
    errorEl.textContent = '';
    btn.disabled = true;
    try {
      const user = await login(select.value, pinInput.value);
      setCurrentUser(user);
      onLoggedIn();
    } catch (err) {
      errorEl.textContent = err.message || 'Incorrect PIN — try again.';
      pinInput.value = '';
      pinInput.focus();
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', tryLogin);
  pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
  select.addEventListener('change', () => { pinInput.value = ''; errorEl.textContent = ''; pinInput.focus(); });
  pinInput.focus();
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s === undefined || s === null ? '' : String(s);
  return div.innerHTML;
}

function escapeAttr(s) {
  return String(s === undefined || s === null ? '' : s).replace(/"/g, '&quot;');
}
