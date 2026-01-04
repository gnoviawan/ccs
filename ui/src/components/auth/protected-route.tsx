import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that redirects to login if user is not authenticated.
 * Shows loading state while checking auth status.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { authEnabled, authenticated, isLoading } = useAuth();
  const location = useLocation();

  // Still checking auth status
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Auth not enabled - allow access
  if (!authEnabled) {
    return <>{children}</>;
  }

  // Not authenticated - redirect to login
  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated - render children
  return <>{children}</>;
}
