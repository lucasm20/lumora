import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const COMPANIES_CACHE_TTL_MS = 5 * 60 * 1000;

let companiesCache = null;
let companiesCacheTime = 0;
let companiesRequest = null;

function clearCompaniesCache() {
  companiesCache = null;
  companiesCacheTime = 0;
}

async function request(path, options = {}) {
  const { headers: optionHeaders, ...fetchOptions } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(optionHeaders || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed.');
  }

  return data;
}

export function getCompanies({ forceRefresh = false } = {}) {
  const cacheIsFresh = companiesCache && Date.now() - companiesCacheTime < COMPANIES_CACHE_TTL_MS;

  if (!forceRefresh && cacheIsFresh) {
    return Promise.resolve(companiesCache);
  }

  if (!forceRefresh && companiesRequest) {
    return companiesRequest;
  }

  companiesRequest = request('/companies')
    .then((data) => {
      companiesCache = {
        ...data,
        companies: Array.isArray(data.companies) ? data.companies : [],
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
