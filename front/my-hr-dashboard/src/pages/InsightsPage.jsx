import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getEmployees, processActiveEmployeeEmotions } from '../services/api';
import '../App.css';

const InsightsPage = () => {
  const { firebaseUser, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('Week');
  const [query, setQuery] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingError, setProcessingError] = useState('');
  const [processSummary, setProcessSummary] = useState('');

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

    if (!needle) {
      return employees;
    }

    return employees.filter((employee) => {
      return [employee.username, employee.role, employee.team, employee.lastEmotion]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [employees, query]);

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
            latestCameraFrameAt: update?.frameCapturedAt || skip?.capturedAt || employee.latestCameraFrameAt,
          };
        })
      );

      const refreshed = await getEmployees(token);
      setEmployees(Array.isArray(refreshed.employees) ? refreshed.employees : []);

      if (!results.length && skipped.length) {
        setProcessSummary(`No se proceso ningun empleado. ${skipped[0].reason}`);
      } else if (!results.length) {
        setProcessSummary('No hay empleados con camara activa y snapshot disponible.');
      } else if (skipped.length) {
        setProcessSummary(`${results.length} empleados procesados. ${skipped.length} sin snapshot activo.`);
      } else {
        setProcessSummary(`${results.length} empleados procesados correctamente.`);
      }
    } catch (requestError) {
      setProcessingError(requestError.message || 'No se pudo procesar la imagen.');
    } finally {
      setProcessing(false);
    }
  };

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
          data-label="Log out"
        >
          <span className="icon-arrow" />
        </button>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-top">
          <div>
            <h1 className="dashboard-title">Insight Hub</h1>
            <p className="dashboard-subtitle">Deep-dive into employee patterns and audit anomalies</p>
          </div>
          <div className="dashboard-actions">
            <button className="ghost-button" type="button">
              <span className="globe-icon" /> Language
            </button>
          </div>
        </header>

        <section className="insights-panel">
          <div className="insights-summary">
            <span className="insights-counter">{filteredEmployees.length}</span>
            <span className="insights-label">Active organizational nodes</span>
          </div>

          <div className="insights-toolbar">
            <div className="insights-tabs" role="tablist" aria-label="Period filters">
              {['1h', 'Today', 'Week', 'Month', 'Custom'].map((label) => (
                <button
                  key={label}
                  className={`insights-tab${period === label ? ' active' : ''}`}
                  type="button"
                  onClick={() => setPeriod(label)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="insights-search">
              <span className="search-icon">🔍</span>
              <input
                type="search"
                placeholder="Search by name or role..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="insights-actions">
              <button
                className="insights-button"
                type="button"
                onClick={handleProcessImages}
                disabled={processing}
              >
                {processing ? 'Processing images...' : 'Process Images'}
              </button>
              <button className="insights-button secondary" type="button">
                Export PDF
              </button>
            </div>
          </div>

          {processingError && <div className="form-alert error">{processingError}</div>}
          {processSummary && <div className="form-alert success">{processSummary}</div>}
          {error && <div className="form-alert error">{error}</div>}

          <div className="insights-table">
            <div className="insights-row insights-head">
              <span>Employee</span>
              <span>Role</span>
              <span>Team</span>
              <span>Live Vibe</span>
              <span>Camera</span>
              <span>Last Sync</span>
            </div>
            {loading && <div className="insights-empty">Loading employees...</div>}
            {!loading && filteredEmployees.length === 0 && (
              <div className="insights-empty">No employees available.</div>
            )}
            {!loading && filteredEmployees.map((employee) => (
              <div className="insights-row" key={employee.id}>
                <div className="insights-employee">
                  <div className="employee-avatar">{employee.username?.slice(0, 1) || 'E'}</div>
                  <div>
                    <strong>{employee.username}</strong>
                    <span>#{employee.id}</span>
                  </div>
                </div>
                <span>{employee.role}</span>
                <span className="insights-tag">{employee.team || 'General'}</span>
                <span className="insights-vibe">
                  {employee.lastEmotion || 'Pending'}
                </span>
                <span className="insights-tag">{employee.cameraOn ? 'On' : 'Off'}</span>
                <span className="insights-sync">
                  {employee.latestCameraFrameAt
                    ? new Date(employee.latestCameraFrameAt).toLocaleTimeString()
                    : employee.lastEmotionAt
                      ? new Date(employee.lastEmotionAt).toLocaleTimeString()
                      : '--:--'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default InsightsPage;
