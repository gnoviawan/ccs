/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface AuthState {
  /** Whether auth is enabled on the server */
  authEnabled: boolean;
  /** Whether the current user is authenticated */
  authenticated: boolean;
  /** Whether we're still checking auth status */
  isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
  /** Check auth status from server */
  checkAuth: () => Promise<void>;
  /** Logout the current user */
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    authEnabled: false,
    authenticated: true, // Assume authenticated until we check
    isLoading: true,
  });

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/status');
      if (response.ok) {
        const data = await response.json();
        setState({
          authEnabled: data.authEnabled,
          authenticated: data.authenticated,
          isLoading: false,
        });
      } else {
        // Server error - assume not authenticated if auth might be enabled
        setState({
          authEnabled: true,
          authenticated: false,
          isLoading: false,
        });
      }
    } catch {
      // Network error - can't determine auth status
      setState({
        authEnabled: false,
        authenticated: true,
        isLoading: false,
      });
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setState((prev) => ({ ...prev, authenticated: false }));
    }
  };

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, checkAuth, logout }}>{children}</AuthContext.Provider>
  );
}
