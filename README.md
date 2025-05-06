# Joip AI

A Reddit slideshow application with AI-generated captions.

## Production URL

The application is deployed at: [https://golden-gelato-5a2c4f.netlify.app](https://golden-gelato-5a2c4f.netlify.app)

## Deployment Instructions

### Netlify Environment Variables

The following environment variables need to be set in the Netlify dashboard for the deployed application:

- `VITE_SUPABASE_URL`: The URL of your Supabase project (e.g., `https://bfserjasoryvqoiarbku.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: The anonymous key for your Supabase project
- `VITE_REDDIT_CLIENT_ID`: Your Reddit application client ID
- `VITE_REDDIT_CLIENT_SECRET`: Your Reddit application client secret

### Setting up Reddit Authentication

For Reddit authentication to work in production:

1. Create a Reddit application at [https://www.reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
2. Set the redirect URI to: `https://bfserjasoryvqoiarbku.supabase.co/functions/v1/reddit-auth/callback`
3. Copy the client ID and client secret to your Netlify environment variables

### Setting up Patreon Authentication

For Patreon authentication to work in production:

1. Create a Patreon application at [https://www.patreon.com/portal/registration/register-clients](https://www.patreon.com/portal/registration/register-clients)
2. Set the redirect URI to: `https://bfserjasoryvqoiarbku.supabase.co/functions/v1/patreon-auth/callback`
3. Update the client ID and client secret in the `supabase/functions/patreon-auth/index.ts` file

### Deploying Supabase Edge Functions

Make sure to deploy the Supabase Edge Functions:

```bash
npx supabase functions deploy reddit-auth
npx supabase functions deploy patreon-auth
```

## Development

To run the project locally:

```bash
npm install
npm run dev
```

Make sure to set up the local environment variables in a `.env` file based on the `.env.example` template.