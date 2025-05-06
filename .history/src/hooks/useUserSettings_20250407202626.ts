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
  const [isOffline, setIsOffline] = useState(!navigator.onLine); // Initialize based on current status
  
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

  // --- Function to fetch settings (extracted for reuse) ---
  const fetchUserSettings = async (isRetry = false) => {
    if (!user) {
      console.log('[fetchUserSettings] No user, skipping fetch.');
      setPreferences(localPreferences);
      setLoading(false);
      setSettingsLoaded(true);
      return;
    }
    
    if (isOffline && !isRetry) {
      console.log('[fetchUserSettings] Offline and not a manual retry, skipping fetch.');
      setPreferences(localPreferences);
      setLoading(false);
      setSettingsLoaded(true);
      return;
    }
    
    // Safety check: prevent excessive fetches
    if (fetchAttemptsRef.current >= MAX_FETCH_ATTEMPTS) {
      console.warn(`[fetchUserSettings] Exceeded max fetch attempts (${MAX_FETCH_ATTEMPTS}), using local preferences`);
      if (!hasShownOfflineMessage) {
        toast.error('Could not connect to database. Using local settings.');
        hasShownOfflineMessage = true; // Prevent repeated toasts
      }
      setPreferences(localPreferences);
      setLoading(false);
      setSettingsLoaded(true);
      return;
    }
    
    fetchAttemptsRef.current++;
    setLoading(true);
    setSettingsLoaded(false); // Mark as not loaded during fetch attempt
    
    try {
      console.log(`[fetchUserSettings] Fetching user settings (attempt ${fetchAttemptsRef.current}/${MAX_FETCH_ATTEMPTS})...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const { data, error } = await supabase
        .from('user_settings')
        .select('preferences')
        .eq('user_id', user.id)
        .single();
        
      clearTimeout(timeoutId);

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const dbPreferences = { ...defaultPreferences, ...data.preferences };
        setPreferences(dbPreferences);
        setLocalPreferences(dbPreferences);
      } else {
        await saveSettingsToDb(localPreferences); // Save default/local if none exists
        setPreferences(localPreferences);
      }
      
      // Reset counter on success
      fetchAttemptsRef.current = 0;
      hasShownOfflineMessage = false; // Reset offline message flag on success
    } catch (error: unknown) {
      console.error('Error fetching user settings:', error);
      let currentPrefsAreLocal = preferences === localPreferences;
      
      // Type check for AbortError
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('Database request timed out. Using local settings.');
      } 
      // Type check for network/fetch errors and Supabase specific code
      else if (error instanceof Error && error.message?.includes('Failed to fetch') || (error && typeof error === 'object' && 'code' in error && error.code === 'NETWORK_ERROR')) {
        setIsOffline(true); // Mark as offline
        if (!hasShownOfflineMessage) {
          toast.error('Network error. Using local settings. Check your connection.');
          hasShownOfflineMessage = true;
        }
      } 
      // Handle other errors
      else {
        toast.error('Failed to load your settings. Using local version.');
      }
      
      // Only update preferences state if it differs from local to avoid loop
      if (!currentPrefsAreLocal) {
        setPreferences(localPreferences);
      }
    } finally {
      setLoading(false);
      setSettingsLoaded(true);
    }
  };
  
  // --- Effect to Fetch Settings ONLY on User Change ---
  useEffect(() => {
    console.log('[useUserSettings] User changed, triggering initial fetch.');
    // Reset fetch attempts when user context changes
    fetchAttemptsRef.current = 0;
    // Reset offline message flag
    hasShownOfflineMessage = false;
    // Set initial offline state based on navigator
    setIsOffline(!navigator.onLine);
    
    if (user) {
      fetchUserSettings();
    } else {
      // If user logs out, immediately use local preferences
      setPreferences(localPreferences);
      setLoading(false);
      setSettingsLoaded(true);
    }
  }, [user]); // DEPEND ONLY ON USER

  // --- Effect to Handle Network Status Changes (Online Recovery) ---
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network connection restored.');
      setIsOffline(false);
      hasShownOfflineMessage = false;
      // If user is logged in, attempt to fetch settings now that we are online
      if (user) {
        console.log('Coming back online with user, attempting settings fetch...');
        fetchAttemptsRef.current = 0; // Reset attempts for recovery
        fetchUserSettings(true); // Pass true to indicate it's a recovery attempt
      }
    };
    
    const handleOffline = () => {
      console.log('Network connection lost.');
      setIsOffline(true);
      if (!hasShownOfflineMessage) {
        toast.error('You appear to be offline. Using local settings.');
        hasShownOfflineMessage = true;
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]); // Re-run if user logs in/out while offline/online listener is active

  // Function to save settings to database
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
    } catch (error: unknown) {
      console.error('Error saving settings to database:', error);
      
      // Type check for network/fetch errors and Supabase specific code
      if (error instanceof Error && error.message?.includes('Failed to fetch') || (error && typeof error === 'object' && 'code' in error && error.code === 'NETWORK_ERROR')) {
        setIsOffline(true);
        if (!hasShownOfflineMessage) {
          toast.error('Network error when saving. Changes saved locally only.');
          hasShownOfflineMessage = true;
        }
      } // Can add more specific error handling here if needed
      
      return false;
    }
  };
  
  // Function to update user settings
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