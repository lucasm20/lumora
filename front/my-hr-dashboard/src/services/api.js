import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
const COMPANIES_CACHE_TTL_MS = 30 * 1000;

let companiesCache = null;
let companiesCacheTime = 0;
let companiesRequest = null;

function clearCompaniesCache() {
  companiesCache = null;
  companiesCacheTime = 0;
}

function parseJsonBody(body) {
  if (typeof body !== 'string') {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function normalizeApiErrorMessage(path, message, payload, status) {
  const fallbackMessage = message || 'Request failed.';
  const normalizedMessage = String(fallbackMessage).toLowerCase();

  if (path === '/auth/login' && status === 401) {
    return 'Invalid username or password.';
  }

  if (path === '/auth/register') {
    const duplicatePattern = /already|exists|exist|duplicate|duplicad|ya.*registrad|ya.*existe/;
    const usernamePattern = /username|user name|usuario|user/;
    const companyPattern = /company|empresa/;
    const invalidCompanyPattern = /not found|not registered|does not exist|doesn't exist|no existe|invalid|incorrect|existing company|registered company|select|seleccion/;

    if (usernamePattern.test(normalizedMessage) && duplicatePattern.test(normalizedMessage)) {
      return 'Username already registered.';
    }

    if (
      payload?.role === 'employee' &&
      companyPattern.test(normalizedMessage) &&
      (invalidCompanyPattern.test(normalizedMessage) || !duplicatePattern.test(normalizedMessage))
    ) {
      return 'Select an existing company.';
    }

    if (companyPattern.test(normalizedMessage) && duplicatePattern.test(normalizedMessage)) {
      const companyName = String(payload?.companyName || 'Company').trim() || 'Company';
      return `Company '${companyName}' already registered`;
    }
  }

  if (path === '/emotions/process-active' && /employee|empleado/.test(normalizedMessage)) {
    return 'No employee found';
  }

  return fallbackMessage;
}

async function request(path, options = {}) {
  const { headers: optionHeaders, ...fetchOptions } = options;
  const payload = parseJsonBody(fetchOptions.body);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(optionHeaders || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(normalizeApiErrorMessage(path, data.message, payload, response.status));
  }

  return data;
}

function getCompanyName(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }

  return String(item.companyName || item.name || item.company || '').trim();
}

function isActiveCompany(item) {
  const status = String(item?.status || '').trim().toLowerCase();
  return item?.active !== false && item?.disabled !== true && status !== 'inactive';
}

function normalizeCompaniesResponse(data) {
  const rawCompanies = Array.isArray(data?.companies)
    ? data.companies
    : Array.isArray(data)
      ? data
      : [];
  const companyNames = new Set();

  const companies = rawCompanies.reduce((items, item, index) => {
    const companyName = getCompanyName(item);

    if (!companyName || !isActiveCompany(item)) {
      return items;
    }

    const companyKey = companyName.toLowerCase();

    if (companyNames.has(companyKey)) {
      return items;
    }

    companyNames.add(companyKey);
    items.push({
      id: String(item.id || item.companyId || companyKey || index),
      companyName,
    });

    return items;
  }, []);

  return companies.sort((left, right) =>
    left.companyName.localeCompare(right.companyName, undefined, { sensitivity: 'base' })
  );
}

export function getCompanies({ forceRefresh = false } = {}) {
  const cacheIsFresh = companiesCache && Date.now() - companiesCacheTime < COMPANIES_CACHE_TTL_MS;

  if (!forceRefresh && cacheIsFresh) {
    return Promise.resolve(companiesCache);
  }

  if (!forceRefresh && companiesRequest) {
    return companiesRequest;
  }

  companiesRequest = request(forceRefresh ? '/companies?refresh=1' : '/companies', {
    headers: forceRefresh ? { 'Cache-Control': 'no-cache' } : undefined,
  })
    .then((data) => {
      companiesCache = {
        ...data,
        companies: normalizeCompaniesResponse(data),
      };
      companiesCacheTime = Date.now();
      return companiesCache;
    })
    .finally(() => {
      companiesRequest = null;
    });

  return companiesRequest;
}

export function prefetchCompanies() {
  return getCompanies();
}

export function registerUser(payload) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((data) => {
    clearCompaniesCache();
    return data;
  });
}

export async function loginUser(payload) {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase web config is missing. Check your VITE_FIREBASE_* variables.');
  }

  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!data.customToken) {
    throw new Error('The backend did not return a Firebase session token.');
  }

  try {
    await signInWithCustomToken(auth, data.customToken);
  } catch (error) {
    if (error.code === 'auth/configuration-not-found') {
      throw new Error(
        'Firebase Authentication no esta inicializado para este proyecto. En Firebase Console, entra a Authentication y presiona Get started.'
      );
    }

    throw error;
  }

  return data;
}

export async function logoutUser() {
  if (auth) {
    await signOut(auth);
  }
}

export async function getSession(idToken) {
  return request('/auth/session', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getEmployees(idToken) {
  return request('/employees', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getDashboardData(idToken, period = 'Week') {
  const params = new URLSearchParams({ period });

  return request(`/dashboard?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getEmployeeEmotionSummary(idToken, employeeId, period = 'Week') {
  const params = new URLSearchParams({ period });

  return request(`/employees/${encodeURIComponent(employeeId)}/emotions/summary?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function processEmployeeEmotion(idToken, payload) {
  return request('/emotions/process', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function processActiveEmployeeEmotions(idToken) {
  return request('/emotions/process-active', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getWeeklyEmotionTrend(idToken, period = 'Week') {
  const params = new URLSearchParams({ period });

  return request(`/emotions/weekly-trend?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getEmotionDistribution(idToken, period = 'Week') {
  const params = new URLSearchParams({ period });

  return request(`/emotions/distribution?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getEmotionComparison(idToken, period = 'Week') {
  const params = new URLSearchParams({ period });

  return request(`/emotions/current-vs-previous?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getEmotionalIntensity(idToken, period = 'Week') {
  const params = new URLSearchParams({ period });

  return request(`/emotions/intensity?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function updateCameraStatus(idToken, cameraOn) {
  return request('/camera/status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ cameraOn }),
  });
}

export async function getCameraCaptureRequest(idToken) {
  return request('/camera/capture-request', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function publishCameraSnapshot(idToken, imageBase64, requestId, captureHints = null) {
  return request('/camera/snapshot', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ imageBase64, requestId, captureHints }),
  });
}
