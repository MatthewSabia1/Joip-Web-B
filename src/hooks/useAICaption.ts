import { useState, useEffect, useCallback } from 'react';
import { RedditPost, AIResponse } from '@/types';
import { API_ENDPOINTS, OPENROUTER_MODEL } from '@/lib/constants';
import { supabase } from '@/lib/supabase';

interface UseAICaptionProps {
  post: RedditPost | null;
  systemPrompt: string;
  apiKey?: string; // Made optional as we won't need it directly anymore
}

// Helper function for fetch with retry logic
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 300
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.ok || retries <= 1) return response;
    
    // Wait for backoff time
    await new Promise(resolve => setTimeout(resolve, backoff));
    
    // Retry with increased backoff
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  } catch (error) {
    if (retries <= 1) throw error;
    
    // Wait for backoff time
    await new Promise(resolve => setTimeout(resolve, backoff));
    
    // Retry with increased backoff
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
}

export function useAICaption({ post, systemPrompt }: UseAICaptionProps) {
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

      // Get the Supabase URL and anon key for auth
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase configuration');
      }
      
      // Call our proxy Edge Function instead of OpenRouter directly
      const response = await fetchWithRetry(
        `${supabaseUrl}/functions/v1/openrouter-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL, // Send model, but proxy will use default if not available
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
      setResponse({
        caption: '',
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error generating caption'
      });
    }
  }, [post, systemPrompt]);

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
    generateCaption
  };
}