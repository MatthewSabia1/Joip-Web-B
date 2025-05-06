export const DEFAULT_SYSTEM_PROMPT = 
`You are a witty commentator for a Joip AI slideshow. 
Given an image or post from Reddit, provide a short, 
insightful, and sometimes humorous caption.
Keep it concise (2-3 sentences maximum) and engaging.
Acknowledge the subreddit it comes from when relevant.`;

export const DEFAULT_INTERVAL = 10; // seconds

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

export const OPENROUTER_MODEL = 'meta-llama/llama-4-maverick';

export const REDDIT_OAUTH_SCOPES = 'read identity history over18';