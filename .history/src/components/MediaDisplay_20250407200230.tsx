import { useState, useEffect, useRef } from 'react';
import { RedditPost, TransitionEffect } from '@/types';
import { cn } from '@/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon, AlertTriangleIcon, RefreshCwIcon as RefreshIcon, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useRedditAuth } from '@/contexts/RedditAuthContext';

// Define available fallback stages for image loading
type ImageLoadingStage = 'primary' | 'preview' | 'thumbnail' | 'failed';

interface MediaDisplayProps {
  post: RedditPost | null;
  isTransitioning: boolean;
  transitionDirection: 'next' | 'prev';
  transition: TransitionEffect;
  totalPosts: number;
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  error?: string | null;
  isLoading?: boolean;
}

export function MediaDisplay({
  post,
  isTransitioning,
  transitionDirection,
  transition,
  totalPosts,
  currentIndex,
  onNext,
  onPrevious,
  error,
  isLoading = false,
}: MediaDisplayProps) {
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<ImageLoadingStage>('primary');
  const [currentMediaUrl, setCurrentMediaUrl] = useState<string | undefined>(undefined);
  const { authState, connectReddit } = useRedditAuth();
  const loadAttemptRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debug log to see what's in the auth state
  useEffect(() => {
    console.log('[MediaDisplay] Reddit auth state:', authState);
  }, [authState]);

  useEffect(() => {
    if (post) {
      setIsImageLoading(true);
      setLoadingStage('primary');
      loadAttemptRef.current = 0;
      
      // Initialize with the primary URL
      if (post.isVideo && post.videoUrl) {
        setCurrentMediaUrl(post.videoUrl);
      } else {
        setCurrentMediaUrl(post.url);
      }
    }
  }, [post?.id]);

  // Image loading error handler with fallback system
  const handleImageError = () => {
    console.error(`[Media Error] Failed to load media for post ${post?.id} at stage ${loadingStage}`);
    
    // Increment the load attempt counter
    loadAttemptRef.current += 1;
    
    // Try different fallback strategies based on current stage
    if (loadingStage === 'primary' && post?.url !== post?.thumbnailUrl) {
      // First fallback: Try the preview/thumbnail URL if different from the primary
      console.log(`[Media Fallback] Trying preview URL for post ${post?.id}`);
      setLoadingStage('preview');
      setCurrentMediaUrl(post?.thumbnailUrl);
    } else if (loadingStage === 'preview' || loadAttemptRef.current > 2) {
      // Second fallback or too many attempts: Mark as failed after multiple attempts
      console.log(`[Media Failed] All loading attempts failed for post ${post?.id}`);
      setLoadingStage('failed');
      setIsImageLoading(false);
    }
  };

  // Enhanced transition classes with improved animations
  const getTransitionClasses = () => {
    // Base transition classes
    const baseClasses = 'transition-transform duration-500 ease-out will-change-transform';
    
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

  // Display Reddit authentication prompt if not authenticated
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
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangleIcon className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="mt-2">
            {error}
          </AlertDescription>
          <Button 
            variant="outline" 
            className="w-full mt-4"
            onClick={() => window.location.reload()}
          >
            <RefreshIcon className="h-4 w-4 mr-2" />
            Refresh Page
          </Button>
        </Alert>
      </div>
    );
  }

  // Loading indicator when fetching posts
  if (isLoading && totalPosts === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading content...</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-muted-foreground mb-2">
            Configure subreddits in settings to begin.
          </p>
          <Button asChild variant="outline">
            <Link to="/settings">
              Go to Settings
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleImageLoad = () => {
    setIsImageLoading(false);
  };

  // Generate appropriate URL transformations for direct Reddit URLs to optimize loading
  const getTransformedUrl = (url: string | undefined) => {
    if (!url) return '';
    
    // Try to transform URL if it's a known Reddit pattern
    if (url.includes('preview.redd.it')) {
      // Convert preview URLs to i.redd.it direct URLs
      return url.replace('preview.redd.it', 'i.redd.it')
                .split('?')[0]; // Remove all query parameters
    }
    
    // Remove query parameters from image URLs
    if (/\.(jpg|jpeg|png|gif|webp)/i.test(url) && url.includes('?')) {
      return url.split('?')[0];
    }
    
    return url;
  };

  return (
    <div className="relative h-full flex flex-col">
      {/* Media Display */}
      <div 
        ref={containerRef}
        className={cn("flex-grow flex items-center justify-center p-4 relative", getContainerClasses())}
      >
        {isImageLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Skeleton className="w-full h-full absolute" />
          </div>
        )}

        <div className={cn("h-full w-full flex items-center justify-center", getTransitionClasses())}>
          {/* Handle Video */}
          {post.isVideo && post.videoUrl ? (
            <video
              key={post.id + '-video-' + loadingStage}
              src={currentMediaUrl}
              controls
              autoPlay
              loop
              muted
              className="max-h-full max-w-full object-contain rounded-md"
              onLoadedData={handleImageLoad}
              onError={handleImageError}
            />
          ) : (
            /* Handle Images with multiple fallback strategies */
            <>
              {loadingStage !== 'failed' ? (
                <img
                  key={post.id + '-image-' + loadingStage}
                  src={getTransformedUrl(currentMediaUrl)}
                  alt={post.title}
                  className="max-h-full max-w-full object-contain rounded-md"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              ) : (
                /* Final fallback - show unavailable message */
                <div className="flex flex-col items-center justify-center text-center p-4 border rounded-md">
                  <AlertTriangleIcon className="h-6 w-6 text-amber-500 mb-2" />
                  <p className="text-muted-foreground">Media unavailable</p>
                  {post.thumbnailUrl && (
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
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';