import { useState, useEffect, useCallback } from 'react';
import { RedditPost, AIResponse } from '@/types';
import { API_ENDPOINTS, OPENROUTER_MODEL, DEFAULT_OPENROUTER_API_KEY } from '@/lib/constants';

interface UseAICaptionProps {
  post: RedditPost | null;
  systemPrompt: string;
  apiKey: string;
}

// Retry fetch with exponential backoff
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  retries = 3, 
  backoff = 300
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.ok) return response;
    
    // If we've run out of retries, throw the response
    if (retries <= 1) throw response;
    
    // Wait for backoff duration
    await new Promise(resolve => setTimeout(resolve, backoff));
    
    // Retry with one fewer retry and exponentially longer backoff
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  } catch (error) {
    if (retries <= 1) throw new Error(error instanceof Error ? error.message : String(error));
    
    // Wait for backoff duration
    await new Promise(resolve => setTimeout(resolve, backoff));
    
    // Retry with one fewer retry and exponentially longer backoff
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
}

export function useAICaption({ post, systemPrompt, apiKey }: UseAICaptionProps) {
  const [response, setResponse] = useState<AIResponse>({
    caption: '',
    loading: false
  });

  const generateCaption = useCallback(async () => {
    if (!post) {
      setResponse({
        caption: 'No post selected.',
        loading: false
      });
      return;
    }
    
    // Use default API key if none is provided
    const effectiveApiKey = apiKey.trim() || DEFAULT_OPENROUTER_API_KEY;

    setResponse(prev => ({ ...prev, loading: true, error: undefined }));

    try {
      // Prepare content for AI prompt
      const postContent = `
        Title: ${post.title}
        Subreddit: r/${post.subreddit}
        URL: ${post.url}
        Author: u/${post.author}
        Media Type: ${post.isImage ? 'Image' : post.isVideo ? 'Video' : 'Other'}
      `;

      // Call OpenRouter API with retry logic and proper error handling
      const response = await fetchWithRetry(
        API_ENDPOINTS.OPENROUTER,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveApiKey}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Reddit Slideshow App'
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Generate a caption for this Reddit post: ${postContent}` }
            ],
            max_tokens: 150
          })
        },
        3, // 3 retries
        300 // 300ms initial backoff
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const caption = data.choices[0]?.message?.content || 'No caption generated.';

      setResponse({
        caption,
        loading: false
      });
    } catch (error) {
      console.error('Error generating caption:', error);
      
      // Prepare user-friendly error message based on error type
      let errorMessage = 'Failed to generate caption';
      
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        errorMessage = 'Network error: Please check your internet connection and try again.';
      } else if (error instanceof Response) {
        if (error.status === 401) {
          errorMessage = apiKey.trim() ? 'Invalid API key. Please check your OpenRouter API key and try again.' : 'The default API key is not working. Please try using your own API key.';
        } else if (error.status === 403) {
          errorMessage = 'Access denied. The API key may have insufficient permissions.';
        } else if (error.status >= 500) {
          errorMessage = 'OpenRouter API is currently unavailable. Please try again later.';
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setResponse({
        caption: '',
        loading: false,
        error: errorMessage
      });
    }
  }, [post, systemPrompt, apiKey]);

  // Generate caption whenever post changes
  useEffect(() => {
    if (post) {
      generateCaption();
    } else {
      setResponse({
        caption: '',
        loading: false
      });
    }
  }, [post, generateCaption]);

  return {
    ...response,
    regenerate: generateCaption
  };
}