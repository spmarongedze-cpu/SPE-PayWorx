/**
 * Thin client for the Google Apps Script Web App backend.
 *
 * The Web App URL and API token are entered once in the Settings screen and stored in
 * localStorage (per-device). POST bodies are sent as text/plain rather than
 * application/json - Apps Script Web Apps don't handle CORS preflight (OPTIONS)
 * requests, so a "simple request" content type is required to avoid the browser
 * sending a preflight at all. The server (Code.gs) still parses the body as JSON.
 */

const LS_URL_KEY = 'spe_payroll_webapp_url';
const LS_TOKEN_KEY = 'spe_payroll_api_token';

function getConfig() {
  return {
    url: localStorage.getItem(LS_URL_KEY) || '',
    token: localStorage.getItem(LS_TOKEN_KEY) || ''
  };
}

function setConfig(url, token) {
  localStorage.setItem(LS_URL_KEY, url.trim());
  localStorage.setItem(LS_TOKEN_KEY, token.trim());
}

function isConfigured() {
  const { url, token } = getConfig();
  return Boolean(url && token);
}

async function apiGet(action, params = {}) {
  const { url, token } = getConfig();
  if (!url || !token) throw new Error('Not connected. Open Settings and enter your Web App URL and API token.');
  const qs = new URLSearchParams({ action, token, ...params });
  const res = await fetch(`${url}?${qs.toString()}`, { method: 'GET' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function apiPost(action, payload = {}) {
  const { url, token } = getConfig();
  if (!url || !token) throw new Error('Not connected. Open Settings and enter your Web App URL and API token.');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, payload })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function login(name, pin) {
  return apiPost('login', { name, pin });
}

async function fetchUsers() {
  return apiGet('users');
}

async function fetchDashboard() {
  return apiGet('dashboard');
}

async function bulkSaveEntriesMulti(periodId, byEmployee) {
  return apiPost('bulkSaveEntriesMulti', { periodId, byEmployee });
}

export {
  getConfig, setConfig, isConfigured, apiGet, apiPost,
  login, fetchUsers, fetchDashboard, bulkSaveEntriesMulti
};
