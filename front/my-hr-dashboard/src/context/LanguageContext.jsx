import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const translations = {
  en: {},
  es: {
    language: 'Espanol',
    switchLanguage: 'English',
    signedInAs: 'sesion iniciada como',
    logout: 'Cerrar sesion',
    dashboard: 'Dashboard',
    insightsHub: 'Centro de insights',
    totalEmployees: 'TOTAL EMPLEADOS',
    live: 'EN VIVO',
    dominantVibe: 'Vibra dominante',
    evolvingPattern: 'Patron organico en evolucion',
    exporting: 'Exportando...',
    exportPdf: 'Exportar PDF',
    liveMonitoringActive: 'Monitoreo en vivo activo',
    liveTicker: 'TICKER EN VIVO',
    info: 'INFO',
    systemConnected: 'Sistema conectado. Monitoreando transmisiones en vivo...',
    macroSentimentAnalytics: 'Analitica macro de sentimiento',
    macroSentimentSubtitle: 'Tendencias conductuales a largo plazo y mapa de contagio emocional',
    emotionDistribution: 'Distribucion emocional',
    weeklyEmotionTrend: 'Tendencia emocional semanal',
    currentVsPrevious: 'Actual vs hace 7 dias',
    emotionalIntensity: 'Intensidad emocional',
    intensity: 'Intensidad',
    current: 'Actual',
    previous: 'Hace 7 dias',
    percentage: 'Porcentaje',
    records: 'Registros',
    noData: 'Sin datos',
    noEmotionData: 'No hay datos emocionales disponibles',
    insightSubtitle: 'Analisis profundo de patrones de empleados y anomalias',
    recordsInPeriod: 'Registros en el periodo seleccionado',
    periodFilters: 'Filtros de periodo',
    searchPlaceholder: 'Buscar por nombre o rol...',
    processImages: 'Procesar imagenes',
    processingImages: 'Procesando imagenes...',
    employee: 'Empleado',
    role: 'Rol',
    team: 'Equipo',
    liveVibe: 'Vibra en vivo',
    camera: 'Camara',
    lastSync: 'Ultima sincronizacion',
    loadingEmployees: 'Cargando empleados...',
    noEmployeeRecords: 'No hay registros de empleados para este periodo.',
    employeeDetail: 'Detalle del empleado',
    aiClinicalSummary: 'RESUMEN CLINICO IA',
    generatingSummary: 'Generando resumen del empleado...',
    loadingData: 'Cargando datos...',
    pending: 'Pendiente',
    general: 'General',
    on: 'Encendida',
    off: 'Apagada',
    welcomeBack: 'Bienvenido de nuevo',
    selectRole: 'Seleccionar rol',
    hrAdmin: 'Admin HR',
    username: 'Usuario',
    password: 'Contrasena',
    hidePassword: 'Ocultar contrasena',
    showPassword: 'Mostrar contrasena',
    signingIn: 'Iniciando sesion...',
    login: 'Iniciar sesion',
    needAccount: 'Necesitas una cuenta?',
    register: 'Registrarse',
    createAccount: 'Crear cuenta',
    startMonitoring: 'Empieza a monitorear el bienestar de la empresa',
    companyName: 'Nombre de empresa',
    loadingCompanies: 'Cargando empresas...',
    selectCompany: 'Selecciona una empresa registrada',
    creating: 'Creando...',
    alreadyAccount: 'Ya tienes una cuenta?',
    logIn: 'Iniciar sesion',
    hrPlatform: 'Plataforma HR',
    employeeAccess: 'Acceso de empleados',
    registeredEmployees: 'Empleados registrados',
    employees: 'Empleados',
    loading: 'Cargando...',
    recordCount: '{count} registros',
    company: 'Empresa',
    noRegisteredEmployees: 'No hay empleados registrados para esta empresa.',
    loadingSession: 'Cargando sesion...',
    welcomeEmployee: 'Bienvenido, {name}',
    employeeFallback: 'empleado',
    companyFallback: 'Empresa',
    turnOnCameraTitle: 'Enciende tu camara',
    turnOnCameraBody: 'Enciende tu camara y espera a que HR procese la imagen desde su dashboard.',
    turningOn: 'Encendiendo...',
    stopCamera: 'Apagar camara',
    startCamera: 'Encender camara',
    preview: 'Vista previa',
    waitingHr: 'Esperando procesamiento de HR...',
    period: {
      '1h': '1h',
      Today: 'Hoy',
      Week: 'Semana',
      Month: 'Mes',
      Custom: 'Personalizado',
    },
    weekday: {
      Mon: 'Lun',
      Tue: 'Mar',
      Wed: 'Mie',
      Thu: 'Jue',
      Fri: 'Vie',
      Sat: 'Sab',
      Sun: 'Dom',
    },
    emotion: {
      HAPPY: 'FELIZ',
      NEUTRAL: 'NEUTRAL',
      STRESS: 'ESTRES',
      SAD: 'TRISTE',
      ANGRY: 'ENOJO',
      FEAR: 'MIEDO',
      SURPRISE: 'SORPRESA',
      DISGUST: 'DISGUSTO',
      DROWSINESS: 'SOMNOLENCIA',
      Happy: 'Feliz',
      Neutral: 'Neutral',
      Stress: 'Estres',
      Sad: 'Triste',
      Angry: 'Enojo',
      Fear: 'Miedo',
      Surprise: 'Sorpresa',
      Disgust: 'Disgusto',
      Drowsiness: 'Somnolencia',
    },
  },
};

const LanguageContext = createContext(null);

function interpolate(value, params = {}) {
  return Object.entries(params).reduce(
    (text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)),
    value
  );
}

function resolveTranslation(language, key) {
  return key.split('.').reduce((value, part) => value?.[part], translations[language]);
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('lumora-language') || 'en');

  useEffect(() => {
    localStorage.setItem('lumora-language', language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => {
    const t = (key, fallback = key, params = {}) => {
      const translated = resolveTranslation(language, key);
      return interpolate(typeof translated === 'string' ? translated : fallback, params);
    };

    return {
      language,
      setLanguage,
      toggleLanguage: () => setLanguage((current) => (current === 'es' ? 'en' : 'es')),
      t,
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }

  return context;
}
