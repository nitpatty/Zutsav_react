import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import API from '../api/axios';
import { saveAuth as persistAuth, readToken, readUser, updateStoredUser, clearAuth } from '../utils/authStorage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readUser());
  const [loading, setLoading] = useState(false);

  const saveAuth = (token, userData, remember = true) => {
    persistAuth(token, userData, remember);
    setUser(userData);
  };

  const logout = useCallback(() => {
    // Only hit the server when a token is actually present — this guard also
    // prevents a loop with the 401 interceptor below: once it has already
    // cleared storage and dispatched 'zutsav:unauthorized', the resulting
    // logout() call finds no token and skips the network call entirely.
    if (readToken()) {
      API.post('/auth/logout').catch(() => {});
    }
    clearAuth();
    setUser(null);
  }, []);

  // Listen for 401s dispatched by the Axios interceptor so logout flows
  // through React state (and React Router) rather than a hard page reload.
  useEffect(() => {
    const handle = () => logout();
    window.addEventListener('zutsav:unauthorized', handle);
    return () => window.removeEventListener('zutsav:unauthorized', handle);
  }, [logout]);

  const login = useCallback(async (emailOrPhone, password, rememberMe = false) => {
    setLoading(true);
    try {
      const { data } = await API.post('/auth/login', { emailOrPhone, password, rememberMe });
      saveAuth(data.token, data.user, rememberMe);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (payload) => {
    setLoading(true);
    try {
      const { data } = await API.post('/auth/register', payload);
      saveAuth(data.token, data.user);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const registerPandit = useCallback(async (formData) => {
    setLoading(true);
    try {
      const { data } = await API.post('/auth/register-pandit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      saveAuth(data.token, data.user);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await API.get('/auth/me');
      updateStoredUser(data.user);
      setUser(data.user);
      return data.user;
    } catch (err) {
      // Only logout on a confirmed 401 — network errors should not sign users out
      if (err.response?.status === 401) logout();
    }
  }, [logout]);

  return (
    <AuthContext.Provider value={{
      user, setUser, login, register, registerPandit,
      logout, refreshUser, loading, isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
