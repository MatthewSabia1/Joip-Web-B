import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useJoiSessions } from '@/hooks/useJoiSessions';
import { JoiSession } from '@/types';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { SessionForm } from '@/components/SessionForm';
import { supabase } from '@/lib/supabase';
import React from 'react';

// Import logo images
import logoLight from '../assets/Joip App Logo Light.png';
import logoDark from '../assets/Joip App Logo Dark.png';

export function SessionFormPage() {
  const { id } = useParams<{ id: string }>();
  // Determine if we're editing or creating new
  // Check if we're on /session/new explicitly to avoid confusion if 'new' could be a valid session ID
  const isCreatingNew = window.location.pathname.includes('/session/new');
  const isEditing = !isCreatingNew && id !== undefined;
  
  const navigate = useNavigate();
  const { user, loading: userLoading } = useAuth();
  const { theme } = useTheme();
  const { sessions, loading: sessionsLoading, fetchSessions } = useJoiSessions();
  
  // Debug current route and mode
  console.log('SessionFormPage mode:', {
    path: window.location.pathname,
    id: id,
    isEditing: isEditing,
    sessionsCount: sessions.length
  });
  
  const [sessionData, setSessionData] = useState<JoiSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [isDirectFetching, setIsDirectFetching] = useState(false);
  
  // Flag to prevent multiple notFound state updates
  const hasSetNotFoundRef = React.useRef(false);
  
  // Direct session fetch function to get session data directly from database
  const fetchSessionDirectly = useCallback(async (sessionId: string) => {
    if (!user || !sessionId) return null;
    
    console.log(`Attempting direct session fetch from database for ID: ${sessionId}`);
    try {
      setIsDirectFetching(true);
      
      // Try to fetch the session directly from the database
      const { data: ownSession, error: ownError } = await supabase
        .from('joi_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (ownError) {
        console.error('Error fetching session directly:', ownError);
        return null;
      }
      
      if (ownSession) {
        console.log('Successfully fetched session directly:', ownSession.title);
        return ownSession;
      }
      
      return null;
    } catch (err) {
      console.error('Error in direct session fetch:', err);
      return null;
    } finally {
      setIsDirectFetching(false);
    }
  }, [user]);
  
  // Add a timeout to handle excessive loading
  useEffect(() => {
    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      // Only trigger timeout if we're actually in a necessary loading state
      // For new sessions, we don't need to wait for sessions to load
      if (userLoading || (isEditing && sessionsLoading)) {
        console.log('Loading session form timed out after 10 seconds');
        setLoadingTimeout(true);
        
        // Try to fetch sessions again if that's what we're waiting for
        if (isEditing && sessionsLoading) {
          fetchSessions().catch(err => {
            console.error('Failed to fetch sessions after timeout:', err);
          });
        }
      }
    }, 10000); // 10 second timeout
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [userLoading, sessionsLoading, isEditing, fetchSessions]);
  
  // Find session data if editing
  useEffect(() => {
    if (!isEditing || !id) return;
    
    // Skip if we've already found the session or determined it doesn't exist
    if (sessionData || hasSetNotFoundRef.current) return;
    
    // FIRST APPROACH: Check the useJoiSessions hook's sessions array
    const checkSessionsArray = () => {
      // Wait for sessions to load
      if (sessionsLoading) {
        console.log('Sessions still loading, waiting...');
        return false;
      }

      if (sessions.length > 0) {
        const foundSession = sessions.find(s => s.id === id);
        if (foundSession) {
          console.log('Session found for editing:', foundSession.id);
          setSessionData(foundSession);
          return true;
        } else {
          console.log('Session not found in sessions array');
        }
      } else {
        console.log('No sessions loaded but loading is complete');
      }
      
      return false;
    };
    
    // Try to find the session in the array
    const foundInArray = checkSessionsArray();
    
    // If not found in array and not currently loading, try fetching directly from database
    if (!foundInArray && !sessionsLoading && !isDirectFetching) {
      console.log('Session not found in array, trying direct fetch...');
      
      // SECOND APPROACH: Fetch directly from Supabase as a fallback
      fetchSessionDirectly(id).then(directFetchedSession => {
        if (directFetchedSession) {
          console.log('Session found via direct fetch');
          setSessionData(directFetchedSession);
        } else {
          console.log('Session not found via direct fetch, will try one more time in 2 seconds');
          
          // Final retry after a short delay
          setTimeout(async () => {
            // Try checking arrays one more time
            const foundInArrayFinal = checkSessionsArray();
            
            if (!foundInArrayFinal) {
              // Try one more direct fetch
              const finalAttempt = await fetchSessionDirectly(id);
              
              if (finalAttempt) {
                setSessionData(finalAttempt);
              } else if (!hasSetNotFoundRef.current) {
                console.log('Session still not found after all attempts - setting notFound to true');
                hasSetNotFoundRef.current = true;
                setNotFound(true);
              }
            }
          }, 2000);
        }
      });
    }
  }, [isEditing, id, sessions, sessionsLoading, sessionData, fetchSessionDirectly, isDirectFetching]);
  
  // Handle excessive loading with a retry option
  if (loadingTimeout) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <h2 className="text-xl font-semibold mb-4">Loading is taking longer than expected</h2>
        <p className="text-muted-foreground mb-6 text-center">
          There might be an issue with the connection or the database.
        </p>
        <div className="flex gap-4">
          <Button 
            variant="outline" 
            onClick={() => navigate('/sessions')}
          >
            Back to Sessions
          </Button>
          <Button 
            onClick={() => {
              setLoadingTimeout(false);
              window.location.reload();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }
  
  // Loading state - But ONLY if we're loading the required data
  // User loading or session loading (ONLY when editing an existing session)
  if (userLoading || (isEditing && sessionsLoading)) {
    console.log('Showing loading state:', { 
      userLoading, 
      sessionsLoading, 
      isEditing,
      path: window.location.pathname 
    });
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="animate-pulse flex space-x-2 mb-4">
          <div className="rounded-full bg-muted h-3 w-3"></div>
          <div className="rounded-full bg-muted h-3 w-3"></div>
          <div className="rounded-full bg-muted h-3 w-3"></div>
        </div>
        <p className="text-muted-foreground text-sm">
          {isEditing ? 'Loading session data...' : 'Preparing form...'}
        </p>
      </div>
    );
  }
  
  // If user isn't authenticated, show login page
  if (!user) {
    console.log('User not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }
  
  // Redirect if session not found
  if (notFound) {
    console.log('Session not found, redirecting to sessions list');
    return <Navigate to="/sessions" replace />;
  }
  
  return (
    <div className="flex flex-col bg-background min-h-screen">
      <header className="flex items-center justify-between p-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="mr-2">
            <Link to="/sessions">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to Sessions</span>
            </Link>
          </Button>
          <img 
            src={theme === 'dark' ? logoDark : logoLight} 
            alt="Joip AI" 
            className="h-auto w-auto max-h-9 object-contain"
          />
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <UserAvatar />
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? 'Edit Session' : 'Create New Session'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isEditing 
                ? 'Update your session configuration'
                : 'Configure a new slideshow session'
              }
            </p>
          </div>
          
          {isEditing && !sessionData && !notFound ? (
            <div className="flex items-center justify-center h-60">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <SessionForm
              sessionId={isEditing ? id : undefined}
              defaultValues={sessionData || undefined}
              isEditing={isEditing}
            />
          )}
        </div>
      </main>
      
      <footer className="py-4 border-t">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Joip AI &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}