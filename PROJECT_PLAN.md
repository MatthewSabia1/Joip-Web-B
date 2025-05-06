# Joip AI Project Plan & Documentation

## Project Overview

Joip AI is a web application that creates interactive slideshows displaying media content from Reddit with AI-generated captions. The app allows users to create, save, and share customized slideshow sessions with specific subreddits, intervals, transitions, and AI prompts.

### Key Features
- User authentication via Supabase or Patreon
- Reddit OAuth integration for fetching posts
- AI-generated captions using OpenRouter
- Customizable slideshow sessions with various settings
- Session sharing and management
- Subscription-based premium features (via Stripe)
- User profile and settings management
- Admin panel for analytics and user management

## Current Implementation Status

### Core Infrastructure
- ✅ React + TypeScript + Vite setup
- ✅ Supabase authentication and database
- ✅ Patreon authentication
- ✅ Reddit OAuth integration
- ✅ Tailwind CSS with ShadCN components
- ✅ OpenRouter AI integration

### User Authentication
- ✅ Supabase email/password authentication
- ✅ Patreon authentication
- ✅ User profile management
- ⚠️ Need to improve error handling and user feedback

### Media Features
- ✅ Reddit post fetching with OAuth
- ✅ Media display (images and videos)
- ✅ Slideshow controls and transitions
- ✅ AI caption generation
- ⚠️ Need to optimize performance for large media files

### Session Management
- ✅ Basic session data model
- ✅ Session creation, updating, and deletion
- ✅ Session favorites and sharing
- ⚠️ Need to implement session list UI with filtering
- ⚠️ Need to complete session import/export functionality

### Missing Features
- ❌ Stripe payment integration
- ❌ Text-to-Speech functionality
- ❌ Admin panel and analytics
- ❌ Complete session list/management UI
- ❌ User theme management

## Database Schema

### Current Tables
1. `profiles` - User profiles with basic information
2. `user_settings` - User preferences stored as JSON
3. `joi_sessions` - Saved slideshow sessions
4. `shared_sessions` - Records of sessions shared between users

## Implementation Roadmap

### Phase 1: Core Feature Completion
1. Complete Session UI and management
   - Build session list view with filtering and search
   - Implement session delete/edit/favorite controls
   - Add session import/export functionality

2. Fix Authentication Issues
   - Improve error handling during login/registration
   - Fix Patreon OAuth integration edge cases
   - Enhance profile update flow

### Phase 2: Premium Features
1. Implement Stripe Integration
   - Setup payment processing
   - Create subscription tiers
   - Handle subscription lifecycle
   - Add premium user identification

2. Add Text-to-Speech
   - Integrate TTS service
   - Add voice selection options
   - Implement caption-to-speech timing

### Phase 3: Admin Features
1. Build Admin Panel
   - User management interface
   - Analytics dashboard
   - Theme/prompt management
   - Application settings

### Phase 4: Optimization & Polish
1. Performance Improvements
   - Optimize media loading and caching
   - Reduce API calls
   - Implement better error handling

2. UI/UX Enhancements
   - Mobile responsiveness
   - Accessibility improvements
   - Custom themes

## Technical Considerations

### Authentication Flow
The application uses multiple authentication providers:
1. Supabase email/password (primary)
2. Patreon OAuth (alternative)
3. Reddit OAuth (for content access)

Each requires careful management of tokens, session state, and error handling.

### Media Management
Reddit media comes in various formats with inconsistent APIs, requiring:
- Proper CORS handling
- Fallbacks for unavailable media
- Format detection and conversion
- Caching strategies

### Database Structure
The Supabase database follows these relationships:
- `profiles` (1) ↔ `user_settings` (1)
- `profiles` (1) ↔ `joi_sessions` (many)
- `joi_sessions` (1) ↔ `shared_sessions` (many)

### API Integrations
The application integrates with multiple external APIs:
- Supabase (auth, storage, database)
- Reddit API (content)
- OpenRouter (AI captions)
- Patreon API (authentication)
- Stripe API (payments)

Each integration requires careful token management, rate limiting, and error handling.

## Testing Plan

### Unit Tests
- Authentication functions
- Hook behaviors
- Utility functions

### Integration Tests
- User flows (registration, session creation, etc.)
- API integrations

### User Acceptance Testing
- Session creation and playback
- Payment processing
- Sharing functionality

## Deployment Considerations

- Netlify for frontend hosting
- Supabase for backend and authentication
- Environment variable management
- CORS configuration

## Known Issues & Limitations

1. Reddit API rate limits can affect content availability
2. Video playback may not work consistently across all sources
3. OpenRouter API has usage costs that scale with user activity
4. Patreon OAuth requires special handling for token refreshes

---

This document will be updated throughout development to track progress and changes.