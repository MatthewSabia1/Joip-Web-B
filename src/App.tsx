import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Import logo images properly
import logoLight from './assets/Joip App Logo Light.png';
import logoDark from './assets/Joip App Logo Dark.png';

// Auth Provider
import { AuthProvider } from '@/contexts/AuthContext';
import { RedditAuthProvider } from '@/contexts/RedditAuthContext';
import { PatreonAuthProvider } from '@/contexts/PatreonAuthContext';

// Components
import { UserAvatar } from '@/components/UserAvatar';
import { ProtectedRoute } from '@/components/ProtectedRoute';

// Pages
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SessionsPage } from '@/pages/SessionsPage';
import { SessionFormPage } from '@/pages/SessionFormPage';
import { SessionPlayPage } from '@/pages/SessionPlayPage';
import { SessionSharePage } from '@/pages/SessionSharePage';
import { SessionSavePage } from '@/pages/SessionSavePage';
import { AdminPage } from '@/pages/AdminPage';

// Hooks
import { useAuth } from '@/contexts/AuthContext';

// UI Components
import { ThemeToggle } from './components/ThemeToggle';
import { Button } from './components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { Link } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';

function MainApp() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  
  return (
    <div className="w-full h-screen flex flex-col">
      <header className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Link to="/">
            <img 
              src={theme === 'dark' ? logoDark : logoLight} 
              alt="Joip AI" 
              className="h-auto w-auto max-h-10 object-contain"
            />
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/sessions">
            <Button variant="ghost">Sessions</Button>
          </Link>
          <Link to="/settings">
            <Button variant="ghost">Settings</Button>
          </Link>
          {profile && typeof profile === 'object' && 'is_admin' in profile && profile.is_admin === true && (
            <Link to="/admin">
              <Button variant="ghost">Admin</Button>
            </Link>
          )}
          <ThemeToggle />
          <UserAvatar />
        </div>
      </header>

      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-8">
        <div className="max-w-md space-y-3">
          <h1 className="text-3xl font-bold">Welcome to Joip AI</h1>
          <p className="text-muted-foreground">
            Create and manage your JOIP sessions with custom settings and AI-generated captions.
          </p>
        </div>
        
        <div className="flex flex-col gap-3 items-center">
          <Button asChild size="lg" className="px-8">
            <Link to="/sessions">View Your Sessions</Link>
          </Button>
          
          <Button asChild variant="outline" size="lg" className="px-8">
            <Link to="/session/new">Create New Session</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter
      future={{
        // Opt-in to the future flags to silence the warnings
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <RedditAuthProvider>
          <PatreonAuthProvider>
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/app" element={<MainApp />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/sessions" element={<ProtectedRoute><SessionsPage /></ProtectedRoute>} />
              {/* Specific routes must be placed before dynamic routes */}
              <Route path="/session/play/:id" element={<ProtectedRoute><SessionPlayPage /></ProtectedRoute>} />
              <Route path="/session/new" element={<ProtectedRoute><SessionFormPage /></ProtectedRoute>} />
              <Route path="/session/edit/:id" element={<ProtectedRoute><SessionFormPage /></ProtectedRoute>} />
              <Route path="/session/share/:id" element={<ProtectedRoute><SessionSharePage /></ProtectedRoute>} />
              <Route path="/session/save/:id" element={<ProtectedRoute><SessionSavePage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminPage /></ProtectedRoute>} />
            </Routes>
            <Toaster />
          </PatreonAuthProvider>
        </RedditAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

// Home redirect component that checks auth status and redirects accordingly
// Only used for the root "/" path, not for any other routes
function HomeRedirect() {
  const { user, loading } = useAuth();
  // Get the current path to avoid redirecting non-root paths
  const currentPath = window.location.pathname;
  
  // Only redirect if we're actually on the root path ("/")
  // This prevents the redirect from affecting other routes
  if (currentPath !== "/") {
    console.log("HomeRedirect: Not on root path, not redirecting", { currentPath });
    return null;
  }
  
  console.log("HomeRedirect: On root path, checking auth status", { loading, authenticated: !!user });
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
        <span className="ml-3">Loading...</span>
      </div>
    );
  }
  
  // Check if we're coming back from an OAuth redirect
  const hasAuthRedirectParam = () => {
    // Look for URL parameters that indicate a redirect from OAuth
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.has('reddit_tokens') || 
           urlParams.has('state') || 
           urlParams.has('code') || 
           urlParams.has('reddit_success');
  };
  
  // If we have auth redirect params, don't replace the current URL
  if (user && hasAuthRedirectParam()) {
    console.log("HomeRedirect: Auth redirect params found, not redirecting");
    // Stay on current page (OAuth callback handling)
    // Just return null to let the auth handlers process the redirect
    return null;
  }
  
  console.log("HomeRedirect: Redirecting based on auth status", { authenticated: !!user });
  // Regular behavior: redirect to sessions page if logged in, otherwise to login page
  return user ? <Navigate to="/sessions" replace /> : <Navigate to="/login" replace />;
}

export default App;