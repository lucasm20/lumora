import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import FilterLoader from '../components/FilterLoader';
import {
  getDashboardData,
  getEmotionalIntensity,
  getEmotionComparison,
  getEmotionDistribution,
  getEmployees,
  getWeeklyEmotionTrend,
} from '../services/api';
import '../App.css';

const EMOTION_COLORS = {
  happy: '#22c55e',
  neutral: '#94a3b8',
  stress: '#f97316',
  angry: '#ef4444',
  fear: '#8b5cf6',
  drowsiness: '#4f46e5',
};

const emotionItems = [
  { key: 'happy', label: 'HAPPY', display: 'Happy', tone: EMOTION_COLORS.happy, emoji: '\u{1F60A}' },
  { key: 'neutral', label: 'NEUTRAL', display: 'Neutral', tone: EMOTION_COLORS.neutral, emoji: '\u{1F610}' },
  { key: 'stress', label: 'STRESS', display: 'Stress', tone: EMOTION_COLORS.stress, emoji: '\u{1F62B}' },
  { key: 'angry', label: 'ANGRY', display: 'Angry', tone: EMOTION_COLORS.angry, emoji: '\u{1F620}' },
  { key: 'fear', label: 'FEAR', display: 'Fear', tone: EMOTION_COLORS.fear, emoji: '\u{1F628}' },
  { key: 'drowsiness', label: 'DROWSINESS', display: 'Drowsiness', tone: EMOTION_COLORS.drowsiness, emoji: '\u{1F634}' },
];

const periodOptions = ['1h', 'Today', 'Week', 'Month'];
const monthLabels = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const emotionAliases = {
  anger: 'angry',
  angry: 'angry',
  drowsiness: 'drowsiness',
  drowsy: 'drowsiness',
  fear: 'fear',
  fearful: 'fear',
  happy: 'happy',
  joy: 'happy',
  neutral: 'neutral',
  stress: 'stress',
  stressed: 'stress',
};

const emptyEmotionCounts = emotionItems.reduce((counts, item) => {
  counts[item.key] = 0;
  return counts;
}, {});

const emptyTrendDays = weekdayLabels.map((label) => ({
  label,
  counts: { ...emptyEmotionCounts },
}));

const emptyEmotionComparison = {
  current: { ...emptyEmotionCounts },
  previous: null,
  previousAvailable: false,
  previousAvailableByEmotion: { ...emptyEmotionCounts },
  maxValue: 0,
};

const emptyEmotionDistribution = {
  counts: { ...emptyEmotionCounts },
  percentages: { ...emptyEmotionCounts },
  total: 0,
};

const emptyIntensityDays = weekdayLabels.map((label) => ({
  label,
  intensity: 0,
  trend: 0,
  total: 0,
  intense: 0,
}));

function getMonthValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthPeriod(monthValue) {
  return `month:${monthValue}`;
}

function isSelectedMonthPeriod(period) {
  return String(period || '').toLowerCase().startsWith('month:');
}

function getMonthOptions(year = new Date().getFullYear()) {
  return monthLabels.map((label, index) => ({
    label,
    value: `${year}-${String(index + 1).padStart(2, '0')}`,
  }));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmotion(value) {
  return emotionAliases[normalizeText(value)] || '';
}

function formatPercent(value) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const rounded = Math.round(safeValue * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function getCountsTotal(counts = {}) {
  return Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function getEmotionPercent(counts = {}, emotionKey) {
  const total = getCountsTotal(counts);
  return total ? ((Number(counts[emotionKey]) || 0) / total) * 100 : 0;
}

function normalizeMetricPercent(value) {
  const numericValue = Number(value) || 0;
  return numericValue <= 1 ? numericValue * 100 : numericValue;
}

function normalizeComparisonData(comparisonData) {
  const currentComparison = {
    ...emptyEmotionCounts,
    ...(comparisonData?.current || {}),
  };
  const hasCurrentComparison = getCountsTotal(currentComparison) > 0;

  return {
    current: currentComparison,
    previous: hasCurrentComparison && comparisonData?.previous ? { ...emptyEmotionCounts, ...comparisonData.previous } : null,
    previousAvailable: hasCurrentComparison && Boolean(comparisonData?.previousAvailable),
    previousAvailableByEmotion: hasCurrentComparison
      ? {
          ...emptyEmotionCounts,
          ...(comparisonData?.previousAvailableByEmotion || {}),
        }
      : { ...emptyEmotionCounts },
    maxValue: hasCurrentComparison ? Number(comparisonData?.maxValue) || 0 : 0,
  };
}

function buildDominantVibeStyle(emotionStats) {
  const activeItems = emotionItems
    .map((emotion) => ({
      ...emotion,
      percentage: Number(emotionStats.percentages?.[emotion.key]) || 0,
    }))
    .filter((emotion) => emotion.percentage > 0);
  const fallbackColor = EMOTION_COLORS.neutral;
  const dominantColor = EMOTION_COLORS[emotionStats.dominantEmotion] || fallbackColor;

  if (!activeItems.length) {
    return {
      '--vibe-gradient': `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.62) 0 12%, transparent 36%), radial-gradient(circle at 35% 30%, ${fallbackColor} 0%, #c7d2fe 52%, #eef2ff 100%)`,
      '--vibe-c1': fallbackColor,
      '--vibe-c2': '#c7d2fe',
      '--vibe-glow': 'rgba(147, 197, 253, 0.3)',
    };
  }

  const positions = [
    ['28%', '26%'],
    ['72%', '30%'],
    ['46%', '72%'],
    ['22%', '68%'],
    ['78%', '72%'],
    ['52%', '42%'],
    ['34%', '52%'],
    ['66%', '54%'],
    ['50%', '20%'],
  ];
  const layers = activeItems.map((emotion, index) => {
    const [x, y] = positions[index % positions.length];
    const size = Math.max(34, Math.min(74, 30 + emotion.percentage * 0.75));
    return `radial-gradient(circle at ${x} ${y}, ${emotion.tone} 0%, ${emotion.tone} ${size * 0.42}%, transparent ${size}%)`;
  });

  return {
    '--vibe-gradient': `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.58) 0 11%, transparent 35%), ${layers.join(', ')}, linear-gradient(135deg, ${activeItems[0]?.tone || dominantColor}, ${activeItems[activeItems.length - 1]?.tone || dominantColor})`,
    '--vibe-c1': activeItems[0]?.tone || dominantColor,
    '--vibe-c2': activeItems[1]?.tone || dominantColor,
    '--vibe-glow': `${dominantColor}38`,
  };
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

function drawPdfTitle(doc, title, x, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(title, x, y);
}

function drawPdfAxes(doc, x, y, width, height) {
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);

  [0, 25, 50, 75, 100].forEach((tick) => {
    const tickY = y + height - (tick / 100) * height;
    doc.line(x, tickY, x + width, tickY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(formatPercent(tick), x - 12, tickY + 2);
  });
}

function drawPdfLegend(doc, items, x, y, maxWidth = 180) {
  let cursorX = x;
  let cursorY = y;

  items.forEach((item) => {
    const itemWidth = doc.getTextWidth(item.label) + 9;

    if (cursorX + itemWidth > x + maxWidth) {
      cursorX = x;
      cursorY += 5;
    }

    setPdfColor(doc, item.color);
    doc.circle(cursorX + 1.5, cursorY - 1.4, 1.2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(item.label, cursorX + 5, cursorY);
    cursorX += itemWidth + 6;
  });
}

function drawLineSeries(doc, points, color) {
  if (points.length < 2) {
    return;
  }

  setPdfColor(doc, color);
  doc.setLineWidth(0.55);

  points.forEach((point, index) => {
    if (index > 0) {
      const previous = points[index - 1];
      doc.line(previous.x, previous.y, point.x, point.y);
    }
    doc.circle(point.x, point.y, 0.9, 'F');
  });
}

function drawWeeklyTrendPdf(doc, weeklyTrend, x, y, width, height) {
  drawPdfCard(doc, x, y, width, height);
  drawPdfTitle(doc, 'Weekly Emotion Trend', x + 6, y + 9);
  drawPdfLegend(
    doc,
    emotionItems.map((emotion) => ({ label: emotion.display, color: emotion.tone })),
    x + 58,
    y + 9,
    width - 66
  );

  const chartX = x + 18;
  const chartY = y + 22;
  const chartW = width - 26;
  const chartH = height - 34;
  const days = weeklyTrend.days?.length ? weeklyTrend.days : emptyTrendDays;
  drawPdfAxes(doc, chartX, chartY, chartW, chartH);

  emotionItems.forEach((emotion) => {
    const points = days.map((day, index) => {
      const value = getEmotionPercent(day.counts, emotion.key);
      const pointX = chartX + (chartW / Math.max(days.length - 1, 1)) * index;
      const pointY = chartY + chartH - (value / 100) * chartH;
      return { x: pointX, y: pointY };
    });

    drawLineSeries(doc, points, emotion.tone);
  });

  days.forEach((day, index) => {
    const pointX = chartX + (chartW / Math.max(days.length - 1, 1)) * index;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(day.label, pointX - 3, chartY + chartH + 6);
  });
}

function drawComparisonPdf(doc, comparison, x, y, width, height) {
  drawPdfCard(doc, x, y, width, height);
  drawPdfTitle(doc, 'Current vs 7 Days Ago', x + 6, y + 9);
  drawPdfLegend(
    doc,
    [
      { label: 'Current', color: '#4f46e5' },
      { label: '7 Days Ago', color: '#c7d2fe' },
    ],
    x + width - 55,
    y + 9,
    50
  );

  const chartX = x + 18;
  const chartY = y + 21;
  const chartW = width - 28;
  const chartH = height - 36;
  const groupW = chartW / emotionItems.length;
  const barW = Math.min(3.5, groupW * 0.24);
  const currentTotal = getCountsTotal(comparison.current);
  const previousTotal = comparison.previousAvailable && comparison.previous ? getCountsTotal(comparison.previous) : 0;

  drawPdfAxes(doc, chartX, chartY, chartW, chartH);

  emotionItems.forEach((emotion, index) => {
    const current = currentTotal ? ((comparison.current?.[emotion.key] || 0) / currentTotal) * 100 : 0;
    const previousAvailable = Boolean(comparison.previousAvailableByEmotion?.[emotion.key]);
    const previous = previousAvailable && previousTotal ? ((comparison.previous?.[emotion.key] || 0) / previousTotal) * 100 : 0;
    const groupX = chartX + groupW * index + groupW / 2;
    const currentH = (current / 100) * chartH;
    const previousH = (previous / 100) * chartH;

    doc.setFillColor(79, 70, 229);
    doc.roundedRect(groupX - barW - 1, chartY + chartH - currentH, barW, currentH, 1, 1, 'F');
    if (previousAvailable && previousTotal) {
      doc.setFillColor(199, 210, 254);
      doc.roundedRect(groupX + 1, chartY + chartH - previousH, barW, previousH, 1, 1, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(emotion.display.slice(0, 4), groupX - 4, chartY + chartH + 6);
  });
}

function drawIntensityPdf(doc, days, x, y, width, height) {
  drawPdfCard(doc, x, y, width, height);
  drawPdfTitle(doc, 'Emotional Intensity', x + 6, y + 9);

  const chartX = x + 18;
  const chartY = y + 21;
  const chartW = width - 28;
  const chartH = height - 36;
  const chartDays = days?.length ? days : emptyIntensityDays;
  const groupW = chartW / Math.max(chartDays.length, 1);
  const barW = Math.min(8, groupW * 0.56);

  drawPdfAxes(doc, chartX, chartY, chartW, chartH);

  chartDays.forEach((day, index) => {
    const value = Math.max(0, Math.min(100, normalizeMetricPercent(day.intensity)));
    const barHeight = (value / 100) * chartH;
    const barX = chartX + groupW * index + (groupW - barW) / 2;

    doc.setFillColor(253, 164, 175);
    doc.roundedRect(barX, chartY + chartH - barHeight, barW, barHeight, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(day.label, barX + barW / 2 - 2.5, chartY + chartH + 6);
  });
}

function getEmployeeLiveVibe(employee) {
  return (
    normalizeEmotion(employee?.lastEmotion) ||
    normalizeEmotion(employee?.liveVibe) ||
    normalizeEmotion(employee?.emotion) ||
    normalizeEmotion(employee?.dominantEmotion) ||
    normalizeEmotion(employee?.vibe)
  );
}

function isEmployee(employee) {
  return normalizeText(employee?.role) === 'employee';
}

function isActiveEmployee(employee) {
  const status = normalizeText(employee?.status);
  return employee?.active !== false && employee?.disabled !== true && status !== 'inactive';
}

function getRecordDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEmployeeActivityDate(employee) {
  const timestamps = [
    employee?.latestCameraFrameAt,
    employee?.lastEmotionAt,
    employee?.lastSync,
    employee?.timestamp,
    employee?.cameraUpdatedAt,
    employee?.updatedAt,
    employee?.createdAt,
  ]
    .map(getRecordDate)
    .filter(Boolean);

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps.map((date) => date.getTime())));
}

function formatTickerTime(date) {
  return (date || new Date()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function belongsToCurrentCompany(employee, userProfile) {
  const profileCompanyId = normalizeText(userProfile?.companyId);
  const employeeCompanyId = normalizeText(employee?.companyId);

  if (profileCompanyId && employeeCompanyId) {
    return profileCompanyId === employeeCompanyId;
  }

  const profileCompanyName = normalizeText(userProfile?.companyName);
  const employeeCompanyName = normalizeText(employee?.companyName);

  if (profileCompanyName && employeeCompanyName) {
    return profileCompanyName === employeeCompanyName;
  }

  return !profileCompanyId && !profileCompanyName;
}

function buildSmoothPath(points) {
  if (!points.length) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const controlOffset = (point.x - previous.x) * 0.5;
    return `${path} C ${previous.x + controlOffset} ${previous.y}, ${point.x - controlOffset} ${point.y}, ${point.x} ${point.y}`;
  }, '');
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

function EmotionDistributionDonut({ stats }) {
  const { t } = useLanguage();
  const [activeEmotion, setActiveEmotion] = useState(null);
  const total = Number(stats?.total) || getCountsTotal(stats?.counts);
  const dominant = emotionItems.reduce(
    (current, item) =>
      (stats?.counts?.[item.key] || 0) > current.count
        ? { ...item, count: stats.counts[item.key] || 0 }
        : current,
    { display: t('noData', 'No data'), key: '', tone: '#94a3b8', count: 0 }
  );
  let cursor = -Math.PI / 2;
  const segments = emotionItems
    .map((emotion) => {
      const records = Number(stats?.counts?.[emotion.key]) || 0;
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

  return (
    <div className="dashboard-donut-wrap" onMouseLeave={() => setActiveEmotion(null)}>
      <div className="dashboard-donut-stage">
        <svg className="dashboard-donut" viewBox="0 0 190 190" role="img" aria-label="Company emotion distribution donut">
          <circle className="dashboard-donut-track" cx="95" cy="95" r="62" />
          {segments.map((segment) => (
            <path
              className="dashboard-donut-segment"
              key={segment.key}
              d={describeDonutArc(95, 95, 62, segment.start, segment.end)}
              stroke={segment.tone}
              onMouseEnter={() => setActiveEmotion(segment)}
              onFocus={() => setActiveEmotion(segment)}
              onBlur={() => setActiveEmotion(null)}
              tabIndex={0}
            />
          ))}
          <circle className="dashboard-donut-hole" cx="95" cy="95" r="38" />
          <text className="dashboard-donut-center-label" x="95" y="91">
            {dominant.key ? t(`emotion.${dominant.display}`, dominant.display) : t('noData', 'No data')}
          </text>
          <text className="dashboard-donut-center-value" x="95" y="109">
            {total} {t('records', 'records')}
          </text>
        </svg>

        {activeEmotion && (
          <div className="dashboard-donut-tooltip">
            <strong>{t(`emotion.${activeEmotion.display}`, activeEmotion.display)}</strong>
            <span>{t('percentage', 'Percentage')}: {formatPercent(activeEmotion.percentage)}</span>
            <span>{t('records', 'Records')}: {activeEmotion.records}</span>
          </div>
        )}
      </div>

      <div className="dashboard-donut-legend">
        {emotionItems.map((emotion) => {
          const percentage = stats?.percentages?.[emotion.key] || 0;

          return (
            <span key={emotion.key} style={{ color: emotion.tone }}>
              <i style={{ backgroundColor: emotion.tone }} />
              {t(`emotion.${emotion.display}`, emotion.display)} {formatPercent(percentage)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyEmotionTrendChart({ days }) {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState(2);
  const [showTooltip, setShowTooltip] = useState(false);
  const chartDays = days?.length ? days : emptyTrendDays;
  const width = 760;
  const height = 238;
  const padding = { top: 22, right: 24, bottom: 34, left: 46 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const chartMax = 100;
  const ticks = [100, 75, 50, 25, 0];
  const activeDay = chartDays[activeIndex] || chartDays[0];
  const activeX =
    chartDays.length > 1
      ? padding.left + (innerWidth / (chartDays.length - 1)) * activeIndex
      : padding.left;

  const getPoint = (dayIndex, emotionKey) => {
    const value = getEmotionPercent(chartDays[dayIndex]?.counts, emotionKey);
    const x =
      chartDays.length > 1
        ? padding.left + (innerWidth / (chartDays.length - 1)) * dayIndex
        : padding.left;
    const y = padding.top + innerHeight - (value / chartMax) * innerHeight;
    return { x, y, value };
  };

  return (
    <div className="trend-chart-inner" onMouseLeave={() => setShowTooltip(false)}>
      <svg className="trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Weekly emotion trend">
        <defs>
          <filter id="trendLineShadow" x="-10%" y="-40%" width="120%" height="180%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#64748b" floodOpacity="0.16" />
          </filter>
        </defs>

        {ticks.map((tick) => {
          const y = padding.top + innerHeight - (tick / chartMax) * innerHeight;
          return (
            <g key={tick}>
              <text className="trend-y-label" x={18} y={y + 4}>
                {formatPercent(tick)}
              </text>
              <line className="trend-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            </g>
          );
        })}

        {chartDays.map((day, index) => {
          const x =
            chartDays.length > 1
              ? padding.left + (innerWidth / (chartDays.length - 1)) * index
              : padding.left;
          return (
            <text className="trend-x-label" key={day.label} x={x} y={height - 9}>
              {t(`weekday.${day.label}`, day.label)}
            </text>
          );
        })}

        <line
          className="trend-active-line"
          x1={activeX}
          x2={activeX}
          y1={padding.top}
          y2={height - padding.bottom}
        />

        {emotionItems.map((emotion) => {
          const points = chartDays.map((_, index) => getPoint(index, emotion.key));
          return (
            <g key={emotion.key}>
              <path
                className="trend-series-line"
                d={buildSmoothPath(points)}
                stroke={emotion.tone}
                filter="url(#trendLineShadow)"
              />
              {points.map((point, index) => (
                <circle
                  className="trend-series-point"
                  key={`${emotion.key}-${chartDays[index].label}`}
                  cx={point.x}
                  cy={point.y}
                  r={activeIndex === index ? 4.4 : 3.2}
                  fill={emotion.tone}
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="trend-hit-grid" aria-hidden="true">
        {chartDays.map((day, index) => (
          <span
            key={day.label}
            onMouseEnter={() => {
              setActiveIndex(index);
              setShowTooltip(true);
            }}
            onFocus={() => {
              setActiveIndex(index);
              setShowTooltip(true);
            }}
            onBlur={() => setShowTooltip(false)}
          />
        ))}
      </div>

      {showTooltip && (
        <div
          className="trend-live-tooltip"
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
          <strong>{t(`weekday.${activeDay?.label || 'Mon'}`, activeDay?.label || 'Mon')}</strong>
          {emotionItems.map((emotion) => (
            <span key={emotion.key} style={{ color: emotion.tone }}>
              {t(`emotion.${emotion.display}`, emotion.display)}: {formatPercent(getEmotionPercent(activeDay?.counts, emotion.key))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CurrentVsPreviousChart({ comparison }) {
  const { t } = useLanguage();
  const [activeKey, setActiveKey] = useState(null);
  const data = comparison || emptyEmotionComparison;
  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 42, left: 34 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const chartMax = 100;
  const ticks = [100, 75, 50, 25, 0];
  const groupWidth = innerWidth / emotionItems.length;
  const barWidth = data.previousAvailable ? Math.min(16, groupWidth * 0.22) : Math.min(18, groupWidth * 0.38);
  const activeEmotion = emotionItems.find((emotion) => emotion.key === activeKey);
  const currentTotal = getCountsTotal(data.current);
  const previousTotal = currentTotal && data.previousAvailable && data.previous ? getCountsTotal(data.previous) : 0;

  const getBarHeight = (value) => (value / chartMax) * innerHeight;

  return (
    <div className="comparison-chart-inner" onMouseLeave={() => setActiveKey(null)}>
      <svg className="comparison-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('currentVsPrevious', 'Current vs 7 days ago')}>
        {ticks.map((tick) => {
          const y = padding.top + innerHeight - (tick / chartMax) * innerHeight;
          return (
            <g key={tick}>
              <text className="comparison-y-label" x={10} y={y + 4}>
                {formatPercent(tick)}
              </text>
              <line className="comparison-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            </g>
          );
        })}

        {emotionItems.map((emotion, index) => {
          const currentValue = currentTotal ? ((data.current?.[emotion.key] || 0) / currentTotal) * 100 : 0;
          const previousEmotionAvailable = currentTotal > 0 && Boolean(data.previousAvailableByEmotion?.[emotion.key]);
          const previousValue =
            previousEmotionAvailable && previousTotal
              ? ((data.previous?.[emotion.key] || 0) / previousTotal) * 100
              : null;
          const groupX = padding.left + groupWidth * index + groupWidth / 2;
          const currentHeight = getBarHeight(currentValue);
          const previousHeight = previousValue === null ? 0 : getBarHeight(previousValue);
          const currentX = data.previousAvailable ? groupX - barWidth - 2 : groupX - barWidth / 2;
          const previousX = groupX + 2;

          return (
            <g
              className="comparison-group"
              key={emotion.key}
              onMouseEnter={() => setActiveKey(emotion.key)}
              onFocus={() => setActiveKey(emotion.key)}
              onBlur={() => setActiveKey(null)}
              tabIndex={0}
            >
              <rect
                className="comparison-hit"
                x={padding.left + groupWidth * index}
                y={padding.top}
                width={groupWidth}
                height={innerHeight}
              />
              <rect
                className="comparison-bar current"
                x={currentX}
                y={padding.top + innerHeight - currentHeight}
                width={barWidth}
                height={currentHeight}
                rx="5"
              />
              {previousValue !== null && (
                <rect
                  className="comparison-bar previous"
                  x={previousX}
                  y={padding.top + innerHeight - previousHeight}
                  width={barWidth}
                  height={previousHeight}
                  rx="5"
                />
              )}
              <text className="comparison-x-label" x={groupX} y={height - 12}>
                {t(`emotion.${emotion.display}`, emotion.display).slice(0, 4)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="comparison-legend">
        <span><i className="current" /> {t('current', 'Current')}</span>
        {currentTotal > 0 && <span><i className="previous" /> {t('previous', '7 Days Ago')}</span>}
      </div>

      {activeEmotion && (
        <div
          className="comparison-tooltip"
          style={{
            left: `${((padding.left + groupWidth * emotionItems.findIndex((item) => item.key === activeKey) + groupWidth / 2) / width) * 100}%`,
          }}
        >
          <strong>{t(`emotion.${activeEmotion.display}`, activeEmotion.display)}</strong>
          <span>{t('current', 'Current')}: {formatPercent(currentTotal ? ((data.current?.[activeEmotion.key] || 0) / currentTotal) * 100 : 0)}</span>
          <span>
            {t('previous', '7 Days Ago')}:{' '}
            {data.previousAvailableByEmotion?.[activeEmotion.key] && previousTotal
              ? formatPercent(((data.previous?.[activeEmotion.key] || 0) / previousTotal) * 100)
              : t('noData', 'No data')}
          </span>
        </div>
      )}
    </div>
  );
}

function EmotionalIntensityChart({ days }) {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState(null);
  const chartDays = days?.length ? days : emptyIntensityDays;
  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 24, bottom: 34, left: 38 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const chartMax = 100;
  const ticks = [100, 75, 50, 25, 0];
  const activeDay = activeIndex === null ? null : chartDays[activeIndex];
  const groupWidth = innerWidth / Math.max(chartDays.length, 1);
  const barWidth = Math.min(30, groupWidth * 0.56);
  const activeX =
    activeIndex === null
      ? padding.left
      : padding.left + groupWidth * activeIndex + groupWidth / 2;

  const getBarHeight = (value) => (value / chartMax) * innerHeight;

  return (
    <div className="intensity-chart-inner" onMouseLeave={() => setActiveIndex(null)}>
      <svg className="intensity-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('emotionalIntensity', 'Emotional intensity')}>
        {ticks.map((tick) => {
          const y = padding.top + innerHeight - (tick / chartMax) * innerHeight;

          return (
            <g key={tick}>
              <text className="intensity-y-label" x={10} y={y + 4}>
                {formatPercent(tick)}
              </text>
              <line className="intensity-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            </g>
          );
        })}

        {chartDays.map((day, index) => {
          const intensityValue = normalizeMetricPercent(day.intensity);
          const barHeight = getBarHeight(intensityValue);
          const x = padding.left + groupWidth * index + (groupWidth - barWidth) / 2;

          return (
            <g
              className="intensity-day-group"
              key={day.label}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              tabIndex={0}
            >
              <rect
                className="intensity-hit"
                x={padding.left + groupWidth * index}
                y={padding.top}
                width={groupWidth}
                height={innerHeight}
              />
              <rect
                className="intensity-bar"
                x={x}
                y={padding.top + innerHeight - barHeight}
                width={barWidth}
                height={barHeight}
                rx="6"
              />
              <text className="intensity-x-label" x={x + barWidth / 2} y={height - 10}>
                {t(`weekday.${day.label}`, day.label)}
              </text>
            </g>
          );
        })}
      </svg>

      {activeDay && (
        <div
          className="intensity-live-tooltip"
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
          <span className="i-value">{t('emotionalIntensity', 'Emotional Intensity')}: {formatPercent(normalizeMetricPercent(activeDay.intensity))}</span>
        </div>
      )}
    </div>
  );
}

const DashboardPage = () => {
  const { firebaseUser, userProfile, logout } = useAuth();
  const { t, toggleLanguage } = useLanguage();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [dashboardLoadedAt, setDashboardLoadedAt] = useState(() => new Date());
  const [selectedPeriod, setSelectedPeriod] = useState('Week');
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthValue());
  const [weeklyTrend, setWeeklyTrend] = useState({
    days: emptyTrendDays,
    maxValue: 0,
  });
  const [emotionDistribution, setEmotionDistribution] = useState(null);
  const [emotionComparison, setEmotionComparison] = useState(emptyEmotionComparison);
  const [emotionalIntensity, setEmotionalIntensity] = useState(emptyIntensityDays);
  const [dashboardError, setDashboardError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const filterStartedAtRef = useRef(null);
  const filterTimeoutRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      if (!firebaseUser) {
        if (isMounted) {
          setEmployees([]);
          setWeeklyTrend({ days: emptyTrendDays, maxValue: 0 });
          setEmotionDistribution(null);
          setEmotionComparison(emptyEmotionComparison);
          setEmotionalIntensity(emptyIntensityDays);
        }
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const dashboardData = await getDashboardData(token, selectedPeriod);
        const employeesData = { employees: dashboardData.employees };
        const trendData = dashboardData.weeklyTrend || { days: emptyTrendDays, maxValue: 0 };
        const distributionData = dashboardData.distribution || emptyEmotionDistribution;
        const comparisonData = dashboardData.comparison || null;
        const intensityData = dashboardData.intensity || null;

        if (isMounted) {
          setEmployees(Array.isArray(employeesData.employees) ? employeesData.employees : []);
          setDashboardLoadedAt(new Date());
          setWeeklyTrend({
            days: Array.isArray(trendData.days) ? trendData.days : emptyTrendDays,
            maxValue: Number(trendData.maxValue) || 0,
          });
          setEmotionDistribution(distributionData);
          setEmotionComparison(normalizeComparisonData(comparisonData));
          setEmotionalIntensity(Array.isArray(intensityData?.days) ? intensityData.days : emptyIntensityDays);
          setDashboardError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setDashboardError(requestError.message || 'Could not load dashboard data.');
        }
      } finally {
        if (isMounted && filterStartedAtRef.current) {
          const elapsed = Date.now() - filterStartedAtRef.current;
          const remaining = Math.max(0, 400 - elapsed);

          window.clearTimeout(filterTimeoutRef.current);
          filterTimeoutRef.current = window.setTimeout(() => {
            if (isMounted) {
              setFilterLoading(false);
              filterStartedAtRef.current = null;
            }
          }, remaining);
        }
      }
    }

    loadDashboardData();

    const handleDashboardRefresh = () => {
      loadDashboardData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadDashboardData();
      }
    };

    window.addEventListener('employees:update', handleDashboardRefresh);
    window.addEventListener('emotion:update', handleDashboardRefresh);
    window.addEventListener('focus', handleDashboardRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      window.removeEventListener('employees:update', handleDashboardRefresh);
      window.removeEventListener('emotion:update', handleDashboardRefresh);
      window.removeEventListener('focus', handleDashboardRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(filterTimeoutRef.current);
    };
  }, [firebaseUser, selectedPeriod]);

  const handlePeriodChange = (period) => {
    if (filterLoading || period === selectedPeriod) {
      return;
    }

    filterStartedAtRef.current = Date.now();
    setFilterLoading(true);
    setSelectedPeriod(period);
  };

  const handleMonthChange = (event) => {
    const monthValue = event.target.value;
    setSelectedMonth(monthValue);
    handlePeriodChange(getMonthPeriod(monthValue));
  };

  const companyEmployees = useMemo(() => {
    return employees.filter((employee) => {
      return isEmployee(employee) && isActiveEmployee(employee) && belongsToCurrentCompany(employee, userProfile);
    });
  }, [employees, userProfile]);

  const tickerTime = useMemo(() => {
    const latestActivity = companyEmployees
      .map(getEmployeeActivityDate)
      .filter(Boolean)
      .reduce((latest, date) => (!latest || date > latest ? date : latest), null);

    return formatTickerTime(latestActivity || dashboardLoadedAt);
  }, [companyEmployees, dashboardLoadedAt]);

  const emotionStats = useMemo(() => {
    if (emotionDistribution?.percentages && emotionDistribution?.counts) {
      const counts = {
        ...emptyEmotionCounts,
        ...emotionDistribution.counts,
      };
      const percentages = emotionItems.reduce((nextPercentages, item) => {
        nextPercentages[item.key] = Number(emotionDistribution.percentages[item.key]) || 0;
        return nextPercentages;
      }, {});
      const dominant = emotionItems.reduce(
        (current, item) => (counts[item.key] > current.count ? { key: item.key, count: counts[item.key] } : current),
        { key: 'neutral', count: 0 }
      );

      return {
        counts,
        percentages,
        total: Number(emotionDistribution.total) || 0,
        dominantEmotion: dominant.count > 0 ? dominant.key : 'neutral',
      };
    }

    return {
      counts: { ...emptyEmotionCounts },
      percentages: { ...emptyEmotionCounts },
      total: 0,
      dominantEmotion: 'neutral',
    };
  }, [emotionDistribution]);


  const dominantStyle = useMemo(() => buildDominantVibeStyle(emotionStats), [emotionStats]);

  const comparisonStats = useMemo(() => {
    return emotionComparison;
  }, [emotionComparison]);

  const handleExportPdf = async () => {
    if (!firebaseUser) {
      return;
    }

    setExportingPdf(true);

    try {
      const token = await firebaseUser.getIdToken();
      const dashboardData = await getDashboardData(token, selectedPeriod);
      const employeesData = { employees: dashboardData.employees };
      const trendData = dashboardData.weeklyTrend || { days: emptyTrendDays, maxValue: 0 };
      const distributionData = dashboardData.distribution || emptyEmotionDistribution;
      const comparisonData = dashboardData.comparison || null;
      const intensityData = dashboardData.intensity || null;
      const latestEmployees = Array.isArray(employeesData.employees) ? employeesData.employees : [];
      const latestCompanyEmployees = latestEmployees.filter((employee) => {
        return isEmployee(employee) && isActiveEmployee(employee) && belongsToCurrentCompany(employee, userProfile);
      });
      const latestWeeklyTrend = {
        days: Array.isArray(trendData.days) ? trendData.days : emptyTrendDays,
        maxValue: Number(trendData.maxValue) || 0,
      };
      const latestEmotionStats = (() => {
        if (distributionData?.percentages && distributionData?.counts) {
          const counts = {
            ...emptyEmotionCounts,
            ...distributionData.counts,
          };
          const percentages = emotionItems.reduce((nextPercentages, item) => {
            nextPercentages[item.key] = Number(distributionData.percentages[item.key]) || 0;
            return nextPercentages;
          }, {});
          const dominant = emotionItems.reduce(
            (current, item) => (counts[item.key] > current.count ? { key: item.key, count: counts[item.key] } : current),
            { key: 'neutral', count: 0 }
          );

          return {
            counts,
            percentages,
            total: Number(distributionData.total) || 0,
            dominantEmotion: dominant.count > 0 ? dominant.key : 'neutral',
          };
        }

        return {
          counts: { ...emptyEmotionCounts },
          percentages: { ...emptyEmotionCounts },
          total: 0,
          dominantEmotion: 'neutral',
        };
      })();
      const latestComparison = normalizeComparisonData(comparisonData);
      const latestIntensity = Array.isArray(intensityData?.days) ? intensityData.days : emptyIntensityDays;

      setEmployees(latestEmployees);
      setWeeklyTrend(latestWeeklyTrend);
      setEmotionDistribution(distributionData);
      setEmotionComparison(latestComparison);
      setEmotionalIntensity(latestIntensity);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const generatedAt = new Date();
      const companyName = userProfile?.companyName || 'Company';
      const dominantVibe =
        emotionItems.find((emotion) => emotion.key === latestEmotionStats.dominantEmotion)?.display || 'Neutral';
      const safeCompanyName = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'company';
      const dateStamp = generatedAt.toISOString().slice(0, 10);

      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, 210, 297, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42);
      doc.text('Dashboard', 14, 20);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('Lumora AI', 14, 27);
      doc.text(`Company: ${companyName}`, 14, 33);
      doc.text(`Generated: ${generatedAt.toLocaleString()}`, 14, 39);

      drawPdfCard(doc, 14, 48, 86, 26);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL EMPLOYEES', 20, 58);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text(String(latestCompanyEmployees.length), 20, 68);

      drawPdfCard(doc, 110, 48, 86, 26);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('DOMINANT VIBE', 116, 58);
      setPdfColor(doc, EMOTION_COLORS[latestEmotionStats.dominantEmotion] || EMOTION_COLORS.neutral);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(dominantVibe, 116, 68);

      drawPdfCard(doc, 14, 82, 182, 44);
      drawPdfTitle(doc, 'Emotion Distribution', 20, 92);
      const distributionX = 22;
      const distributionY = 104;
      emotionItems.forEach((emotion, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const itemX = distributionX + col * 58;
        const itemY = distributionY + row * 8;
        const percentage = latestEmotionStats.percentages[emotion.key] || 0;

        setPdfColor(doc, emotion.tone);
        doc.circle(itemX, itemY - 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`${emotion.display}: ${formatPercent(percentage)}`, itemX + 5, itemY);
      });

      drawWeeklyTrendPdf(doc, latestWeeklyTrend, 14, 136, 182, 88);

      doc.addPage();
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, 210, 297, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text('Dashboard Analytics', 14, 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`${companyName} · ${generatedAt.toLocaleDateString()}`, 14, 27);

      drawComparisonPdf(doc, latestComparison, 14, 38, 182, 96);
      drawIntensityPdf(doc, latestIntensity, 14, 148, 182, 96);

      doc.save(`lumora-dashboard-${safeCompanyName}-${dateStamp}.pdf`);
      setDashboardError('');
    } catch (error) {
      setDashboardError(error.message || 'Could not export dashboard PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const companyDisplayName = userProfile?.companyName || t('companyFallback', 'Company');
  const monthOptions = getMonthOptions(Number(selectedMonth.slice(0, 4)) || new Date().getFullYear());
  const monthSelectorActive = isSelectedMonthPeriod(selectedPeriod);

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="sidebar-logo" src="/logo-lumora.jpg" alt="" />
          <span>LUMORA</span>
        </div>
        <div className="sidebar-items">
          <button className="sidebar-icon sidebar-active" type="button" data-label="Dashboard">
            <span className="icon-tiles">
              <span />
              <span />
              <span />
              <span />
            </span>
          </button>
          <button
            className="sidebar-icon"
            type="button"
            data-label={t('insightsHub', 'Insights Hub')}
            onClick={() => navigate('/insights')}
          >
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

      <div className="dashboard-main" aria-busy={filterLoading}>
        {filterLoading && <FilterLoader />}
        <header className="dashboard-top">
          <div>
            <h1 className="dashboard-title">{companyDisplayName}</h1>
            <p className="dashboard-subtitle">
              {t('signedInAs', 'signed in as')} {userProfile?.username}
            </p>
          </div>
          <div className="dashboard-actions">
            <button className="ghost-button" type="button" onClick={toggleLanguage}>
              <span className="globe-icon" /> Language
            </button>
          </div>
        </header>
        <section className="dashboard-content">
          <div className="card-panel mini-card">
          <div className="mini-people-icon" aria-hidden="true">
            <span className="mini-person main" />
            <span className="mini-person side left" />
            <span className="mini-person side right" />
          </div>
          <div>
            <span className="mini-value">{companyEmployees.length}</span>
            <span className="mini-label">{t('totalEmployees', 'TOTAL EMPLOYEES')}</span>
          </div>
          <span className="mini-live">{t('live', 'LIVE')}</span>
          </div>

          <div className="card-panel dominant-card">
          <div className="dominant-header">
            <div>
              <h2>{t('dominantVibe', 'Dominant Vibe')}</h2>
              <p>{t('evolvingPattern', 'Evolving organic pattern')}</p>
            </div>
            <div className="dominant-filters">
              {periodOptions.map((period) => (
                <button
                  className={`filter-chip${selectedPeriod === period ? ' active' : ''}`}
                  type="button"
                  key={period}
                  onClick={() => handlePeriodChange(period)}
                  disabled={filterLoading}
                >
                  {t(`period.${period}`, period)}
                </button>
              ))}
              <label className={`month-filter${monthSelectorActive ? ' active' : ''}`}>
                <span>{t('period.Custom', 'By month')}</span>
                <select
                  value={selectedMonth}
                  onChange={handleMonthChange}
                  disabled={filterLoading}
                  aria-label={t('selectMonth', 'Select month')}
                >
                  {monthOptions.map((month) => (
                    <option key={month.value} value={month.value}>
                      {t(`month.${month.label}`, month.label)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="export-button"
                type="button"
                onClick={handleExportPdf}
                disabled={exportingPdf}
              >
                {exportingPdf ? t('exporting', 'Exporting...') : t('exportPdf', 'Export as PDF')}
              </button>
            </div>
          </div>
          <div className="dominant-body">
            <div className="dominant-circle" style={dominantStyle} />
            <div className="dominant-footer">
              <div className="avatar-stack">
                <span />
                <span />
                <span />
              </div>
              <span>{t('liveMonitoringActive', 'Live monitoring active')}</span>
            </div>
          </div>
          </div>

          <div className="card-panel ticker-card">
          <div className="ticker-header">
            <span className="ticker-icon">⚡</span>
            <span>{t('liveTicker', 'LIVE TICKER')}</span>
          </div>
          <div className="ticker-item">
            <span className="ticker-pill">{t('info', 'INFO')}</span>
            <span>{dashboardError || t('systemConnected', 'System connected. Monitoring live streams...')}</span>
            <span className="ticker-time">{tickerTime}</span>
          </div>
          </div>
        </section>

      <section className="emotion-row">
        {emotionItems.map((item) => {
          const percentage = emotionStats.percentages[item.key] || 0;

          return (
          <div className="emotion-card" key={item.label}>
            <div className="emotion-top">
              <span className="emotion-emoji">{item.emoji}</span>
              <span className="emotion-value">{percentage}%</span>
            </div>
            <span className="emotion-label">{t(`emotion.${item.label}`, item.label)}</span>
            <span
              className="emotion-bar"
              style={{
                background: item.tone,
                width: `${percentage}%`,
              }}
            />
          </div>
          );
        })}
      </section>

      <section className="macro-section">
        <div className="macro-header">
          <div className="macro-title">
            <span className="macro-icon" />
            <div>
              <h2>{t('macroSentimentAnalytics', 'Macro Sentiment Analytics')}</h2>
              <p>{t('macroSentimentSubtitle', 'Long-term behavioral trends and emotional contagion mapping')}</p>
            </div>
          </div>
        </div>

        <div className="macro-grid">
          <div className="macro-card emotion-distribution-card">
            <h3>{t('emotionDistribution', 'Emotion Distribution')}</h3>
            <EmotionDistributionDonut stats={emotionStats} />
          </div>

          <div className="macro-card trend-card">
            <div className="trend-card-header">
              <h3>{t('weeklyEmotionTrend', 'Weekly Emotion Trend')}</h3>
              <div className="trend-legend">
                {emotionItems.map((emotion) => (
                  <span key={emotion.key} style={{ color: emotion.tone }}>
                    <i style={{ backgroundColor: emotion.tone }} />
                    {t(`emotion.${emotion.display}`, emotion.display)}
                  </span>
                ))}
              </div>
            </div>
            <div className="macro-chart chart-wide trend-chart">
              <WeeklyEmotionTrendChart days={weeklyTrend.days} maxValue={weeklyTrend.maxValue} />
            </div>
          </div>

          <div className="macro-card comparison-card">
            <h3>{t('currentVsPrevious', 'Current vs 7 Days Ago')}</h3>
            <div className="macro-chart comparison-chart">
              <CurrentVsPreviousChart comparison={comparisonStats} />
            </div>
          </div>

          <div className="macro-card">
            <div className="macro-card-header">
              <h3>{t('emotionalIntensity', 'Emotional Intensity')}</h3>
              <div className="macro-tag">
                <span className="tag-dot" /> {t('intensity', 'Intensity')}
              </div>
            </div>
            <div className="macro-chart chart-wide intensity-chart">
              <EmotionalIntensityChart days={emotionalIntensity} />
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
};

export default DashboardPage;
