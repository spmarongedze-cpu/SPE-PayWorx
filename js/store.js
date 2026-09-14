/**
 * In-memory application state, loaded from the backend on startup (and refreshed after
 * writes). Keeping this as a single shared object avoids every view re-fetching the
 * same reference data (employees, categories, settings) over and over.
 */
import { apiGet } from './api.js';

const state = {
  employees: [],
  categories: [],
  payGroups: [],
  periods: [],
  settings: {},
  payeBands: [],
  loaded: false
};

function settingsAsMap(settingsRows) {
  const map = {};
  settingsRows.forEach((r) => { map[r.Key] = r.Value; });
  return map;
}

async function loadBootstrap() {
  const data = await apiGet('bootstrap');
  state.employees = data.employees || [];
  state.categories = data.categories || [];
  state.payGroups = data.payGroups || [];
  state.periods = data.periods || [];
  state.settings = settingsAsMap(data.settings || []);
  state.payeBands = data.payeBands || [];
  state.loaded = true;
  return state;
}

function activeEmployees() {
  return state.employees.filter((e) => String(e.Active).toUpperCase() !== 'FALSE' && e.Active !== false);
}

export { state, loadBootstrap, activeEmployees };
