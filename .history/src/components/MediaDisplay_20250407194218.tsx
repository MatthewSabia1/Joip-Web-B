import { useState, useEffect } from 'react';
import { RedditPost, TransitionEffect } from '@/types';
import { cn } from '@/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, AlertTriangleIcon, RefreshCwIcon as RefreshIcon, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useRedditAuth } from '@/contexts/RedditAuthContext';

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
  const { authState, connectReddit } = useRedditAuth();

  // Debug log to see what's in the auth state
  useEffect(() => {
    console.log('[MediaDisplay] Reddit auth state:', authState);
  }, [authState]);

  useEffect(() => {
    if (post) {
      setIsImageLoading(true);
    }
  }, [post?.id]);

  // Define transition classes based on the selected effect
  const getTransitionClasses = () => {
    let baseClasses = 'transition-all duration-500 ease-in-out';
    
    if (!isTransitioning) return baseClasses;
    
    switch (transition) {
      case 'fade':
        return cn(baseClasses, 'opacity-0');
      
      case 'slide':
        return cn(
          baseClasses,
          transitionDirection === 'next' 
            ? '-translate-x-full' 
            : 'translate-x-full'
        );
      
      case 'zoom':
        return cn(baseClasses, isTransitioning ? 'scale-50 opacity-0' : 'scale-100 opacity-100');
      
      case 'flip':
        return cn(
          baseClasses,
          'transform perspective-1000',
          isTransitioning ? 'rotate-y-90 opacity-0' : 'rotate-y-0 opacity-100'
        );
      
      default:
        return baseClasses;
    }
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

  // Function to handle CORS issues by proxying through backend or CORS proxy
  const getProxiedUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    
    // Log the raw URL for debugging
    console.log(`[MediaDisplay] Raw URL: ${url}`);
    
    // If the URL is already a data URL, return it as is
    if (url.startsWith('data:')) return url;
    
    // Basic HTTPS check/fix
    let processedUrl = url;
    if (processedUrl.startsWith('http://')) {
      processedUrl = processedUrl.replace('http://', 'https://');
    }

    // For local development, use a CORS proxy service
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Try different CORS proxies as corsproxy.io seems to be blocked
      // Alternative 1: thingproxy
      // console.log(`[Proxy] Using thingproxy for: ${processedUrl}`);
      // return `https://thingproxy.freeboard.io/fetch/${processedUrl}`;
      
      // Alternative 2: allOrigins
      console.log(`[Proxy] Using allorigins for: ${processedUrl}`);
      return `https://api.allorigins.win/raw?url=${encodeURIComponent(processedUrl)}`;
      
      // Alternative 3: CORS Anywhere (may require a key)
      // console.log(`[Proxy] Using CORS Anywhere for: ${processedUrl}`);
      // return `https://cors-anywhere.herokuapp.com/${processedUrl}`;
    }
    
    // In production, return the processed URL directly (assuming no proxy needed or handled server-side)
    return processedUrl;
  };

  return (
    <div className="relative h-full flex flex-col">
      {/* Link to Reddit in top-right corner */}
      <div className="absolute top-4 right-4 z-10">
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          title="View on Reddit"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLinkIcon className="h-5 w-5" />
        </a>
      </div>

      {/* Media Display */}
      <div className="flex-grow flex items-center justify-center p-4 relative">
        {isImageLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="w-full h-full absolute" />
          </div>
        )}

        <div className={cn("h-full w-full flex items-center justify-center", getTransitionClasses())}>
          {/* Simple display approach: Just use img tag with direct URL */}
          <img
            key={post.id + '-direct'}
            src={post.url || post.thumbnailUrl}
            alt={post.title}
            className="max-h-full max-w-full object-contain rounded-md"
            onLoad={handleImageLoad}
            onError={(e) => {
              console.error(`[Image Load Error] Failed for direct URL: ${post.url}`, e);
              setIsImageLoading(false);
            }}
          />
        </div>
      </div>

      {/* Title overlay at the bottom */}
      <div className="absolute bottom-16 left-0 right-0 bg-black/50 p-2 text-center">
        <p className="text-white text-sm truncate">{post.title}</p>
      </div>

      {/* Navigation Controls */}
      <div className="h-12 flex items-center justify-between px-4 mt-auto">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevious}
          disabled={totalPosts <= 1}
          className="h-9 w-9 rounded-full"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          <span className="sr-only">Previous</span>
        </Button>

        <div className="flex items-center justify-center h-6 w-16 text-xs font-medium text-muted-foreground rounded-full bg-muted/30">
          <span>{totalPosts > 0 ? `${currentIndex + 1}/${totalPosts}` : '-'}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          disabled={totalPosts <= 1}
          className="h-9 w-9 rounded-full"
        >
          <ChevronRightIcon className="h-4 w-4" />
          <span className="sr-only">Next</span>
        </Button>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';