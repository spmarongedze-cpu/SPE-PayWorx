/**
 * Who's currently logged in, on this device, for this browser session.
 *
 * Separate from api.js's Settings (Web App URL + API token): Settings connects this
 * device to your Google Sheet once, and is remembered indefinitely (localStorage).
 * The logged-in user is remembered only for the current browser session
 * (sessionStorage) - closing the app/tab requires logging in again, so a shared PC
 * doesn't stay logged in as the last person who used it.
 */

const SS_USER_KEY = 'spe_payroll_current_user';

function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem(SS_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function setCurrentUser(user) {
  sessionStorage.setItem(SS_USER_KEY, JSON.stringify(user));
}

function logout() {
  sessionStorage.removeItem(SS_USER_KEY);
}

export { getCurrentUser, setCurrentUser, logout };
