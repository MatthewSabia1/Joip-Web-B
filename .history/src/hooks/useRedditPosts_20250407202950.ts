import { useState, useEffect } from 'react';
import { Subreddit, RedditPost } from '@/types';
import { useRedditAuth } from '@/contexts/RedditAuthContext';
import { API_ENDPOINTS } from '@/lib/constants';
import { shuffle } from 'lodash';

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

export function useRedditPosts(subredditNames: string[], refreshInterval: number) {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { authState, getAccessToken } = useRedditAuth();

  const fetchPosts = async () => {
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

    setIsLoading(true);
    setError(null);

    try {
      // Get a fresh access token
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        throw new Error('Failed to get Reddit access token');
      }

      // console.log('[Reddit] Fetching posts for subreddits:', subredditNames); // Keep higher-level log in App.tsx if needed

      // Create an array to hold results for all subreddits
      const results: Subreddit[] = [];
      const sortTypes = ['hot', 'new', 'top?t=day', 'controversial?t=day'];
      const limitPerSort = 10; // Limit per sort type to avoid excessive data

      // Process each subreddit separately
      for (const name of subredditNames) {
        let combinedPosts: RedditPost[] = [];
        let fetchError: string | undefined = undefined;

        try {
          console.log(`[Reddit] Fetching posts for r/${name} using sort types: ${sortTypes.join(', ')}`);

          // Fetch from all sort types concurrently
          const fetchPromises = sortTypes.map(sort => {
            const apiUrl = `${API_ENDPOINTS.REDDIT}/r/${name}/${sort}?limit=${limitPerSort}&raw_json=1&include_over_18=true`;
            return fetch(apiUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              }
            }).then(async response => {
              if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Reddit] Error fetching r/${name}/${sort}:`, response.status, errorText);
                // Throw an error to be caught by Promise.allSettled
                throw new Error(`Failed to fetch ${sort}: ${response.status}`);
              }
              return response.json();
            });
          });

          const settledResults = await Promise.allSettled(fetchPromises);

          // Process results from successful fetches
          const allFetchedChildren: any[] = [];
          settledResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              const data = result.value;
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

          // Process posts (Map raw data to RedditPost structure)
          const processedPosts: (RedditPost | null)[] = allFetchedChildren.map((child: any) => {
            const post = child.data;
            
            // Skip if the post is removed or deleted
            if (post.removed_by_category || post.removed) {
              return null;
            }
            
            // Log if post is NSFW
            if (post.over_18) {
              console.log(`[Reddit] Processing NSFW post: ${post.id} (${post.title})`);
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
                // console.log(`[Reddit Debug ${post.id}] Type: Reddit Video`); // Verbose
                isVideo = true;
                const fallbackUrl = post.media.reddit_video.fallback_url;
                
                if (fallbackUrl) {
                    videoUrl = fallbackUrl;
                    if (videoUrl && videoUrl.includes('DASHPlaylist.mpd')) {
                        const baseUrl = videoUrl.split('DASHPlaylist.mpd')[0];
                        const qualities = ['1080', '720', '480', '360', '240'];
                        // Simplification: Reddit API doesn't reliably provide `resolutions`. Try common DASH suffix.
                        // Often DASH_720.mp4 or DASH_480.mp4 etc exist. We'll try 720 first as a common default.
                        videoUrl = `${baseUrl}DASH_720.mp4`;
                        // console.log(`[Reddit Debug ${post.id}] Constructed MP4 attempt: ${videoUrl}`); // Verbose
                    }
                    if (videoUrl) {
                        videoUrl = videoUrl.replace('?source=fallback', '');
                    }
                }
                
                if (post.over_18 && post.preview?.images?.[0]?.variants?.nsfw?.source?.url) {
                  imageUrl = cleanRedditUrl(post.preview.images[0].variants.nsfw.source.url);
                  console.log(`[Reddit Debug ${post.id}] Using NSFW preview variant for video`);
                } else if (post.preview?.images?.[0]?.source?.url) {
                  imageUrl = cleanRedditUrl(post.preview.images[0].source.url);
                } else {
                  imageUrl = post.thumbnail || '';
                }
                thumbnailUrl = thumbnailUrl || imageUrl;
            }
            // 2. Handle Reddit Galleries
            else if (post.is_gallery && post.gallery_data?.items?.length > 0 && post.media_metadata) {
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
                } else if (firstItemMeta?.p?.length > 0) {
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
                if (post.url && (
                  post.url.includes('i.redd.it') ||
                  post.url.includes('i.imgur.com') ||
                  /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)
                )) {
                  imageUrl = post.url;
                  console.log(`[Reddit Debug ${post.id}] Using direct image URL: ${imageUrl}`);
                } else if (post.preview?.images?.[0]?.source?.url) {
                  if (post.over_18 && post.preview.images[0]?.variants?.nsfw?.source?.url) {
                    imageUrl = cleanRedditUrl(post.preview.images[0].variants.nsfw.source.url);
                    console.log(`[Reddit Debug ${post.id}] Using NSFW variant URL`);
                  } else {
                    imageUrl = cleanRedditUrl(post.preview.images[0].source.url);
                    console.log(`[Reddit Debug ${post.id}] Using high-res preview source`);
                  }
                } else {
                  imageUrl = cleanRedditUrl(post.url || '');
                  console.log(`[Reddit Debug ${post.id}] Falling back to post URL`);
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
            else if (!isVideo && !isImage && post.crosspost_parent_list?.length > 0) {
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

          // Shuffle the unique posts
          combinedPosts = shuffle(uniquePosts); // Use lodash shuffle

          console.log(`[Reddit] Shuffled ${combinedPosts.length} posts for r/${name}.`);

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
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch on mount and when subreddit names change
  useEffect(() => {
    if (authState.isAuthenticated) {
      fetchPosts();

      // Set up periodic refresh
      const intervalId = setInterval(fetchPosts, refreshInterval * 1000);

      return () => clearInterval(intervalId);
    } else {
      // Clear subreddits if not authenticated
      setSubreddits([]);
      setError('Please connect your Reddit account to view content');
    }
    // Ensure dependencies are correct - use subredditNames.join(',') for primitive dependency
  }, [subredditNames.join(','), refreshInterval, authState.isAuthenticated, getAccessToken]); // Added getAccessToken to deps

  return { subreddits, isLoading, error, refetch: fetchPosts };
}