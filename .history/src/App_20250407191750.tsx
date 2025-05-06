import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';

// Import logo images properly
import logoLight from './assets/Joip App Logo Light.png';
import logoDark from './assets/Joip App Logo Dark.png';

// Auth Provider
import { AuthProvider } from '@/contexts/AuthContext';

// Components
import { MediaDisplay } from '@/components/MediaDisplay';
import { CaptionDisplay } from '@/components/CaptionDisplay';
import { UserAvatar } from '@/components/UserAvatar';

// Pages
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { SettingsPage } from '@/pages/SettingsPage';

// Hooks
import { useRedditPosts } from '@/hooks/useRedditPosts';
import { useSlideshow } from '@/hooks/useSlideshow';
import { useAICaption } from '@/hooks/useAICaption';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useRedditAuth } from '@/contexts/RedditAuthContext';

// UI Components
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { ThemeToggle } from './components/ThemeToggle';
import { Button } from './components/ui/button';
import { Toaster } from 'sonner';
import { Link } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';

function MainApp() {
  // Get user settings
  const { preferences } = useUserSettings();
  const { theme } = useTheme();
  const { authState } = useRedditAuth();
  
  // Debug Reddit auth state
  useEffect(() => {
    console.log('[MainApp] Reddit auth state:', authState);
    console.log('[MainApp] User preferences:', preferences);
  }, [authState, preferences]);
  
  // State
  const [isPaused] = useState<boolean>(false);

  // Fetch reddit posts using preferences.subreddits directly
  const { subreddits, isLoading, error } = useRedditPosts(
    preferences.subreddits,
    preferences.interval * 2 // Refresh at twice the interval rate
  );

  // Slideshow controller
  const slideshow = useSlideshow({
    subreddits,
    interval: preferences.interval,
    transition: preferences.transition,
    paused: isPaused || isLoading,
  });

  // AI Caption generator
  const caption = useAICaption({
    post: slideshow.currentPost,
    systemPrompt: preferences.systemPrompt,
    apiKey: preferences.apiKeys.openRouter,
  });

  // Set document title based on current post
  useEffect(() => {
    if (slideshow.currentPost) {
      document.title = `${slideshow.currentPost.subreddit} - ${slideshow.currentPost.title.slice(0, 50)}${slideshow.currentPost.title.length > 50 ? '...' : ''}`;
    } else {
      document.title = `Joip AI`;
    }

    // Reset on unmount
    return () => {
      const defaultTitle = document.querySelector('title[data-default]')?.textContent;
      if (defaultTitle) document.title = defaultTitle;
    };
  }, [slideshow.currentPost]);

  return (
    <div className="w-full h-screen flex flex-col">
      <header className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <img 
            src={theme === 'dark' ? logoDark : logoLight} 
            alt="Joip AI" 
            className="h-auto w-auto max-h-10 object-contain"
          />
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link to="/settings">Settings</Link>
          </Button>
          <ThemeToggle />
          <UserAvatar />
        </div>
      </header>

      <div className="flex-grow overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full"
        >
          {/* Left Panel: Reddit Slideshow */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full">
              <MediaDisplay
                post={slideshow.currentPost}
                isTransitioning={slideshow.isTransitioning}
                transitionDirection={slideshow.transitionDirection}
                transition={slideshow.transition}
                totalPosts={slideshow.totalPosts}
                currentIndex={slideshow.currentIndex}
                onNext={slideshow.goToNext}
                onPrevious={slideshow.goToPrevious}
                error={error}
                isLoading={isLoading}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel: AI Captions */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full">
              <CaptionDisplay
                caption={caption}
                onRegenerate={caption.regenerate}
                isApiKeySet={!!preferences.apiKeys.openRouter}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route 
            path="/settings" 
            element={<SettingsPage />} 
          />
        </Routes>
        <Toaster position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;