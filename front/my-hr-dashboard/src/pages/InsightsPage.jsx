import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import FilterLoader from '../components/FilterLoader';
import { getEmployeeEmotionSummary, getEmployees, processActiveEmployeeEmotions } from '../services/api';
import '../App.css';

const EMOTION_COLORS = {
  happy: '#22c55e',
  neutral: '#94a3b8',
  stress: '#f97316',
  sad: '#2f80ed',
  angry: '#ef4444',
  fear: '#8b5cf6',
  surprise: '#14b8a6',
  disgust: '#f5b400',
  drowsiness: '#4f46e5',
};

const emotionItems = [
  { key: 'happy', label: 'Happy', color: EMOTION_COLORS.happy },
  { key: 'neutral', label: 'Neutral', color: EMOTION_COLORS.neutral },
  { key: 'stress', label: 'Stress', color: EMOTION_COLORS.stress },
  { key: 'sad', label: 'Sad', color: EMOTION_COLORS.sad },
  { key: 'angry', label: 'Angry', color: EMOTION_COLORS.angry },
  { key: 'fear', label: 'Fear', color: EMOTION_COLORS.fear },
  { key: 'surprise', label: 'Surprise', color: EMOTION_COLORS.surprise },
  { key: 'disgust', label: 'Disgust', color: EMOTION_COLORS.disgust },
  { key: 'drowsiness', label: 'Drowsiness', color: EMOTION_COLORS.drowsiness },
];

const emptyCounts = emotionItems.reduce((counts, item) => {
  counts[item.key] = 0;
  return counts;
}, {});
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const emptyTrendDays = weekdayLabels.map((label) => ({ label, counts: { ...emptyCounts } }));
const emptyIntensityDays = weekdayLabels.map((label) => ({
  label,
  intensity: 0,
  trend: 0,
}));
const NO_EMPLOYEE_FOUND_MESSAGE = 'No employee found';

function formatPercent(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  const rounded = Math.round(number * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function normalizeCounts(counts) {
  return counts && typeof counts === 'object' ? counts : emptyCounts;
}

function getCountsTotal(counts = {}) {
  return Object.values(normalizeCounts(counts)).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function getEmotionPercent(counts = {}, key) {
  const safeCounts = normalizeCounts(counts);
  const total = getCountsTotal(safeCounts);
  return total ? ((Number(safeCounts[key]) || 0) / total) * 100 : 0;
}

function normalizeMetricPercent(value) {
  const number = Number(value) || 0;
  return number <= 1 ? number * 100 : number;
}

function getEmployeeLiveVibe(employee) {
  return employee?.lastEmotion || employee?.liveVibe || employee?.emotion || employee?.dominantEmotion || employee?.vibe || '';
}

function getEmployeeSyncDate(employee) {
  const timestamp =
    employee?.latestCameraFrameAt ||
    employee?.lastEmotionAt ||
    employee?.liveVibeAt ||
    employee?.emotionAt ||
    employee?.cameraUpdatedAt ||
    employee?.updatedAt ||
    employee?.createdAt;

  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPeriodStart(period, now = new Date()) {
  const start = new Date(now);
  const normalizedPeriod = String(period || '').toLowerCase();

  if (normalizedPeriod === '1h') {
    start.setHours(start.getHours() - 1);
    return start;
  }

  if (normalizedPeriod === 'today') {
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (normalizedPeriod === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  const day = start.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);
  return start;
}

function isEmployeeInPeriod(employee, period) {
  const syncDate = getEmployeeSyncDate(employee);

  if (!syncDate) {
    return false;
  }

  const now = new Date();
  return syncDate >= getPeriodStart(period, now) && syncDate <= now;
}

function formatEmployeeSyncDate(employee) {
  const syncDate = getEmployeeSyncDate(employee);
  return syncDate ? syncDate.toLocaleString() : '--:--';
}

function hexToRgb(hex) {
  const cleanHex = String(hex || '#000000').replace('#', '');
  const value = parseInt(cleanHex.length === 3
    ? cleanHex.split('').map((char) => char + char).join('')
    : cleanHex, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function setPdfColor(doc, hex) {
  const { r, g, b } = hexToRgb(hex);
  doc.setTextColor(r, g, b);
  doc.setDrawColor(r, g, b);
  doc.setFillColor(r, g, b);
}

function drawPdfCard(doc, x, y, width, height) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, y, width, height, 4, 4, 'FD');
}

function drawEmployeeTrendPdf(doc, days, x, y, width, height) {
  const chartDays = days?.length ? days : emptyTrendDays;
  const chartX = x + 8;
  const chartY = y + 8;
  const chartW = width - 16;
  const chartH = height - 17;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  [0, 50, 100].forEach((tick) => {
    const tickY = chartY + chartH - (tick / 100) * chartH;
    doc.line(chartX, tickY, chartX + chartW, tickY);
  });

  emotionItems.forEach((emotion) => {
    const points = chartDays.map((day, index) => {
      const value = getEmotionPercent(day.counts, emotion.key);
      return {
        x: chartX + (chartW / Math.max(chartDays.length - 1, 1)) * index,
        y: chartY + chartH - (value / 100) * chartH,
      };
    });

    setPdfColor(doc, emotion.color);
    doc.setLineWidth(0.55);
    points.forEach((point, index) => {
      if (index > 0) {
        const previous = points[index - 1];
        doc.line(previous.x, previous.y, point.x, point.y);
      }
      doc.circle(point.x, point.y, 0.65, 'F');
    });
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  chartDays.forEach((day, index) => {
    const pointX = chartX + (chartW / Math.max(chartDays.length - 1, 1)) * index;
    doc.text(day.label, pointX - 2.6, chartY + chartH + 6);
  });
}

function getAuditSummary(employeeName, distribution) {
  const counts = normalizeCounts(distribution?.counts);
  const total = getCountsTotal(counts);

  if (!total) {
    return 'No data available.';
  }

  const dominant = emotionItems.reduce(
    (current, item) => (counts[item.key] > current.count ? { label: item.label, count: counts[item.key] } : current),
    { label: 'Neutral', count: 0 }
  );

  return `${employeeName} currently trends ${dominant.label}. Individual analysis is based on ${total} valid Live Vibe record${total === 1 ? '' : 's'}.`;
}

function getSafeFilenamePart(value) {
  return String(value || 'company')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'company';
}

function buildPath(points) {
  if (!points.length) {
    return '';
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const control = (point.x - previous.x) * 0.5;
    return `${path} C ${previous.x + control} ${previous.y}, ${point.x - control} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

function MiniLineChart({ days = emptyTrendDays }) {
  const { t } = useLanguage();
  const width = 330;
  const height = 132;
  const pad = { top: 14, right: 12, bottom: 24, left: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  return (
    <svg className="employee-mini-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('weeklyEmotionTrend', 'Employee weekly trend')}>
      {[100, 50, 0].map((tick) => {
        const y = pad.top + innerH - (tick / 100) * innerH;
        return (
          <g key={tick}>
            <text className="employee-chart-axis" x={4} y={y + 3}>{formatPercent(tick)}</text>
            <line className="employee-chart-grid" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
          </g>
        );
      })}
      {emotionItems.map((emotion) => {
        const points = days.map((day, index) => {
          const value = getEmotionPercent(day.counts, emotion.key);
          return {
            x: pad.left + (innerW / Math.max(days.length - 1, 1)) * index,
            y: pad.top + innerH - (value / 100) * innerH,
          };
        });

        return <path key={emotion.key} className="employee-trend-line" d={buildPath(points)} stroke={emotion.color} />;
      })}
      {days.map((day, index) => (
        <text
          className="employee-chart-axis"
          key={day.label}
          x={pad.left + (innerW / Math.max(days.length - 1, 1)) * index - 4}
          y={height - 7}
        >
          {t(`weekday.${day.label}`, day.label)}
        </text>
      ))}
    </svg>
  );
}

function MiniBarComparison({ comparison }) {
  const { t } = useLanguage();
  const data = {
    current: normalizeCounts(comparison?.current),
    previous: normalizeCounts(comparison?.previous),
  };
  const width = 330;
  const height = 128;
  const pad = { top: 12, right: 8, bottom: 26, left: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const groupW = innerW / emotionItems.length;
  const barW = Math.min(8, groupW * 0.22);
  const currentTotal = getCountsTotal(data.current);
  const previousTotal = getCountsTotal(data.previous);

  return (
    <svg className="employee-mini-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('currentVsPrevious', 'Employee current versus seven days ago')}>
      {[100, 50, 0].map((tick) => {
        const y = pad.top + innerH - (tick / 100) * innerH;
        return (
          <g key={tick}>
            <text className="employee-chart-axis" x={4} y={y + 3}>{formatPercent(tick)}</text>
            <line className="employee-chart-grid" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
          </g>
        );
      })}
      {emotionItems.map((emotion, index) => {
        const current = currentTotal ? ((data.current?.[emotion.key] || 0) / currentTotal) * 100 : 0;
        const previous = previousTotal ? ((data.previous?.[emotion.key] || 0) / previousTotal) * 100 : 0;
        const groupX = pad.left + groupW * index + groupW / 2;
        const currentH = (current / 100) * innerH;
        const previousH = (previous / 100) * innerH;
        return (
          <g key={emotion.key}>
            <rect className="employee-current-bar" x={groupX - barW - 1} y={pad.top + innerH - currentH} width={barW} height={currentH} rx="3" />
            <rect className="employee-previous-bar" x={groupX + 1} y={pad.top + innerH - previousH} width={barW} height={previousH} rx="3" />
            <text className="employee-chart-axis" x={groupX - 4} y={height - 7}>{t(`emotion.${emotion.label}`, emotion.label).slice(0, 3)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MiniIntensityChart({ days = emptyIntensityDays }) {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState(null);
  const chartDays = days?.length ? days : emptyIntensityDays;
  const width = 330;
  const height = 132;
  const pad = { top: 12, right: 12, bottom: 24, left: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const groupW = innerW / Math.max(chartDays.length, 1);
  const barW = Math.min(22, groupW * 0.5);
  const activeDay = activeIndex === null ? null : chartDays[activeIndex];
  const activeX = activeIndex === null ? pad.left : pad.left + groupW * activeIndex + groupW / 2;

  return (
    <div className="employee-intensity-chart-wrap" onMouseLeave={() => setActiveIndex(null)}>
      <svg className="employee-mini-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('emotionalIntensity', 'Employee emotional intensity')}>
        {[100, 50, 0].map((tick) => {
          const y = pad.top + innerH - (tick / 100) * innerH;
          return (
            <g key={tick}>
              <text className="employee-chart-axis" x={4} y={y + 3}>{formatPercent(tick)}</text>
              <line className="employee-chart-grid" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
            </g>
          );
        })}

        {chartDays.map((day, index) => {
          const value = Math.max(0, Math.min(100, normalizeMetricPercent(day.intensity)));
          const barH = (value / 100) * innerH;
          const x = pad.left + groupW * index + (groupW - barW) / 2;

          return (
            <g
              className="employee-intensity-day"
              key={day.label}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              tabIndex={0}
            >
              <rect
                className="employee-intensity-hit"
                x={pad.left + groupW * index}
                y={pad.top}
                width={groupW}
                height={innerH}
              />
              <rect
                className="employee-intensity-bar"
                x={x}
                y={pad.top + innerH - barH}
                width={barW}
                height={barH}
                rx="5"
              />
              <text className="employee-chart-axis" x={x + barW / 2 - 5} y={height - 7}>
                {t(`weekday.${day.label}`, day.label)}
              </text>
            </g>
          );
        })}
      </svg>

      {activeDay && (
        <div
          className="employee-intensity-tooltip"
          style={{
            left: `${(activeX / width) * 100}%`,
            transform:
              activeIndex === 0
                ? 'translateX(0)'
                : activeIndex === chartDays.length - 1
                  ? 'translateX(-100%)'
                  : 'translateX(-50%)',
          }}
        >
          <strong>{t(`weekday.${activeDay.label}`, activeDay.label)}</strong>
          <span>{t('emotionalIntensity', 'Emotional Intensity')}: {formatPercent(normalizeMetricPercent(activeDay.intensity))}</span>
        </div>
      )}
    </div>
  );
}

function describeDonutArc(cx, cy, radius, startAngle, endAngle) {
  const start = {
    x: cx + radius * Math.cos(startAngle),
    y: cy + radius * Math.sin(startAngle),
  };
  const end = {
    x: cx + radius * Math.cos(endAngle),
    y: cy + radius * Math.sin(endAngle),
  };
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function EmployeeEmotionDonut({ distribution }) {
  const { t } = useLanguage();
  const [activeEmotion, setActiveEmotion] = useState(null);
  const counts = distribution?.counts || emptyCounts;
  const total = Number(distribution?.total) || getCountsTotal(counts);
  const dominant = emotionItems.reduce(
    (current, item) =>
      (counts[item.key] || 0) > current.count
        ? { ...item, count: counts[item.key] || 0 }
        : current,
    { label: t('noData', 'No data'), key: '', color: '#94a3b8', count: 0 }
  );
  let cursor = -Math.PI / 2;
  const segments = emotionItems
    .map((emotion) => {
      const records = Number(counts[emotion.key]) || 0;
      const percentage = total ? (records / total) * 100 : 0;
      const start = cursor;
      const end = cursor + (percentage / 100) * Math.PI * 2;
      cursor = end;

      return {
        ...emotion,
        records,
        percentage,
        start,
        end,
      };
    })
    .filter((segment) => segment.records > 0);

  if (!total) {
    return <div className="employee-chart-empty">{t('noEmotionData', 'No emotion data available')}</div>;
  }

  return (
    <div className="employee-donut-wrap" onMouseLeave={() => setActiveEmotion(null)}>
      <div className="employee-donut-stage">
        <svg className="employee-donut" viewBox="0 0 170 170" role="img" aria-label="Employee emotion distribution donut">
          <circle className="employee-donut-track" cx="85" cy="85" r="56" />
          {segments.map((segment) => (
            <path
              className="employee-donut-segment"
              key={segment.key}
              d={describeDonutArc(85, 85, 56, segment.start, segment.end)}
              stroke={segment.color}
              onMouseEnter={() => setActiveEmotion(segment)}
              onFocus={() => setActiveEmotion(segment)}
              onBlur={() => setActiveEmotion(null)}
              tabIndex={0}
            />
          ))}
          <circle className="employee-donut-hole" cx="85" cy="85" r="34" />
          <text className="employee-donut-center-label" x="85" y="81">
            {dominant.label}
          </text>
          <text className="employee-donut-center-value" x="85" y="98">
            {total} records
          </text>
        </svg>

        {activeEmotion && (
          <div className="employee-donut-tooltip">
            <strong>{t(`emotion.${activeEmotion.label}`, activeEmotion.label)}</strong>
            <span>{t('percentage', 'Percentage')}: {formatPercent(activeEmotion.percentage)}</span>
            <span>{t('records', 'Records')}: {activeEmotion.records}</span>
          </div>
        )}
      </div>

      <div className="employee-donut-legend">
        {emotionItems.map((emotion) => {
          const records = Number(counts[emotion.key]) || 0;
          const percentage = total ? (records / total) * 100 : 0;

          return (
            <span key={emotion.key} style={{ color: emotion.color }}>
              <i style={{ backgroundColor: emotion.color }} />
              {t(`emotion.${emotion.label}`, emotion.label)} {formatPercent(percentage)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const InsightsPage = () => {
  const { firebaseUser, userProfile, logout } = useAuth();
  const { language, t, toggleLanguage } = useLanguage();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('Week');
  const [query, setQuery] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [processingError, setProcessingError] = useState('');
  const [processSummary, setProcessSummary] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeDetail, setEmployeeDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [filterLoading, setFilterLoading] = useState(false);
  const filterTimeoutRef = useRef(null);

  const showFilterLoader = () => {
    setFilterLoading(true);
    window.clearTimeout(filterTimeoutRef.current);
    filterTimeoutRef.current = window.setTimeout(() => {
      setFilterLoading(false);
    }, 400);
  };

  useEffect(() => {
    return () => {
      window.clearTimeout(filterTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadEmployees() {
      if (!firebaseUser) {
        setLoading(false);
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const data = await getEmployees(token);

        if (isMounted) {
          setEmployees(Array.isArray(data.employees) ? data.employees : []);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message || 'Could not load employees.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadEmployees();

    return () => {
      isMounted = false;
    };
  }, [firebaseUser]);

  const filteredEmployees = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const employeesInPeriod = employees.filter((employee) => isEmployeeInPeriod(employee, period));

    if (!needle) {
      return employeesInPeriod;
    }

    return employeesInPeriod.filter((employee) => {
      return [employee.username, employee.role, employee.team, getEmployeeLiveVibe(employee)]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [employees, period, query]);

  const handleProcessImages = async () => {
    if (!firebaseUser) {
      return;
    }

    setProcessing(true);
    setProcessingError('');
    setProcessSummary('');

    try {
      const token = await firebaseUser.getIdToken();
      const response = await processActiveEmployeeEmotions(token);
      const results = response.processed || [];
      const skipped = response.skipped || [];

      if (response.status === 'no_employee_found' || (!results.length && !skipped.length)) {
        setProcessSummary(response.message || NO_EMPLOYEE_FOUND_MESSAGE);
        return;
      }

      if (!results.length) {
        setProcessSummary(response.message || NO_EMPLOYEE_FOUND_MESSAGE);
        return;
      }

      setEmployees((prev) =>
        prev.map((employee) => {
          const update = results.find((item) => item.employeeId === employee.id);
          const skip = skipped.find((item) => item.employeeId === employee.id);

          if (!update && !skip?.capturedAt) {
            return employee;
          }

          return {
            ...employee,
            lastEmotion: update?.emotion || employee.lastEmotion,
            lastEmotionAt: update?.capturedAt || employee.lastEmotionAt,
            liveVibe: update?.emotion || employee.liveVibe,
            liveVibeAt: update?.capturedAt || employee.liveVibeAt,
            emotion: update?.emotion || employee.emotion,
            emotionAt: update?.capturedAt || employee.emotionAt,
            latestCameraFrameAt: update?.frameCapturedAt || skip?.capturedAt || employee.latestCameraFrameAt,
          };
        })
      );

      const refreshed = await getEmployees(token);
      const nextEmployees = Array.isArray(refreshed.employees) ? refreshed.employees : [];
      setEmployees(nextEmployees);

      window.dispatchEvent(
        new CustomEvent('employees:update', {
          detail: { source: 'process-images', processed: results.length },
        })
      );
      window.dispatchEvent(
        new CustomEvent('emotion:update', {
          detail: { source: 'process-images', processed: results },
        })
      );

      setProcessSummary(response.message || `${results.length} employees were processed`);
    } catch (requestError) {
      setProcessingError(requestError.message || NO_EMPLOYEE_FOUND_MESSAGE);
    } finally {
      setProcessing(false);
    }
  };

  const handleExportPdf = async () => {
    if (!firebaseUser || exportingPdf) {
      return;
    }

    setExportingPdf(true);
    setProcessingError('');

    try {
      const token = await firebaseUser.getIdToken();
      const companyName = userProfile?.companyName || 'Company';
      const visibleEmployees = filteredEmployees.filter((employee) => {
        return employee.role === 'employee' && (!employee.companyName || employee.companyName === companyName);
      });
      const generatedAt = new Date();
      const details = await Promise.all(
        visibleEmployees.map(async (employee) => {
          try {
            const summary = await getEmployeeEmotionSummary(token, employee.id, 'Week');
            return { employee, summary, failed: false };
          } catch (requestError) {
            return { employee, summary: null, failed: true };
          }
        })
      );

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const page = { width: 210, height: 297, margin: 14 };
      let cursorY = 14;

      const drawHeader = () => {
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 0, page.width, page.height, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(21);
        doc.setTextColor(15, 23, 42);
        doc.text('Auditoría de Empleados', page.margin, 22);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('Lumora AI', page.margin, 29);
        doc.text(`Empresa: ${companyName}`, page.margin, 35);
        doc.text(`Generado: ${generatedAt.toLocaleString()}`, page.margin, 41);

        drawPdfCard(doc, 128, 16, 68, 24);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('REGISTROS ACTIVOS', 134, 26);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42);
        doc.text(String(visibleEmployees.length), 134, 36);
        cursorY = 52;
      };

      const addPageIfNeeded = (blockHeight) => {
        if (cursorY + blockHeight <= page.height - page.margin) {
          return;
        }

        doc.addPage();
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 0, page.width, page.height, 'F');
        cursorY = page.margin;
      };

      drawHeader();

      if (!details.length) {
        drawPdfCard(doc, page.margin, cursorY, 182, 30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text('No data available', page.margin + 6, cursorY + 17);
      }

      details.forEach(({ employee, summary }) => {
        const blockHeight = 91;
        addPageIfNeeded(blockHeight);

        const distribution = summary?.distribution || { counts: emptyCounts, percentages: emptyCounts, total: 0 };
        const counts = normalizeCounts(distribution.counts);
        const total = getCountsTotal(counts);
        const weeklyDays = summary?.weeklyTrend?.days?.length ? summary.weeklyTrend.days : emptyTrendDays;
        const employeeName = employee.username || 'Employee';
        const liveVibe = getEmployeeLiveVibe(employee) || 'Pending';
        const lastSync = formatEmployeeSyncDate(employee);
        const summaryText = total ? getAuditSummary(employeeName, distribution) : 'No data available.';

        drawPdfCard(doc, page.margin, cursorY, 182, blockHeight - 4);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(employeeName, page.margin + 6, cursorY + 9);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Equipo: ${employee.team || 'General'} | Rol: ${employee.role || 'employee'}`, page.margin + 6, cursorY + 15);
        doc.text(`Live Vibe: ${liveVibe} | Ultima sincronizacion: ${lastSync}`, page.margin + 6, cursorY + 21);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text('Distribucion emocional', page.margin + 6, cursorY + 30);
        doc.text('Tendencia 7 dias', page.margin + 103, cursorY + 30);

        emotionItems.forEach((emotion, index) => {
          const rowY = cursorY + 37 + index * 4.8;
          const percentage = total ? (counts[emotion.key] / total) * 100 : 0;
          setPdfColor(doc, emotion.color);
          doc.circle(page.margin + 7.5, rowY - 1.2, 1.1, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.8);
          doc.text(emotion.label, page.margin + 11, rowY);
          doc.setDrawColor(226, 232, 240);
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(page.margin + 43, rowY - 3, 28, 2.6, 1.2, 1.2, 'F');
          setPdfColor(doc, emotion.color);
          doc.roundedRect(page.margin + 43, rowY - 3, Math.max(0, (percentage / 100) * 28), 2.6, 1.2, 1.2, 'F');
          doc.setTextColor(100, 116, 139);
          doc.text(formatPercent(percentage), page.margin + 75, rowY);
        });

        drawEmployeeTrendPdf(doc, weeklyDays, page.margin + 98, cursorY + 33, 88, 39);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        const summaryLines = doc.splitTextToSize(`Resumen AI: ${summaryText}`, 170);
        doc.text(summaryLines.slice(0, 2), page.margin + 6, cursorY + 80);

        cursorY += blockHeight;
      });

      const safeCompanyName = getSafeFilenamePart(companyName);
      const dateStamp = generatedAt.toISOString().slice(0, 10);
      doc.save(`lumora-insight-hub-${safeCompanyName}-${dateStamp}.pdf`);
    } catch (requestError) {
      setProcessingError(requestError.message || 'No se pudo exportar el PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const openEmployeeDetail = (employee) => {
    setSelectedEmployee(employee);
    setEmployeeDetail(null);
    setDetailError('');
  };

  useEffect(() => {
    let isActive = true;

    async function loadEmployeeDetail() {
      if (!selectedEmployee || !firebaseUser) {
        return;
      }

      setDetailLoading(true);
      setEmployeeDetail(null);
      setDetailError('');

      try {
        const token = await firebaseUser.getIdToken();
        const detail = await getEmployeeEmotionSummary(token, selectedEmployee.id, period);

        if (isActive) {
          setEmployeeDetail(detail);
        }
      } catch (requestError) {
        if (isActive) {
          setDetailError(requestError.message || 'Could not load employee detail.');
        }
      } finally {
        if (isActive) {
          setDetailLoading(false);
        }
      }
    }

    loadEmployeeDetail();

    return () => {
      isActive = false;
    };
  }, [firebaseUser, selectedEmployee, period]);

  const closeEmployeeDetail = () => {
    setSelectedEmployee(null);
    setEmployeeDetail(null);
    setDetailLoading(false);
    setDetailError('');
  };

  const handlePeriodChange = (nextPeriod) => {
    if (filterLoading || nextPeriod === period) {
      return;
    }

    setPeriod(nextPeriod);
    showFilterLoader();
  };

  const handleQueryChange = (event) => {
    setQuery(event.target.value);
    showFilterLoader();
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const detailEmployee = employeeDetail?.employee || selectedEmployee;
  const detailDistribution = employeeDetail?.distribution || { counts: emptyCounts, percentages: emptyCounts, total: 0 };
  const detailWeeklyDays = employeeDetail?.weeklyTrend?.days?.length ? employeeDetail.weeklyTrend.days : emptyTrendDays;
  const detailComparison = employeeDetail?.comparison || { current: emptyCounts, previous: emptyCounts };
  const detailIntensityDays = employeeDetail?.intensity?.days?.length ? employeeDetail.intensity.days : emptyIntensityDays;
  const currentVibe = getEmployeeLiveVibe(detailEmployee) || t('pending', 'Pending');
  const lastSync =
    detailEmployee?.latestCameraFrameAt ||
    detailEmployee?.lastEmotionAt ||
    detailEmployee?.liveVibeAt ||
    detailEmployee?.emotionAt;
  const validLiveVibeCount = Number(detailDistribution.total) || 0;
  const dominantEmotion = emotionItems.reduce(
    (current, item) =>
      (detailDistribution.counts?.[item.key] || 0) > current.count
        ? { label: item.label, count: detailDistribution.counts[item.key] || 0 }
        : current,
    { label: t('pending', 'Pending'), count: 0 }
  );
  const clinicalSummary = validLiveVibeCount
    ? `${detailEmployee?.username || t('employee', 'Employee')} ${language === 'es' ? 'tiene tendencia' : 'currently trends'} ${t(`emotion.${dominantEmotion.label}`, dominantEmotion.label)}. ${t('liveVibe', 'Live Vibe')}: ${t(`emotion.${currentVibe}`, currentVibe)}. ${validLiveVibeCount} ${t('records', 'records')}.`
    : language === 'es'
      ? 'Aun no hay historial individual de Vibra en Vivo. Procesa imagenes para generar un resumen especifico.'
      : 'No individual Live Vibe history is available yet. Process Images to generate an employee-specific summary.';

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="sidebar-logo" src="/logo-lumora.jpg" alt="" />
          <span>LUMORA</span>
        </div>
        <div className="sidebar-items">
          <button
            className="sidebar-icon"
            type="button"
            data-label="Dashboard"
            onClick={() => navigate('/dashboard')}
          >
            <span className="icon-tiles">
              <span />
              <span />
              <span />
              <span />
            </span>
          </button>
          <button className="sidebar-icon sidebar-active" type="button" data-label="Insights Hub">
            <span className="icon-shield">
              <span className="icon-alert" />
            </span>
          </button>
        </div>
        <button
          className="sidebar-icon logout-icon"
          type="button"
          onClick={handleLogout}
          data-label={t('logout', 'Log out')}
        >
          <span className="icon-arrow" />
        </button>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-top">
          <div>
            <h1 className="dashboard-title">{t('insightsHub', 'Insight Hub')}</h1>
            <p className="dashboard-subtitle">{t('insightSubtitle', 'Deep-dive into employee patterns and audit anomalies')}</p>
          </div>
          <div className="dashboard-actions">
            <button className="ghost-button" type="button" onClick={toggleLanguage}>
              <span className="globe-icon" /> Language
            </button>
          </div>
        </header>

        <section className="insights-panel" aria-busy={filterLoading}>
          {filterLoading && <FilterLoader />}
          <div className="insights-summary">
            <span className="insights-counter">{filteredEmployees.length}</span>
            <span className="insights-label">{t('recordsInPeriod', 'Records in selected period')}</span>
          </div>

          <div className="insights-toolbar">
            <div className="insights-tabs" role="tablist" aria-label={t('periodFilters', 'Period filters')}>
              {['1h', 'Today', 'Week', 'Month'].map((label) => (
                <button
                  key={label}
                  className={`insights-tab${period === label ? ' active' : ''}`}
                  type="button"
                  onClick={() => handlePeriodChange(label)}
                  disabled={filterLoading}
                >
                  {t(`period.${label}`, label)}
                </button>
              ))}
            </div>

            <div className="insights-search">
              <span className="search-icon">🔍</span>
              <input
                type="search"
                placeholder={t('searchPlaceholder', 'Search by name or role...')}
                value={query}
                onChange={handleQueryChange}
              />
            </div>

            <div className="insights-actions">
              <button
                className="insights-button"
                type="button"
                onClick={handleProcessImages}
                disabled={processing}
              >
                {processing ? t('processingImages', 'Processing images...') : t('processImages', 'Process Images')}
              </button>
              <button
                className="insights-button secondary"
                type="button"
                onClick={handleExportPdf}
                disabled={exportingPdf}
              >
                {exportingPdf ? t('exporting', 'Exporting...') : t('exportPdf', 'Export PDF')}
              </button>
            </div>
          </div>

          {processingError && <div className="form-alert error">{processingError}</div>}
          {processSummary && <div className="form-alert success">{processSummary}</div>}
          {error && <div className="form-alert error">{error}</div>}

          <div className="insights-table">
            <div className="insights-row insights-head">
              <span>{t('employee', 'Employee')}</span>
              <span>{t('role', 'Role')}</span>
              <span>{t('team', 'Team')}</span>
              <span>{t('liveVibe', 'Live Vibe')}</span>
              <span>{t('camera', 'Camera')}</span>
              <span>{t('lastSync', 'Last Sync')}</span>
            </div>
            {loading && <div className="insights-empty">{t('loadingEmployees', 'Loading employees...')}</div>}
            {!loading && filteredEmployees.length === 0 && (
              <div className="insights-empty">{t('noEmployeeRecords', 'No employee records for this period.')}</div>
            )}
            {!loading && filteredEmployees.map((employee) => (
              <button
                className="insights-row insights-row-button"
                key={employee.id}
                type="button"
                onClick={() => openEmployeeDetail(employee)}
              >
                <div className="insights-employee">
                  <div className="employee-avatar">{employee.username?.slice(0, 1) || 'E'}</div>
                  <div>
                    <strong>{employee.username}</strong>
                    <span>#{employee.id}</span>
                  </div>
                </div>
                <span>{employee.role}</span>
                <span className="insights-tag">{employee.team || t('general', 'General')}</span>
                <span className="insights-vibe">
                  {(() => {
                    const liveVibe = getEmployeeLiveVibe(employee);
                    return t(`emotion.${liveVibe}`, liveVibe || t('pending', 'Pending'));
                  })()}
                </span>
                <span className="insights-tag">{employee.cameraOn ? t('on', 'On') : t('off', 'Off')}</span>
                <span className="insights-sync">{formatEmployeeSyncDate(employee)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {selectedEmployee && (
        <div className="employee-drawer-layer" role="dialog" aria-modal="true" aria-label={t('employeeDetail', 'Employee details')}>
          <button className="employee-drawer-overlay" type="button" onClick={closeEmployeeDetail} aria-label={t('employeeDetail', 'Close employee detail')} />
          <aside className="employee-drawer">
            <button className="employee-drawer-close" type="button" onClick={closeEmployeeDetail} aria-label="Close">
              X
            </button>

            <div className="employee-drawer-profile">
              <div className="employee-drawer-avatar">{detailEmployee?.username?.slice(0, 1) || 'E'}</div>
              <div>
                <span className="employee-drawer-eyebrow">{t('employeeDetail', 'Employee Detail')}</span>
                <h2>{detailEmployee?.username || t('employee', 'Employee')}</h2>
                <p>{detailEmployee?.team || t('general', 'General')} - {detailEmployee?.role || 'employee'}</p>
              </div>
            </div>

            <div className="employee-drawer-metrics">
              <div>
                <span>{t('liveVibe', 'Live Vibe')}</span>
                <strong>{t(`emotion.${currentVibe}`, currentVibe)}</strong>
              </div>
              <div>
                <span>{t('lastSync', 'Last Sync')}</span>
                <strong>{lastSync ? new Date(lastSync).toLocaleString() : '--:--'}</strong>
              </div>
            </div>

            <section className="clinical-summary">
              <div className="clinical-summary-top">
                <span>{t('aiClinicalSummary', 'AI CLINICAL SUMMARY')}</span>
              </div>
              <p>{detailLoading ? t('generatingSummary', 'Generating employee summary...') : clinicalSummary}</p>
            </section>

            {detailError && <div className="form-alert error">{detailError}</div>}

            <div className="employee-drawer-charts">
              <section className="employee-detail-card">
                <h3>{t('emotionDistribution', 'Emotion Distribution')}</h3>
                {detailLoading ? <div className="employee-chart-empty">{t('loadingData', 'Loading data...')}</div> : <EmployeeEmotionDonut distribution={detailDistribution} />}
              </section>

              <section className="employee-detail-card">
                <h3>{t('weeklyEmotionTrend', 'Weekly Emotion Trend')}</h3>
                {detailLoading ? <div className="employee-chart-empty">{t('loadingData', 'Loading data...')}</div> : <MiniLineChart days={detailWeeklyDays} />}
              </section>

              <section className="employee-detail-card">
                <h3>{t('currentVsPrevious', 'Current vs 7 Days Ago')}</h3>
                {detailLoading ? <div className="employee-chart-empty">{t('loadingData', 'Loading data...')}</div> : <MiniBarComparison comparison={detailComparison} />}
              </section>

              <section className="employee-detail-card">
                <h3>{t('emotionalIntensity', 'Emotional Intensity')}</h3>
                {detailLoading ? <div className="employee-chart-empty">{t('loadingData', 'Loading data...')}</div> : <MiniIntensityChart days={detailIntensityDays} />}
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default InsightsPage;
