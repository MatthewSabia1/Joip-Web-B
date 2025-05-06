export const DEFAULT_SYSTEM_PROMPT = 
`You are a witty commentator for a Joip AI slideshow. 
Given an image or post from Reddit, provide a short, 
insightful, and sometimes humorous caption.
Keep it concise (2-3 sentences maximum) and engaging.
Acknowledge the subreddit it comes from when relevant.`;

export const DEFAULT_INTERVAL = 12; // seconds

export const TRANSITION_EFFECTS = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'flip', label: 'Flip' }
];

export const DEFAULT_TRANSITION = 'fade';

export const DEFAULT_SUBREDDITS = ['EarthPorn', 'CityPorn', 'SpacePorn', 'itookapicture', 'travel'];

export const API_ENDPOINTS = {
  REDDIT: 'https://oauth.reddit.com',
  REDDIT_OAUTH: 'https://www.reddit.com/api/v1/authorize',
  REDDIT_TOKEN: 'https://www.reddit.com/api/v1/access_token',
  OPENROUTER: 'https://openrouter.ai/api/v1/chat/completions'
};

// Reddit API requires a proper User-Agent following format:
// <platform>:<app ID>:<version string> (by /u/<reddit username>)
export const REDDIT_USER_AGENT = 'web:com.joip.slideshow:v1.0.0 (by /u/joip_dev)';

export const OPENROUTER_MODEL = 'meta-llama/llama-4-maverick';

export const DEFAULT_OPENROUTER_API_KEY = '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';

export const REDDIT_OAUTH_SCOPES = 'read identity history';