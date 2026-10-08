import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth.ts';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { Spinner } from './components/ui/Spinner.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 0, staleTime: 0 },
  },
});

/**
 * Route table (FRONTEND.MD §8.1 / §10):
 *   /login  -> login screen (redirects to / when a session exists)
 *   /       -> protected dashboard (redirects to /login without a session)
 * OAuth returns land on /?auth=success|slack_connected=true (UNIFY.MD §9).
 */
function AppRoutes() {
  const { user, loading, login, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <Spinner />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage
              onDemoLogin={async (email: string, name: string) => {
                await login(email, name);
                navigate('/', { replace: true });
              }}
            />
          )
        }
      />
      <Route
        path="/"
        element={
          user ? (
            <DashboardPage
              user={user}
              onLogout={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
