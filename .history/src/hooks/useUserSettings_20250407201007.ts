import { useState, useEffect } from 'react';
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

export function useUserSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  // Fetch user settings from database when user logs in
  useEffect(() => {
    async function fetchUserSettings() {
      setSettingsLoaded(false);
      if (!user) {
        // If not logged in, use local preferences and mark as loaded
        setPreferences(localPreferences);
        setLoading(false);
        setSettingsLoaded(true);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('preferences')
          .eq('user_id', user.id)
          .single();

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
      } catch (error) {
        console.error('Error fetching user settings:', error);
        toast.error('Failed to load your settings');
        setPreferences(localPreferences);
      } finally {
        setLoading(false);
        setSettingsLoaded(true);
      }
    }

    fetchUserSettings();
  }, [user, setLocalPreferences]);

  // Function to save settings to database
  const saveSettingsToDb = async (prefs: UserPreferences) => {
    if (!user) return false;

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
      return false;
    }
  };

  // Function to update user settings
  const updateUserSettings = async (newPreferences: Partial<UserPreferences>) => {
    if (!user) {
      // If not logged in, just update local state
      const updated = { ...preferences, ...newPreferences };
      setPreferences(updated);
      setLocalPreferences(updated);
      return;
    }

    // Update local state immediately for responsive UI
    const updated = { ...preferences, ...newPreferences };
    setPreferences(updated);
    setLocalPreferences(updated);

    // Then sync with database
    setSyncing(true);
    try {
      const success = await saveSettingsToDb(updated);
      if (!success) {
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
  };
}