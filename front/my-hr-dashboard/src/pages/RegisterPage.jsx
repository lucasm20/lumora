import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerUser } from '../services/api';
import { useCompanies } from '../hooks/useCompanies';
import '../App.css';

const RegisterPage = () => {
  const [role, setRole] = useState('hr');
  const [companyName, setCompanyName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);
  const navigate = useNavigate();
  const {
    companies,
    loading: companiesLoading,
    error: companyLoadError,
  } = useCompanies();

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

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await registerUser({
        role,
        companyName,
        username,
        password,
      });
      navigate('/');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginClick = (event) => {
    event.preventDefault();
    triggerBounce(() => navigate('/'));
  };

  const handleRoleChange = (nextRole) => {
    setRole(nextRole);
    setCompanyName('');
  };

  const companySelectPending = role === 'employee' && companiesLoading;

  return (
    <div className="login-page">
      <div className={`login-card${isBouncing ? ' card-bounce' : ''}`}>
        <div className="login-icon">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" aria-hidden="true">
            <path
              d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z"
              stroke="currentColor"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="login-title">Create Account</h1>
        <p className="login-subtitle">Start monitoring company wellness</p>

        <form onSubmit={handleRegister}>
          <div className="role-toggle register-toggle" role="tablist" aria-label="Select role">
            <button
              className={`role-tab${role === 'hr' ? ' active' : ''}`}
              type="button"
              onClick={() => handleRoleChange('hr')}
              aria-pressed={role === 'hr'}
            >
              HR Admin
            </button>
            <button
              className={`role-tab${role === 'employee' ? ' active' : ''}`}
              type="button"
              onClick={() => handleRoleChange('employee')}
              aria-pressed={role === 'employee'}
            >
              Employee
            </button>
          </div>

          {companyLoadError && <div className="form-alert error">{companyLoadError}</div>}

          <div className="form-group">
            <label htmlFor="register-company">
              Company name
            </label>
            <div className="input-wrapper">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" aria-hidden="true">
                <path d="M4 20V7l8-4 8 4v13" stroke="currentColor" strokeLinejoin="round" />
                <path d="M9 20v-7h6v7" stroke="currentColor" strokeLinejoin="round" />
              </svg>
              {role === 'employee' ? (
                <select
                  id="register-company"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  disabled={companiesLoading}
                  required
                >
                  <option value="" disabled>
                    {companiesLoading ? 'Loading companies...' : 'Select a registered company name'}
                  </option>
                  {companies.map((item) => (
                    <option key={item.id} value={item.companyName}>
                      {item.companyName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="register-company"
                  type="text"
                  placeholder="Company name"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  required
                />
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="register-username">Username</label>
            <div className="input-wrapper">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" aria-hidden="true">
                <path
                  d="M20 21c0-4-3.6-7-8-7s-8 3-8 7"
                  stroke="currentColor"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="7" r="4" stroke="currentColor" />
              </svg>
              <input
                id="register-username"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="register-password">Password</label>
            <div className="input-wrapper password-wrapper">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" aria-hidden="true">
                <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" />
                <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" />
              </svg>
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
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
          </div>

          {error && <div className="form-alert error">{error}</div>}

          <button className="signin-button" type="submit" disabled={loading || companySelectPending}>
            {loading ? 'Creating...' : 'Register'}
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" aria-hidden="true">
              <path d="M5 12h14" stroke="currentColor" strokeLinecap="round" />
              <path d="M13 6l6 6-6 6" stroke="currentColor" strokeLinecap="round" />
            </svg>
          </button>
        </form>

        <div className="register-link">
          Already have an account?{' '}
          <Link className="link-bounce" to="/" onClick={handleLoginClick}>
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
