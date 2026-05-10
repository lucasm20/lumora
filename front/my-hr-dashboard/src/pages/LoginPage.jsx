import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../App.css';

const LoginPage = () => {
  const [role, setRole] = useState('hr');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const roleHome = {
    hr: '/dashboard',
    employee: '/employee',
  };

  const triggerBounce = (callback) => {
    setIsBouncing(false);
    requestAnimationFrame(() => setIsBouncing(true));

    setTimeout(() => {
      setIsBouncing(false);
      if (callback) {
        callback();
      }
    }, 280);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const session = await login({
        role,
        username,
        password,
      });
      navigate(session.redirectTo || roleHome[role] || '/dashboard');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterClick = (event) => {
    event.preventDefault();
    triggerBounce(() => navigate('/register'));
  };

  return (
    <div className="login-page lumora-login">
      <div className={`lumora-card${isBouncing ? ' card-bounce' : ''}`}>
        <div className="lumora-brand">
          <div className="lumora-logo">L</div>
          <span className="lumora-name">Lumora</span>
        </div>

        <div className="lumora-panel">
          <h1 className="lumora-title">Welcome back</h1>

          <div className="role-toggle" role="tablist" aria-label="Select role">
            <button
              className={`role-tab${role === 'hr' ? ' active' : ''}`}
              type="button"
              onClick={() => setRole('hr')}
              aria-pressed={role === 'hr'}
            >
              HR Admin
            </button>
            <button
              className={`role-tab${role === 'employee' ? ' active' : ''}`}
              type="button"
              onClick={() => setRole('employee')}
              aria-pressed={role === 'employee'}
            >
              Employee
            </button>
          </div>

          <form onSubmit={handleLogin} className="lumora-form">
            <label className="lumora-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              className="lumora-field"
              placeholder=""
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />

            <label className="lumora-label" htmlFor="password">
              Password
            </label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="lumora-field"
                placeholder=""
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" aria-hidden="true">
                  <path
                    d="M2.4 12s3.7-6.2 9.6-6.2 9.6 6.2 9.6 6.2-3.7 6.2-9.6 6.2-9.6-6.2-9.6-6.2z"
                    stroke="currentColor"
                  />
                  <circle cx="12" cy="12" r="3.2" stroke="currentColor" />
                </svg>
              </button>
            </div>

            {error && <div className="form-alert error">{error}</div>}

            <button className="lumora-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="lumora-register">
            Need an account?{' '}
            <Link className="lumora-link" to="/register" onClick={handleRegisterClick}>
              Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
