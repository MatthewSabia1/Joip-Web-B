> **Disclaimer:** This document is a living snapshot intended to track the development progress of Joip AI. It reflects the understanding of the application's state at the time of the last update (see title date). Features, architecture, and implementation details are subject to change as development continues. This document should not be considered the sole source of truth but rather a progressive record.

# Joip AI - Project State (2025-05-02)

This document provides an analysis of the Joip AI web application's architecture, technology stack, and current development state. It is updated periodically as development progresses.

## Changelog

*   **2025-05-02:** Major feature update: Added Session Management system with SessionsPage, SessionForm, SessionPlayPage, and SessionCard components. Added Admin Panel with user management and statistics dashboard. Performed comprehensive codebase review and bug fixing.
*   **2024-08-13:** Fixed user settings saving issues with debouncing. Added proper debouncing to prevent excessive database calls when typing in settings fields. Implemented a "Save Changes" button that properly indicates pending changes and syncing status. Resolved the "failed to save" toast notification issue that appeared on each keystroke.
*   **2024-08-09:** Fixed fetch loop in `useUserSettings` by restructuring effects. Separated initial fetch (on user change) from online recovery fetch (on network status change) and refined effect dependencies to prevent unwanted re-renders.
*   **2024-08-09:** Added offline detection and connection resilience to `useUserSettings` hook. Implemented network status tracking, fetch attempt limits, request timeouts, and graceful fallback to local storage when Supabase is unreachable or when network is offline.
*   **2024-08-09:** Implemented session-level guards to permanently prevent Reddit auth infinite loops. Added multi-level safeguards including a global execution flag, initialization tracking, and strategic preference updates to ensure stability even with unreliable Reddit API responses.
*   **2024-08-09:** Fixed "Initializing session" infinite loading bug by adding multiple timeout safeguards, async/await error handling, and user-friendly recovery options for Reddit API issues. Added fallback UI for authentication taking too long.
*   **2024-08-09:** Fixed infinite loop bug in Reddit refresh token mechanism. Implemented a refresh token attempt tracking system to prevent continuous failed requests when the Reddit API returns errors. This prevents browser freezing and excessive API calls.
*   **2024-08-09:** Fixed Reddit authentication persistence. Refactored `RedditAuthContext` to proactively initialize the session using stored refresh tokens on load, centralized token refresh logic, and ensured state is correctly saved/loaded via `useUserSettings`.
*   **2024-08-09:** Fixed slideshow transitions breaking after the first item. Synchronized animation durations between `useSlideshow` hook and `MediaDisplay` component CSS. Refactored transition timing logic in `useSlideshow` to correctly sequence state updates (`isTransitioning`, `currentIndex`) with animation completion.
*   **2024-08-09:** Fixed final TypeScript build error (TS2322) by removing unused props (`currentIndex`, `onNext`, `onPrevious`) from the `MediaDisplay` component invocation in `App.tsx`.
*   **2024-08-09:** Fixed TypeScript build error (TS6133) by removing unused imports, props, and variables from `MediaDisplay.tsx`.
*   **2024-08-09:** Enhanced slideshow transition animations with smoother effects. Improved CSS transforms, added proper enter/exit animations, implemented effect-specific timing, and fixed bugs with concurrent transitions. All transitions (fade, slide, zoom, flip) now appear more polished and professional.
*   **2024-08-09:** Improved Reddit media display with multi-stage fallback system that handles failed media loads. Added URL transformations to fix preview.redd.it URLs, implemented retry functionality, and improved display for unavailable media.
*   **2024-08-08:** Enhanced Reddit media loading with multiple fallback methods, removed NSFW badges as requested, and added more robust debugging options for media playback issues. Implemented direct URL fallbacks and improved CORS handling.
*   **2024-08-08:** Fixed Reddit media display issues by implementing robust media URL extraction and processing. Added fallbacks for failed media loading, improved CORS handling, and added proper NSFW content support. Also added a Debug tab in Settings for troubleshooting.
*   **2024-08-07:** Fixed OAuth history state security errors by improving URL cleanup in RedditAuthContext and PatreonAuthContext. Implemented image proxy solution for Reddit images to fix CORS issues in local development.
*   **2024-08-07:** Fixed "Missing authorization header" errors in Patreon and Reddit OAuth flows by ensuring the correct tokens (user JWT for Patreon connect, Supabase anon key for Reddit refresh) are passed in the `Authorization` header of frontend requests to Supabase Edge Functions.
*   **YYYY-MM-DD:** Initial deep dive analysis and documentation creation.
*   **YYYY-MM-DD:** Removed verbose `console.log` statements from `App.tsx`, `RedditAuthContext.tsx`, and `useRedditPosts.ts`. Updated document title and added changelog.

## 1. Overview

**Project:** Joip AI
**Description:** A web application that displays slideshows of media (images/videos) from selected Reddit subreddits, accompanied by AI-generated captions for each post.
**Production URL:** [https://golden-gelato-5a2c4f.netlify.app](https://golden-gelato-5a2c4f.netlify.app)

## 2. Technology Stack

*   **Frontend:**
    *   Framework/Library: React 18+
    *   Language: TypeScript
    *   Build Tool: Vite
    *   Routing: `react-router-dom` v6
    *   Styling: Tailwind CSS
    *   UI Components: `shadcn/ui`
    *   State Management: React Hooks (useState, useEffect, useContext), Custom Hooks
    *   Notifications: `sonner`
*   **Backend:**
    *   Platform: Supabase
    *   Services:
        *   Authentication (Email/Password, Reddit OAuth, Patreon OAuth)
        *   Database (PostgreSQL)
        *   Edge Functions (Deno/TypeScript) - for OAuth callbacks & token refresh
        *   Storage (for user avatars)
*   **External Services:**
    *   Reddit API (OAuth for fetching posts)
    *   OpenRouter API (for AI caption generation)
*   **Deployment:**
    *   Platform: Netlify
    *   CI/CD: Configured via `netlify.toml`

## 3. Architecture

### 3.1 Frontend Architecture

*   **Entry Point:** `src/main.tsx` initializes React and renders `src/App.tsx`.
*   **Routing:** `src/App.tsx` defines routes using `react-router-dom`:
    *   `/`: Main application view (`MainApp` component).
    *   `/login`: User login page (`LoginPage`).
    *   `/register`: User registration page (`RegisterPage`).
    *   `/settings`: User settings page (`SettingsPage`).
    *   `/sessions`: Session management page (`SessionsPage`).
    *   `/session/play/:id`: Session playback page (`SessionPlayPage`).
    *   `/session/new`: New session creation page (`SessionFormPage`).
    *   `/session/edit/:id`: Session editing page (`SessionFormPage`).
    *   `/admin`: Admin dashboard and management (`AdminPage`).
*   **Main Application Layout (`MainApp`):**
    *   Resizable panels display Reddit media (`MediaDisplay`) and AI captions (`CaptionDisplay`).
    *   Header contains navigation, theme toggle, and user avatar/auth status.
*   **State Management & Data Flow:**
    *   **Authentication:** `AuthContext` manages Supabase user sessions and profiles. `RedditAuthContext` manages Reddit OAuth tokens, storing them in user settings via `useUserSettings`.
    *   **User Settings:** `useUserSettings` hook manages preferences (subreddits, API keys, etc.), syncing between local storage and the Supabase DB (`user_settings` table).
    *   **Reddit Data:** `useRedditPosts` hook fetches posts using the Reddit OAuth API (requires Reddit auth via `RedditAuthContext`).
    *   **Slideshow Logic:** `useSlideshow` hook manages the display cycle of posts fetched by `useRedditPosts`.
    *   **AI Captions:** `useAICaption` hook uses the current post and user settings (API key, prompt) to generate captions via OpenRouter.
    *   **Session Management:** `useJoiSessions` hook manages creating, editing, and fetching user sessions from the Supabase DB (`sessions` table), enabling users to save and load predefined slideshow configurations.
*   **Key Components:** Located in `src/components/`. UI primitives via `src/components/ui/`.
*   **Key Hooks:** Located in `src/hooks/`. Encapsulate major functionalities.
*   **Key Contexts:** Located in `src/contexts/`. Manage global state (Auth, Reddit Auth).

### 3.2 Backend Architecture (Supabase)

*   **Database:** PostgreSQL managed by Supabase.
    *   **Schema:** Managed via SQL migrations in `supabase/migrations/`.
    *   **Key Tables:**
        *   `auth.users` (Built-in)
        *   `profiles` (Public schema: `id` (FK to auth.users), `username`, `avatar_url`, `is_admin`, etc.)
        *   `user_settings` (Public schema: `user_id` (FK to auth.users, unique), `preferences` (JSONB containing subreddits, interval, keys, redditAuth tokens, etc.))
        *   `sessions` (Public schema: `id`, `user_id` (FK to auth.users), `name`, `description`, `subreddits`, `system_prompt`, `transition_effect`, `interval`, `is_public`, `created_at`, `updated_at`)
        *   `session_shares` (Public schema: Tracks shared sessions between users)
        *   `app_settings` (Public schema: Stores global application settings, accessible by admins)
*   **Authentication:** Utilizes Supabase Auth for email/password and integrates with Reddit/Patreon OAuth providers via Edge Functions.
*   **Edge Functions (`supabase/functions/`):**
    *   `reddit-auth`: Handles Reddit OAuth callback (`/callback`) and token refresh (`/refresh`). Requires `VITE_REDDIT_CLIENT_ID` and `VITE_REDDIT_CLIENT_SECRET`.
    *   `patreon-auth`: Handles Patreon OAuth callback. Requires client ID/secret configuration within the function code.
    *   `_shared`: Likely contains shared utilities for functions.
*   **Storage:** Supabase Storage used for user avatars (`avatars` bucket).

## 4. Current State & Functionality

*   **Core Feature:** Displays Reddit media slideshows with AI captions.
*   **User Accounts:** Supports email/password registration and login.
*   **Reddit Integration:** Users can connect their Reddit accounts via OAuth to fetch content from private/subscribed subreddits (using `history` and `mysubreddits` scopes). Fetches top posts weekly.
*   **Patreon Integration:** Authentication flow exists but its purpose within the app isn't immediately clear from the code examined (likely for premium features or creator support).
*   **AI Captions:** Generates captions using OpenRouter based on post details and a user-configurable system prompt. Requires an OpenRouter API key.
*   **User Settings:** Users can configure:
    *   Target subreddits.
    *   Slideshow interval and transition effect.
    *   AI system prompt.
    *   OpenRouter API key.
*   **Session Management:** Users can create, edit, and play saved slideshow configurations:
    *   Create personalized sessions with custom names, descriptions, and settings.
    *   Share sessions with other users.
    *   Browse public sessions created by others.
    *   Play sessions with optimal settings for their content.
*   **Admin Panel:** Admin users have access to:
    *   User statistics dashboard showing registrations and activity.
    *   User management interface to view and manage users.
    *   Global application settings configuration.
*   **Customization:** Supports light/dark theme toggling.
*   **Persistence:** User settings, sessions, and Reddit auth tokens are persisted in the Supabase database for logged-in users and cached in local storage.

## 5. Setup & Deployment

*   **Local Development:** Requires Node.js/npm, a `.env` file with Supabase/Reddit credentials, and running `npm install && npm run dev`. Supabase local development (`supabase start`) might be needed for full testing.
*   **Deployment:** Configured for Netlify. Requires environment variables for Supabase URL/key and Reddit client ID/secret. Supabase Edge Functions must be deployed separately (`supabase functions deploy`).

## 6. Potential Areas for Review/Improvement

*   **Error Handling & User Feedback:** Ensure errors from API calls (Reddit, OpenRouter, Supabase) are consistently handled and communicated clearly to the user, beyond console logs.
*   **Loading States:** Verify clear and consistent loading indicators for all asynchronous operations.
*   **Reddit API Usage:** Monitor efficiency if users add many subreddits. Explore alternative endpoints if needed (e.g., fetching from multiple subreddits in one call if possible, using different sorting/timeframes).
*   **AI Cost/Rate Limits:** OpenRouter usage incurs costs. Implement checks or limits if necessary. Handle rate limits gracefully.
*   **Patreon Flow:** Clarify the purpose and integration of Patreon authentication if it's a core feature.
*   **Code Cleanup:** ~~Minor TODOs or console logs might exist from development.~~ (Verbose console logs removed YYYY-MM-DD).
*   **Testing:** No automated tests were observed. Consider adding unit/integration tests for key hooks and components.

## Project State

### Last Update: 2025-05-02

### Current Focus:
- Ensuring complete feature implementation with Session Management and Admin Panel.
- Fixing routing issues and bugs identified in comprehensive code review.
- Improving application stability and UX with robust error handling.

### Recent Major Features Added:
- **Session Management System:** Implemented a comprehensive session management system allowing users to:
  - Create, edit, and delete personalized sessions
  - Share sessions with other users
  - Browse and play sessions created by others
  - Configure detailed session settings including name, description, subreddits, system prompt, and display preferences
  
- **Admin Panel:** Added an administration dashboard with:
  - User statistics showing registrations over time and platform usage
  - User management interface for viewing and administering user accounts
  - Global application settings configuration
  - System monitoring capabilities

### Issues Identified in Code Review:
- **Routing Issues:** Found missing routes for `/session/share/:id` and `/session/save/:id` that are referenced in component code.
- **Session Component Issues:** Issues with proper error handling and form validation in session-related components.
- **Authentication Flow Issues:** Improved error handling and type consistency for better user experience.
- **State Management Issues:** Fixed type assertions and validation in various hooks.
- **Admin Functionality Issues:** Standardized admin authorization checks and fixed date inconsistencies.
- **Form Validation:** Added proper validation for session forms and other user inputs.

### Previous Changes:
- **Fixed User Settings Saving:** Implemented debouncing on settings updates to prevent excessive database calls. Added a "Save Changes" button with proper visual indicators for pending changes and syncing status. This resolves the issue where "Failed to save settings" toast notifications would appear on each keystroke.
- **Fixed Settings Fetch Loop:** Resolved infinite loop in `useUserSettings` by separating initial data fetch logic from network recovery logic and correcting effect dependencies.
- **Added Offline Support:** Enhanced the `useUserSettings` hook with offline detection, connection retry limits, and graceful fallback to local storage when Supabase is unreachable.
- **Implemented Nuclear Option for Auth Loops:** Added multiple layers of safeguards to completely prevent Reddit authentication infinite loops, including session-level execution guards and strategic preference updates. This ensures the app remains stable even when Reddit API is inconsistent.
- **Fixed Authentication Loading State:** Added timeout safeguards to both the auth contexts and UI components to prevent getting stuck in "Initializing session" state. Added user-friendly recovery options when Reddit API is unavailable.

### Next Steps:
- Fix identified routing issues by adding missing routes to App.tsx
- Implement proper error handling in session components
- Standardize admin authorization checks
- Add proper form validation for all user inputs
- Fix navigation in session-related components to ensure proper state handling
- Add more comprehensive test cases for all major features

### Known Issues/TODOs:
- Missing routes for session sharing and saving need to be added
- Session form validation needs improvement
- Admin panel user edit functionality needs implementation
- Navigation after form submission needs refinement
- Route protection for authenticated routes needs implementation

### Reddit API Integration

- **Authentication:** Uses OAuth2 with a Supabase Edge Function (`reddit-auth`) acting as a backend to handle the token exchange and refresh securely. The frontend initiates the auth flow and stores the tokens (access & refresh) in local storage via the `useRedditAuth` context.
- **Post Fetching:** The `useRedditPosts` hook fetches posts for specified subreddits.
  - **Current Strategy:** Fetches posts concurrently from multiple sort types (`hot`, `new`, `top?t=day`, `controversial?t=day`) for each selected subreddit using the authenticated user's access token.
  - Fetched posts from different sort types are combined.
  - Duplicate posts (based on ID) are removed.
  - The combined, unique list of posts is shuffled using the Fisher-Yates algorithm (`lodash.shuffle`).
  - This aims to provide a more varied and randomized display of media compared to fetching from a single sort type.
- **Media Handling:** Includes logic to extract the best available image or video URL from various Reddit post types (direct images, videos, galleries, rich embeds, crossposts).
- **Dependencies:** `react`, `react-router-dom`, `@supabase/supabase-js`, `zustand`, `lodash`. 