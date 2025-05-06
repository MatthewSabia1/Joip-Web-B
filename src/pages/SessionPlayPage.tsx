import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useJoiSessions } from '@/hooks/useJoiSessions';
import { useRedditPosts } from '@/hooks/useRedditPosts';
import { useJoipPlayer } from '@/hooks/useJoipPlayer';
import { useAICaption } from '@/hooks/useAICaption';
import { useTheme } from '@/hooks/useTheme';
import { MediaDisplay } from '@/components/MediaDisplay';
import { CaptionDisplay } from '@/components/CaptionDisplay';
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from '@/components/ui/resizable';
import { ArrowLeft, RefreshCw, Pause, Play, Menu, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_INTERVAL, DEFAULT_TRANSITION } from '@/lib/constants';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// Import logo images
import logoLight from '../assets/Joip App Logo Light.png';
import logoDark from '../assets/Joip App Logo Dark.png';

export function SessionPlayPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: userLoading } = useAuth();
  const { theme } = useTheme();
  const { sessions, sharedWithMe, loading: sessionsLoading } = useJoiSessions();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(false);
  
  const [sessionData, setSessionData] = useState<typeof sessions[number] | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [notFound, setNotFound] = useState(false);
  
  // Flag to prevent multiple notFound state updates
  const hasSetNotFoundRef = React.useRef(false);
  
  // Ref to store timeout IDs for proper cleanup
  const finalTimeoutRef = React.useRef<number | null>(null);
  
  // Add a flag to control when to show the player after initial load
  const [playerReady, setPlayerReady] = useState(false);
  // Add a flag to track content loading progress
  const [contentLoaded, setContentLoaded] = useState(false);

  // Direct session fetch function to get session data directly from database
  const fetchSessionDirectly = useCallback(async (sessionId: string) => {
    if (!user || !sessionId) return null;
    
    console.log(`Attempting direct session fetch from database for ID: ${sessionId}`);
    try {
      // Try to fetch the session directly from the database
      const { data: ownSession, error: ownError } = await supabase
        .from('joi_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      
      if (ownError) {
        console.error('Error fetching session directly:', ownError);
        return null;
      }
      
      if (ownSession) {
        console.log('Successfully fetched session directly:', ownSession.title);
        return ownSession;
      }
      
      // Try shared sessions if not found in own sessions
      const { data: sharedData, error: sharedError } = await supabase
        .from('shared_sessions')
        .select(`
          id,
          session:joi_sessions(*)
        `)
        .eq('shared_with_id', user.id)
        .eq('session_id', sessionId)
        .maybeSingle();
      
      if (sharedError) {
        console.error('Error fetching shared session directly:', sharedError);
        return null;
      }
      
      if (sharedData?.session) {
        const sessionData = Array.isArray(sharedData.session) 
          ? sharedData.session[0] 
          : sharedData.session;
        
        if (sessionData && typeof sessionData === 'object') {
          console.log('Successfully fetched shared session directly:', sessionData.title);
          return sessionData;
        }
      }
      
      return null;
    } catch (err) {
      console.error('Error in direct session fetch:', err);
      return null;
    }
  }, [user, supabase]);

  // Find session data
  useEffect(() => {
    // Reset notFound state when id changes
    if (id) {
      setNotFound(false);
      hasSetNotFoundRef.current = false;
    }

    console.log('Session data lookup - Current state:', { 
      id, 
      sessionsLoading, 
      sessionsCount: sessions.length, 
      sharedCount: sharedWithMe.length,
      userAuthenticated: !!user
    });

    if (!id) {
      console.log('No session ID provided');
      return;
    }
    
    // FIRST APPROACH: Check sessionStorage cache for immediate display
    const cachedSessionJson = sessionStorage.getItem(`session_${id}`);
    if (cachedSessionJson && !sessionData) {
      try {
        const cachedSession = JSON.parse(cachedSessionJson);
        console.log('Found cached session while waiting for DB query:', cachedSession.title);
        setSessionData(cachedSession);
        // Session found in cache, but we'll still try to load fresh data
      } catch (err) {
        console.error('Error parsing cached session:', err);
      }
    }
    
    // SECOND APPROACH: Check the useJoiSessions hook's sessions and sharedWithMe arrays
    const checkSessionsArrays = () => {
      // Skip if sessions are still loading
      if (sessionsLoading) {
        console.log('Sessions still loading, waiting...');
        return false;
      }

      if (sessions.length > 0 || sharedWithMe.length > 0) {
        // Check user's own sessions
        console.log(`Looking for session with ID: ${id}`);
        console.log('Available session IDs:', sessions.map(s => s.id));
        
        const ownSession = sessions.find(s => s.id === id);
        if (ownSession) {
          console.log('Found session in user\'s own sessions:', ownSession.title);
          // Cache the session data in sessionStorage for faster loading on next visit
          try {
            sessionStorage.setItem(`session_${id}`, JSON.stringify(ownSession));
          } catch (err) {
            console.error('Error caching session:', err);
          }
          setSessionData(ownSession);
          return true;
        }
        
        // Check shared sessions
        console.log('Checking shared sessions');
        const shared = sharedWithMe.find(s => s.session?.id === id);
        if (shared?.session) {
          console.log('Found session in shared sessions:', shared.session.title);
          // Cache the session data in sessionStorage for faster loading on next visit
          try {
            sessionStorage.setItem(`session_${id}`, JSON.stringify(shared.session));
          } catch (err) {
            console.error('Error caching shared session:', err);
          }
          setSessionData(shared.session);
          return true;
        }
      }
      
      return false;
    };
    
    // Try to find the session in the arrays immediately
    const foundInArrays = checkSessionsArrays();
    
    // If not found in arrays and not currently loading, try fetching directly from database
    if (!foundInArrays && !sessionsLoading) {
      // THIRD APPROACH: Fetch directly from Supabase as a fallback
      const directFetch = async () => {
        const directFetchedSession = await fetchSessionDirectly(id ?? '');
        
        if (directFetchedSession) {
          // We found the session, update state and cache
          setSessionData(directFetchedSession);
          try {
            sessionStorage.setItem(`session_${id}`, JSON.stringify(directFetchedSession));
          } catch (err) {
            console.error('Error caching directly fetched session:', err);
          }
          return true;
        }
        
        return false;
      };
      
      // Use the finalTimeoutRef from component scope
      
      // Execute the direct fetch
      directFetch().then(foundDirectly => {
        // If still not found after direct fetch, set notFound after a delay
        if (!foundDirectly && !hasSetNotFoundRef.current) {
          console.log('Session not found directly, will check again in 10 seconds');
          
          // Check one more time after 10 seconds before giving up
          finalTimeoutRef.current = window.setTimeout(async () => {
            console.log('Performing final session check...');
            
            // Try checking arrays one more time
            const foundInArraysFinal = checkSessionsArrays();
            
            if (!foundInArraysFinal) {
              // Try one more direct fetch
              const foundDirectlyFinal = await directFetch();
              
              if (!foundDirectlyFinal && !hasSetNotFoundRef.current) {
                console.log('Session still not found after all attempts - setting notFound to true');
                hasSetNotFoundRef.current = true;
                setNotFound(true);
              }
            }
            
            // Clear the ref after it's been executed
            finalTimeoutRef.current = null;
          }, 10000);
        }
      });
      
      // Return a cleanup function that properly clears the timeout
      return () => {
        if (finalTimeoutRef.current) {
          clearTimeout(finalTimeoutRef.current);
          finalTimeoutRef.current = null;
        }
      };
    }
  }, [id, sessions, sharedWithMe, sessionsLoading, user, sessionData, fetchSessionDirectly]);
  
  // Fetch reddit posts using session data
  const { subreddits, isLoading, error } = useRedditPosts(
    sessionData?.subreddits ?? [],
    sessionData?.interval ? sessionData.interval * 2 : 20 // Already safe
  );

  // Add an effect to set player ready after subreddits are loaded
  useEffect(() => {
    if (!isLoading && subreddits.length > 0 && subreddits.some(sub => sub.posts.length > 0)) {
      // Set content loaded flag first
      setContentLoaded(true);
      
      // Delay showing player to ensure smooth initial render
      const readyTimer = setTimeout(() => {
        setPlayerReady(true);
      }, 500); // Increased delay to ensure content is fully prepared
      
      return () => clearTimeout(readyTimer);
    }
  }, [isLoading, subreddits]);

  // JOIP player controller
  const joipPlayer = useJoipPlayer({
    subreddits,
    interval: sessionData?.interval ?? DEFAULT_INTERVAL, 
    transition: sessionData?.transition ?? DEFAULT_TRANSITION, 
    paused: isPaused || isLoading || !playerReady, // Also pause until player is ready
  });

  // Helper function to safely check if user is a patron
  const isUserPatron = useCallback(() => {
    if (!user) return false;
    if (typeof user !== 'object') return false;
    if (!('profile' in user)) return false;
    
    const { profile } = user;
    if (!profile || typeof profile !== 'object') return false;
    
    return 'is_patron' in profile && profile.is_patron === true;
  }, [user]);
  
  // AI Caption generator
  const caption = useAICaption({
    post: joipPlayer.currentPost,
    systemPrompt: sessionData?.system_prompt ?? '',
    apiKey: isUserPatron() ? 'patron' : '', // Not a coalesce scenario
  });

  // Set document title based on current post
  useEffect(() => {
    if (joipPlayer.currentPost) {
      document.title = `${joipPlayer.currentPost.subreddit} - ${joipPlayer.currentPost.title.slice(0, 50)}${joipPlayer.currentPost.title.length > 50 ? '...' : ''}`;
    } else if (sessionData) {
      document.title = `JOIP Session: ${sessionData.title} - Joip AI`;
    } else {
      document.title = 'Joip AI';
    }

    // Reset on unmount
    return () => {
      document.title = 'Joip AI';
    };
  }, [joipPlayer.currentPost, sessionData]);
  
  // Toggle pause - wrapped in useCallback to maintain stable reference
  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);
  
  // Handle browser back button
  useEffect(() => {
    // Save current session state to sessionStorage to help with back button navigation
    if (sessionData) {
      sessionStorage.setItem('lastViewedSession', JSON.stringify({
        id: sessionData.id,
        title: sessionData.title,
        paused: isPaused,
        currentIndex: joipPlayer.currentIndex,
      }));
    }
    
    // Handle the popstate event (browser back/forward buttons)
    const handlePopState = () => {
      // Check if we're navigating away from this page
      if (!window.location.pathname.includes('/session/play/')) {
        // Clean up any resources or cancel ongoing requests
        if (joipPlayer.currentPost?.isVideo) {
          const videoElement = document.querySelector('video');
          if (videoElement) {
            videoElement.pause();
          }
        }
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [sessionData, isPaused, joipPlayer.currentIndex, joipPlayer.currentPost?.isVideo]);

  // Add keyboard navigation (simplified to only allow pause/play)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keypresses if the user isn't typing in an input field
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement) {
        return;
      }
      
      switch (e.key) {
        case ' ': // Space bar
          e.preventDefault(); // Prevent page scroll
          togglePause();
          break;
        case 'Escape': // Handle escape key for navigation
          if (document.fullscreenElement) {
            // If in fullscreen, exit fullscreen instead of navigating
            document.exitFullscreen().catch(err => {
              console.error('Error exiting fullscreen:', err);
            });
          } else {
            // Navigate back to sessions page with state preservation
            navigate('/sessions', { 
              state: { 
                fromSessionPlay: true,
                sessionId: sessionData?.id 
              } 
            });
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [joipPlayer, togglePause, sessionData, navigate]);
  
  // Handle notFound redirect via a dedicated useEffect
  useEffect(() => {
    if (notFound) {
      console.log("Setting up redirect timer because session not found");
      const redirectTimer = setTimeout(() => {
        console.log("Now redirecting to /sessions after delay", {
          id,
          currentPath: window.location.pathname,
          currentTime: new Date().toISOString()
        });
        navigate('/sessions', { replace: true });
      }, 500);
      
      return () => {
        console.log("Cleaning up redirect timer");
        clearTimeout(redirectTimer);
      };
    }
  }, [notFound, navigate, id]);
  
  // Redirect to settings page
  const goToSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);
  
  // Redirect if session not found
  if (notFound) {
    console.log('SESSION NOT FOUND - Redirecting to /sessions', { 
      id, 
      sessionsLoading, 
      sessionsCount: sessions.length,
      sharedCount: sharedWithMe.length,
      notFound,
      userAuthenticated: !!user,
      currentPath: window.location.pathname
    });
    
    // Return a temporary message
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h2 className="text-xl font-semibold mb-4">Session not found</h2>
        <p className="mb-4">The requested session could not be found.</p>
        <p>Redirecting to session list...</p>
      </div>
    );
  }
  
  // Loading state
  if (userLoading || sessionsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse flex space-x-2">
          <div className="rounded-full bg-muted h-3 w-3"></div>
          <div className="rounded-full bg-muted h-3 w-3"></div>
          <div className="rounded-full bg-muted h-3 w-3"></div>
        </div>
      </div>
    );
  }
  
  // Redirect if not logged in
  if (!user) {
    console.log("SessionPlayPage: User not authenticated, redirecting to login");
    return <Navigate to="/login" replace />;
  }
  
  // Loading session data
  if (!sessionData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <RefreshCw className="h-10 w-10 animate-spin text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">Loading session...</h2>
      </div>
    );
  }
  
  return (
    <div className="w-full h-screen flex flex-col relative">
      {/* Mobile Menu Toggle Button - Only visible when header is hidden */}
      {isMobile && !isMobileHeaderVisible && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileHeaderVisible(true)}
          aria-label="Toggle menu"
          className="absolute top-3 right-3 z-50 bg-background/90 backdrop-blur-sm rounded-full shadow-sm h-10 w-10"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      {/* Header - Collapsible on mobile */}
      <AnimatePresence>
        {(!isMobile || (isMobile && isMobileHeaderVisible)) && (
          <motion.header 
            className={cn(
              "z-40 border-b",
              isMobile 
                ? "absolute top-0 left-0 right-0 bg-background" 
                : "flex items-center justify-between px-5 py-4 bg-card/50 backdrop-blur-sm"
            )}
            initial={isMobile ? { opacity: 0, y: -20 } : undefined}
            animate={isMobile ? { opacity: 1, y: 0 } : undefined}
            exit={isMobile ? { opacity: 0, y: -20 } : undefined}
            transition={isMobile ? { duration: 0.2, ease: "easeOut" } : undefined}
          >
            {/* Desktop Header Layout */}
            {!isMobile && (
              <>
                <div className="flex items-center gap-4">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="mr-2"
                    onClick={() => navigate('/sessions', { 
                      state: { fromSessionPlay: true, sessionId: sessionData?.id } 
                    })}
                  >
                    <ArrowLeft className="h-5 w-5" />
                    <span className="sr-only">Back to Sessions</span>
                  </Button>
                  
                  <img 
                    src={theme === 'dark' ? logoDark : logoLight} 
                    alt="Joip AI" 
                    className="h-auto w-auto max-h-9 object-contain"
                  />
                  <h1 className="text-xl font-bold hidden sm:block">
                    {sessionData.title}
                  </h1>
                </div>
                
                <div className="flex items-center gap-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={togglePause}
                    className="gap-1"
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-4 w-4" />
                        <span>Resume</span>
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4" />
                        <span>Pause</span>
                      </>
                    )}
                  </Button>
                  <ThemeToggle />
                  <UserAvatar />
                </div>
              </>
            )}
            
            {/* Mobile Header Layout - Single Row with precise spacing */}
            {isMobile && (
              <div className="flex items-center justify-between h-[56px] px-4">
                {/* Back button with more left padding */}
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-10 w-10 p-0"
                  onClick={() => {
                    navigate('/sessions', { 
                      state: { fromSessionPlay: true, sessionId: sessionData?.id } 
                    });
                    setIsMobileHeaderVisible(false);
                  }}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                
                {/* Logo - centered with play/pause button */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
                  <img 
                    src={theme === 'dark' ? logoDark : logoLight} 
                    alt="Joip AI" 
                    className="h-7 w-auto object-contain absolute left-0 -translate-x-[calc(100%+16px)]"
                  />
                  
                  {/* Play/Pause Button - true center */}
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      togglePause();
                      setIsMobileHeaderVisible(false);
                    }}
                    className="h-9 min-w-[100px] flex items-center justify-center"
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-4 w-4 mr-2 shrink-0" />
                        <span>Resume</span>
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4 mr-2 shrink-0" />
                        <span>Pause</span>
                      </>
                    )}
                  </Button>
                </div>
                
                {/* Right controls with consistent spacing */}
                <div className="flex items-center space-x-1">
                  <div className="w-10 h-10 flex items-center justify-center">
                    <ThemeToggle />
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 p-0"
                    onClick={() => {
                      goToSettings();
                      setIsMobileHeaderVisible(false);
                    }}
                    aria-label="Account settings"
                  >
                    <UserAvatar />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMobileHeaderVisible(false)}
                    aria-label="Close menu"
                    className="h-10 w-10 p-0"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className={`flex-grow overflow-hidden ${!isMobile ? 'pt-[69px]' : 'h-full'}`}>
        <ResizablePanelGroup
          direction={isMobile ? "vertical" : "horizontal"}
          className="h-full"
        >
          {/* Media Panel */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full">
              {playerReady ? (
                <MediaDisplay
                  post={joipPlayer.currentPost}
                  isTransitioning={joipPlayer.isTransitioning}
                  transitionDirection={joipPlayer.transitionDirection}
                  transition={sessionData.transition}
                  totalPosts={joipPlayer.totalPosts}
                  error={error}
                  isLoading={isLoading}
                  paused={isPaused}
                  onTogglePause={togglePause}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  {contentLoaded ? (
                    <div className="text-center space-y-2">
                      <div className="animate-pulse flex space-x-2 justify-center mb-4">
                        <div className="rounded-full bg-muted h-3 w-3"></div>
                        <div className="rounded-full bg-muted h-3 w-3"></div>
                        <div className="rounded-full bg-muted h-3 w-3"></div>
                      </div>
                      <p>Preparing content...</p>
                    </div>
                  ) : (
                    <div className="animate-pulse flex space-x-2">
                      <div className="rounded-full bg-muted h-3 w-3"></div>
                      <div className="rounded-full bg-muted h-3 w-3"></div>
                      <div className="rounded-full bg-muted h-3 w-3"></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Caption Panel */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full">
              <CaptionDisplay
                caption={caption}
                onRegenerate={caption.regenerate}
                isApiKeySet={isUserPatron() || !!caption.caption}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}