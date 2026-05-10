import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const roleHome = {
  employee: '/employee',
  hr: '/dashboard',
};

const ProtectedRoute = ({ allowedRole, children }) => {
  const { firebaseUser, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <span>Loading session...</span>
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
