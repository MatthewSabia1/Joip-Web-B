import { useState, useEffect, useRef, useCallback } from 'react';
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

// Debounce helper function
function debounce<T extends (arg: UserPreferences) => void>(func: T, wait: number): (arg: UserPreferences) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(arg: UserPreferences): void {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(arg), wait);
  };
}

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
    // Note: redditAuth is now stored in a dedicated table, not in preferences
  };

  // Local storage for preferences (used when not logged in or as cache)
  const [localPreferences, setLocalPreferences] = useLocalStorage<UserPreferences>(
    'reddit-slideshow-preferences',
    defaultPreferences
  );

  // State for current preferences (from DB if logged in, otherwise local)
  const [preferences, setPreferences] = useState<UserPreferences>(localPreferences);
  
  // Track pending changes that need to be saved to DB
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const pendingPreferencesRef = useRef<UserPreferences | null>(null);

  // Replace global variable with a ref for hasShownOfflineMessage
  const hasShownOfflineMessageRef = useRef(false);

  // --- Function to fetch settings (extracted for reuse) ---
  const fetchUserSettings = useCallback(async (isRetry = false) => {
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
      console.warn(`[fetchUserSettings] Exceeded max fetch attempts, using local preferences`);
      if (!hasShownOfflineMessageRef.current) {
        toast.error('Could not connect to database. Using local settings.');
        hasShownOfflineMessageRef.current = true;
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
        // Exclude redditAuth from preferences - it's now handled by RedditAuthContext directly
        // using the dedicated table
        const { redditAuth, ...otherPreferences } = data.preferences;
        const dbPreferences = { ...defaultPreferences, ...otherPreferences };
        setPreferences(dbPreferences);
        setLocalPreferences(dbPreferences);
      } else {
        await saveSettingsToDb(localPreferences); // Save default/local if none exists
        setPreferences(localPreferences);
      }
      
      // Reset counter on success
      fetchAttemptsRef.current = 0;
      hasShownOfflineMessageRef.current = false; // Reset offline message flag on success
    } catch (error: unknown) {
      console.error('Error fetching user settings:', error);
      const currentPrefsAreLocal = preferences === localPreferences;
      
      // Type check for AbortError
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('Database request timed out. Using local settings.');
      } 
      // Type check for network/fetch errors and Supabase specific code
      else if (error instanceof Error && error.message?.includes('Failed to fetch') || (error && typeof error === 'object' && 'code' in error && error.code === 'NETWORK_ERROR')) {
        setIsOffline(true);
        if (!hasShownOfflineMessageRef.current) {
          toast.error('Network error. Using local settings.');
          hasShownOfflineMessageRef.current = true;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline, localPreferences, setIsOffline, setLoading, setPreferences, setSettingsLoaded, user]);
  
  // --- Effect to Fetch Settings ONLY on User Change ---
  useEffect(() => {
    console.log('[useUserSettings] User changed, triggering initial fetch.');
    // Reset fetch attempts when user context changes
    fetchAttemptsRef.current = 0;
    // Reset offline message flag
    hasShownOfflineMessageRef.current = false;
    // Set initial offline state based on navigator
    setIsOffline(!navigator.onLine);
    
    if (user) {
      // Use a flag to ensure we only do this once per user change
      if (!settingsLoaded) {
        fetchUserSettings();
      }
    } else {
      // If user logs out, immediately use local preferences
      setPreferences(localPreferences);
      setLoading(false);
      setSettingsLoaded(true);
    }
  }, [user, fetchUserSettings, localPreferences, settingsLoaded]);

  // --- Effect to Handle Network Status Changes (Online Recovery) ---
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network connection restored.');
      setIsOffline(false);
      hasShownOfflineMessageRef.current = false;
      if (user) {
        fetchUserSettings(true);
      }
    };
    
    const handleOffline = () => {
      console.log('Network connection lost.');
      setIsOffline(true);
      if (!hasShownOfflineMessageRef.current) {
        toast.error('You appear to be offline. Using local settings.');
        hasShownOfflineMessageRef.current = true;
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, fetchUserSettings]);

  // Function to save settings to database
  const saveSettingsToDb = async (prefs: UserPreferences) => {
    if (!user) return false;
    if (isOffline) {
      console.log('Offline: Skipping DB save, using local storage only');
      return false;
    }

    try {
      setSyncing(true);
      
      // Make sure we don't save redditAuth to preferences, as it's now in its own table
      const { redditAuth, ...prefsToSave } = prefs;
      
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            preferences: prefsToSave,
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;
      setHasPendingChanges(false);
      pendingPreferencesRef.current = null;
      return true;
    } catch (error: unknown) {
      console.error('Error saving settings to database:', error);
      
      // Type check for network/fetch errors and Supabase specific code
      if (error instanceof Error && error.message?.includes('Failed to fetch') || (error && typeof error === 'object' && 'code' in error && error.code === 'NETWORK_ERROR')) {
        setIsOffline(true);
        if (!hasShownOfflineMessageRef.current) {
          toast.error('Network error when saving. Changes saved locally only.');
          hasShownOfflineMessageRef.current = true;
        }
      } // Can add more specific error handling here if needed
      
      return false;
    } finally {
      setSyncing(false);
    }
  };
  
  // Create a debounced version of saveSettingsToDb with 1000ms delay
  const debouncedSaveSettingsToDb = useRef(
    debounce((prefs: UserPreferences) => {
      void saveSettingsToDb(prefs);
    }, 1000)
  ).current;
  
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

    // Store the pending changes for later direct save
    pendingPreferencesRef.current = updated;
    setHasPendingChanges(true);
    
    // Debounce the save operation to prevent excessive API calls
    debouncedSaveSettingsToDb(updated);
  };

  // Save pending changes immediately (used by Apply button)
  const saveChanges = async () => {
    if (!hasPendingChanges || !pendingPreferencesRef.current || !user) {
      return true; // Nothing to save or no user
    }
    
    if (isOffline) {
      toast.info('You\'re offline. Changes saved locally only.');
      return false;
    }
    
    const success = await saveSettingsToDb(pendingPreferencesRef.current);
    if (success) {
      toast.success('Settings saved successfully');
    } else if (!isOffline) { // Skip error toast if already offline
      toast.error('Failed to save settings to your account');
    }
    
    return success;
  };
  
  return {
    preferences,
    updatePreferences: updateUserSettings,
    saveChanges,
    hasPendingChanges,
    loading,
    settingsLoaded,
    syncing,
    isOffline,
  };
}