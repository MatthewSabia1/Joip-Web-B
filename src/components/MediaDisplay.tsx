import { useState, useEffect, useRef } from 'react';
import { RedditPost, TransitionEffect } from '@/types';
import cn from 'clsx';
import './media-display.css'; // Import custom CSS
import { 
  AlertTriangleIcon, 
  RefreshCwIcon as RefreshIcon, 
  LogIn, 
  Image
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useRedditAuth } from '@/contexts/RedditAuthContext';
import { Link } from 'react-router-dom';
// Progress is no longer used after UI simplification
import { motion } from 'framer-motion';

// Define available fallback stages for image loading
type ImageLoadingStage = 'primary' | 'preview' | 'thumbnail' | 'failed';

interface MediaDisplayProps {
  post: RedditPost | null;
  isTransitioning: boolean;
  transitionDirection: 'next' | 'prev';
  transition: TransitionEffect;
  totalPosts: number;
  error?: string | null;
  isLoading?: boolean;
  paused?: boolean;
  onTogglePause?: () => void;
}

export function MediaDisplay({
  post,
  isTransitioning,
  transitionDirection,
  transition,
  totalPosts,
  error,
  isLoading = false,
  paused = false,
}: MediaDisplayProps) {
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<ImageLoadingStage>('primary');
  const [currentMediaUrl, setCurrentMediaUrl] = useState<string | undefined>(undefined);
  const { authState, connectReddit, isLoading: isAuthLoading } = useRedditAuth();
  const loadAttemptRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [authLoadingTimeout, setAuthLoadingTimeout] = useState(false);
  const [isMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  
  // Add refs to track current and previous posts for better transition handling
  const currentPostRef = useRef<RedditPost | null>(null);
  const previousPostRef = useRef<RedditPost | null>(null);
  
  // Add a loading queue to prevent premature transitions
  const loadingCompleteRef = useRef(false);

  // Debug log to see what's in the auth state - minimized to reduce noise
  useEffect(() => {
    if (authState && process.env.NODE_ENV !== 'production') {
      console.log('[MediaDisplay] Reddit auth state updated:', 
        authState.isAuthenticated ? 'Authenticated' : 'Not authenticated');
    }
  }, [authState?.isAuthenticated]); // Fixed to use optional chaining
  
  // Listen for fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Update fullscreen state but we don't need to track it in a state variable
      // since we're not using it for rendering
      document.fullscreenElement;
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Ensure video controls are always hidden
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      // Make sure controls are disabled programmatically
      const disableControls = () => {
        video.controls = false;
      };
      
      // Add event listeners to ensure controls stay disabled
      video.addEventListener('loadedmetadata', disableControls);
      video.addEventListener('play', disableControls);
      video.addEventListener('playing', disableControls);
      video.addEventListener('pause', disableControls);
      
      return () => {
        // Clean up event listeners
        video.removeEventListener('loadedmetadata', disableControls);
        video.removeEventListener('play', disableControls);
        video.removeEventListener('playing', disableControls);
        video.removeEventListener('pause', disableControls);
      };
    }
  }, []);

  // Enhanced effect to handle post changes and preload media
  useEffect(() => {
    if (post) {
      // Save previous post before updating
      if (currentPostRef.current && currentPostRef.current.id !== post.id) {
        previousPostRef.current = currentPostRef.current;
      }
      
      // Update current post reference
      currentPostRef.current = post;
      
      // Don't reset loading state during transitions - only for new posts
      if (!isTransitioning) {
        setIsImageLoading(true);
        setLoadingStage('primary');
        loadAttemptRef.current = 0;
        loadingCompleteRef.current = false;
      }
      
      // Initialize with the primary URL
      if (post.isVideo && post.videoUrl) {
        setCurrentMediaUrl(post.videoUrl);
      } else {
        setCurrentMediaUrl(post.url);
      }
      
      // Preload the image to improve transition performance
      if (!post.isVideo && post.url) {
        const img = new (window.Image)();
        img.src = post.url;
        
        img.onload = () => {
          loadingCompleteRef.current = true;
          // Once loaded, make sure we update the loading state
          setIsImageLoading(false);
        };
        
        img.onerror = () => {
          // If primary image fails, try to preload thumbnail
          if (post.thumbnailUrl) {
            const thumbImg = new (window.Image)();
            thumbImg.src = post.thumbnailUrl;
            thumbImg.onload = () => {
              loadingCompleteRef.current = true;
              setIsImageLoading(false);
            };
          }
        };
      }
    }
  }, [post, isTransitioning]);

  // Image loading error handler with fallback system
  const handleImageError = () => {
    console.error(`[Media Error] Failed to load media for post ${post?.id}`);
    loadAttemptRef.current += 1;
    if (loadAttemptRef.current <= 2) {
      setLoadingStage(loadAttemptRef.current === 1 ? 'preview' : 'thumbnail');
      setCurrentMediaUrl(post?.thumbnailUrl);
    } else {
      setLoadingStage('failed');
      setIsImageLoading(false);
    }
  };

  // Enhanced transition classes with improved animations
  const getTransitionClasses = () => {
    // Set up common animation settings for different transitions
    const transitions = {
      fade: {
        base: 'transition-opacity duration-300 ease-in-out will-change-opacity',
        enter: 'opacity-100',
        exit: 'opacity-0',
      },
      slide: {
        base: 'transition-transform duration-300 ease-in-out will-change-transform',
        enterFromNext: 'translate-x-full',
        enterFromPrev: '-translate-x-full',
        entered: 'translate-x-0',
        exitToNext: '-translate-x-full',
        exitToPrev: 'translate-x-full',
      },
      zoom: {
        base: 'transition-[transform,opacity] duration-300 ease-in-out origin-center will-change-transform will-change-opacity',
        enter: 'scale-100 opacity-100',
        exit: 'scale-50 opacity-0',
      },
      flip: {
        base: 'transition-[transform,opacity] duration-400 ease-in-out transform-gpu backface-visibility-hidden perspective-1200 will-change-transform will-change-opacity',
        enterFromNext: 'rotate-y-90 opacity-0',
        enterFromPrev: '-rotate-y-90 opacity-0',
        entered: 'rotate-y-0 opacity-100',
        exitToNext: '-rotate-y-90 opacity-0',
        exitToPrev: 'rotate-y-90 opacity-0',
      },
    };
    
    // Determine the current animation state based on transition type and direction
    switch (transition) {
      case 'fade':
        return cn(
          transitions.fade.base,
          isTransitioning ? transitions.fade.exit : transitions.fade.enter
        );
      
      case 'slide':
        if (isTransitioning) {
          // Exit animation
          return cn(
            transitions.slide.base,
            transitionDirection === 'next' 
              ? transitions.slide.exitToNext
              : transitions.slide.exitToPrev
          );
        } else {
          // Enter animation - Apply entry state immediately when not transitioning
          return cn(
            transitions.slide.base,
            transitions.slide.entered
          );
        }
      
      case 'zoom':
        return cn(
          transitions.zoom.base,
          isTransitioning ? transitions.zoom.exit : transitions.zoom.enter
        );
      
      case 'flip':
        if (isTransitioning) {
          // Exit animation
          return cn(
            transitions.flip.base,
            transitionDirection === 'next' 
              ? transitions.flip.exitToNext
              : transitions.flip.exitToPrev
          );
        } else {
          // Enter animation - Apply entry state immediately when not transitioning
          return cn(
            transitions.flip.base,
            transitions.flip.entered
          );
        }
      
      default:
        // Fallback if no transition or unknown type - no transition classes
        return '';
    }
  };

  // Apply special container classes for certain transitions
  const getContainerClasses = () => {
    let classes = 'relative overflow-hidden';
    
    if (transition === 'flip') {
      classes = cn(classes, 'perspective-1200');
    }
    
    return classes;
  };

  // Add a timeout for the auth loading state and detect CORS errors
  // Use a ref to properly track and clear timeouts
  const authTimeoutRef = useRef<number | null>(null);
  
  useEffect(() => {
    // Clear any existing timeout first to prevent memory leaks
    if (authTimeoutRef.current) {
      window.clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
    
    if (isAuthLoading) {
      // Set new timeout if loading
      authTimeoutRef.current = window.setTimeout(() => {
        setAuthLoadingTimeout(true);
        authTimeoutRef.current = null; // Clear reference after execution
      }, 15000);
    } else {
      // Reset timeout state if not loading
      setAuthLoadingTimeout(false);
    }
    
    // Clean up on unmount or dependency change
    return () => {
      if (authTimeoutRef.current) {
        window.clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = null;
      }
    };
  }, [isAuthLoading]);  // Only depend on isAuthLoading
  
  // Detect CORS errors and handle them gracefully
  useEffect(() => {
    // Check for CORS errors in console logs
    const originalError = console.error;
    const errorHandler = (message: any, ...args: any[]) => {
      const errorString = String(message);
      
      // Check if this is a CORS error related to Reddit API
      if ((errorString.includes('CORS') || errorString.includes('cross-origin')) &&
          (errorString.includes('reddit') || errorString.includes('supabase') || 
           errorString.includes('/functions/v1/reddit-auth'))) {
        
        // Set a longer timeout to avoid constant retries
        setAuthLoadingTimeout(true);
        console.log('[MediaDisplay] CORS error detected with Reddit API, extending timeout');
      }
      
      // Still call the original console.error
      originalError.call(console, message, ...args);
    };
    
    // Override console.error
    console.error = errorHandler;
    
    // Restore original on cleanup
    return () => {
      console.error = originalError;
    };
  }, []);

  // Check if RedditAuth context is still loading/initializing
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">
            {authLoadingTimeout 
              ? "Authentication is taking longer than expected..." 
              : "Initializing session..."}
          </p>
          {authLoadingTimeout && (
            <div className="max-w-md mx-auto">
              <p className="text-sm text-muted-foreground mt-2">
                Reddit API might be experiencing connectivity issues. This could be due to:
              </p>
              <ul className="text-xs text-muted-foreground mt-2 list-disc list-inside text-left max-w-xs mx-auto">
                <li>CORS security restrictions</li>
                <li>Network connectivity problems</li>
                <li>Reddit API temporary outage</li>
                <li>Authentication token issues</li>
              </ul>
              <div className="flex gap-2 justify-center mt-4">
                <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                  <RefreshIcon className="h-3 w-3 mr-1" />
                  Refresh Page
                </Button>
                <Button size="sm" onClick={connectReddit}>
                  <LogIn className="h-3 w-3 mr-1" />
                  Try Reconnecting
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3 opacity-80">
                If the issue persists, try again later or check if Reddit is experiencing service disruptions.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Display Reddit authentication prompt if not authenticated *after* context loading check
  if (!authState.isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center space-y-4 max-w-md">
          <AlertTriangleIcon className="h-10 w-10 text-amber-500 mx-auto mb-4" />
          <h3 className="text-xl font-medium">Reddit Authentication Required</h3>
          <p className="text-muted-foreground mb-6">
            Please connect your Reddit account to view content from your favorite subreddits.
          </p>
          <Button 
            onClick={connectReddit}
            className="bg-[#FF4500] hover:bg-[#FF4500]/90 text-white"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Connect Reddit Account
          </Button>
          <div className="mt-4 border-t pt-4">
            <details className="text-left">
              <summary className="text-xs text-muted-foreground cursor-pointer">Debug Info</summary>
              <pre className="text-xs bg-muted p-2 mt-2 overflow-auto max-h-40 rounded">
                {JSON.stringify({authState}, null, 2)}
              </pre>
              <Button 
                onClick={() => {
                  console.log('[Debug] Forcing reconnect');
                  window.location.reload();
                }}
                variant="outline"
                size="sm"
                className="mt-2 text-xs"
              >
                Force Reload
              </Button>
            </details>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Connecting your account allows us to access content while respecting Reddit's API policies.
          </p>
        </div>
      </div>
    );
  }

  // Display error message if there's an error
  if (error) {
    // Categorize errors for better user feedback
    const errorType = (() => {
      if (error.includes('CORS') || error.includes('cross-origin')) {
        return 'cors';
      } else if (error.includes('network error') || error.includes('failed to fetch') || error.includes('timed out')) {
        return 'network';
      } else if (error.includes('rate limit') || error.includes('429')) {
        return 'rateLimit';
      } else if (error.includes('authentication') || error.includes('401') || error.includes('unauthorized')) {
        return 'auth';
      } else if (error.includes('not found') || error.includes('404')) {
        return 'notFound';
      } else {
        return 'general';
      }
    })();
    
    // Map error types to user-friendly messages
    const errorMessages = {
      cors: "Unable to connect to Reddit API due to browser security restrictions. This is often a temporary issue.",
      network: "Network connection issue. Please check your internet connection and try again.",
      rateLimit: "Reddit API rate limit exceeded. Please wait a moment before trying again.",
      auth: "Reddit authentication issue. Please reconnect your Reddit account.",
      notFound: "Content not found. The subreddit or posts may be unavailable or private.",
      general: error
    };
    
    const errorTitles = {
      cors: "Connection Issue",
      network: "Network Error",
      rateLimit: "Rate Limit Exceeded",
      auth: "Authentication Error",
      notFound: "Content Not Found",
      general: "Error"
    };
    
    const isReconnectNeeded = ['cors', 'auth'].includes(errorType);
    const showDetailsCollapsible = errorType === 'general';
    
    return (
      <div className="flex items-center justify-center h-full p-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-md w-full"
        >
          <Alert 
            variant={errorType === 'general' ? "destructive" : "default"} 
            className={cn(
              "border shadow-sm",
              errorType === 'cors' && "border-amber-500 bg-amber-500/10",
              errorType === 'network' && "border-blue-500 bg-blue-500/10",
              errorType === 'rateLimit' && "border-orange-500 bg-orange-500/10",
              errorType === 'auth' && "border-red-500 bg-red-500/10",
              errorType === 'notFound' && "border-slate-500 bg-slate-500/10"
            )}
          >
            <AlertTriangleIcon className={cn(
              "h-5 w-5",
              errorType === 'cors' && "text-amber-500",
              errorType === 'network' && "text-blue-500",
              errorType === 'rateLimit' && "text-orange-500",
              errorType === 'auth' && "text-red-500",
              errorType === 'notFound' && "text-slate-500"
            )} />
            <AlertTitle className="text-lg font-semibold">{errorTitles[errorType]}</AlertTitle>
            <AlertDescription className="mt-2 text-base">
              {errorMessages[errorType]}
            </AlertDescription>
            
            {showDetailsCollapsible && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">Show error details</summary>
                <div className="mt-2 p-2 bg-background/50 rounded overflow-auto max-h-24">
                  <code>{error}</code>
                </div>
              </details>
            )}
            
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              {isReconnectNeeded && (
                <Button 
                  className="sm:flex-1"
                  onClick={connectReddit}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Reconnect Reddit
                </Button>
              )}
              
              <Button 
                variant={isReconnectNeeded ? "outline" : "default"}
                className="sm:flex-1"
                onClick={() => window.location.reload()}
              >
                <RefreshIcon className="h-4 w-4 mr-2" />
                Refresh Page
              </Button>
            </div>
            
            {errorType === 'cors' && (
              <p className="text-xs text-muted-foreground mt-4 bg-background/50 p-2 rounded">
                <strong>Tip:</strong> CORS errors occur when browsers block cross-origin requests for security reasons.
                This is often temporary and can be resolved by refreshing, trying another browser, or reconnecting.
              </p>
            )}
            
            {errorType === 'rateLimit' && (
              <p className="text-xs text-muted-foreground mt-4 bg-background/50 p-2 rounded">
                <strong>Tip:</strong> Reddit limits how many requests can be made in a short time period.
                Please wait a minute and try again, or try with fewer subreddits.
              </p>
            )}
          </Alert>
        </motion.div>
      </div>
    );
  }

  // Loading indicator when fetching posts
  if (isLoading && totalPosts === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div 
          className="text-center space-y-4 max-w-sm"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0">
              <div className="animate-spin h-16 w-16 border-4 border-primary/20 border-t-primary rounded-full"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 bg-background rounded-full flex items-center justify-center">
                <Image className="h-4 w-4 text-primary animate-pulse" />
              </div>
            </div>
          </div>
          <div>
            <p className="text-lg font-medium">Loading JOIP content</p>
            <p className="text-muted-foreground text-sm mt-1">Fetching from Reddit...</p>
          </div>
          <div className="pt-2">
            <div className="h-1 w-full bg-muted overflow-hidden rounded-full">
              <motion.div 
                className="h-full bg-primary"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ 
                  duration: 4,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "reverse" 
                }}
              />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Cases where there's no post to display
  if (!post) {
    // Determine if we're in a session with subreddits but content just isn't loading,
    // or if there are truly no subreddits configured
    const hasNoContent = !isLoading && (totalPosts === 0);
    
    // Determine the session ID from the URL if we're in a session
    const getSessionIdFromUrl = () => {
      const url = window.location.pathname;
      const match = /\/session\/(?:play|edit)\/([^\/]+)/.exec(url);
      return match ? match[1] : null;
    };
    
    const sessionId = getSessionIdFromUrl();
    
    return (
      <div className="flex items-center justify-center h-full p-8">
        <motion.div 
          className="text-center space-y-4 max-w-md bg-muted/10 backdrop-blur-sm p-6 rounded-xl border shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mx-auto rounded-full bg-muted/30 w-16 h-16 flex items-center justify-center mb-2">
            <Image className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-xl font-medium">No Content Loaded</h3>
          <p className="text-muted-foreground">
            {hasNoContent
              ? "No content was found for this session. This could be because the subreddits aren't configured correctly or no posts were found."
              : "Loading content from Reddit..."
            }
          </p>
          <div className="pt-2">
            {sessionId && (
              <Button asChild className="mt-2">
                <Link to={`/session/edit/${sessionId}`}>
                  Edit Session Settings
                </Link>
              </Button>
            )}
            {!sessionId && (
              <Button asChild className="mt-2">
                <Link to="/sessions">
                  Back to Sessions
                </Link>
              </Button>
            )}
            {hasNoContent && isAuthLoading === false && (
              <div className="mt-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.reload()}
                  className="mt-2"
                >
                  <RefreshIcon className="h-4 w-4 mr-2" />
                  Retry Loading
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const handleImageLoad = () => {
    setIsImageLoading(false);
    loadingCompleteRef.current = true;
  };

  // Generate appropriate URL transformations for direct Reddit URLs to optimize loading
  const getTransformedUrl = (url: string | undefined) => {
    if (!url) return '';
    
    // Avoid CORS issues by:
    // 1. Preserving preview.redd.it URLs - they often have better CORS headers
    // 2. Keeping parameters that help with access
    // 3. Ensuring URLs are HTTPS
    
    // Ensure HTTPS
    if (url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    }
    
    // Handle different URL types carefully
    if (url.includes('preview.redd.it')) {
      // Keep preview.redd.it URLs as they may have better CORS support
      // But clean up unnecessary parameters that could be tracking-related
      if (url.includes('?')) {
        const [baseUrl, params] = url.split('?');
        const validParams = params.split('&').filter(param => 
          param.startsWith('width=') || 
          param.startsWith('height=') || 
          param.startsWith('auto=') || 
          param.startsWith('s=') ||
          param.startsWith('format=')
        );
        return validParams.length > 0 ? `${baseUrl}?${validParams.join('&')}` : baseUrl;
      }
      return url;
    }
    
    // Clean up image URLs by removing unnecessary query parameters
    if (/\.(jpg|jpeg|png|gif|webp)/i.test(url) && url.includes('?')) {
      return url.split('?')[0];
    }
    
    // Handle i.redd.it URLs
    if (url.includes('i.redd.it')) {
      // i.redd.it URLs work best without query parameters
      return url.split('?')[0];
    }
    
    // Handle imgur URLs
    if (url.includes('imgur.com')) {
      // Imgur direct links work better without parameters
      if (/\.(jpg|jpeg|png|gif|webp)/i.test(url)) {
        return url.split('?')[0];
      }
    }
    
    // Return the URL as is for other cases
    return url;
  };

  // Enhance video handling when post changes
  useEffect(() => {
    if (post?.isVideo && videoRef.current) {
      // Reset video when transitioning to avoid playback issues
      const videoElement = videoRef.current;
      
      // Pause during transitions to prevent choppy playback
      if (isTransitioning) {
        videoElement.pause();
      } else {
        // Small delay to ensure animation completes before starting video
        setTimeout(() => {
          if (!paused) {
            // Preload video content before playing
            videoElement.load();
            const playPromise = videoElement.play();
            
            // Handle potential play() promise rejection (can happen due to browser autoplay policies)
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.warn('[MediaDisplay] Video autoplay prevented:', error);
                // Video can't autoplay, but user can manually play it later
              });
            }
          }
        }, 100); // Increase delay to ensure transitions complete before video starts
      }
    }
  }, [post, isTransitioning, paused]);

  return (
    <div className="relative h-full flex flex-col" ref={fullscreenContainerRef}>
      {/* Media Display */}
      <div 
        ref={containerRef}
        className={cn("flex-grow flex items-center justify-center p-4 relative rounded-lg", getContainerClasses())}
      >
        {/* Only show loading skeleton if primary content is loading AND not transitioning */}
        {isImageLoading && !isTransitioning && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Skeleton className="w-full h-full absolute rounded-md" />
          </div>
        )}

        {/* Progress indicator removed for cleaner experience */}

        <div className={cn("h-full w-full flex items-center justify-center", getTransitionClasses())}>
          {/* Handle Video */}
          {post?.isVideo && post.videoUrl ? (
            <video
              ref={videoRef}
              key={post.id + '-video-' + loadingStage}
              src={currentMediaUrl}
              autoPlay={!isTransitioning && !paused}
              loop
              muted={isMuted}
              controls={false}
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              disableRemotePlayback
              className="max-h-full max-w-full object-contain rounded-md no-controls"
              onLoadedData={handleImageLoad}
              onError={handleImageError}
              playsInline
              preload="auto"
              style={{ 
                pointerEvents: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none'
              }}
            />
          ) : (
            /* Handle Images with multiple fallback strategies */
            <>
              {loadingStage !== 'failed' ? (
                <img
                  key={post?.id + '-image-' + loadingStage}
                  src={getTransformedUrl(currentMediaUrl)}
                  alt={post?.title}
                  className="max-h-full max-w-full object-contain rounded-md"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  loading="eager"
                  decoding="async"
                  style={{ 
                    pointerEvents: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none'
                  }}
                />
              ) : (
                /* Final fallback - show unavailable message */
                <div className="flex flex-col items-center justify-center text-center p-4 border rounded-md">
                  <AlertTriangleIcon className="h-6 w-6 text-amber-500 mb-2" />
                  <p className="text-muted-foreground">Media unavailable</p>
                  {post?.thumbnailUrl && (
                    <img 
                      src={post.thumbnailUrl} 
                      alt="Thumbnail" 
                      className="mt-4 max-w-[200px] max-h-[200px] object-contain opacity-70"
                    />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      if (!post) return;
                      // Reset loading state to try again
                      setLoadingStage('primary');
                      setIsImageLoading(true);
                      loadAttemptRef.current = 0;
                      setCurrentMediaUrl(post.url);
                    }}
                  >
                    <RefreshIcon className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Remove the playback controls from here completely */}
      </div>
    </div>
  );
}