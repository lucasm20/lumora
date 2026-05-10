import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase';
import { getSession, loginUser, logoutUser } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (!user) {
        setUserProfile(null);
        setLoading(false);
        return;
      }

      try {
        const idToken = await user.getIdToken(true);
        const session = await getSession(idToken);
        setUserProfile(session.user);
      } catch (error) {
        setUserProfile(null);
        await logoutUser();
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const login = useCallback(async (payload) => {
    setLoading(true);

    try {
      const session = await loginUser(payload);
      setFirebaseUser(auth?.currentUser || null);
      setUserProfile(session.user);
      return session;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      firebaseUser,
      userProfile,
      loading,
      login,
      logout: logoutUser,
    }),
    [firebaseUser, userProfile, loading, login]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
