import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../App.css';

const DashboardPage = () => {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [dominantEmotion, setDominantEmotion] = useState('neutral');

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
    const handleEmotionUpdate = (event) => {
      const nextEmotion = event?.detail?.emotion;
      if (typeof nextEmotion === 'string') {
        setDominantEmotion(nextEmotion.toLowerCase());
      }
    };

    window.addEventListener('emotion:update', handleEmotionUpdate);
    return () => window.removeEventListener('emotion:update', handleEmotionUpdate);
  }, []);


  const dominantStyle = useMemo(() => {
    const palette = emotionPalette[dominantEmotion] || emotionPalette.neutral;
    return {
      '--vibe-c1': palette.c1,
      '--vibe-c2': palette.c2,
      '--vibe-c3': palette.c3,
      '--vibe-glow': palette.glow,
    };
  }, [dominantEmotion, emotionPalette]);

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
            <span className="mini-value">1</span>
            <span className="mini-label">TOTAL ACTIVE TALENT</span>
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
              <button className="filter-chip" type="button">1h</button>
              <button className="filter-chip" type="button">Today</button>
              <button className="filter-chip active" type="button">Week</button>
              <button className="filter-chip" type="button">Month</button>
              <button className="filter-chip" type="button">Custom</button>
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
            <span>System connected. Monitoring live streams...</span>
            <span className="ticker-time">01:35</span>
          </div>
          </div>
        </section>

      <section className="emotion-row">
        {[
          { label: 'HAPPY', tone: '#f97316', emoji: '😊' },
          { label: 'NEUTRAL', tone: '#94a3b8', emoji: '😐' },
          { label: 'STRESS', tone: '#f59e0b', emoji: '😫' },
          { label: 'SAD', tone: '#60a5fa', emoji: '😢' },
          { label: 'ANGRY', tone: '#f87171', emoji: '😠' },
          { label: 'FEAR', tone: '#818cf8', emoji: '😨' },
          { label: 'SURPRISE', tone: '#22c55e', emoji: '😲' },
          { label: 'DISGUST', tone: '#34d399', emoji: '🤢' },
          { label: 'DROWSINESS', tone: '#a855f7', emoji: '😴' }
        ].map((item) => (
          <div className="emotion-card" key={item.label}>
            <div className="emotion-top">
              <span className="emotion-emoji">{item.emoji}</span>
              <span className="emotion-value">0%</span>
            </div>
            <span className="emotion-label">{item.label}</span>
            <span className="emotion-bar" style={{ background: item.tone }} />
          </div>
        ))}
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
          <div className="macro-card">
            <h3>Emotion Distribution</h3>
            <div className="macro-chart" />
            <div className="emotion-distribution">
              <span className="emotion" style={{ backgroundColor: '#4CAF50' }}>Happy</span>
              <span className="emotion" style={{ backgroundColor: '#9E9E9E' }}>Neutral</span>
              <span className="emotion" style={{ backgroundColor: '#FF9800' }}>Stress</span>
              <span className="emotion" style={{ backgroundColor: '#2196F3' }}>Sad</span>
              <span className="emotion" style={{ backgroundColor: '#F44336' }}>Angry</span>
              <span className="emotion" style={{ backgroundColor: '#9C27B0' }}>Fear</span>
              <span className="emotion" style={{ backgroundColor: '#00BCD4' }}>Surprise</span>
              <span className="emotion" style={{ backgroundColor: '#FFEB3B' }}>Disgust</span>
              <span className="emotion" style={{ backgroundColor: '#00B0FF' }}>Drowsiness</span>
            </div>
          </div>

          <div className="macro-card">
            <h3>Weekly Emotion Trend</h3>
            <div className="macro-chart chart-wide trend-chart">
              <div className="trend-grid">
                <span>4</span>
                <span>3</span>
                <span>2</span>
                <span>1</span>
                <span>0</span>
              </div>
              <div className="trend-line">
                <span className="trend-point" />
                <span className="trend-point" />
                <span className="trend-point" />
                <span className="trend-point" />
                <span className="trend-point" />
              </div>
              <div className="trend-tooltip">
                <strong>Tue</strong>
                <span className="t-happy">Happy: 0</span>
                <span className="t-neutral">Neutral: 0</span>
                <span className="t-stress">Stress: 0</span>
                <span className="t-sad">Sad: 0</span>
                <span className="t-angry">Angry: 0</span>
                <span className="t-fear">Fear: 0</span>
                <span className="t-surprise">Surprise: 0</span>
                <span className="t-disgust">Disgust: 0</span>
                <span className="t-drowsy">Drowsiness: 0</span>
              </div>
              <div className="trend-hover" />
            </div>
            <div className="macro-axis trend-axis">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
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
