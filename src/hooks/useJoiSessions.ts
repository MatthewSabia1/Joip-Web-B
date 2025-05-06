import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { JoiSession, SharedSession, UserPreferences } from '@/types';
import { toast } from 'sonner';

export function useJoiSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<JoiSession[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user's sessions and sessions shared with them
  const fetchSessions = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch user's own sessions
      const { data: ownSessions, error: ownError } = await supabase
        .from('joi_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (ownError) throw ownError;
      
      // Fetch sessions shared with the user
      const { data: sharedData, error: sharedError } = await supabase
        .from('shared_sessions')
        .select(`
          id,
          session_id,
          owner_id,
          shared_with_id,
          created_at,
          session:joi_sessions(*),
          owner:profiles!shared_sessions_owner_id_fkey(username, avatar_url)
        `)
        .eq('shared_with_id', user.id);

      if (sharedError) throw sharedError;

      setSessions(ownSessions || []);
      setSharedWithMe(sharedData as unknown as SharedSession[] || []);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Failed to load sessions');
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Create a new session
  const createSession = async (sessionData: Partial<JoiSession>): Promise<JoiSession | null> => {
    if (!user) {
      toast.error('You must be logged in to create a session');
      return null;
    }

    // Validate required fields
    if (!sessionData.title?.trim()) {
      throw new Error('Session title is required');
    }
    
    if (!sessionData.subreddits || sessionData.subreddits.length === 0) {
      throw new Error('At least one subreddit is required');
    }

    try {
      // Check for network connectivity
      if (!navigator.onLine) {
        throw new Error('You are currently offline. Please check your internet connection and try again.');
      }
      
      // Create a logging point to diagnose issues
      console.log('Creating session with data:', {
        userId: user.id,
        title: sessionData.title || 'Untitled Session',
        subredditsCount: (sessionData.subreddits || []).length,
        hasSystemPrompt: !!sessionData.system_prompt,
        interval: sessionData.interval || 10,
        transition: sessionData.transition || 'fade'
      });

      // Check for duplicate title
      const { data: existingSession, error: checkError } = await supabase
        .from('joi_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('title', sessionData.title)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking for duplicate session:', checkError);
      } else if (existingSession) {
        throw new Error('A session with this title already exists. Please choose a different title.');
      }

      const { data, error } = await supabase
        .from('joi_sessions')
        .insert({
          user_id: user.id,
          title: sessionData.title,
          subreddits: sessionData.subreddits,
          system_prompt: sessionData.system_prompt || '',
          interval: sessionData.interval || 10,
          transition: sessionData.transition || 'fade',
          is_favorite: sessionData.is_favorite || false,
          is_public: sessionData.is_public || false
        })
        .select()
        .single();

      if (error) {
        // Parse the error for better user feedback
        if (error.code === '23505') {
          throw new Error('A session with this title already exists. Please choose a different title.');
        } else if (error.code === '42501') {
          throw new Error('You don\'t have permission to create sessions.');
        } else if (error.code?.startsWith('22')) {
          throw new Error('Invalid data format. Please check your inputs.');
        } else if (error.code === '23503') {
          throw new Error('The user account no longer exists.');
        } else {
          console.error('Supabase error creating session:', error);
          throw new Error(`Database error: ${error.message}`);
        }
      }
      
      if (!data) {
        console.error('No data returned from session creation');
        throw new Error('No data returned from session creation');
      }
      
      console.log('Session created successfully:', data.id);
      
      // Update local state
      setSessions(prevSessions => [data, ...prevSessions]);
      
      toast.success('Session created successfully');
      return data;
    } catch (err) {
      console.error('Error creating session:', err);
      
      // Let the error bubble up to be handled by the form component
      // This allows for better context-specific error handling
      throw err;
    }
  };

  // Update a session
  const updateSession = async (id: string, updates: Partial<JoiSession>): Promise<JoiSession | null> => {
    if (!user) {
      toast.error('You must be logged in to update a session');
      return null;
    }

    // Validate required fields
    if (updates.title !== undefined && !updates.title?.trim()) {
      throw new Error('Session title is required');
    }
    
    if (updates.subreddits !== undefined && (updates.subreddits.length === 0)) {
      throw new Error('At least one subreddit is required');
    }

    try {
      // Check for network connectivity
      if (!navigator.onLine) {
        throw new Error('You are currently offline. Please check your internet connection and try again.');
      }

      // Log update attempt for debugging
      console.log('Updating session:', {
        sessionId: id,
        userId: user.id,
        updatesFields: Object.keys(updates)
      });

      // First check if the session exists and belongs to the user
      const { data: existingSession, error: checkError } = await supabase
        .from('joi_sessions')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking session ownership:', checkError);
        throw new Error('Failed to verify session ownership');
      }

      if (!existingSession) {
        throw new Error('Session not found or you don\'t have permission to edit it');
      }

      // Check for duplicate title if title is being updated
      if (updates.title) {
        const { data: duplicateTitle, error: titleCheckError } = await supabase
          .from('joi_sessions')
          .select('id')
          .eq('user_id', user.id)
          .eq('title', updates.title)
          .neq('id', id) // Exclude current session
          .maybeSingle();

        if (titleCheckError) {
          console.error('Error checking for duplicate title:', titleCheckError);
        } else if (duplicateTitle) {
          throw new Error('A session with this title already exists. Please choose a different title.');
        }
      }

      // Proceed with update
      const { data, error } = await supabase
        .from('joi_sessions')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id) // Ensure user can only update their own sessions
        .select()
        .single();

      if (error) {
        // Parse the error for better user feedback
        if (error.code === '23505') {
          throw new Error('A session with this title already exists. Please choose a different title.');
        } else if (error.code === '42501') {
          throw new Error('You don\'t have permission to update this session.');
        } else if (error.code?.startsWith('22')) {
          throw new Error('Invalid data format. Please check your inputs.');
        } else {
          console.error('Supabase error updating session:', error);
          throw new Error(`Database error: ${error.message}`);
        }
      }
      
      if (!data) {
        console.error('No data returned from session update');
        throw new Error('No data returned from session update');
      }
      
      console.log('Session updated successfully:', data.id);
      
      // Update local state
      setSessions(prevSessions => 
        prevSessions.map(session => 
          session.id === id ? data : session
        )
      );
      
      toast.success('Session updated successfully');
      return data;
    } catch (err) {
      console.error('Error updating session:', err);
      
      // Let the error bubble up to be handled by the form component
      // This allows for better context-specific error handling
      throw err;
    }
  };

  // Delete a session
  const deleteSession = async (id: string): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in to delete a session');
      return false;
    }

    try {
      const { error } = await supabase
        .from('joi_sessions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id); // Ensure user can only delete their own sessions

      if (error) throw error;
      
      // Update local state
      setSessions(prevSessions => 
        prevSessions.filter(session => session.id !== id)
      );
      
      toast.success('Session deleted successfully');
      return true;
    } catch (err) {
      console.error('Error deleting session:', err);
      toast.error('Failed to delete session');
      return false;
    }
  };

  // Toggle session favorite status
  const toggleFavorite = async (id: string): Promise<boolean> => {
    const session = sessions.find(s => s.id === id);
    if (!session) return false;

    try {
      const { error } = await supabase
        .from('joi_sessions')
        .update({ is_favorite: !session.is_favorite })
        .eq('id', id)
        .eq('user_id', user?.id);

      if (error) throw error;
      
      // Update local state
      setSessions(prevSessions => 
        prevSessions.map(s => 
          s.id === id ? { ...s, is_favorite: !s.is_favorite } : s
        )
      );
      
      return true;
    } catch (err) {
      console.error('Error toggling favorite:', err);
      toast.error('Failed to update favorite status');
      return false;
    }
  };

  // Toggle public sharing status
  const togglePublic = async (id: string): Promise<boolean> => {
    const session = sessions.find(s => s.id === id);
    if (!session) return false;

    try {
      const { error } = await supabase
        .from('joi_sessions')
        .update({ is_public: !session.is_public })
        .eq('id', id)
        .eq('user_id', user?.id);

      if (error) throw error;
      
      // Refetch to get the updated shared_url_id if needed
      await fetchSessions();
      
      toast.success(session.is_public ? 'Session set to private' : 'Session is now public');
      return true;
    } catch (err) {
      console.error('Error toggling public status:', err);
      toast.error('Failed to update sharing status');
      return false;
    }
  };

  // Share a session with another user
  const shareSessionWithUser = async (sessionId: string, username: string): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in to share a session');
      return false;
    }

    try {
      const { error } = await supabase
        .rpc('share_session', {
          p_session_id: sessionId,
          p_username: username
        });

      if (error) throw error;
      
      toast.success(`Session shared with ${username}`);
      return true;
    } catch (err) {
      console.error('Error sharing session:', err);
      toast.error(`Failed to share session: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  };

  // Remove a shared session
  const unshareSession = async (sessionId: string, username: string): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in to unshare a session');
      return false;
    }

    try {
      const { error } = await supabase
        .rpc('unshare_session', {
          p_session_id: sessionId,
          p_username: username
        });

      if (error) throw error;
      
      toast.success(`Sharing with ${username} removed`);
      return true;
    } catch (err) {
      console.error('Error unsharing session:', err);
      toast.error(`Failed to unshare session: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    }
  };

  // Remove yourself from a shared session
  const removeSharedAccess = async (sharedId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('shared_sessions')
        .delete()
        .eq('id', sharedId)
        .eq('shared_with_id', user.id);

      if (error) throw error;
      
      // Update local state
      setSharedWithMe(prev => prev.filter(s => s.id !== sharedId));
      
      toast.success('Removed from shared session');
      return true;
    } catch (err) {
      console.error('Error removing shared access:', err);
      toast.error('Failed to remove shared access');
      return false;
    }
  };

  // Load session by shared URL ID
  const loadSessionByShareId = async (shareId: string): Promise<JoiSession | null> => {
    try {
      const { data, error } = await supabase
        .from('joi_sessions')
        .select('*')
        .eq('shared_url_id', shareId)
        .eq('is_public', true)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error loading shared session:', err);
      toast.error('Failed to load shared session');
      return null;
    }
  };

  // Save a shared session as your own (creates a copy)
  const saveSharedSession = async (session: JoiSession): Promise<JoiSession | null> => {
    if (!user) {
      toast.error('You must be logged in to save this session');
      return null;
    }

    // Remove fields we don't want to copy
    const { ...sessionData } = session;

    try {
      const newSession = await createSession({
        ...sessionData,
        title: `Copy of ${session.title}`,
        is_public: false
      });

      toast.success('Session saved to your library');
      return newSession;
    } catch (err) {
      console.error('Error saving shared session:', err);
      toast.error('Failed to save session');
      return null;
    }
  };

  // Convert a user preferences object into a session
  const createSessionFromPreferences = async (preferences: UserPreferences, title: string): Promise<JoiSession | null> => {
    return await createSession({
      title,
      subreddits: preferences.subreddits,
      system_prompt: preferences.systemPrompt,
      interval: preferences.interval,
      transition: preferences.transition,
      is_favorite: false,
      is_public: false
    });
  };

  // Apply a session to user preferences
  const applySessionToPreferences = (session: JoiSession): Partial<UserPreferences> => {
    return {
      subreddits: session.subreddits,
      interval: session.interval,
      transition: session.transition,
      systemPrompt: session.system_prompt
    };
  };

  // Load sessions when the user changes
  useEffect(() => {
    if (user) {
      fetchSessions();
    } else {
      setSessions([]);
      setSharedWithMe([]);
    }
  }, [user, fetchSessions]);

  // Helper function to get a session by ID
  const getSessionById = useCallback((id: string): JoiSession | null => {
    return sessions.find(s => s.id === id) || null;
  }, [sessions]);

  // Overload updateSession to accept either full session object or id + updates
  const updateSessionWrapper = async (sessionOrId: string | JoiSession, updates?: Partial<JoiSession>): Promise<JoiSession | null> => {
    // If first param is a string (ID), use the existing function
    if (typeof sessionOrId === 'string') {
      return updateSession(sessionOrId, updates || {});
    }
    
    // If first param is a session object, extract id and use as updates
    if (sessionOrId && typeof sessionOrId === 'object') {
      const { id, ...sessionData } = sessionOrId;
      return updateSession(id, sessionData);
    }
    
    return null;
  };

  return {
    sessions,
    sharedWithMe,
    loading,
    error,
    fetchSessions,
    createSession,
    updateSession: updateSessionWrapper,
    deleteSession,
    toggleFavorite,
    togglePublic,
    shareSession: shareSessionWithUser, // Alias for better naming
    shareSessionWithUser,
    unshareSession,
    removeSharedAccess,
    loadSessionByShareId,
    saveSharedSession,
    createSessionFromPreferences,
    applySessionToPreferences,
    getSessionById
  };
}