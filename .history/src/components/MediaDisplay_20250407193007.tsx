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

  // Helper to display thumbnail when video fails
  const displayThumbnailFallback = (videoElement: HTMLVideoElement, postData: RedditPost) => {
    if (!postData.thumbnailUrl) {
      setIsImageLoading(false); // No thumbnail to fallback to
      return;
    }
    console.log(`[Video Fallback] Displaying thumbnail: ${postData.thumbnailUrl}`);
    const imgElement = document.createElement("img");
    imgElement.src = getProxiedUrl(postData.thumbnailUrl) || postData.thumbnailUrl; // Try proxied first
    imgElement.alt = postData.title;
    imgElement.className = "max-w-full max-h-full object-contain rounded-md";
    imgElement.crossOrigin = "anonymous";
    imgElement.onload = handleImageLoad;
    imgElement.onerror = () => {
      console.error(`[Video Fallback] Failed to load fallback thumbnail: ${imgElement.src}`);
      // Try direct thumbnail URL if proxy failed
      if (imgElement.src !== postData.thumbnailUrl && postData.thumbnailUrl) {
        imgElement.src = postData.thumbnailUrl;
        imgElement.onerror = () => { // Final attempt
          console.error(`[Video Fallback] Failed to load direct thumbnail: ${postData.thumbnailUrl}`);
           setIsImageLoading(false);
        }
      } else {
         setIsImageLoading(false);
      }
    };

    if (videoElement.parentNode) {
      videoElement.parentNode.replaceChild(imgElement, videoElement);
    }
  };

  // Function to handle CORS issues by proxying through backend or CORS proxy
  const getProxiedUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    
    // If the URL is already a data URL, return it as is
    if (url.startsWith('data:')) return url;
    
    // Basic HTTPS check/fix
    let processedUrl = url;
    if (processedUrl.startsWith('http://')) {
      processedUrl = processedUrl.replace('http://', 'https://');
    }

    // For local development, use a CORS proxy service
    if (window.location.hostname === 'localhost') {
      console.log(`[Proxy] Using corsproxy.io for: ${processedUrl}`);
      return `https://corsproxy.io/?${encodeURIComponent(processedUrl)}`;
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
          {post.isVideo && post.videoUrl ? (
            <video
              key={post.id + '-video'}
              src={getProxiedUrl(post.videoUrl)}
              controls
              autoPlay
              loop
              muted
              crossOrigin="anonymous"
              className="max-h-full max-w-full object-contain rounded-md"
              onLoadedData={handleImageLoad}
              onError={(e) => {
                console.error(`[Video Error] Failed to load proxied video: ${getProxiedUrl(post.videoUrl)}`);
                const videoElement = e.target as HTMLVideoElement;
                
                // Try direct URL
                if (post.videoUrl && videoElement.src !== post.videoUrl) {
                  console.log(`[Video Error] Trying direct URL: ${post.videoUrl}`);
                  videoElement.src = post.videoUrl;
                  videoElement.onerror = () => {
                     console.error(`[Video Error] Failed to load direct video: ${post.videoUrl}`);
                     // Fallback to thumbnail if direct also fails
                     if (post.thumbnailUrl) {
                       displayThumbnailFallback(videoElement, post);
                     } else {
                       setIsImageLoading(false);
                     }
                  };
                } else if (post.thumbnailUrl) {
                  // If proxied URL was already direct, or no direct URL, go straight to thumbnail
                  displayThumbnailFallback(videoElement, post);
                } else {
                   setIsImageLoading(false);
                }
              }}
            />
          ) : post.isImage && post.url ? (
            <img
              key={post.id + '-image'}
              src={getProxiedUrl(post.url)}
              alt={post.title}
              crossOrigin="anonymous"
              className="max-h-full max-w-full object-contain rounded-md"
              onLoad={handleImageLoad}
              onError={(e) => {
                console.error(`[Image Error] Failed to load proxied image: ${getProxiedUrl(post.url)}`);
                const imgElement = e.target as HTMLImageElement;
                
                // Try direct URL
                if (post.url && imgElement.src !== post.url) {
                   console.log(`[Image Error] Trying direct URL: ${post.url}`);
                   imgElement.src = post.url;
                   imgElement.onerror = () => {
                     console.error(`[Image Error] Failed to load direct image: ${post.url}`);
                     // Fallback to thumbnail if direct also fails
                     if (post.thumbnailUrl) {
                       console.log(`[Image Error] Trying thumbnail URL: ${post.thumbnailUrl}`);
                       imgElement.src = post.thumbnailUrl;
                       imgElement.onerror = () => {
                         console.error(`[Image Error] Failed to load thumbnail: ${post.thumbnailUrl}`);
                         setIsImageLoading(false);
                       }
                     } else {
                       setIsImageLoading(false);
                     }
                   };
                } else if (post.thumbnailUrl) {
                   // If proxied URL was already direct, or no direct URL, go straight to thumbnail
                   console.log(`[Image Error] Trying thumbnail URL: ${post.thumbnailUrl}`);
                   if (post.thumbnailUrl) { // Explicit check added
                     imgElement.src = post.thumbnailUrl;
                   } 
                   imgElement.onerror = () => {
                      console.error(`[Image Error] Failed to load thumbnail: ${post.thumbnailUrl}`);
                      setIsImageLoading(false);
                   }
                } else {
                   setIsImageLoading(false);
                }
              }}
            />
          ) : post.thumbnailUrl ? (
             <img
               key={post.id + '-thumb-fallback'}
               src={getProxiedUrl(post.thumbnailUrl)}
               alt={post.title + ' (thumbnail)'}
               crossOrigin="anonymous"
               className="max-w-full max-h-full object-contain rounded-md"
               onLoad={handleImageLoad}
               onError={(e) => {
                 console.error(`[Thumbnail Error] Failed to load proxied thumbnail: ${getProxiedUrl(post.thumbnailUrl)}`);
                 const imgElement = e.target as HTMLImageElement;
                 // Try direct thumbnail URL
                 if (post.thumbnailUrl && imgElement.src !== post.thumbnailUrl) {
                   if (post.thumbnailUrl) { // Explicit check added
                     imgElement.src = post.thumbnailUrl;
                   }
                   imgElement.onerror = () => {
                     console.error(`[Thumbnail Error] Failed to load direct thumbnail: ${post.thumbnailUrl}`);
                     setIsImageLoading(false);
                   }
                 } else {
                   setIsImageLoading(false);
                 }
               }}
             />
          ) : (
            <div className="flex items-center justify-center h-full">
               <p className="text-muted-foreground">Media not available</p>
            </div>
          )}
        </div>
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