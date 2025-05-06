# Local Development Setup

This guide will help you set up and run the Joip AI application locally.

## Prerequisites

1. Node.js 18+ and npm 
2. [Supabase CLI](https://supabase.com/docs/guides/cli) installed
3. Docker (required for Supabase local development)
4. Reddit & Patreon Developer Accounts (for OAuth testing)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment Variables

The repository already includes a `.env` file with the necessary frontend variables.

We've also created a `supabase/.env.local` file with the necessary environment variables for Supabase Edge Functions.

## Step 3: Start Supabase Local Development

```bash
supabase start
```

Note the local Supabase URL and function port from the output (usually something like `http://localhost:54321`).

## Step 4: Configure OAuth Redirect URIs

For Reddit OAuth to work locally:

1. Go to your [Reddit App preferences](https://www.reddit.com/prefs/apps)
2. Add the following URL to your app's "redirect uri" field:
   ```
   http://localhost:54321/functions/v1/reddit-auth/callback
   ```
   (Replace 54321 with your actual Supabase port if different)

For Patreon OAuth to work locally:

1. Go to your [Patreon Developer Portal](https://www.patreon.com/portal/registration/register-clients)
2. Add the following URL to your app's "Redirect URIs" field:
   ```
   http://localhost:54321/functions/v1/patreon-auth/callback
   ```
   (Replace 54321 with your actual Supabase port if different)

## Step 5: Start the Development Server

```bash
npm run dev
```

Your application should now be running at http://localhost:5173

## Step 6: Deploy Supabase Functions (Optional)

When you're ready to update the Edge Functions in production:

```bash
supabase functions deploy reddit-auth
supabase functions deploy patreon-auth
```

## Troubleshooting

### Supabase Edge Functions

If you encounter issues with the Edge Functions:

1. Verify your `supabase/.env.local` file contains all needed environment variables
2. Check Supabase logs: `supabase logs --remote --since 1h`
3. Test functions locally: `supabase functions serve --env-file supabase/.env.local`

### OAuth Flows

If OAuth flows aren't working:

1. Ensure you've added the correct redirect URIs to your Reddit/Patreon app settings
2. Check browser console for errors during the authentication flow 
3. Check the Edge Function logs for detailed error information 