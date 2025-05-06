import { useState, useEffect, useCallback } from 'react';
import { Subreddit, RedditPost, TransitionEffect } from '@/types';

interface UseSlideshowProps {
  subreddits: Subreddit[];
  interval: number;
  transition: TransitionEffect;
  paused?: boolean;
}

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

  // Set up timer for auto-advancing
  useEffect(() => {
    if (paused || totalPosts <= 1 || interval <= 0) return;
    
    const timer = setTimeout(() => {
      setTransitionDirection('next');
      setIsTransitioning(true);
      
      // Short timeout to allow transition to start
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % totalPosts);
        
        // Reset transition state after completing
        setTimeout(() => {
          setIsTransitioning(false);
        }, 500); // Duration should match CSS transition time
      }, 50);
    }, interval * 1000);
    
    return () => clearTimeout(timer);
  }, [currentIndex, interval, totalPosts, paused]);

  // Navigation functions
  const goToNext = useCallback(() => {
    if (totalPosts <= 1) return;
    
    setTransitionDirection('next');
    setIsTransitioning(true);
    
    setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % totalPosts);
      
      setTimeout(() => {
        setIsTransitioning(false);
      }, 500);
    }, 50);
  }, [totalPosts]);

  const goToPrevious = useCallback(() => {
    if (totalPosts <= 1) return;
    
    setTransitionDirection('prev');
    setIsTransitioning(true);
    
    setTimeout(() => {
      setCurrentIndex(prev => (prev - 1 + totalPosts) % totalPosts);
      
      setTimeout(() => {
        setIsTransitioning(false);
      }, 500);
    }, 50);
  }, [totalPosts]);

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