import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  adminOnly?: boolean;
}

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // Add debugging for navigation issues
  useEffect(() => {
    if (!loading) {
      console.log("ProtectedRoute check:", { 
        path: location.pathname, 
        authenticated: !!user, 
        isAdmin: profile && typeof profile === 'object' && 'is_admin' in profile && profile.is_admin === true,
        adminRequired: adminOnly
      });
    }
  }, [loading, user, profile, location.pathname, adminOnly]);

  // If still loading auth state, show loading indicator
  if (loading) {
    console.log("ProtectedRoute: Still loading authentication...");
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2 text-lg">Authenticating...</span>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!user) {
    console.log("ProtectedRoute: User not authenticated, redirecting to login");
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // For admin routes, check if user is admin
  if (adminOnly && !(profile && typeof profile === 'object' && 'is_admin' in profile && profile.is_admin === true)) {
    console.log("ProtectedRoute: User not admin, redirecting to home");
    return <Navigate to="/" replace />;
  }

  // Render children if authenticated and authorized
  console.log("ProtectedRoute: Access granted to", location.pathname);
  return <>{children}</>;
}