import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { AuthState, User, UserProfile } from '@/lib/types';
import { AuthError } from '@supabase/supabase-js';

interface AuthContextType extends AuthState {
  signUp: (email: string, password: string, username: string) => Promise<{ 
    error: AuthError | null; 
    data: any; 
  }>;
  signIn: (email: string, password: string) => Promise<{ 
    error: AuthError | null; 
    data: any; 
  }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    initialized: false,
  });

  useEffect(() => {
    async function initializeAuth() {
      // Check if there is an active session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
          
        setState({
          user: session.user as unknown as User,
          profile,
          session,
          loading: false,
          initialized: true,
        });
      } else {
        setState({
          user: null,
          profile: null,
          session: null,
          loading: false,
          initialized: true,
        });
      }

      // Set up auth state listener
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
              
            setState({
              user: session.user as unknown as User,
              profile,
              session,
              loading: false,
              initialized: true,
            });
          } else if (event === 'SIGNED_OUT') {
            setState({
              user: null,
              profile: null,
              session: null,
              loading: false,
              initialized: true,
            });
          }
        }
      );

      return () => {
        subscription.unsubscribe();
      };
    }

    initializeAuth();
  }, []);

  async function signUp(email: string, password: string, username: string) {
    setState(prev => ({ ...prev, loading: true }));
    const response = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        }
      }
    });
    setState(prev => ({ ...prev, loading: false }));
    return response;
  }

  async function signIn(email: string, password: string) {
    setState(prev => ({ ...prev, loading: true }));
    const response = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setState(prev => ({ ...prev, loading: false }));
    return response;
  }

  async function signOut() {
    setState(prev => ({ ...prev, loading: true }));
    await supabase.auth.signOut();
    setState({
      user: null,
      profile: null,
      session: null,
      loading: false,
      initialized: true,
    });
  }

  async function updateProfile(updates: Partial<UserProfile>) {
    if (!state.user) throw new Error('No user logged in');

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', state.user.id);

    if (error) throw error;

    // Refresh profile
    await refreshProfile();
  }

  async function refreshProfile() {
    if (!state.user) throw new Error('No user logged in');

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', state.user.id)
      .single();

    if (error) throw error;

    setState(prev => ({ ...prev, profile }));
  }

  async function uploadAvatar(file: File) {
    if (!state.user) throw new Error('No user logged in');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${state.user.id}.${fileExt}`;
      const filePath = `${state.user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
      await updateProfile({ avatar_url: data.publicUrl });

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      throw error;
    }
  }

  const value = {
    ...state,
    signUp,
    signIn,
    signOut,
    updateProfile,
    uploadAvatar,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}