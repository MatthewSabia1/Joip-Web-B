import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { UserPreferences } from '@/types';
import { toast } from 'sonner';

import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_INTERVAL,
  DEFAULT_TRANSITION,
  DEFAULT_SUBREDDITS,
} from '@/lib/constants';

// Global variable to prevent excessive retries when offline
let hasShownOfflineMessage = false;

export function useUserSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  
  // Fetch attempt tracking
  const fetchAttemptsRef = useRef(0);
  const MAX_FETCH_ATTEMPTS = 3;

  // Default settings
  const defaultPreferences: UserPreferences = {
    subreddits: DEFAULT_SUBREDDITS,
    interval: DEFAULT_INTERVAL,
    transition: DEFAULT_TRANSITION,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    apiKeys: {
      openRouter: '',
    },
    redditAuth: {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      scope: null,
      isAuthenticated: false
    }
  };

  // Local storage for preferences (used when not logged in or as cache)
  const [localPreferences, setLocalPreferences] = useLocalStorage<UserPreferences>(
    'reddit-slideshow-preferences',
    defaultPreferences
  );

  // State for current preferences (from DB if logged in, otherwise local)
  const [preferences, setPreferences] = useState<UserPreferences>(localPreferences);

  // Listen for online/offline status changes
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network connection restored');
      setIsOffline(false);
      hasShownOfflineMessage = false;
    };
    
    const handleOffline = () => {
      console.log('Network connection lost');
      setIsOffline(true);
      if (!hasShownOfflineMessage) {
        toast.error('You appear to be offline. Using local settings.');
        hasShownOfflineMessage = true;
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Check if already offline
    if (!navigator.onLine) {
      handleOffline();
    }
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch user settings from database when user logs in
  useEffect(() => {
    // Reset fetch attempt counter when user changes
    fetchAttemptsRef.current = 0;
    
    async function fetchUserSettings() {
      setSettingsLoaded(false);
      if (!user) {
        // If not logged in, use local preferences and mark as loaded
        setPreferences(localPreferences);
        setLoading(false);
        setSettingsLoaded(true);
        return;
      }
      
      // If we're offline, don't attempt to fetch from DB
      if (isOffline) {
        console.log('Offline: Using local settings instead of fetching from DB');
        setPreferences(localPreferences);
        setLoading(false);
        setSettingsLoaded(true);
        return;
      }
      
      // Safety check: prevent excessive fetches
      if (fetchAttemptsRef.current >= MAX_FETCH_ATTEMPTS) {
        console.warn(`Exceeded max fetch attempts (${MAX_FETCH_ATTEMPTS}), using local preferences`);
        toast.error('Could not connect to database. Using local settings.');
        setPreferences(localPreferences);
        setLoading(false);
        setSettingsLoaded(true);
        return;
      }
      
      fetchAttemptsRef.current++;
      setLoading(true);
      
      try {
        console.log(`Fetching user settings (attempt ${fetchAttemptsRef.current}/${MAX_FETCH_ATTEMPTS})...`);
        
        // Add timeout to prevent hanging request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const { data, error } = await supabase
          .from('user_settings')
          .select('preferences')
          .eq('user_id', user.id)
          .single()
          .abortSignal(controller.signal);
          
        clearTimeout(timeoutId);

        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          throw error;
        }

        if (data) {
          // Merge with defaults to ensure all fields exist
          const dbPreferences = {
            ...defaultPreferences,
            ...data.preferences,
          };
          setPreferences(dbPreferences);
          
          // Update local storage with DB values
          setLocalPreferences(dbPreferences);
        } else {
          // No settings in DB yet, use local and save to DB
          await saveSettingsToDb(localPreferences);
          setPreferences(localPreferences);
        }
        
        // Reset counter on success
        fetchAttemptsRef.current = 0;
      } catch (error) {
        console.error('Error fetching user settings:', error);
        
        // Handle specifically aborted requests
        if (error.name === 'AbortError') {
          toast.error('Database request timed out. Using local settings.');
        }
        // If it's a network error, mark as offline
        else if (error.message?.includes('Failed to fetch') || error.code === 'NETWORK_ERROR') {
          setIsOffline(true);
          if (!hasShownOfflineMessage) {
            toast.error('Network error. Using local settings. Check your connection.');
            hasShownOfflineMessage = true;
          }
        } else {
          toast.error('Failed to load your settings. Using local version.');
        }
        
        // Always fall back to local preferences
        setPreferences(localPreferences);
      } finally {
        setLoading(false);
        setSettingsLoaded(true);
      }
    }

    fetchUserSettings();
  }, [user, localPreferences, isOffline]);

  // Function to save settings to database with retry and offline handling
  const saveSettingsToDb = async (prefs: UserPreferences) => {
    if (!user) return false;
    if (isOffline) {
      console.log('Offline: Skipping DB save, using local storage only');
      return false;
    }

    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            preferences: prefs,
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error saving settings to database:', error);
      
      // If it's a network error, mark as offline
      if (error.message?.includes('Failed to fetch') || error.code === 'NETWORK_ERROR') {
        setIsOffline(true);
        if (!hasShownOfflineMessage) {
          toast.error('Network error when saving. Changes saved locally only.');
          hasShownOfflineMessage = true;
        }
      }
      
      return false;
    }
  };

  // Function to update user settings with offline awareness
  const updateUserSettings = async (newPreferences: Partial<UserPreferences>) => {
    // Update local state immediately for responsive UI regardless of connection
    const updated = { ...preferences, ...newPreferences };
    setPreferences(updated);
    setLocalPreferences(updated);
    
    // Don't attempt DB update if not logged in
    if (!user) {
      return;
    }
    
    // Don't attempt DB update if offline, but show a message
    if (isOffline) {
      toast.info('You\'re offline. Changes saved locally only.');
      return;
    }

    // Then sync with database if we're online
    setSyncing(true);
    try {
      const success = await saveSettingsToDb(updated);
      if (!success && !isOffline) { // Skip error toast if already offline
        toast.error('Failed to save settings to your account');
      }
    } finally {
      setSyncing(false);
    }
  };

  return {
    preferences,
    updatePreferences: updateUserSettings,
    loading,
    settingsLoaded,
    syncing,
    isOffline,
  };
}