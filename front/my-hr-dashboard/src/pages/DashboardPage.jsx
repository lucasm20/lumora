import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getEmotionDistribution, getEmployees, getWeeklyEmotionTrend } from '../services/api';
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
  { key: 'happy', label: 'HAPPY', display: 'Happy', tone: EMOTION_COLORS.happy, emoji: '\u{1F60A}' },
  { key: 'neutral', label: 'NEUTRAL', display: 'Neutral', tone: EMOTION_COLORS.neutral, emoji: '\u{1F610}' },
  { key: 'stress', label: 'STRESS', display: 'Stress', tone: EMOTION_COLORS.stress, emoji: '\u{1F62B}' },
  { key: 'sad', label: 'SAD', display: 'Sad', tone: EMOTION_COLORS.sad, emoji: '\u{1F622}' },
  { key: 'angry', label: 'ANGRY', display: 'Angry', tone: EMOTION_COLORS.angry, emoji: '\u{1F620}' },
  { key: 'fear', label: 'FEAR', display: 'Fear', tone: EMOTION_COLORS.fear, emoji: '\u{1F628}' },
  { key: 'surprise', label: 'SURPRISE', display: 'Surprise', tone: EMOTION_COLORS.surprise, emoji: '\u{1F632}' },
  { key: 'disgust', label: 'DISGUST', display: 'Disgust', tone: EMOTION_COLORS.disgust, emoji: '\u{1F922}' },
  { key: 'drowsiness', label: 'DROWSINESS', display: 'Drowsiness', tone: EMOTION_COLORS.drowsiness, emoji: '\u{1F634}' },
];

const periodOptions = ['1h', 'Today', 'Week', 'Month', 'Custom'];
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const emotionAliases = {
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

const emptyEmotionCounts = emotionItems.reduce((counts, item) => {
  counts[item.key] = 0;
  return counts;
}, {});

const emptyTrendDays = weekdayLabels.map((label) => ({
  label,
  counts: { ...emptyEmotionCounts },
}));

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmotion(value) {
  return emotionAliases[normalizeText(value)] || '';
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

function WeeklyEmotionTrendChart({ days, maxValue }) {
  const [activeIndex, setActiveIndex] = useState(2);
  const [showTooltip, setShowTooltip] = useState(false);
  const chartDays = days?.length ? days : emptyTrendDays;
  const width = 760;
  const height = 238;
  const padding = { top: 22, right: 24, bottom: 34, left: 46 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const tickStep = Math.max(1, Math.ceil(Math.max(maxValue, 4) / 4));
  const chartMax = tickStep * 4;
  const ticks = Array.from({ length: 5 }, (_, index) => chartMax - index * tickStep);
  const activeDay = chartDays[activeIndex] || chartDays[0];
  const activeX =
    chartDays.length > 1
      ? padding.left + (innerWidth / (chartDays.length - 1)) * activeIndex
      : padding.left;

  const getPoint = (dayIndex, emotionKey) => {
    const value = chartDays[dayIndex]?.counts?.[emotionKey] || 0;
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
                {tick}
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
              {day.label}
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
          <strong>{activeDay?.label || 'Mon'}</strong>
          {emotionItems.map((emotion) => (
            <span key={emotion.key} style={{ color: emotion.tone }}>
              {emotion.display}: {activeDay?.counts?.[emotion.key] || 0}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const DashboardPage = () => {
  const { firebaseUser, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('Week');
  const [weeklyTrend, setWeeklyTrend] = useState({
    days: emptyTrendDays,
    maxValue: 0,
  });
  const [emotionDistribution, setEmotionDistribution] = useState(null);
  const [dashboardError, setDashboardError] = useState('');

  const emotionPalette = useMemo(
    () => ({
      happy: { c1: '#fbbf24', c2: '#fb923c', c3: '#fde68a', glow: 'rgba(251, 191, 36, 0.35)' },
      neutral: { c1: '#93c5fd', c2: '#a5b4fc', c3: '#cbd5f5', glow: 'rgba(147, 197, 253, 0.3)' },
      stress: { c1: '#f59e0b', c2: '#f97316', c3: '#fde68a', glow: 'rgba(245, 158, 11, 0.32)' },
      sad: { c1: '#60a5fa', c2: '#818cf8', c3: '#c7d2fe', glow: 'rgba(96, 165, 250, 0.32)' },
      angry: { c1: '#f87171', c2: '#ef4444', c3: '#fecaca', glow: 'rgba(248, 113, 113, 0.35)' },
      fear: { c1: '#f43f5e', c2: '#be123c', c3: '#fecdd3', glow: 'rgba(244, 63, 94, 0.35)' },
      surprise: { c1: '#22c55e', c2: '#16a34a', c3: '#bbf7d0', glow: 'rgba(34, 197, 94, 0.3)' },
      disgust: { c1: '#34d399', c2: '#10b981', c3: '#a7f3d0', glow: 'rgba(52, 211, 153, 0.3)' },
      drowsiness: { c1: '#a855f7', c2: '#7c3aed', c3: '#ddd6fe', glow: 'rgba(168, 85, 247, 0.3)' },
    }),
    []
  );

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      if (!firebaseUser) {
        if (isMounted) {
          setEmployees([]);
          setWeeklyTrend({ days: emptyTrendDays, maxValue: 0 });
          setEmotionDistribution(null);
        }
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const [employeesData, trendData, distributionData] = await Promise.all([
          getEmployees(token),
          getWeeklyEmotionTrend(token, selectedPeriod),
          getEmotionDistribution(token).catch(() => null),
        ]);

        if (isMounted) {
          setEmployees(Array.isArray(employeesData.employees) ? employeesData.employees : []);
          setWeeklyTrend({
            days: Array.isArray(trendData.days) ? trendData.days : emptyTrendDays,
            maxValue: Number(trendData.maxValue) || 0,
          });
          setEmotionDistribution(distributionData);
          setDashboardError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setDashboardError(requestError.message || 'Could not load dashboard data.');
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
    };
  }, [firebaseUser, selectedPeriod]);

  const companyEmployees = useMemo(() => {
    return employees.filter((employee) => {
      return isEmployee(employee) && isActiveEmployee(employee) && belongsToCurrentCompany(employee, userProfile);
    });
  }, [employees, userProfile]);

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

    const counts = { ...emptyEmotionCounts };

    companyEmployees.forEach((employee) => {
      const emotion = getEmployeeLiveVibe(employee);

      if (emotion) {
        counts[emotion] += 1;
      }
    });

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const percentages = emotionItems.reduce((nextPercentages, item) => {
      nextPercentages[item.key] = total ? Math.round((counts[item.key] / total) * 100) : 0;
      return nextPercentages;
    }, {});

    const dominant = emotionItems.reduce(
      (current, item) => (counts[item.key] > current.count ? { key: item.key, count: counts[item.key] } : current),
      { key: 'neutral', count: 0 }
    );

    return {
      counts,
      percentages,
      total,
      dominantEmotion: dominant.count > 0 ? dominant.key : 'neutral',
    };
  }, [companyEmployees, emotionDistribution]);


  const dominantStyle = useMemo(() => {
    const palette = emotionPalette[emotionStats.dominantEmotion] || emotionPalette.neutral;
    return {
      '--vibe-c1': palette.c1,
      '--vibe-c2': palette.c2,
      '--vibe-c3': palette.c3,
      '--vibe-glow': palette.glow,
    };
  }, [emotionStats.dominantEmotion, emotionPalette]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };


  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">L</div>
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
            data-label="Insights Hub"
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
          data-label="Log out"
        >
          <span className="icon-arrow" />
        </button>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-top">
          <div>
            <h1 className="dashboard-title">EYEAI</h1>
            <p className="dashboard-subtitle">
              {userProfile?.companyName} · signed in as {userProfile?.username}
            </p>
          </div>
          <div className="dashboard-actions">
            <button className="ghost-button" type="button">
              <span className="globe-icon" /> Language
            </button>
          </div>
        </header>
        <section className="dashboard-content">
          <div className="card-panel mini-card">
          <div className="mini-icon" />
          <div>
            <span className="mini-value">{companyEmployees.length}</span>
            <span className="mini-label">TOTAL EMPLOYEES</span>
          </div>
          <span className="mini-live">LIVE</span>
          <div className="mini-ring" />
          </div>

          <div className="card-panel dominant-card">
          <div className="dominant-header">
            <div>
              <h2>Dominant Vibe</h2>
              <p>Evolving organic pattern</p>
            </div>
            <div className="dominant-filters">
              {periodOptions.map((period) => (
                <button
                  className={`filter-chip${selectedPeriod === period ? ' active' : ''}`}
                  type="button"
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                >
                  {period}
                </button>
              ))}
              <button className="export-button" type="button">Export as PDF</button>
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
              <span>Live monitoring active</span>
            </div>
          </div>
          </div>

          <div className="card-panel ticker-card">
          <div className="ticker-header">
            <span className="ticker-icon">⚡</span>
            <span>LIVE TICKER</span>
          </div>
          <div className="ticker-item">
            <span className="ticker-pill">INFO</span>
            <span>{dashboardError || 'System connected. Monitoring live streams...'}</span>
            <span className="ticker-time">01:35</span>
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
            <span className="emotion-label">{item.label}</span>
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
              <h2>Macro Sentiment Analytics</h2>
              <p>Long-term behavioral trends and emotional contagion mapping</p>
            </div>
          </div>
          <button className="ghost-button" type="button">
            <span className="globe-icon" /> Language
          </button>
        </div>

        <div className="macro-grid">
          <div className="macro-card emotion-distribution-card">
            <h3>Emotion Distribution</h3>
            <div className="emotion-distribution">
              {emotionItems.map((emotion) => (
                <span className="emotion" key={emotion.key} style={{ color: emotion.tone }}>
                  <i style={{ backgroundColor: emotion.tone }} />
                  {emotion.display}
                </span>
              ))}
            </div>
          </div>

          <div className="macro-card trend-card">
            <div className="trend-card-header">
              <h3>Weekly Emotion Trend</h3>
              <div className="trend-legend">
                {emotionItems.map((emotion) => (
                  <span key={emotion.key} style={{ color: emotion.tone }}>
                    <i style={{ backgroundColor: emotion.tone }} />
                    {emotion.display}
                  </span>
                ))}
              </div>
            </div>
            <div className="macro-chart chart-wide trend-chart">
              <WeeklyEmotionTrendChart days={weeklyTrend.days} maxValue={weeklyTrend.maxValue} />
            </div>
          </div>

          <div className="macro-card">
            <h3>Current vs 7 Days Ago</h3>
            <div className="macro-chart" />
            <div className="macro-axis">
              <span>Happy</span>
              <span>Neutral</span>
              <span>Stress</span>
              <span>Sad</span>
              <span>Angry</span>
              <span>Fear</span>
              <span>Surprise</span>
              <span>Disgust</span>
              <span>Drowsiness</span>
            </div>
          </div>

          <div className="macro-card">
            <div className="macro-card-header">
              <h3>Emotional Intensity</h3>
              <div className="macro-tag">
                <span className="tag-dot" /> Daily Value
                <span className="tag-dot alt" /> Trend
              </div>
            </div>
            <div className="macro-chart chart-wide intensity-chart">
              <div className="intensity-grid">
                <span>4</span>
                <span>3</span>
                <span>2</span>
                <span>1</span>
                <span>0</span>
              </div>
              <div className="intensity-baseline" />
              <div className="intensity-line">
                <span className="intensity-point" />
                <span className="intensity-point" />
                <span className="intensity-point" />
                <span className="intensity-point" />
                <span className="intensity-point" />
                <span className="intensity-point" />
                <span className="intensity-point" />
              </div>
              <div className="intensity-tooltip">
                <strong>Sat</strong>
                <span className="i-value">Intensity: 0</span>
                <span className="i-trend">Trend: 0</span>
              </div>
              <div className="intensity-hover" />
            </div>
            <div className="macro-axis intensity-axis">
              <span>Sat</span>
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
};

export default DashboardPage;
