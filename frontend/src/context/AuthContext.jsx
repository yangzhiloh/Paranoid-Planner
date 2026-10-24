// Authentication Context
// Manages global authentication state

import { createContext, useState, useEffect, useContext } from 'react';
import { authAPI, setAccessToken } from '../api/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Keep the API client's in-memory token and React state in sync
  const startSession = (data) => {
    setAccessToken(data.token);
    setToken(data.token);
    setUser(data.user);
    setIsAuthenticated(true);
  };

  const clearSession = () => {
    setAccessToken(null);
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  useEffect(() => {
    // Tokens used to be stored here; remove any left over from older versions of the app
    localStorage.removeItem('token');

    // Restore the session from the httpOnly refresh cookie
    const restoreSession = async () => {
      try {
        startSession(await authAPI.refresh());
      } catch (err) {
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email, password) => {
    setError('');

    try {
      const res = await authAPI.login(email, password);

      startSession(res.data);

      return res.data;
    } catch (err) {
      const message =
        err.response?.data?.error || 'Login failed';

      setError(message);

      throw err;
    }
  };

  const register = async (name, email, password) => {
    setError('');

    try {
      const res = await authAPI.register(name, email, password);

      startSession(res.data);

      return res.data;
    } catch (err) {
      const message =
        err.response?.data?.error || 'Registration failed';

      setError(message);

      throw err;
    }
  };

  const logout = async () => {
    clearSession();

    try {
      // Revokes the refresh token server-side and clears the cookie
      await authAPI.logout();
    } catch (err) {
      // Local session is already cleared; the refresh token expires on its own
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        loading,
        error,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook for using auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};