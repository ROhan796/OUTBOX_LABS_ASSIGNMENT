import { useCallback, useEffect, useState } from 'react';
import { User } from '../types/index.ts';
import { getMe, logoutUser, demoLogin } from '../api/auth.api.ts';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Session state for the protected routes (FRONTEND.MD §3 "hooks/").
 * 401 from the API simply means "no session" — App renders /login.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, name: string) => {
    const res = await demoLogin(email, name);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      setUser(null);
    }
  }, []);

  return { user, loading, login, logout, refresh };
}
