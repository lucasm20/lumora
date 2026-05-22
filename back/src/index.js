const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { auth, db } = require('./firebaseAdmin');
const { HR_USER, seedHrUser } = require('./hrUser');

const app = express();
const PORT = process.env.PORT || 4000;
const DEFAULT_CLIENT_ORIGINS = [
  'http://localhost:5173',
  'https://lumora-nine-olive.vercel.app',
  'https://lumora-668dbouqn-lucas-projects-ca67a672.vercel.app',
  'https://*.vercel.app',
];
const ENV_CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const CLIENT_ORIGINS = Array.from(new Set([...DEFAULT_CLIENT_ORIGINS, ...ENV_CLIENT_ORIGINS]));

function isOriginAllowed(origin) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.replace(/\/$/, '');

  if (normalizedOrigin.endsWith('.vercel.app')) {
    return true;
  }

  return CLIENT_ORIGINS.some((allowedOrigin) => {
    if (allowedOrigin === normalizedOrigin) {
      return true;
    }

    if (allowedOrigin.includes('*')) {
      const pattern = new RegExp(
        `^${allowedOrigin
          .split('*')
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')}$`
      );
      return pattern.test(normalizedOrigin);
    }

    return false;
  });
}
const COMPANIES_CACHE_TTL_MS = Number(process.env.COMPANIES_CACHE_TTL_MS || 5 * 60 * 1000);
const CAPTURE_REQUEST_WAIT_MS = Number(process.env.CAPTURE_REQUEST_WAIT_MS || 8000);
const CAPTURE_REQUEST_POLL_MS = Number(process.env.CAPTURE_REQUEST_POLL_MS || 500);
const CAPTURE_REQUEST_TTL_MS = Number(process.env.CAPTURE_REQUEST_TTL_MS || 30000);
const CAMERA_SNAPSHOT_MAX_BYTES = Number(process.env.CAMERA_SNAPSHOT_MAX_BYTES || 10 * 1024 * 1024);
const LIVE_VIBE_NO_EMPLOYEE_FOUND_MESSAGE = 'No employee found';
const EMOTION_LABELS = [
  'happy',
  'neutral',
  'stress',
  'sad',
  'angry',
  'fear',
  'surprise',
  'disgust',
  'drowsiness',
];
const EMOTION_ALIASES = {
  anger: 'angry',
  angry: 'angry',
  disgust: 'disgust',
  disgusted: 'disgust',
  drowsiness: 'drowsiness',
  drowsy: 'drowsiness',
  fear: 'fear',
  fearful: 'fear',
  happy: 'happy',
  joy: 'happy',
  neutral: 'neutral',
  sad: 'sad',
  sadness: 'sad',
  stress: 'stress',
  stressed: 'stress',
  surprise: 'surprise',
  surprised: 'surprise',
};
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const INTENSITY_EMOTIONS = new Set(['stress', 'sad', 'drowsiness']);
const ANALYTICS_TIME_ZONE = process.env.ANALYTICS_TIME_ZONE || 'America/Lima';
const TIME_ZONE_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ANALYTICS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const TIME_ZONE_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ANALYTICS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const TIME_ZONE_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ANALYTICS_TIME_ZONE,
  weekday: 'short',
});

let companiesCache = null;
let companiesCacheExpiresAt = 0;
let companiesSeedPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

function normalizeUsername(username = '') {
  return username.trim().toLowerCase();
}

function normalizeValue(value = '') {
  return String(value || '').trim().toLowerCase();
}

function getCompanyId(companyName = '') {
  return normalizeValue(companyName);
}

function normalizeEmotion(value = '') {
  return EMOTION_ALIASES[normalizeValue(value)] || null;
}

function getFormatterParts(formatter, date) {
  return formatter.formatToParts(date).reduce((parts, part) => {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }

    return parts;
  }, {});
}

function getTimeZoneDateParts(date) {
  const parts = getFormatterParts(TIME_ZONE_DATE_FORMATTER, date);

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function normalizeCalendarDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getTimeZoneOffsetMinutes(date) {
  const parts = getFormatterParts(TIME_ZONE_OFFSET_FORMATTER, date);
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (localAsUtc - date.getTime()) / 60000;
}

function getTimeZoneStartOfDay(year, month, day) {
  const normalized = normalizeCalendarDateParts(year, month, day);
  const utcGuess = Date.UTC(normalized.year, normalized.month - 1, normalized.day);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcGuess));

  return new Date(utcGuess - offsetMinutes * 60 * 1000);
}

function getTimeZoneWeekdayLabel(date) {
  return TIME_ZONE_WEEKDAY_FORMATTER.format(date);
}

function isValidUsername(username) {
  return /^[a-z0-9._-]{3,40}$/.test(username);
}

function getAuthErrorResponse(error) {
  const responses = {
    'auth/configuration-not-found': {
      status: 503,
      message:
        'Firebase Authentication no esta configurado. Habilita Authentication en Firebase Console.',
    },
    'auth/email-already-exists': {
      status: 409,
      message: 'El nombre de usuario ya existe.',
    },
    'auth/invalid-email': {
      status: 400,
      message: 'El email temporal generado no es valido. Revisa el formato del usuario.',
    },
    'auth/invalid-password': {
      status: 400,
      message: 'La contrasena debe tener al menos 6 caracteres.',
    },
    'auth/uid-already-exists': {
      status: 409,
      message: 'Ya existe un usuario de Firebase para este perfil.',
    },
  };

  return responses[error.code] || {
    status: 500,
    message: 'No se pudo completar la operacion de Firebase Authentication.',
  };
}

function sanitizeUser(doc) {
  if (!doc.exists) {
    return null;
  }

  const { password, ...data } = doc.data();
  return {
    id: doc.id,
    ...data,
  };
}

function sanitizeEmployee(doc) {
  const user = sanitizeUser(doc);

  if (!user) {
    return null;
  }

  const { latestCameraFrameBase64, lastEmotionRaw, ...safeUser } = user;
  return safeUser;
}

function createEmptyEmotionCounts() {
  return EMOTION_LABELS.reduce((counts, emotion) => {
    counts[emotion] = 0;
    return counts;
  }, {});
}

function getPeriodStart(period, now = new Date()) {
  const normalizedPeriod = normalizeValue(period);

  if (normalizedPeriod === '1h') {
    const start = new Date(now);
    start.setHours(start.getHours() - 1);
    return start;
  }

  const { year, month, day } = getTimeZoneDateParts(now);

  if (normalizedPeriod === 'today') {
    return getTimeZoneStartOfDay(year, month, day);
  }

  if (normalizedPeriod === 'month') {
    return getTimeZoneStartOfDay(year, month, 1);
  }

  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return getTimeZoneStartOfDay(year, month, day - daysSinceMonday);
}

function filterEventsByPeriod(events, period) {
  const startDate = getPeriodStart(period);
  const now = new Date();

  return events.filter((event) => {
    const capturedAt = getRecordDate(event.capturedAt || event.createdAt);
    return capturedAt && capturedAt >= startDate && capturedAt <= now;
  });
}

function createWeeklyTrend(events) {
  const dayMap = WEEKDAY_ORDER.reduce((map, label) => {
    map[label] = createEmptyEmotionCounts();
    return map;
  }, {});
  const latestEventByEmployeeDay = new Map();

  events.forEach((event) => {
    const capturedAt = getRecordDate(event.capturedAt || event.createdAt);

    if (!capturedAt) {
      return;
    }

    const emotion = normalizeEmotion(event.emotion);
    const dayLabel = getTimeZoneWeekdayLabel(capturedAt);

    if (!emotion || !dayMap[dayLabel]) {
      return;
    }

    const eventKey = `${dayLabel}:${event.employeeId}`;
    const existing = latestEventByEmployeeDay.get(eventKey);

    if (!existing || capturedAt > existing.capturedAt) {
      latestEventByEmployeeDay.set(eventKey, {
        capturedAt,
        dayLabel,
        emotion,
      });
    }
  });

  latestEventByEmployeeDay.forEach((event) => {
    dayMap[event.dayLabel][event.emotion] += 1;
  });

  const days = WEEKDAY_ORDER.map((label) => ({
    label,
    counts: dayMap[label],
  }));
  const maxValue = days.reduce((max, day) => {
    const dayMax = Math.max(...EMOTION_LABELS.map((emotion) => day.counts[emotion] || 0));
    return Math.max(max, dayMax);
  }, 0);

  return {
    days,
    emotions: EMOTION_LABELS,
    maxValue,
  };
}

function getRecordEmotion(record = {}) {
  return (
    normalizeEmotion(record.lastEmotion) ||
    normalizeEmotion(record.liveVibe) ||
    normalizeEmotion(record.emotion) ||
    normalizeEmotion(record.dominantEmotion) ||
    normalizeEmotion(record.vibe)
  );
}

function getRecordDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === 'function') {
    return value.toDate();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createEmotionDistribution(employeeDocs, emotionEvents, includeEmployeeFallback = true) {
  const counts = createEmptyEmotionCounts();
  const employeeDataById = new Map();
  const latestByEmployee = new Map();

  employeeDocs.forEach((doc) => {
    employeeDataById.set(doc.id, doc.data());
  });

  emotionEvents.forEach((event) => {
    if (!employeeDataById.has(event.employeeId)) {
      return;
    }

    const emotion = getRecordEmotion(event);
    const capturedAt = getRecordDate(event.capturedAt || event.createdAt);

    if (!emotion || !capturedAt) {
      return;
    }

    const existing = latestByEmployee.get(event.employeeId);

    if (!existing || capturedAt > existing.capturedAt) {
      latestByEmployee.set(event.employeeId, {
        emotion,
        capturedAt,
      });
    }
  });

  if (includeEmployeeFallback) {
    employeeDataById.forEach((employeeData, employeeId) => {
      if (latestByEmployee.has(employeeId)) {
        return;
      }

      const emotion = getRecordEmotion(employeeData);
      const capturedAt = getRecordDate(
        employeeData.lastEmotionAt ||
          employeeData.liveVibeAt ||
          employeeData.emotionAt ||
          employeeData.updatedAt ||
          employeeData.createdAt
      );

      if (emotion) {
        latestByEmployee.set(employeeId, {
          emotion,
          capturedAt: capturedAt || new Date(0),
        });
      }
    });
  }

  latestByEmployee.forEach(({ emotion }) => {
    counts[emotion] += 1;
  });

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const percentages = EMOTION_LABELS.reduce((nextPercentages, emotion) => {
    nextPercentages[emotion] = total ? Math.round((counts[emotion] / total) * 100) : 0;
    return nextPercentages;
  }, {});

  return {
    counts,
    percentages,
    total,
  };
}

function createCurrentVsPreviousComparison(employeeDocs, emotionEvents, options = {}) {
  const targetDate = options.targetDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const currentStart = options.currentStart || null;
  const currentEnd = options.currentEnd || null;
  const current = createEmptyEmotionCounts();
  let previous = createEmptyEmotionCounts();
  const previousAvailableByEmotion = createEmptyEmotionCounts();
  const employeeIds = new Set(employeeDocs.map((doc) => doc.id));
  const eventsByEmployee = new Map();

  emotionEvents.forEach((event) => {
    if (!employeeIds.has(event.employeeId)) {
      return;
    }

    const emotion = getRecordEmotion(event);
    const capturedAt = getRecordDate(event.capturedAt || event.createdAt);

    if (!emotion || !capturedAt) {
      return;
    }

    const existing = eventsByEmployee.get(event.employeeId) || [];
    existing.push({
      emotion,
      capturedAt,
    });
    eventsByEmployee.set(event.employeeId, existing);
  });

  employeeDocs.forEach((doc) => {
    const employeeEvents = eventsByEmployee
      .get(doc.id)
      ?.sort((left, right) => left.capturedAt - right.capturedAt) || [];

    if (!employeeEvents.length) {
      return;
    }

    const currentEvents = employeeEvents.filter((event) => {
      return (
        (!currentStart || event.capturedAt >= currentStart) &&
        (!currentEnd || event.capturedAt <= currentEnd)
      );
    });

    if (currentEvents.length) {
      const latest = currentEvents[currentEvents.length - 1];
      current[latest.emotion] += 1;
    }

    const historicalEvents = employeeEvents.filter((event) => event.capturedAt <= targetDate);

    if (historicalEvents.length) {
      const historical = historicalEvents[historicalEvents.length - 1];
      previous[historical.emotion] += 1;
      previousAvailableByEmotion[historical.emotion] = 1;
    }
  });

  const currentTotal = Object.values(current).reduce((sum, value) => sum + value, 0);
  const previousTotal = Object.values(previous).reduce((sum, value) => sum + value, 0);
  const previousAvailable = currentTotal > 0 && previousTotal > 0;

  if (!previousAvailable) {
    previous = null;
  }

  const maxValue = Math.max(
    0,
    ...EMOTION_LABELS.flatMap((emotion) => [current[emotion] || 0, previous?.[emotion] || 0])
  );

  return {
    emotions: EMOTION_LABELS,
    current,
    previous,
    previousAvailable,
    previousAvailableByEmotion: EMOTION_LABELS.reduce((map, emotion) => {
      map[emotion] = Boolean(previousAvailableByEmotion[emotion]);
      return map;
    }, {}),
    maxValue,
    targetAt: targetDate.toISOString(),
  };
}

function createEmotionalIntensityTrend(employeeDocs, emotionEvents, period = 'week') {
  const startIso = getPeriodStart(period).toISOString();
  const nowIso = new Date().toISOString();
  const employeeIds = new Set(employeeDocs.map((doc) => doc.id));
  const latestByEmployeeDay = new Map();

  emotionEvents.forEach((event) => {
    if (!employeeIds.has(event.employeeId)) {
      return;
    }

    const emotion = getRecordEmotion(event);
    const capturedAt = getRecordDate(event.capturedAt || event.createdAt);

    if (!emotion || !capturedAt) {
      return;
    }

    const capturedIso = capturedAt.toISOString();
    const dayLabel = getTimeZoneWeekdayLabel(capturedAt);

    if (capturedIso < startIso || capturedIso > nowIso || !WEEKDAY_ORDER.includes(dayLabel)) {
      return;
    }

    const eventKey = `${dayLabel}:${event.employeeId}`;
    const existing = latestByEmployeeDay.get(eventKey);

    if (!existing || capturedAt > existing.capturedAt) {
      latestByEmployeeDay.set(eventKey, {
        capturedAt,
        dayLabel,
        emotion,
      });
    }
  });

  const dayTotals = WEEKDAY_ORDER.reduce((map, label) => {
    map[label] = {
      total: 0,
      intense: 0,
    };
    return map;
  }, {});

  latestByEmployeeDay.forEach((event) => {
    dayTotals[event.dayLabel].total += 1;

    if (INTENSITY_EMOTIONS.has(event.emotion)) {
      dayTotals[event.dayLabel].intense += 1;
    }
  });

  const days = WEEKDAY_ORDER.map((label) => {
    const total = dayTotals[label].total;
    const intensity = total ? dayTotals[label].intense / total : 0;

    return {
      label,
      intensity: Number(intensity.toFixed(2)),
      total,
      intense: dayTotals[label].intense,
    };
  });

  const withTrend = days.map((day, index) => {
    const windowDays = days.slice(Math.max(0, index - 1), Math.min(days.length, index + 2));
    const trend =
      windowDays.reduce((sum, item) => sum + item.intensity, 0) / Math.max(windowDays.length, 1);

    return {
      ...day,
      trend: Number(trend.toFixed(2)),
    };
  });

  return {
    days: withTrend,
    range: { start: startIso, end: nowIso, period },
  };
}

async function ensureHrUserSeeded() {
  if (process.env.AUTO_SEED_HR_USER !== 'true') {
    return null;
  }

  if (!companiesSeedPromise) {
    companiesSeedPromise = seedHrUser(db).catch((error) => {
      companiesSeedPromise = null;
      throw error;
    });
  }

  return companiesSeedPromise;
}

function clearCompaniesCache() {
  companiesCache = null;
  companiesCacheExpiresAt = 0;
}

async function findUserByUsername(username) {
  const snapshot = await db
    .collection('users')
    .where('username', '==', normalizeUsername(username))
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0];
}

function getDominantEmotion(output) {
  if (!output) {
    return 'unknown';
  }

  if (typeof output === 'string') {
    return normalizeEmotionName(output);
  }

  if (typeof output.dominant_emotion === 'string') {
    return normalizeEmotionName(output.dominant_emotion);
  }

  if (output.emotions && typeof output.emotions === 'object') {
    const entries = Object.entries(output.emotions);
    if (entries.length) {
      entries.sort((left, right) => right[1] - left[1]);
      return normalizeEmotionName(entries[0][0]);
    }
  }

  if (Array.isArray(output) && output[0] && typeof output[0].dominant_emotion === 'string') {
    return normalizeEmotionName(output[0].dominant_emotion);
  }

  return 'unknown';
}

function normalizeEmotionName(emotion) {
  const value = String(emotion || '').trim().toLowerCase();
  const aliases = {
    anger: 'angry',
    happiness: 'happy',
    sadness: 'sad',
    sleepy: 'drowsiness',
    tired: 'drowsiness',
    anxiety: 'fear',
    anxious: 'fear',
  };

  const normalized = aliases[value] || value;

  return EMOTION_LABELS.includes(normalized) ? normalized : 'stress';
}

function getAzureVisionEndpoint() {
  return (process.env.AZURE_VISION_ENDPOINT || '').replace(/\/+$/, '');
}

function getAzureVisionConfig() {
  return {
    endpoint: getAzureVisionEndpoint(),
    key: process.env.AZURE_VISION_KEY || '',
    apiVersion: process.env.AZURE_VISION_API_VERSION || '2024-02-01',
  };
}

function getAzureVisionMissingConfig(config = getAzureVisionConfig()) {
  return [
    !config.endpoint ? 'AZURE_VISION_ENDPOINT' : null,
    !config.key ? 'AZURE_VISION_KEY' : null,
  ].filter(Boolean);
}

function createVisionConfigError(message, code = 'vision/missing-config') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertAzureVisionConfig(config = getAzureVisionConfig()) {
  const missing = getAzureVisionMissingConfig(config);

  if (missing.length) {
    throw createVisionConfigError(
      `Azure Vision configuration is missing: ${missing.join(', ')}.`
    );
  }

  if (/openai\.azure\.com/i.test(config.endpoint)) {
    throw createVisionConfigError(
      'AZURE_VISION_ENDPOINT must be an Azure AI Vision / Computer Vision endpoint, not an Azure OpenAI endpoint.',
      'vision/invalid-endpoint'
    );
  }
}

function validateAzureVisionStartupConfig() {
  const config = getAzureVisionConfig();
  const missing = getAzureVisionMissingConfig(config);

  if (missing.length) {
    console.warn(
      `Azure Vision is not fully configured. Missing variables: ${missing.join(
        ', '
      )}. Process Images will fail until these are set.`
    );
  }

  if (config.endpoint && /openai\.azure\.com/i.test(config.endpoint)) {
    console.warn(
      'AZURE_VISION_ENDPOINT points to Azure OpenAI. Use the Azure AI Vision / Computer Vision endpoint instead.'
    );
  }
}

function getImagePayloadParts(imageValue) {
  const value = String(imageValue || '');
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const contentType = match?.[1] || 'image/jpeg';
  const base64 = match ? match[2] : value;
  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) {
    const error = new Error('Image payload is empty.');
    error.code = 'vision/invalid-image';
    throw error;
  }

  return { buffer, contentType };
}

function getAzureVisionAnalyzeUrl(endpoint, apiVersion) {
  const params = new URLSearchParams({
    'api-version': apiVersion,
    features: 'caption,denseCaptions,tags,people',
    'gender-neutral-caption': 'true',
  });

  return `${endpoint}/computervision/imageanalysis:analyze?${params.toString()}`;
}

function getAzureVisionEvidence(data) {
  const captions = [
    data?.captionResult?.text,
    ...(Array.isArray(data?.denseCaptionsResult?.values)
      ? data.denseCaptionsResult.values.map((item) => item.text)
      : []),
  ].filter(Boolean);
  const tags = Array.isArray(data?.tagsResult?.values)
    ? data.tagsResult.values.map((item) => item.name).filter(Boolean)
    : [];

  return {
    captions,
    tags,
    text: [...captions, ...tags].join(' ').toLowerCase(),
  };
}

function classifyAzureVisionEmotion(data, captureHints = null) {
  const evidence = getAzureVisionEvidence(data);
  const text = evidence.text;
  const matchers = [
    { emotion: 'happy', pattern: /\b(smile|smiling|happy|joy|laugh|laughing|grin|cheerful)\b/ },
    { emotion: 'drowsiness', pattern: /\b(tired|sleepy|sleeping|drowsy|eyes closed|yawning|fatigue)\b/ },
    { emotion: 'sad', pattern: /\b(sad|crying|tearful|unhappy|depressed)\b/ },
    { emotion: 'angry', pattern: /\b(angry|mad|furious|annoyed|frown|frowning)\b/ },
    { emotion: 'fear', pattern: /\b(scared|fear|fearful|afraid|anxious|worried)\b/ },
    { emotion: 'surprise', pattern: /\b(surprised|surprise|shocked|astonished)\b/ },
    { emotion: 'disgust', pattern: /\b(disgust|disgusted|grimace)\b/ },
  ];

  if (captureHints?.smileLikely) {
    return {
      dominant_emotion: 'happy',
      confidence: Math.max(0.72, Number(captureHints.smileScore) || 0.72),
      reason: 'Local smile signal detected before Azure Vision analysis.',
      rawText: evidence.text,
    };
  }

  const matched = matchers.find((item) => item.pattern.test(text));

  if (matched) {
    return {
      dominant_emotion: matched.emotion,
      confidence: 0.72,
      reason: `Azure Vision captions/tags matched ${matched.emotion}.`,
      rawText: evidence.text,
    };
  }

  return {
    dominant_emotion: 'neutral',
    confidence: 0.75,
    reason: 'Azure Vision did not return a stronger expression signal.',
    rawText: evidence.text,
  };
}

function sanitizeCaptureHints(captureHints) {
  if (!captureHints || typeof captureHints !== 'object') {
    return null;
  }

  return {
    smileLikely: Boolean(captureHints.smileLikely),
    smileScore: Number.isFinite(Number(captureHints.smileScore))
      ? Math.max(0, Math.min(1, Number(captureHints.smileScore)))
      : null,
    longestBrightRun: Number.isFinite(Number(captureHints.longestBrightRun))
      ? Number(captureHints.longestBrightRun)
      : null,
    brightPixels: Number.isFinite(Number(captureHints.brightPixels))
      ? Number(captureHints.brightPixels)
      : null,
  };
}

async function requestVisionEmotion(imageValue, employeeId, captureHints = null) {
  const config = getAzureVisionConfig();
  assertAzureVisionConfig(config);

  const url = getAzureVisionAnalyzeUrl(config.endpoint, config.apiVersion);
  const imagePayload = /^https?:\/\//i.test(String(imageValue || ''))
    ? { body: { url: String(imageValue) }, contentType: 'application/json' }
    : (() => {
        const { buffer, contentType } = getImagePayloadParts(imageValue);
        return { body: buffer, contentType };
      })();

  let response;

  try {
    response = await axios.post(url, imagePayload.body, {
      headers: {
        'Ocp-Apim-Subscription-Key': config.key,
        'Content-Type': imagePayload.contentType,
      },
      timeout: 30000,
    });
  } catch (requestError) {
    const apiMessage =
      requestError.response?.data?.error?.message ||
      requestError.response?.data?.error?.code ||
      requestError.response?.data?.message ||
      requestError.response?.statusText ||
      requestError.message;
    const error = new Error(apiMessage || 'Vision emotion request failed.');
    error.code = 'vision/request-failed';
    error.status = requestError.response?.status;
    throw error;
  }

  return {
    ...classifyAzureVisionEmotion(response.data, captureHints),
    provider: 'azure-ai-vision',
    model: `image-analysis-${config.apiVersion}`,
    rawResponse: response.data,
  };
}

async function saveEmotionResult(employeeId, emotionData) {
  const timestamp = emotionData.capturedAt || new Date().toISOString();

  await db.collection('users').doc(employeeId).set(
    {
      lastEmotion: emotionData.emotion,
      lastEmotionAt: timestamp,
      lastEmotionConfidence: emotionData.confidence || null,
      lastEmotionRaw: emotionData.raw || null,
      liveVibe: emotionData.emotion,
      liveVibeAt: timestamp,
      emotion: emotionData.emotion,
      emotionAt: timestamp,
    },
    { merge: true }
  );

  await db.collection('emotionEvents').add({
    employeeId,
    companyName: emotionData.companyName || null,
    emotion: emotionData.emotion,
    confidence: emotionData.confidence || null,
    capturedAt: timestamp,
    createdAt: new Date().toISOString(),
  });
}

async function processEmotionForEmployee(employeeDoc, imageValue, captureHints = null) {
  const employeeData = employeeDoc.data();
  const sanitizedHints = sanitizeCaptureHints(captureHints);
  const output = await requestVisionEmotion(imageValue, employeeDoc.id, sanitizedHints);
  const modelEmotion = getDominantEmotion(output);
  const confidence = output?.confidence || null;
  const isWeakNeutral = modelEmotion === 'neutral' && (!confidence || confidence < 0.7);
  const dominantEmotion =
    isWeakNeutral && sanitizedHints?.smileLikely
      ? 'happy'
      : isWeakNeutral
        ? 'stress'
        : modelEmotion;
  const timestamp = new Date().toISOString();
  const emotionData = {
    companyName: employeeData.companyName,
    emotion: dominantEmotion,
    confidence,
    raw: {
      ...(output || {}),
      captureHints: sanitizedHints,
      adjustedFromNeutral: isWeakNeutral ? dominantEmotion : null,
    },
    capturedAt: timestamp,
  };

  await saveEmotionResult(employeeDoc.id, emotionData);

  return {
    employeeId: employeeDoc.id,
    emotion: dominantEmotion,
    confidence: emotionData.confidence,
    capturedAt: timestamp,
  };
}

async function closePendingCaptureRequests(employeeDocs, requestId, status, fields = {}) {
  await Promise.all(
    employeeDocs.map(async (employeeDoc) => {
      const requestRef = db.collection('cameraCaptureRequests').doc(employeeDoc.id);
      const requestDoc = await requestRef.get();
      const requestData = requestDoc.exists ? requestDoc.data() : null;

      if (!requestData || requestData.status !== 'pending') {
        return;
      }

      if (requestId && requestData.requestId !== requestId) {
        return;
      }

      await requestRef.set(
        {
          status,
          completedAt: new Date().toISOString(),
          ...fields,
        },
        { merge: true }
      );
    })
  );
}

function getProcessErrorReason(error) {
  if (error.code === 'vision/missing-config') {
    return 'Azure Vision endpoint or key is not configured.';
  }

  if (error.code === 'vision/invalid-endpoint') {
    return error.message;
  }

  if (error.code === 'vision/request-failed') {
    return `Vision emotion request failed${error.status ? ` (${error.status})` : ''}: ${
      error.message
    }`;
  }

  return error.message || 'Could not process emotion.';
}

async function createSessionForUser(userDoc, userData) {
  const customToken = await auth.createCustomToken(userDoc.id, {
    role: userData.role,
    companyName: userData.companyName || null,
    username: userData.username,
    userDocId: userDoc.id,
  });

  return {
    customToken,
    user: sanitizeUser(userDoc),
    redirectTo: userData.role === 'hr' ? '/dashboard' : '/employee',
  };
}

async function authenticateRequest(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing Firebase ID token.' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const userDocId = decodedToken.userDocId || decodedToken.uid;
    const userDoc = await db.collection('users').doc(userDocId).get();

    if (!userDoc.exists) {
      return res.status(401).json({ message: 'User profile not found.' });
    }

    req.firebaseUser = decodedToken;
    req.userProfile = sanitizeUser(userDoc);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired Firebase ID token.' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/companies', async (req, res) => {
  try {
    const refreshRequested = ['1', 'true', 'yes'].includes(
      String(req.query.refresh || req.query.forceRefresh || '').toLowerCase()
    );

    if (!refreshRequested && companiesCache && Date.now() < companiesCacheExpiresAt) {
      return res
        .set('Cache-Control', 'private, max-age=10')
        .json({ companies: companiesCache, cached: true });
    }

    await ensureHrUserSeeded();

    const snapshot = await db
      .collection('companies')
      .select('companyName')
      .orderBy('companyName')
      .get();
    const companies = snapshot.docs.map((doc) => ({
      id: doc.id,
      companyName: doc.data().companyName,
    }));

    companiesCache = companies;
    companiesCacheExpiresAt = Date.now() + COMPANIES_CACHE_TTL_MS;

    return res
      .set('Cache-Control', refreshRequested ? 'no-store' : 'private, max-age=10')
      .json({ companies, cached: false });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load companies.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { role = 'employee', companyName, username, password } = req.body;
  const normalizedUsername = normalizeUsername(username);
  const normalizedCompany = companyName?.trim();

  if (!['employee', 'hr'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role.' });
  }

  if (!normalizedUsername || !password) {
    return res.status(400).json({ message: 'Missing login fields.' });
  }

  if (!isValidUsername(normalizedUsername)) {
    return res.status(400).json({
      message: 'Username can only use letters, numbers, dot, dash and underscore.',
    });
  }

  try {
    await ensureHrUserSeeded();

    const userDoc = await findUserByUsername(normalizedUsername);

    if (!userDoc) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const userData = userDoc.data();
    const roleMatches = userData.role === role;
    const companyMatches = role === 'hr' || !normalizedCompany || userData.companyName === normalizedCompany;
    const passwordMatches = userData.password === password;

    if (!roleMatches || !companyMatches || !passwordMatches) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const session = await createSessionForUser(userDoc, userData);
    return res.json(session);
  } catch (error) {
    console.error('Login failed:', {
      code: error.code,
      message: error.message,
    });

    if (error.code?.startsWith('auth/')) {
      const response = getAuthErrorResponse(error);
      return res.status(response.status).json({ message: response.message });
    }

    return res.status(500).json({ message: 'Could not complete login.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { role = 'employee', companyName, username, password } = req.body;
  const normalizedUsername = normalizeUsername(username);
  const normalizedCompany = companyName?.trim();
  const companyId = getCompanyId(normalizedCompany);

  // Log minimal context (avoid logging passwords).
  console.log('Register attempt:', {
    role,
    username: normalizedUsername,
    companyName: normalizedCompany,
  });

  if (!['employee', 'hr'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role.' });
  }

  if (!normalizedUsername || !password || !normalizedCompany) {
    return res.status(400).json({ message: 'Missing registration fields.' });
  }

  if (!isValidUsername(normalizedUsername)) {
    return res.status(400).json({
      message: 'Username can only use letters, numbers, dot, dash and underscore.',
    });
  }

  try {
    const existingUser = await findUserByUsername(normalizedUsername);

    if (existingUser) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    const userId = normalizedUsername;
    const companyRef = db.collection('companies').doc(companyId);
    const userRef = db.collection('users').doc(userId);
    let registeredCompanyName = normalizedCompany;

    await db.runTransaction(async (transaction) => {
      const companyDoc = await transaction.get(companyRef);

      if (role === 'hr') {
        if (companyDoc.exists) {
          const error = new Error(`Company '${normalizedCompany}' already registered`);
          error.status = 409;
          throw error;
        }

        transaction.create(companyRef, {
          companyName: normalizedCompany,
        });
      } else {
        if (!companyDoc.exists) {
          const error = new Error('Company not registered.');
          error.status = 400;
          throw error;
        }

        registeredCompanyName = companyDoc.data().companyName || normalizedCompany;
      }

      transaction.create(userRef, {
        username: normalizedUsername,
        companyName: registeredCompanyName,
        role,
        password,
        createdAt: new Date().toISOString(),
      });
    });

    const user = {
      id: userId,
      username: normalizedUsername,
      companyName: registeredCompanyName,
      role,
    };
    clearCompaniesCache();

    return res.status(201).json({
      user,
    });
  } catch (error) {
    console.error('Register failed:', {
      code: error.code,
      message: error.message,
    });

    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    const response = getAuthErrorResponse(error);
    return res.status(response.status).json({ message: response.message });
  }
});

app.post('/api/auth/seed-hr', async (req, res) => {
  try {
    const user = await seedHrUser(db);
    clearCompaniesCache();

    return res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        companyName: user.companyName,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not seed HR user.' });
  }
});

app.post('/api/camera/status', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'employee') {
    return res.status(403).json({ message: 'Only employees can update camera status.' });
  }

  const cameraOn = Boolean(req.body.cameraOn);
  const userId = req.userProfile.id || req.userProfile.username;

  if (!userId) {
    return res.status(400).json({ message: 'Missing user identifier.' });
  }

  try {
    await db.collection('users').doc(userId).set(
      {
        cameraOn,
        cameraUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return res.json({ cameraOn });
  } catch (error) {
    console.error('Camera status update failed:', {
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({ message: 'Could not update camera status.' });
  }
});

app.get('/api/camera/capture-request', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'employee') {
    return res.status(403).json({ message: 'Only employees can read camera capture requests.' });
  }

  const userId = req.userProfile.id || req.userProfile.username;

  if (!userId) {
    return res.status(400).json({ message: 'Missing user identifier.' });
  }

  try {
    const requestDoc = await db.collection('cameraCaptureRequests').doc(userId).get();

    if (!requestDoc.exists) {
      return res.json({ request: null });
    }

    const request = requestDoc.data();

    const requestedAtTime = request.requestedAt ? new Date(request.requestedAt).getTime() : 0;
    const isExpired = !requestedAtTime || Date.now() - requestedAtTime > CAPTURE_REQUEST_TTL_MS;

    if (request.status !== 'pending' || request.companyName !== req.userProfile.companyName || isExpired) {
      if (request.status === 'pending' && isExpired) {
        await requestDoc.ref.set({ status: 'expired' }, { merge: true });
      }

      return res.json({ request: null });
    }

    return res.json({
      request: {
        requestId: request.requestId,
        requestedAt: request.requestedAt,
      },
    });
  } catch (error) {
    console.error('Camera capture request lookup failed:', {
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({ message: 'Could not read camera capture request.' });
  }
});

app.post('/api/camera/snapshot', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'employee') {
    return res.status(403).json({ message: 'Only employees can publish camera snapshots.' });
  }

  const { imageBase64, requestId, captureHints } = req.body || {};
  const imageValue = String(imageBase64 || '');
  const captureRequestId = String(requestId || '');
  const userId = req.userProfile.id || req.userProfile.username;

  if (!imageValue || !captureRequestId || !userId) {
    return res.status(400).json({ message: 'Missing camera snapshot, request, or user identifier.' });
  }

  if (Buffer.byteLength(imageValue, 'utf8') > CAMERA_SNAPSHOT_MAX_BYTES) {
    return res.status(413).json({ message: 'Camera snapshot is too large.' });
  }

  try {
    const capturedAt = new Date().toISOString();

    await db.collection('cameraFrames').doc(userId).set({
      employeeId: userId,
      companyName: req.userProfile.companyName || null,
      imageBase64: imageValue,
      captureHints: sanitizeCaptureHints(captureHints),
      requestId: captureRequestId,
      capturedAt,
      updatedAt: capturedAt,
    });

    const requestRef = db.collection('cameraCaptureRequests').doc(userId);
    const requestDoc = await requestRef.get();
    const requestData = requestDoc.exists ? requestDoc.data() : null;

    if (requestData?.requestId === captureRequestId) {
      await requestRef.set(
        {
          status: 'fulfilled',
          fulfilledAt: capturedAt,
        },
        { merge: true }
      );
    }

    await db.collection('users').doc(userId).set(
      {
        cameraOn: true,
        cameraUpdatedAt: capturedAt,
        latestCameraFrameAt: capturedAt,
      },
      { merge: true }
    );

    return res.json({ capturedAt });
  } catch (error) {
    console.error('Camera snapshot failed:', {
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({
      message:
        process.env.NODE_ENV === 'production'
          ? 'Could not save camera snapshot.'
          : error.message || 'Could not save camera snapshot.',
      code: process.env.NODE_ENV === 'production' ? undefined : error.code,
    });
  }
});

app.post('/api/emotions/process', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'hr') {
    return res.status(403).json({ message: 'Only HR admins can process emotions.' });
  }

  const { employeeId, imageBase64, imageUrl, captureHints } = req.body;
  const imageValue = imageBase64 || imageUrl;

  if (!employeeId || !imageValue) {
    return res.status(400).json({ message: 'Missing employeeId or image payload.' });
  }

  try {
    const employeeDoc = await db.collection('users').doc(employeeId).get();

    if (!employeeDoc.exists) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const employeeData = employeeDoc.data();
    if (employeeData.companyName !== req.userProfile.companyName) {
      return res.status(403).json({ message: 'Employee not in your company.' });
    }

    const result = await processEmotionForEmployee(employeeDoc, imageValue, captureHints);
    return res.json(result);
  } catch (error) {
    console.error('Emotion processing failed:', {
      code: error.code,
      message: error.message,
    });

    if (error.code === 'vision/missing-config' || error.code === 'vision/invalid-endpoint') {
      return res.status(503).json({ message: getProcessErrorReason(error) });
    }

    return res.status(500).json({ message: getProcessErrorReason(error) });
  }
});

async function handleProcessImages(req, res) {
  if (req.userProfile.role !== 'hr') {
    return res.status(403).json({ message: 'Only HR admins can process emotions.' });
  }

  try {
    const snapshot = await db
      .collection('users')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const employeeDocs = snapshot.docs.filter((doc) => {
      const data = doc.data();
      return data.role === 'employee';
    });
    const connectedEmployeeDocs = employeeDocs.filter((doc) => doc.data().cameraOn === true);

    if (!connectedEmployeeDocs.length) {
      await closePendingCaptureRequests(employeeDocs, null, LIVE_VIBE_NO_EMPLOYEE_FOUND_MESSAGE, {
        message: LIVE_VIBE_NO_EMPLOYEE_FOUND_MESSAGE,
      });

      return res.json({
        status: 'no_employee_found',
        message: LIVE_VIBE_NO_EMPLOYEE_FOUND_MESSAGE,
        processed: [],
        skipped: [],
      });
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const requestedAt = new Date().toISOString();

    await Promise.all(
      connectedEmployeeDocs.map((employeeDoc) => {
        const employeeData = employeeDoc.data();

        return db.collection('cameraCaptureRequests').doc(employeeDoc.id).set(
          {
            employeeId: employeeDoc.id,
            companyName: employeeData.companyName || req.userProfile.companyName || null,
            requestId,
            requestedAt,
            requestedBy: req.userProfile.id || req.userProfile.username || null,
            status: 'pending',
          },
          { merge: true }
        );
      })
    );

    const frameDataByEmployee = new Map();
    const deadline = Date.now() + CAPTURE_REQUEST_WAIT_MS;

    while (Date.now() < deadline && frameDataByEmployee.size < connectedEmployeeDocs.length) {
      const frameDocs = await Promise.all(
        connectedEmployeeDocs.map((employeeDoc) => db.collection('cameraFrames').doc(employeeDoc.id).get())
      );

      frameDocs.forEach((frameDoc) => {
        const frameData = frameDoc.exists ? frameDoc.data() : null;

        if (frameData?.requestId === requestId && frameData.imageBase64) {
          frameDataByEmployee.set(frameDoc.id, frameData);
        }
      });

      if (frameDataByEmployee.size < connectedEmployeeDocs.length) {
        await sleep(CAPTURE_REQUEST_POLL_MS);
      }
    }

    const finalFrameDocs = await Promise.all(
      connectedEmployeeDocs.map((employeeDoc) => db.collection('cameraFrames').doc(employeeDoc.id).get())
    );

    finalFrameDocs.forEach((frameDoc) => {
      const frameData = frameDoc.exists ? frameDoc.data() : null;

      if (frameData?.requestId === requestId && frameData.imageBase64) {
        frameDataByEmployee.set(frameDoc.id, frameData);
      }
    });

    const processed = [];
    const skipped = [];

    for (const employeeDoc of connectedEmployeeDocs) {
      const frameData = frameDataByEmployee.get(employeeDoc.id);

      try {
        if (!frameData?.imageBase64 || frameData.requestId !== requestId) {
          skipped.push({
            employeeId: employeeDoc.id,
            reason: 'No camera snapshot received from employee.',
          });
          continue;
        }

        const result = await processEmotionForEmployee(
          employeeDoc,
          frameData.imageBase64,
          frameData.captureHints
        );
        processed.push({
          ...result,
          frameCapturedAt: frameData.capturedAt || null,
        });
      } catch (error) {
        console.error('Active employee emotion processing failed:', {
          employeeId: employeeDoc.id,
          code: error.code,
          status: error.status,
          message: error.message,
        });
        skipped.push({
          employeeId: employeeDoc.id,
          capturedAt: frameData?.capturedAt || null,
          reason: getProcessErrorReason(error),
        });
      }
    }

    const unprocessedEmployeeDocs = connectedEmployeeDocs.filter((employeeDoc) => {
      return !processed.some((result) => result.employeeId === employeeDoc.id);
    });
    const failureMessage = skipped[0]?.reason || LIVE_VIBE_NO_EMPLOYEE_FOUND_MESSAGE;
    const failureStatus = skipped.length ? 'processing_failed' : 'no_employee_found';

    if (unprocessedEmployeeDocs.length) {
      await closePendingCaptureRequests(
        unprocessedEmployeeDocs,
        requestId,
        failureStatus,
        {
          message: failureMessage,
        }
      );
    }

    if (!processed.length) {
      return res.json({
        status: failureStatus,
        message: failureMessage,
        processed,
        skipped,
      });
    }

    return res.json({
      status: 'processed',
      message: `${processed.length} employees were processed`,
      processed,
      skipped,
    });
  } catch (error) {
    console.error('Batch emotion processing failed:', {
      code: error.code,
      message: error.message,
    });

    return res.status(500).json({ message: 'Could not process active employee emotions.' });
  }
}

app.post('/api/process-images', authenticateRequest, handleProcessImages);
app.post('/api/emotions/process-active', authenticateRequest, handleProcessImages);

app.get('/api/auth/session', authenticateRequest, (req, res) => {
  res.json({ user: req.userProfile });
});

app.get('/api/employees', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'hr') {
    return res.status(403).json({ message: 'Only HR admins can list employees.' });
  }

  try {
    const snapshot = await db
      .collection('users')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const employees = snapshot.docs
      .map(sanitizeEmployee)
      .filter((user) => user.role === 'employee')
      .sort((left, right) => left.username.localeCompare(right.username));

    return res.json({ employees });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load employees.' });
  }
});

app.get('/api/employees/:employeeId/emotions/summary', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'hr') {
    return res.status(403).json({ message: 'Only HR admins can read employee emotion details.' });
  }

  try {
    const employeeDoc = await db.collection('users').doc(req.params.employeeId).get();

    if (!employeeDoc.exists) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const employeeData = employeeDoc.data();

    if (
      normalizeValue(employeeData.role) !== 'employee' ||
      employeeData.companyName !== req.userProfile.companyName
    ) {
      return res.status(403).json({ message: 'Employee not in your company.' });
    }

    const eventsSnapshot = await db
      .collection('emotionEvents')
      .where('companyName', '==', req.userProfile.companyName)
      .where('employeeId', '==', employeeDoc.id)
      .get();
    const events = eventsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const period = req.query.period || 'week';
    const periodEvents = filterEventsByPeriod(events, period);
    const startDate = getPeriodStart(period);
    const now = new Date();

    return res.json({
      employee: sanitizeEmployee(employeeDoc),
      distribution: createEmotionDistribution([employeeDoc], periodEvents, false),
      weeklyTrend: createWeeklyTrend(periodEvents),
      comparison: createCurrentVsPreviousComparison([employeeDoc], events, {
        currentStart: startDate,
        currentEnd: now,
      }),
      intensity: createEmotionalIntensityTrend([employeeDoc], events, period),
      eventsCount: events.length,
    });
  } catch (error) {
    console.error('Employee emotion summary lookup failed:', {
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({ message: 'Could not load employee emotion summary.' });
  }
});

app.get('/api/emotions/distribution', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'hr') {
    return res.status(403).json({ message: 'Only HR admins can read emotion distribution.' });
  }

  try {
    const period = req.query.period || 'week';
    const employeesSnapshot = await db
      .collection('users')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const employeeDocs = employeesSnapshot.docs.filter((doc) => {
      return normalizeValue(doc.data().role) === 'employee';
    });

    if (!employeeDocs.length) {
      return res.json(createEmotionDistribution([], []));
    }

    const eventsSnapshot = await db
      .collection('emotionEvents')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const events = eventsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const filteredEvents = filterEventsByPeriod(events, period);

    return res.json({
      ...createEmotionDistribution(employeeDocs, filteredEvents, false),
      range: {
        start: getPeriodStart(period).toISOString(),
        end: new Date().toISOString(),
        period,
      },
    });
  } catch (error) {
    console.error('Emotion distribution lookup failed:', {
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({ message: 'Could not load emotion distribution.' });
  }
});

app.get('/api/emotions/current-vs-previous', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'hr') {
    return res.status(403).json({ message: 'Only HR admins can read emotion comparison.' });
  }

  try {
    const period = req.query.period || 'week';
    const startDate = getPeriodStart(period);
    const now = new Date();
    const employeesSnapshot = await db
      .collection('users')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const employeeDocs = employeesSnapshot.docs.filter((doc) => {
      return normalizeValue(doc.data().role) === 'employee';
    });

    if (!employeeDocs.length) {
      return res.json(createCurrentVsPreviousComparison([], []));
    }

    const eventsSnapshot = await db
      .collection('emotionEvents')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const events = eventsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return res.json({
      ...createCurrentVsPreviousComparison(employeeDocs, events, {
        currentStart: startDate,
        currentEnd: now,
      }),
      range: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        period,
      },
    });
  } catch (error) {
    console.error('Emotion comparison lookup failed:', {
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({ message: 'Could not load emotion comparison.' });
  }
});

app.get('/api/emotions/intensity', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'hr') {
    return res.status(403).json({ message: 'Only HR admins can read emotional intensity.' });
  }

  try {
    const period = req.query.period || 'week';
    const employeesSnapshot = await db
      .collection('users')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const employeeDocs = employeesSnapshot.docs.filter((doc) => {
      return normalizeValue(doc.data().role) === 'employee';
    });

    if (!employeeDocs.length) {
      return res.json(createEmotionalIntensityTrend([], [], period));
    }

    const eventsSnapshot = await db
      .collection('emotionEvents')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const events = eventsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return res.json(createEmotionalIntensityTrend(employeeDocs, events, period));
  } catch (error) {
    console.error('Emotional intensity lookup failed:', {
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({ message: 'Could not load emotional intensity.' });
  }
});

app.get('/api/emotions/weekly-trend', authenticateRequest, async (req, res) => {
  if (req.userProfile.role !== 'hr') {
    return res.status(403).json({ message: 'Only HR admins can read emotion trends.' });
  }

  try {
    const period = req.query.period || 'week';
    const startDate = getPeriodStart(period);
    const startIso = startDate.toISOString();
    const nowIso = new Date().toISOString();

    const employeesSnapshot = await db
      .collection('users')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const employeeIds = new Set(
      employeesSnapshot.docs
        .filter((doc) => doc.data().role === 'employee')
        .map((doc) => doc.id)
    );

    if (!employeeIds.size) {
      return res.json({
        ...createWeeklyTrend([]),
        range: { start: startIso, end: nowIso, period },
      });
    }

    const eventsSnapshot = await db
      .collection('emotionEvents')
      .where('companyName', '==', req.userProfile.companyName)
      .get();

    const events = eventsSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((event) => employeeIds.has(event.employeeId));
    const filteredEvents = filterEventsByPeriod(events, period);

    return res.json({
      ...createWeeklyTrend(filteredEvents),
      range: { start: startIso, end: nowIso, period },
    });
  } catch (error) {
    console.error('Weekly emotion trend lookup failed:', {
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({ message: 'Could not load weekly emotion trend.' });
  }
});

app.listen(PORT, () => {
  validateAzureVisionStartupConfig();
  console.log(`API server listening on http://localhost:${PORT}`);
});
