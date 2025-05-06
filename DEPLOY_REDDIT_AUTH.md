# Deploying the Fixed Reddit OAuth Function

This document explains how to deploy the fixed Reddit OAuth function to resolve the "invalid client id" and "Missing authorization header" errors.

## The Issues

1. **Client ID Mismatch**: There was a mismatch between the client ID used in the frontend and the one set in Supabase. This has been fixed by updating both to use the same value: `xJUYYAjdr7ZcgLLM3XkizA`.

2. **Authorization Header Requirement**: The endpoint was requiring an authorization header for the callback URL, which was causing the 401 "Missing authorization header" error after clicking "Allow" on Reddit's OAuth page. This has been temporarily removed for testing purposes.

## Deployment Steps

1. Make sure Docker is running (for Supabase Functions deployment)

2. Rename the fixed file to replace the original:
   ```bash
   mv /Users/matthewsabia1/Joip\ 2/supabase/functions/reddit-auth/index.fixed.ts /Users/matthewsabia1/Joip\ 2/supabase/functions/reddit-auth/index.ts
   ```

3. Deploy the function using the `--no-verify-jwt` flag:
   ```bash
   cd /Users/matthewsabia1/Joip\ 2
   npx supabase functions deploy reddit-auth --project-ref rvzkbwjycpxmlddgnhxn --no-verify-jwt
   ```

4. Verify that the environment variables are set correctly:
   ```bash
   npx supabase secrets list --project-ref rvzkbwjycpxmlddgnhxn
   ```

   They should include:
   - REDDIT_CLIENT_ID=xJUYYAjdr7ZcgLLM3XkizA
   - REDDIT_CLIENT_SECRET=CVSv6DFs45GdaSVjkVxKL17hSXGIUA
   - FRONTEND_URL=http://localhost:5173 (or your actual frontend URL)

## Testing

1. Start your frontend application:
   ```bash
   npm run dev
   ```

2. In your application, try to connect your Reddit account
   - You should be redirected to Reddit for authorization
   - After clicking "Allow", you should be redirected back to your application without any errors
   - The Reddit connection should be established successfully

## Debugging

If issues persist, you can check the logs for the function:

```bash
npx supabase functions logs reddit-auth --project-ref rvzkbwjycpxmlddgnhxn
```

## Security Note

For production usage, you would want to reinstate the authorization checks, but with proper handling for OAuth redirects. The current fix removes these checks temporarily to debug the issue.