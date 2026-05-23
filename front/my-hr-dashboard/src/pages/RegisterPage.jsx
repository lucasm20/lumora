import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerUser } from '../services/api';
import { useCompanies } from '../hooks/useCompanies';
import { useLanguage } from '../context/LanguageContext';
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
  const { t } = useLanguage();
  const {
    companies,
    loading: companiesLoading,
    error: companyLoadError,
    refreshCompanies,
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

    if (nextRole === 'employee') {
      refreshCompanies();
    }
  };

  const companySelectPending = role === 'employee' && companiesLoading;
  const hasCompanies = companies.length > 0;
  const companySelectUnavailable = role === 'employee' && !companiesLoading && (!hasCompanies || Boolean(companyLoadError));
  const companyPlaceholder = companiesLoading
    ? t('loadingCompanies', 'Loading companies...')
    : companyLoadError
      ? t('companiesLoadFailed', 'Could not load companies')
      : hasCompanies
        ? t('selectCompany', 'Select a registered company name')
        : t('noCompaniesAvailable', 'No active companies available');

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
        <h1 className="login-title">{t('createAccount', 'Create Account')}</h1>
        <p className="login-subtitle">{t('startMonitoring', 'Start monitoring company wellness')}</p>

        <form onSubmit={handleRegister}>
          <div className="role-toggle register-toggle" role="tablist" aria-label={t('selectRole', 'Select role')}>
            <button
              className={`role-tab${role === 'hr' ? ' active' : ''}`}
              type="button"
              onClick={() => handleRoleChange('hr')}
              aria-pressed={role === 'hr'}
            >
              {t('hrAdmin', 'HR Admin')}
            </button>
            <button
              className={`role-tab${role === 'employee' ? ' active' : ''}`}
              type="button"
              onClick={() => handleRoleChange('employee')}
              aria-pressed={role === 'employee'}
            >
              {t('employee', 'Employee')}
            </button>
          </div>

          {role === 'employee' && companyLoadError && (
            <div className="form-alert error company-load-alert">
              <span>{companyLoadError}</span>
              <button type="button" onClick={refreshCompanies}>
                {t('retry', 'Retry')}
              </button>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="register-company">
              {t('companyName', 'Company name')}
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
                  onChange={(event) => {
                    event.target.setCustomValidity('');
                    setCompanyName(event.target.value);
                  }}
                  onInvalid={(event) => {
                    event.target.setCustomValidity('Select an existing company');
                  }}
                  onFocus={() => refreshCompanies()}
                  disabled={companiesLoading || companySelectUnavailable}
                  required
                >
                  <option value="" disabled>
                    {companyPlaceholder}
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
                  placeholder={t('companyName', 'Company name')}
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  required
                />
              )}
            </div>
            {role === 'employee' && !companiesLoading && !companyLoadError && !hasCompanies && (
              <div className="form-helper error">
                {t('noCompaniesAvailable', 'No active companies available')}
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="register-username">{t('username', 'Username')}</label>
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
                placeholder={t('username', 'Username')}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="register-password">{t('password', 'Password')}</label>
            <div className="input-wrapper password-wrapper">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" aria-hidden="true">
                <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" />
                <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" />
              </svg>
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('password', 'Password')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? t('hidePassword', 'Hide password') : t('showPassword', 'Show password')}
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

          <button className="signin-button" type="submit" disabled={loading || companySelectPending || companySelectUnavailable}>
            {loading ? t('creating', 'Creating...') : t('register', 'Register')}
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" aria-hidden="true">
              <path d="M5 12h14" stroke="currentColor" strokeLinecap="round" />
              <path d="M13 6l6 6-6 6" stroke="currentColor" strokeLinecap="round" />
            </svg>
          </button>
        </form>

        <div className="register-link">
          {t('alreadyAccount', 'Already have an account?')}{' '}
          <Link className="link-bounce" to="/" onClick={handleLoginClick}>
            {t('logIn', 'Log In')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
