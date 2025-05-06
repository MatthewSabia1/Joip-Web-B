import { useState, useEffect, useRef, useCallback } from 'react';
import { Subreddit, RedditPost } from '@/types';
import { useRedditAuth } from '@/contexts/RedditAuthContext';
import { API_ENDPOINTS, REDDIT_USER_AGENT } from '@/lib/constants';
import { shuffle } from 'lodash';
import { toast } from 'sonner';

// Helper function to decode HTML entities in URLs
function decodeHTMLEntities(html: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = html;
  return textarea.value;
}

// Helper function to clean and decode Reddit URLs
function cleanRedditUrl(url: string): string {
  if (!url) return '';
  
  // First decode any HTML entities
  let cleanUrl = decodeHTMLEntities(url);
  
  // Reddit often has escaped characters in URLs
  cleanUrl = cleanUrl.replace(/&amp;/g, '&');
  
  // Fix common URL escaping issues
  cleanUrl = cleanUrl.replace(/\\"/g, '"')
                     .replace(/\\\//g, '/');
  
  // Transform preview.redd.it URLs to i.redd.it for direct image access
  // This often gives better quality and avoids CORS issues
  if (cleanUrl.includes('preview.redd.it')) {
    cleanUrl = cleanUrl.replace('preview.redd.it', 'i.redd.it');
    // Remove all query parameters after the transformation
    cleanUrl = cleanUrl.split('?')[0];
  }
  
  // Remove query parameters that break image loading
  // but preserve video parameters for Reddit videos that need them
  if ((cleanUrl.includes('.jpg?') || 
       cleanUrl.includes('.png?') || 
       cleanUrl.includes('.gif?') || 
       cleanUrl.includes('.webp?')) && 
      !cleanUrl.includes('v.redd.it')) {
    cleanUrl = cleanUrl.split('?')[0];
  }
  
  // For v.redd.it video URLs, keep only necessary parameters
  if (cleanUrl.includes('v.redd.it') && cleanUrl.includes('?')) {
    // Extract the base URL and parameters
    const [baseUrl, params] = cleanUrl.split('?');
    // Parse parameters
    const paramPairs = params.split('&');
    // Keep only necessary parameters (like 'source' but not tracking params)
    const necessaryParams = paramPairs.filter(pair => 
      pair.startsWith('source=') || 
      pair.startsWith('x=') || 
      pair.startsWith('is_copy_url=')
    );
    
    // Reconstruct the URL with only necessary parameters
    cleanUrl = necessaryParams.length > 0 
      ? `${baseUrl}?${necessaryParams.join('&')}` 
      : baseUrl;
  }
  
  // Ensure HTTPS
  if (cleanUrl.startsWith('http://')) {
    cleanUrl = cleanUrl.replace('http://', 'https://');
  }
  
  return cleanUrl;
}

// Reddit API rate limiting handler
interface RateLimitState {
  isRateLimited: boolean;
  rateLimitExpiry: number;
  consecutiveErrors: number;
  lastErrorTime: number;
}

/**
 * Gets the current Reddit posts from a list of subreddits with enhanced NSFW content handling.
 * This hook fetches posts from Reddit with special handling to ensure NSFW content is properly included:
 * 
 * 1. Uses multiple NSFW URL parameters to maximize the chances of including adult content
 * 2. Prioritizes NSFW preview variants when available in image and video content
 * 3. Implements special detection for NSFW content based on post attributes and title keywords
 * 4. Sorts results to prioritize NSFW content over other content
 * 5. Provides detailed logging to help debug content loading issues
 */
export function useRedditPosts(subredditNames: string[], refreshInterval: number) {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { authState, getAccessToken } = useRedditAuth();
  
  // Rate limit state tracking with exponential backoff
  const rateLimitState = useRef<RateLimitState>({
    isRateLimited: false,
    rateLimitExpiry: 0,
    consecutiveErrors: 0,
    lastErrorTime: 0
  });

  // Helper function to calculate backoff time using exponential backoff algorithm
  const calculateBackoffTime = (consecutiveErrors: number): number => {
    // Base backoff time: 5 seconds
    // Max backoff time: ~10 minutes (with jitter)
    const baseBackoff = 5000;
    const maxBackoff = 10 * 60 * 1000; // 10 minutes in ms
    
    // Calculate exponential backoff: base * 2^errors
    let backoff = baseBackoff * Math.pow(2, consecutiveErrors);
    
    // Add jitter (randomness) to prevent all clients retrying at the same time
    // Random value between 0.5 and 1.5
    const jitter = 0.5 + Math.random();
    backoff = backoff * jitter;
    
    // Cap at maximum backoff
    return Math.min(backoff, maxBackoff);
  };

  const fetchPosts = useCallback(async () => {
    if (subredditNames.length === 0) {
      setSubreddits([]);
      return;
    }

    // Check if user is authenticated with Reddit
    if (!authState.isAuthenticated) {
      setError('Please connect your Reddit account to view content');
      setIsLoading(false);
      return;
    }
    
    // Check if we're currently rate limited
    const now = Date.now();
    if (rateLimitState.current.isRateLimited && now < rateLimitState.current.rateLimitExpiry) {
      const remainingSeconds = Math.ceil((rateLimitState.current.rateLimitExpiry - now) / 1000);
      console.log(`[Reddit] Rate limited, waiting ${remainingSeconds} more seconds before retrying`);
      setError(`Reddit API rate limited. Retrying in ${remainingSeconds} seconds.`);
      return;
    }
    
    // Reset rate limit state if we've passed the expiry time
    if (rateLimitState.current.isRateLimited && now >= rateLimitState.current.rateLimitExpiry) {
      console.log('[Reddit] Rate limit period expired, resetting rate limit state');
      rateLimitState.current.isRateLimited = false;
      rateLimitState.current.consecutiveErrors = 0;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get a fresh access token
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        // Instead of throwing an error, let's set a more user-friendly message
        setError('Please reconnect your Reddit account to continue');
        setIsLoading(false);
        return;
      }

      // console.log('[Reddit] Fetching posts for subreddits:', subredditNames); // Keep higher-level log in App.tsx if needed

      // Create an array to hold results for all subreddits
      const results: Subreddit[] = [];
      
      // Reduced number of sort types to minimize API requests
      // This helps with rate limiting while still providing diverse content
      const sortTypes = ['hot', 'top?t=day']; // Removed 'new' and 'controversial' to reduce API load
      const limitPerSort = 15; // Increased slightly to compensate for fewer sorts

      // Process each subreddit separately
      for (const name of subredditNames) {
        let combinedPosts: RedditPost[] = [];
        let fetchError: string | undefined = undefined;

        try {
          console.log(`[Reddit] Fetching posts for r/${name} using sort types: ${sortTypes.join(', ')}`);

          // Fetch from all sort types concurrently
          const fetchPromises = sortTypes.map(sort => {
            // Ensure NSFW content is included by adding all possible NSFW parameters
            // Reddit has multiple parameters for NSFW content, and we include all of them
            // to maximize chances of getting NSFW content correctly
            const apiUrl = `${API_ENDPOINTS.REDDIT}/r/${name}/${sort}?limit=${limitPerSort}&raw_json=1&include_over_18=true&include_nsfw=1&nsfw=1&allow_over18=1&over_18=true&show_media=1`;
            console.log(`[Reddit] Fetching from URL with NSFW params: ${apiUrl}`);
            return fetch(apiUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'User-Agent': REDDIT_USER_AGENT
              }
            }).then(async response => {
              if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Reddit] Error fetching r/${name}/${sort}:`, response.status, errorText);
                
                // Handle rate limiting specifically
                if (response.status === 429) {
                  const retryAfter = response.headers.get('Retry-After');
                  let retrySeconds = 60; // Default to 60 seconds if no header
                  
                  if (retryAfter) {
                    // Parse the Retry-After header (could be seconds or a date)
                    if (/^\d+$/.test(retryAfter)) {
                      retrySeconds = parseInt(retryAfter, 10);
                    } else {
                      // It's a HTTP date
                      const retryDate = new Date(retryAfter);
                      retrySeconds = Math.max(10, Math.ceil((retryDate.getTime() - Date.now()) / 1000));
                    }
                  }
                  
                  // Apply rate limiting with the official time from Reddit
                  rateLimitState.current.isRateLimited = true;
                  rateLimitState.current.rateLimitExpiry = Date.now() + (retrySeconds * 1000);
                  throw new Error(`Rate limited by Reddit API. Retry after ${retrySeconds} seconds.`);
                }
                
                // Throw an error to be caught by Promise.allSettled
                throw new Error(`Failed to fetch ${sort}: ${response.status}`);
              }
              return response.json();
            });
          });

          const settledResults = await Promise.allSettled(fetchPromises);

          // Process results from successful fetches
          const allFetchedChildren: Record<string, unknown>[] = [];
          settledResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              const data = result.value as { data?: { children?: Record<string, unknown>[] } };
              if (data?.data?.children) {
                allFetchedChildren.push(...data.data.children);
              } else {
                 console.warn(`[Reddit] Invalid or empty response for r/${name}/${sortTypes[index]}`);
              }
            } else {
              console.warn(`[Reddit] Fetch failed for r/${name}/${sortTypes[index]}:`, result.reason);
              // Optionally accumulate errors, but for now, we just log
            }
          });

          console.log(`[Reddit] Fetched a total of ${allFetchedChildren.length} raw posts for r/${name} across all sort types.`);

          if (allFetchedChildren.length === 0 && settledResults.every(r => r.status === 'rejected')) {
             throw new Error(`Failed to fetch any posts for r/${name} from any sort type.`);
          }

          interface RedditApiPost {
            id: string;
            title: string;
            url: string;
            permalink: string;
            author: string;
            subreddit: string;
            created_utc: number;
            over_18: boolean;
            removed_by_category?: unknown;
            removed?: boolean;
            post_hint?: string;
            is_video?: boolean;
            is_gallery?: boolean;
            media?: {
              reddit_video?: {
                fallback_url?: string;
              };
              oembed?: {
                thumbnail_url?: string;
              };
            };
            preview?: {
              images?: Array<{
                source?: {
                  url?: string;
                };
                variants?: {
                  nsfw?: {
                    source?: {
                      url?: string;
                    };
                  };
                  mp4?: {
                    source?: {
                      url?: string;
                    };
                  };
                };
              }>;
              reddit_video_preview?: {
                fallback_url?: string;
              };
            };
            gallery_data?: {
              items?: Array<{
                media_id: string;
              }>;
            };
            media_metadata?: Record<string, {
              s?: {
                u?: string;
                gif?: string;
              };
              p?: Array<{
                u: string;
                x: number;
                y: number;
              }>;
            }>;
            thumbnail?: string;
            crosspost_parent_list?: RedditApiPost[];
          }

          // Process posts (Map raw data to RedditPost structure)
          const processedPosts: (RedditPost | null)[] = allFetchedChildren.map((child: Record<string, unknown>) => {
            const post = child.data as RedditApiPost;
            
            // Skip if the post is removed or deleted
            if (post.removed_by_category || post.removed) {
              return null;
            }
            
            // Log and prioritize NSFW content
            if (post.over_18) {
              console.log(`[Reddit] Processing NSFW post: ${post.id} (${post.title})`);
              // This application prioritizes NSFW content
            } else {
              // Still process all content, but log non-NSFW for debugging
              console.log(`[Reddit] Processing SFW post: ${post.id}`);
            }
            
            // console.log('[Reddit] Post data:', JSON.stringify(post, null, 2).substring(0, 500) + '...'); // Too verbose for combined list
            
            // --- Start Refactored Media Logic ---

            let imageUrl: string | undefined = undefined;
            let videoUrl: string | undefined = undefined;
            let isImage = false;
            let isVideo = false;
            let thumbnailUrl: string | undefined = (post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default') ? post.thumbnail : undefined;

            // console.log(`[Reddit Debug ${post.id}] Raw post data hint: ${post.post_hint}, url: ${post.url}, is_video: ${post.is_video}, is_gallery: ${post.is_gallery}`); // Verbose

            // 1. Handle Reddit-Hosted Video (v.redd.it)
            if (post.is_video && post.media?.reddit_video) {
                // Process the video content
                isVideo = true;
                const fallbackUrl = post.media.reddit_video.fallback_url;
                
                if (fallbackUrl) {
                    videoUrl = fallbackUrl;
                    
                    // Handle DASH playlist URLs
                    if (videoUrl && videoUrl.includes('DASHPlaylist.mpd')) {
                        const baseUrl = videoUrl.split('DASHPlaylist.mpd')[0];
                        // Try to get the highest quality version available (720p preferred)
                        videoUrl = `${baseUrl}DASH_720.mp4`;
                        console.log(`[Reddit Debug ${post.id}] Constructed high-quality MP4 URL: ${videoUrl?.substring(0, 50)}...`);
                    }
                    
                    // Remove redundant parameters
                    if (videoUrl) {
                        videoUrl = videoUrl.replace('?source=fallback', '');
                    }
                }
                
                // Handle video thumbnails - prioritize NSFW variants for NSFW content
                if (post.over_18) {
                    console.log(`[Reddit Debug ${post.id}] Processing NSFW video content`);
                    
                    // First priority: Use NSFW variant if available
                    if (post.preview?.images?.[0]?.variants?.nsfw?.source?.url) {
                        imageUrl = cleanRedditUrl(post.preview.images[0].variants.nsfw.source.url);
                        console.log(`[Reddit Debug ${post.id}] Using NSFW preview variant for video: ${imageUrl?.substring(0, 50)}...`);
                    } 
                    // Second: Use normal preview image 
                    else if (post.preview?.images?.[0]?.source?.url) {
                        imageUrl = cleanRedditUrl(post.preview.images[0].source.url);
                        console.log(`[Reddit Debug ${post.id}] Using standard preview for NSFW video: ${imageUrl?.substring(0, 50)}...`);
                    }
                    // Last resort: Use thumbnail
                    else {
                        imageUrl = post.thumbnail || '';
                        console.log(`[Reddit Debug ${post.id}] Using thumbnail for NSFW video: ${imageUrl?.substring(0, 50)}...`);
                    }
                } 
                // For SFW videos, use standard thumbnail hierarchy
                else {
                    if (post.preview?.images?.[0]?.source?.url) {
                        imageUrl = cleanRedditUrl(post.preview.images[0].source.url);
                        console.log(`[Reddit Debug ${post.id}] Using standard preview for video: ${imageUrl?.substring(0, 50)}...`);
                    } else {
                        imageUrl = post.thumbnail || '';
                        console.log(`[Reddit Debug ${post.id}] Using thumbnail for video: ${imageUrl?.substring(0, 50)}...`);
                    }
                }
                
                thumbnailUrl = thumbnailUrl || imageUrl;
            }
            // 2. Handle Reddit Galleries
            else if (post.is_gallery && post.gallery_data?.items && post.gallery_data.items.length > 0 && post.media_metadata) {
                // console.log(`[Reddit Debug ${post.id}] Type: Gallery`); // Verbose
                isImage = true;
                const firstItemId = post.gallery_data.items[0].media_id;
                const firstItemMeta = post.media_metadata[firstItemId];
                
                if (firstItemMeta?.s?.u) {
                    imageUrl = cleanRedditUrl(firstItemMeta.s.u);
                    console.log(`[Reddit Debug ${post.id}] Using gallery high-res source URL`);
                } else if (firstItemMeta?.s?.gif) {
                    imageUrl = cleanRedditUrl(firstItemMeta.s.gif);
                    console.log(`[Reddit Debug ${post.id}] Using gallery GIF source URL`);
                } else if (firstItemMeta?.p && firstItemMeta.p.length > 0) {
                    const highestResPreview = firstItemMeta.p[firstItemMeta.p.length - 1];
                    imageUrl = cleanRedditUrl(highestResPreview.u);
                    console.log(`[Reddit Debug ${post.id}] Using gallery preview URL (resolution: ${highestResPreview.x}x${highestResPreview.y})`);
                }
                
                thumbnailUrl = thumbnailUrl || imageUrl;
                console.log(`[Reddit Debug ${post.id}] Gallery URLs - Image: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);
            }
            // 3. Handle Rich Videos (Gfycat, Redgifs, Imgur GIFV, Streamable etc.)
            else if (post.post_hint === 'rich:video' || (post.url && post.url.includes('.gifv'))) {
                 // console.log(`[Reddit Debug ${post.id}] Type: Rich Video/Gifv`); // Verbose
                 isVideo = true;
                 if (post.preview?.reddit_video_preview?.fallback_url) {
                     videoUrl = cleanRedditUrl(post.preview.reddit_video_preview.fallback_url.replace('?source=fallback', ''));
                 } else if (post.url.includes('.gifv')) {
                     videoUrl = cleanRedditUrl(post.url.replace('.gifv', '.mp4'));
                 } else if (post.preview?.images?.[0]?.variants?.mp4?.source?.url) {
                     videoUrl = cleanRedditUrl(post.preview.images[0].variants.mp4.source.url);
                 }
                 imageUrl = cleanRedditUrl(post.media?.oembed?.thumbnail_url || thumbnailUrl || '');
                 thumbnailUrl = thumbnailUrl || imageUrl;
            }
            // 4. Handle Direct Image Links (including i.redd.it, imgur direct)
            else if (post.post_hint === 'image' || (post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url))) {
                // console.log(`[Reddit Debug ${post.id}] Type: Direct Image`); // Verbose
                isImage = true;
                
                // Check for NSFW content first - prefer NSFW variants when available
                if (post.over_18) {
                  console.log(`[Reddit Debug ${post.id}] Processing NSFW image content`);
                  
                  // 1. Check for NSFW variant in preview (highest priority for NSFW content)
                  if (post.preview?.images?.[0]?.variants?.nsfw?.source?.url) {
                    imageUrl = cleanRedditUrl(post.preview.images[0].variants.nsfw.source.url);
                    console.log(`[Reddit Debug ${post.id}] Using NSFW variant URL: ${imageUrl?.substring(0, 50)}...`);
                  } 
                  // 2. Check for direct NSFW URL
                  else if (post.url && (
                    post.url.includes('i.redd.it') ||
                    post.url.includes('i.imgur.com') ||
                    /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)
                  )) {
                    imageUrl = cleanRedditUrl(post.url);
                    console.log(`[Reddit Debug ${post.id}] Using direct NSFW image URL: ${imageUrl?.substring(0, 50)}...`);
                  }
                  // 3. Fall back to regular source
                  else if (post.preview?.images?.[0]?.source?.url) {
                    imageUrl = cleanRedditUrl(post.preview.images[0].source.url);
                    console.log(`[Reddit Debug ${post.id}] Using regular source for NSFW content: ${imageUrl?.substring(0, 50)}...`);
                  }
                  // 4. Last resort, use any URL provided
                  else {
                    imageUrl = cleanRedditUrl(post.url || '');
                    console.log(`[Reddit Debug ${post.id}] Falling back to post URL for NSFW content: ${imageUrl?.substring(0, 50)}...`);
                  }
                }
                // For SFW content, use normal logic
                else {
                  if (post.url && (
                    post.url.includes('i.redd.it') ||
                    post.url.includes('i.imgur.com') ||
                    /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)
                  )) {
                    imageUrl = cleanRedditUrl(post.url);
                    console.log(`[Reddit Debug ${post.id}] Using direct image URL: ${imageUrl?.substring(0, 50)}...`);
                  } else if (post.preview?.images?.[0]?.source?.url) {
                    imageUrl = cleanRedditUrl(post.preview.images[0].source.url);
                    console.log(`[Reddit Debug ${post.id}] Using high-res preview source: ${imageUrl?.substring(0, 50)}...`);
                  } else {
                    imageUrl = cleanRedditUrl(post.url || '');
                    console.log(`[Reddit Debug ${post.id}] Falling back to post URL: ${imageUrl?.substring(0, 50)}...`);
                  }
                }
                
                thumbnailUrl = thumbnailUrl || imageUrl;
            }
            // 5. Handle Linked Videos (MP4/WebM direct links, less common)
            else if (post.post_hint === 'link' && post.url && /\.(mp4|webm)$/i.test(post.url)) {
                // console.log(`[Reddit Debug ${post.id}] Type: Linked Video`); // Verbose
                isVideo = true;
                videoUrl = cleanRedditUrl(post.url);
                imageUrl = thumbnailUrl;
            }
            // 6. Handle Crossposts if no media found yet
            else if (!isVideo && !isImage && post.crosspost_parent_list && post.crosspost_parent_list.length > 0) {
                // console.log(`[Reddit Debug ${post.id}] Type: Crosspost - Checking parent`); // Verbose
                const parent = post.crosspost_parent_list[0];
                if (parent.is_video && parent.media?.reddit_video?.fallback_url) {
                    isVideo = true;
                    videoUrl = cleanRedditUrl(parent.media.reddit_video.fallback_url.replace('?source=fallback', ''));
                    imageUrl = cleanRedditUrl(parent.preview?.images?.[0]?.source?.url || parent.thumbnail || '');
                    console.log(`[Reddit Debug ${post.id}] Using Crosspost Parent Video`);
                } else if (parent.post_hint === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(parent.url)) {
                    isImage = true;
                    imageUrl = cleanRedditUrl(parent.preview?.images?.[0]?.source?.url || parent.url || '');
                     console.log(`[Reddit Debug ${post.id}] Using Crosspost Parent Image`);
                }
                thumbnailUrl = thumbnailUrl || imageUrl || parent.thumbnail;
            }

            // 7. Final Fallback - Use thumbnail as image if nothing else worked
            if (!isImage && !isVideo && thumbnailUrl) {
               // console.log(`[Reddit Debug ${post.id}] Type: Fallback to Thumbnail`); // Verbose
               isImage = true;
               imageUrl = thumbnailUrl;
            }

            imageUrl = imageUrl || undefined;
            videoUrl = videoUrl || undefined;
            thumbnailUrl = thumbnailUrl || imageUrl;

            if (!isImage && !isVideo) {
                // console.warn(`[Reddit Skip ${post.id}] No media identified. URL: ${post.url}, Hint: ${post.post_hint}`); // Verbose
                return null;
            }

            // console.log(`[Reddit Processed ${post.id}] Result - isImage: ${isImage}, isVideo: ${isVideo}, imageUrl: ${imageUrl}, videoUrl: ${videoUrl}, thumbnailUrl: ${thumbnailUrl}`); // Too verbose

            // --- End Refactored Media Logic ---

            // Final check: Ensure we have a usable URL for display
            if (!imageUrl) {
                console.warn(`[Reddit Skip ${post.id}] Final URL check failed. No valid imageUrl derived.`);
                return null;
            }

            return {
              id: post.id,
              title: post.title,
              url: imageUrl, // Now guaranteed to be string here
              permalink: `https://reddit.com${post.permalink}`,
              author: post.author,
              subreddit: post.subreddit,
              created: post.created_utc,
              isImage,
              isVideo,
              videoUrl, // Specific URL for video playback
              thumbnailUrl, // Thumbnail specific URL
            };
          });

          // Filter out null values (including those where imageUrl was missing)
          const validPosts = processedPosts.filter((post): post is RedditPost => post !== null);

          // Deduplicate posts based on ID
          const uniquePostsMap = new Map<string, RedditPost>();
          validPosts.forEach(post => {
            if (!uniquePostsMap.has(post.id)) {
              uniquePostsMap.set(post.id, post);
            }
          });
          const uniquePosts = Array.from(uniquePostsMap.values());

          console.log(`[Reddit] Processed ${uniquePosts.length} unique posts with media for r/${name} after deduplication.`);

          // We need to add an over_18 property to our RedditPost type internally to track NSFW content
          // Since we don't want to modify the type definition, we'll use a temporary array with assertion
          const postsWithNsfwFlag = uniquePosts.map(post => ({
            ...post,
            isNSFW: Boolean(
              // Check if title contains NSFW markers (common on Reddit)
              post.title?.toLowerCase().includes('nsfw') || 
              post.title?.toLowerCase().includes('[over 18]') ||
              post.title?.toLowerCase().includes('over18') ||
              post.title?.toLowerCase().includes('over 18') ||
              post.title?.toLowerCase().includes('18+') ||
              post.title?.toLowerCase().includes('adult') ||
              // For debugging, we can inspect the ID pattern (t3_ prefix is common for Reddit posts)
              (post.id.includes('t3_') && 'over_18' in post && post.over_18 === true)
            )
          }));
          
          // Now separate posts - prioritize anything that might be NSFW
          const nsfwPosts = postsWithNsfwFlag.filter(post => post.isNSFW);
          const otherPosts = postsWithNsfwFlag.filter(post => !post.isNSFW);
          
          console.log(`[Reddit] Found ${nsfwPosts.length} NSFW-flagged posts and ${otherPosts.length} other posts for r/${name}`);
          
          // Shuffle each group separately to maintain randomness within groups
          const shuffledNsfw = shuffle(nsfwPosts);
          const shuffledOther = shuffle(otherPosts);
          
          // Prioritize NSFW content by putting it first in the array
          combinedPosts = [...shuffledNsfw, ...shuffledOther];
          
          console.log(`[Reddit] Shuffled and prioritized ${combinedPosts.length} total posts for r/${name} with NSFW prioritization.`);

        } catch (err) {
          // Catch errors specific to fetching/processing this subreddit
          console.error(`[Reddit] Error processing r/${name}:`, err);
          fetchError = err instanceof Error ? err.message : 'Unknown error during processing';

          // Map common errors
          if (fetchError.includes('403') || fetchError.includes('forbidden')) {
            fetchError = `Unable to access r/${name} - private or quarantined?`;
          } else if (fetchError.includes('404') || fetchError.includes('not found')) {
            fetchError = `Subreddit r/${name} not found.`;
          } else if (fetchError.includes('429') || fetchError.includes('rate limit')) {
            fetchError = `Reddit API rate limit hit for r/${name}.`;
          } else if (fetchError.includes('500') || fetchError.includes('502') || fetchError.includes('503')) {
            fetchError = `Reddit server error for r/${name}.`;
          }
        }

        // Add the results (or error) for this subreddit
        results.push({
          name,
          posts: combinedPosts, // Empty if error occurred
          error: fetchError // Undefined if successful
        });
      } // End loop over subredditNames

      // Set all subreddits results, even those with errors
      setSubreddits(results);

      // Only set overall error if ALL subreddits failed
      const allFailed = results.every(subreddit => subreddit.error && subreddit.posts.length === 0);
      if (allFailed && results.length > 0) {
        setError('Failed to load any subreddits. Please try again.');
      } else if (results.some(subreddit => subreddit.error)) {
        // If some but not all subreddits failed, set a warning but don't block the UI
        console.warn('[Reddit] Some subreddits failed to load or process fully.');
      }

    } catch (err) {
      // Catch top-level errors (like token issues)
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch posts';
      setError(errorMessage);
      console.error('[Reddit] Top-level error fetching Reddit posts:', err);
      
      // Handle exponential backoff for consecutive errors
      const now = Date.now();
      
      // If this is a rate limit error specifically, we've already set the proper state
      if (errorMessage.includes('Rate limited')) {
        toast.error('Reddit API rate limit reached. The app will automatically retry when possible.');
      } 
      // For other errors, apply our exponential backoff
      else {
        // If this error happened within 10 seconds of the last one, increment consecutive errors
        if (now - rateLimitState.current.lastErrorTime < 10000) {
          rateLimitState.current.consecutiveErrors += 1;
        } else {
          // Otherwise, reset to 1
          rateLimitState.current.consecutiveErrors = 1;
        }
        
        // Record the time of this error
        rateLimitState.current.lastErrorTime = now;
        
        // If we have consecutive errors, implement backoff
        if (rateLimitState.current.consecutiveErrors >= 3) {
          const backoffTime = calculateBackoffTime(rateLimitState.current.consecutiveErrors);
          const backoffSeconds = Math.ceil(backoffTime / 1000);
          
          console.log(`[Reddit] Applying exponential backoff: ${backoffSeconds} seconds (${rateLimitState.current.consecutiveErrors} consecutive errors)`);
          
          rateLimitState.current.isRateLimited = true;
          rateLimitState.current.rateLimitExpiry = now + backoffTime;
          
          if (rateLimitState.current.consecutiveErrors >= 5) {
            toast.error(`Multiple Reddit API errors detected. Taking a brief break (${backoffSeconds} seconds) before retrying.`);
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [authState.isAuthenticated, authState.refreshToken, getAccessToken, rateLimitState, setError, setIsLoading, setSubreddits, subredditNames]);

  // Fetch on mount and when subreddit names change
  useEffect(() => {
    // Create a stable ID for the current configuration to prevent unnecessary re-fetches
    // Explicitly list dependencies that should trigger a refetch rather than using derived values
    // that cause the effect to re-run too frequently
    
    // Log subreddit names being requested to help debugging
    console.log(`[Reddit] Requested subreddits: ${subredditNames.join(', ')}`);
    
    if (authState.isAuthenticated) {
      // Only fetch if we have subreddits to fetch
      if (subredditNames.length > 0) {
        // Note: We're calling fetchPosts directly rather than using the dependency
        // to avoid creating a circular dependency with useCallback
        (async () => {
          try {
            // Get a fresh access token
            const accessToken = await getAccessToken();
            if (!accessToken) {
              setError('Please reconnect your Reddit account to continue');
              setIsLoading(false);
              return;
            }
            
            // Call fetchPosts with the current values from the closure
            fetchPosts();
          } catch (error) {
            console.error('Error initializing Reddit fetch:', error);
            setError('Failed to initialize Reddit fetch');
            setIsLoading(false);
          }
        })();
      } else {
        // Clear data and set a specific error when no subreddits are specified
        console.log('[Reddit] No subreddits specified in the session settings');
        setSubreddits([]);
        setError('No subreddits specified in your session settings. Please edit your session to add at least one subreddit.');
      }

      // Set up periodic refresh with a minimum interval of 30 seconds to be kind to Reddit's API
      // This helps prevent excessive API usage
      const actualInterval = Math.max(30, refreshInterval) * 1000;
      
      // Only log once per mount or when configuration changes
      console.log(`[Reddit] Setting refresh interval to ${actualInterval/1000} seconds`);
      
      const intervalId = setInterval(() => {
        // Only fetch if we're not currently rate limited
        if (!rateLimitState.current.isRateLimited || Date.now() >= rateLimitState.current.rateLimitExpiry) {
          if (subredditNames.length > 0) {
            fetchPosts();
          }
        } else {
          console.log('[Reddit] Skipping scheduled fetch due to rate limiting');
        }
      }, actualInterval);

      return () => clearInterval(intervalId);
    } else {
      // Clear subreddits if not authenticated
      setSubreddits([]);
      setError('Please connect your Reddit account to view content');
    }
    
    // Remove fetchPosts from dependencies to avoid circular reference
    // The function is stable due to useCallback, but its dependencies create a cycle
  }, [subredditNames, refreshInterval, authState.isAuthenticated, getAccessToken, setError, setIsLoading, setSubreddits, rateLimitState]);

  return { subreddits, isLoading, error, refetch: fetchPosts };
}