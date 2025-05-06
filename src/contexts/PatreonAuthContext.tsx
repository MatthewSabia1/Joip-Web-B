import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';

interface PatreonAuthContextType {
  isConnecting: boolean;
  connectPatreon: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const PatreonAuthContext = createContext<PatreonAuthContextType | undefined>(undefined);

export function PatreonAuthProvider({ children }: { children: ReactNode }) {
  const { user, session, refreshProfile } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  // Check for Patreon success callback in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const patreonConnected = params.get('patreonConnected');
    
    if (patreonConnected === 'true') {
      console.log('[PatreonAuth] Detected successful Patreon connection callback');
      // Clean up URL - using full origin + pathname to avoid security errors
      try {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (error) {
        console.warn('[PatreonAuth] Could not clean up URL:', error);
        // Fall back to redirect if replaceState fails
        window.location.href = window.location.origin + window.location.pathname;
      }
      
      // Show success toast
      toast.success('Successfully connected to Patreon');
      
      // Refresh profile to get latest Patreon data
      refreshProfile().catch(err => {
        console.error('[PatreonAuth] Error refreshing profile after connection:', err);
      });
    }
  }, [refreshProfile]);

  // Function to connect to Patreon
  const connectPatreon = async () => {
    if (!user || !session) {
      toast.error('You must be logged in to connect your Patreon account');
      return;
    }
    
    setIsConnecting(true);
    
    try {
      console.log('[PatreonAuth] Initiating Patreon connection for user:', user.id);
      
      // Call the Supabase Edge Function to get the OAuth URL
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/patreon-auth/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId: user.id })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PatreonAuth] Failed to connect:', response.status, errorText);
        throw new Error(`Failed to initiate Patreon connection: ${response.status} - ${errorText}`);
      }
      
      const { url } = await response.json();
      console.log('[PatreonAuth] Redirecting to Patreon OAuth URL');
      
      // Redirect to Patreon for authorization
      window.location.href = url;
      
    } catch (error) {
      console.error('[PatreonAuth] Error connecting to Patreon:', error);
      
      // Check if the error is related to missing environment variables
      if (error instanceof Error && 
          (error.message.includes('Missing required environment variables') || 
           error.message.includes('Server configuration error') ||
           error.message.includes('500') || 
           error.message.includes('Failed to initiate Patreon connection: 500'))) {
        toast.error('Patreon integration is not properly configured. Please contact support.');
        console.error('[PatreonAuth] Configuration error details:', error);
      } else {
        toast.error(`Error connecting to Patreon: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      setIsConnecting(false);
    }
  };

  // Function to refresh Patreon status
  const refreshStatus = async () => {
    console.log('[PatreonAuth] Refreshing patron status');
    await refreshProfile();
    toast.success('Patron status refreshed');
  };

  return (
    <PatreonAuthContext.Provider value={{ 
      isConnecting, 
      connectPatreon, 
      refreshStatus 
    }}>
      {children}
    </PatreonAuthContext.Provider>
  );
}

export function usePatreonAuth() {
  const context = useContext(PatreonAuthContext);
  if (context === undefined) {
    throw new Error('usePatreonAuth must be used within a PatreonAuthProvider');
  }
  return context;
}