import { useState, useEffect, useCallback, useRef } from 'react';
import { Subreddit, RedditPost, TransitionEffect } from '@/types';

interface UseSlideshowProps {
  subreddits: Subreddit[];
  interval: number;
  transition: TransitionEffect;
  paused?: boolean;
}

// Define transition durations for each effect type - MUST match MediaDisplay.tsx durations
const TRANSITION_DURATIONS: { [key in TransitionEffect]: number } = {
  fade: 300,  // Matches duration-300
  slide: 300, // Matches duration-300
  zoom: 300,  // Matches duration-300
  flip: 400,  // Matches duration-400
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
    if (isTransitioningRef.current) return;  // Skip without logging
    isTransitioningRef.current = true;
    setTransitionDirection(direction);
    setIsTransitioning(true);
    clearTransitionTimers();
    const duration = TRANSITION_DURATIONS[transition] || 300;
    transitionTimerRef.current = window.setTimeout(() => {
      setCurrentIndex(newIndex);
      setIsTransitioning(false);
      isTransitioningRef.current = false;
      transitionTimerRef.current = null;
    }, duration);
  }, [clearTransitionTimers, transition]);

  // Set up timer for auto-advancing
  useEffect(() => {
    if (paused || totalPosts <= 1 || interval <= 0 || isTransitioningRef.current) {
      return;  // Early return without logging
    }
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