import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const roleHome = {
  employee: '/employee',
  hr: '/dashboard',
};

const ProtectedRoute = ({ allowedRole, children }) => {
  const { firebaseUser, userProfile, loading } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="auth-loading">
        <span>{t('loadingSession', 'Loading session...')}</span>
      </div>
    );
  }

  if (!firebaseUser || !userProfile) {
    return <Navigate to="/" replace />;
  }

  if (allowedRole && userProfile.role !== allowedRole) {
    return <Navigate to={roleHome[userProfile.role] || '/'} replace />;
  }

  return children;
};

export default ProtectedRoute;
