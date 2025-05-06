import { useState, useEffect, useCallback, useRef } from 'react';
import { Subreddit, RedditPost, TransitionEffect } from '@/types';

interface UseSlideshowProps {
  subreddits: Subreddit[];
  interval: number;
  transition: TransitionEffect;
  paused?: boolean;
}

// Define transition durations for each effect type
const TRANSITION_DURATIONS = {
  fade: 400,
  slide: 500,
  zoom: 400,
  flip: 600,
};

export function useSlideshow({ 
  subreddits, 
  interval, 
  transition,
  paused = false 
}: UseSlideshowProps) {
  // Flatten all posts from all subreddits into a single array
  const allPosts = subreddits.flatMap(sub => sub.posts);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPost, setCurrentPost] = useState<RedditPost | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'prev'>('next');
  
  // Ref to keep track of the transition animation ID (for cleanup)
  const transitionTimerRef = useRef<number | null>(null);
  
  // Get the appropriate transition duration based on the selected effect
  const transitionDuration = TRANSITION_DURATIONS[transition] || 500;
  
  // Flag to prevent triggering multiple transitions simultaneously
  const isTransitioningRef = useRef(false);
  
  // Calculate total number of posts
  const totalPosts = allPosts.length;

  // Get current post
  useEffect(() => {
    if (totalPosts > 0) {
      setCurrentPost(allPosts[currentIndex]);
    } else {
      setCurrentPost(null);
    }
  }, [currentIndex, allPosts, totalPosts]);

  // Cleanup function for transition timers
  const clearTransitionTimers = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  // Handle transition sequence with proper timing
  const handleTransition = useCallback((direction: 'next' | 'prev', newIndex: number) => {
    // Prevent concurrent transitions
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    
    // Start transition animation
    setTransitionDirection(direction);
    setIsTransitioning(true);
    
    // Clear any existing transition timers
    clearTransitionTimers();
    
    // Short delay to allow exit animation to begin
    transitionTimerRef.current = window.setTimeout(() => {
      // Update the index after starting the exit animation
      setCurrentIndex(newIndex);
      
      // Wait for the transition to complete before resetting
      transitionTimerRef.current = window.setTimeout(() => {
        setIsTransitioning(false);
        isTransitioningRef.current = false;
      }, transitionDuration); // Duration matches the CSS transition time
    }, 50);
  }, [clearTransitionTimers, transitionDuration]);

  // Set up timer for auto-advancing
  useEffect(() => {
    if (paused || totalPosts <= 1 || interval <= 0 || isTransitioningRef.current) return;
    
    const timer = setTimeout(() => {
      const nextIndex = (currentIndex + 1) % totalPosts;
      handleTransition('next', nextIndex);
    }, interval * 1000);
    
    return () => {
      clearTimeout(timer);
      clearTransitionTimers();
    };
  }, [currentIndex, interval, totalPosts, paused, handleTransition, clearTransitionTimers]);

  // Navigation functions
  const goToNext = useCallback(() => {
    if (totalPosts <= 1 || isTransitioningRef.current) return;
    
    const nextIndex = (currentIndex + 1) % totalPosts;
    handleTransition('next', nextIndex);
  }, [totalPosts, currentIndex, handleTransition]);

  const goToPrevious = useCallback(() => {
    if (totalPosts <= 1 || isTransitioningRef.current) return;
    
    const prevIndex = (currentIndex - 1 + totalPosts) % totalPosts;
    handleTransition('prev', prevIndex);
  }, [totalPosts, currentIndex, handleTransition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTransitionTimers();
    };
  }, [clearTransitionTimers]);

  return {
    currentPost,
    currentIndex,
    totalPosts,
    isTransitioning,
    transitionDirection,
    transition,
    goToNext,
    goToPrevious
  };
}