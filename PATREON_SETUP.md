# Patreon Integration Setup Guide

This guide explains how to set up Patreon integration for the Joip App.

## Step 1: Create a Patreon Developer Account

1. Go to [Patreon's Developer Portal](https://www.patreon.com/portal/registration/register-clients)
2. Sign in or create a Patreon account
3. Create a new API client for your application

## Step 2: Configure Your Patreon App

1. Set the App Name to "Joip App" (or your preferred name)
2. Add a description of your application
3. Set the Redirect URI to your Supabase Edge Function URL:
   ```
   https://[YOUR-SUPABASE-PROJECT-ID].supabase.co/functions/v1/patreon-auth/callback
   ```
4. Set the allowed origins to your frontend URL:
   ```
   http://localhost:5173
   ```
   (Add your production URL as well if deploying to production)
5. Save your application

## Step 3: Copy Your API Credentials

After creating the app, you'll receive:
- Client ID
- Client Secret

Copy these values to your environment variables.

## Step 4: Configure Environment Variables

Add the following environment variables to your Supabase project:

1. Go to your Supabase Dashboard
2. Navigate to Settings > API
3. Find the "Environment Variables" section
4. Add the following variables:

```
PATREON_CLIENT_ID=your_client_id_here
PATREON_CLIENT_SECRET=your_client_secret_here
FRONTEND_URL=http://localhost:5173  # (or your production URL)
```

## Step 5: Update Local Development Environment

For local development, update your env.secrets file with:

```
PATREON_CLIENT_ID=your_client_id_here
PATREON_CLIENT_SECRET=your_client_secret_here
```

## Testing the Integration

After setting up the environment variables:

1. Restart your application
2. Go to your profile settings
3. Click "Connect Patreon"
4. You should be redirected to Patreon's authorization page
5. After authorizing, you should be redirected back to your application

## Troubleshooting

If you encounter errors:

1. Check if all environment variables are set correctly
2. Verify the Redirect URI in your Patreon Developer Portal exactly matches your Supabase Edge Function URL
3. Make sure the allowed origins include your frontend URL
4. Check the browser console and Supabase Edge Function logs for specific error messages