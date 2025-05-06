import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/useTheme';
import { toast } from 'sonner';

// Import logo images
import logoLight from '../assets/Joip App Logo Light.png';
import logoDark from '../assets/Joip App Logo Dark.png';

// New extracted components
import { AdminHeader } from './admin/AdminHeader';
import { AdminTabs } from './admin/AdminTabs';

// Define types for statistics and profiles
interface AdminStats {
  userCount: number;
  newUsersLastMonth: number;
  newUsersLastWeek: number;
  totalSessions: number;
  totalPatrons: number;
  monthlyRevenue: number;
}

interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  updated_at: string | null;
  email: string | null;
  is_admin: boolean;
  is_patron: boolean | null;
  patron_tier: string | null;
}

interface GlobalSettings {
  openrouter_api_key: string;
  openrouter_model: string;
  default_system_prompt: string;
}

export function AdminPage() {
  const { user, profile, loading } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  
  // State for admin data
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [settings, setSettings] = useState<GlobalSettings>({
    openrouter_api_key: '',
    openrouter_model: 'meta-llama/llama-4-maverick',
    default_system_prompt: ''
  });
  
  // UI State
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Fetch admin data - wrapped in useCallback to maintain stable reference
  const fetchAdminData = useCallback(async () => {
    if (!user || !profile) return;
    
    // Type assertion to use our local interface which has the is_admin property
    const userProfile = profile as unknown as UserProfile | null;
    
    // Use profile.is_admin as the source of truth
    if (!userProfile?.is_admin) {
      toast.error('You do not have admin privileges');
      return;
    }
    
    setIsLoading(true);
    
    try {
      
      // Fetch users
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, updated_at, is_patron, patron_tier')
        .order('created_at', { ascending: false });
      
      if (usersError) throw usersError;
      
      // Fetch users with auth data (for email)
      const { data: authUsers, error: authError } = await supabase
        .rpc('get_users_with_email');
      
      if (authError) throw authError;
      
      // Combine profiles with auth data
      const combinedUsers = usersData.map(profile => {
        const authUser = (authUsers as { id: string; email: string }[]).find(u => u.id === profile.id);
        return {
          ...profile,
          email: authUser?.email || null
        };
      });
      
      setUsers(combinedUsers as UserProfile[]);
      
      // Fetch application settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('app_settings')
        .select('*')
        .single();
      
      if (settingsError && settingsError.code !== 'PGRST116') {
        throw settingsError;
      }
      
      if (settingsData) {
        setSettings({
          openrouter_api_key: settingsData.openrouter_api_key || '',
          openrouter_model: settingsData.openrouter_model || 'meta-llama/llama-4-maverick',
          default_system_prompt: settingsData.default_system_prompt || ''
        });
      }
      
      // Calculate stats
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const newUsersLastMonth = combinedUsers.filter(u => 
        new Date(u.updated_at || '') > oneMonthAgo
      ).length;
      
      const newUsersLastWeek = combinedUsers.filter(u => 
        new Date(u.updated_at || '') > oneWeekAgo
      ).length;
      
      const patronUsers = combinedUsers.filter(u => u.is_patron).length;
      
      // Fetch sessions count
      const { count: sessionsCount, error: sessionsError } = await supabase
        .from('joi_sessions')
        .select('id', { count: 'exact', head: true });
      
      if (sessionsError) throw sessionsError;
      
      // Set statistics
      setStats({
        userCount: combinedUsers.length,
        newUsersLastMonth,
        newUsersLastWeek,
        totalSessions: sessionsCount || 0,
        totalPatrons: patronUsers,
        monthlyRevenue: patronUsers * 5, // assuming $5 per patron
      });
      
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setIsLoading(false);
    }
  }, [user, profile, supabase, setUsers, setStats, setSettings, setIsLoading]);
  
  // Update app settings
  const saveAppSettings = async () => {
    if (!user) return;
    
    setSavingSettings(true);
    
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          id: 1, // Use a single row for global settings
          openrouter_api_key: settings.openrouter_api_key,
          openrouter_model: settings.openrouter_model,
          default_system_prompt: settings.default_system_prompt,
          updated_at: new Date().toISOString(),
          updated_by: user.id
        });
      
      if (error) throw error;
      
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };
  
  // Define deleteUser function
  const deleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    try {
      // Note: Need appropriate permissions/setup for admin actions
      const { error: adminError } = await supabase.auth.admin.deleteUser(userId);
      if (adminError) {
        // Attempt to delete from profiles table even if auth deletion fails (e.g., user already deleted)
        console.warn(`Failed to delete user from auth: ${adminError.message}. Attempting profile deletion.`);
        const { error: profileError } = await supabase.from('profiles').delete().match({ id: userId });
        if (profileError) throw profileError; // Throw if profile deletion also fails
      } else {
        // If auth deletion succeeded, profile deletion should cascade or be handled by triggers.
        // If not, explicitly delete profile:
        // const { error: profileError } = await supabase.from('profiles').delete().match({ id: userId });
        // if (profileError) console.error('Error deleting profile after auth deletion:', profileError);
      }
      toast.success('User deleted successfully');
      fetchAdminData(); // Refresh user list
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(`Failed to delete user: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Define makeUserAdmin function
  const makeUserAdmin = async (userId: string) => {
    if (!window.confirm('Are you sure you want to grant admin privileges to this user?')) {
      return;
    }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: true })
        .match({ id: userId });
      
      if (error) throw error;

      toast.success('User granted admin privileges');
      fetchAdminData(); // Refresh user list
    } catch (error) {
      console.error('Error making user admin:', error);
      toast.error(`Failed to grant admin privileges: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Load admin data on mount
  useEffect(() => {
    // The UserProfile interface in this file has is_admin, but the imported one might not
    // Type assertion to use our local interface which has the is_admin property
    const userProfile = profile as unknown as UserProfile | null;
    
    if (!user || !userProfile || !userProfile.is_admin) {
      console.log('Not an admin user, redirecting');
      toast.error('You do not have admin privileges');
      
      // Timeout to allow the toast to be displayed
      setTimeout(() => {
        navigate('/');
      }, 2000);
      return;
    }
    
    // Fetch data when component mounts
    fetchAdminData();
  }, [user, profile, supabase, setUsers, setStats, setSettings, setIsLoading, navigate, fetchAdminData]);
  
  // Handle loading state
  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse flex space-x-2">
          <div className="rounded-full bg-muted h-3 w-3"></div>
          <div className="rounded-full bg-muted h-3 w-3"></div>
          <div className="rounded-full bg-muted h-3 w-3"></div>
        </div>
      </div>
    );
  }
  
  // Redirect if not logged in
  if (!user) {
    console.log("AdminPage: User not authenticated, redirecting to login");
    return <Navigate to="/login" replace />;
  }
  
  // Check if user is admin
  const isAdmin = !!(profile && typeof profile === 'object' && 'is_admin' in profile && profile.is_admin === true);
  
  if (!isAdmin) {
    console.log("AdminPage: User not admin, redirecting to home");
    return <Navigate to="/" replace />;
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AdminHeader
        theme={theme}
        onRefresh={fetchAdminData}
        logoLight={logoLight}
        logoDark={logoDark}
      />

      <main className="flex-grow p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <AdminTabs
            stats={stats}
            users={users}
            settings={settings}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onSaveSettings={saveAppSettings}
            savingSettings={savingSettings}
            deleteUser={deleteUser}
            makeUserAdmin={makeUserAdmin}
            setSettings={setSettings}
          />
        </div>
      </main>
      
      <footer className="py-4 border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Joip AI Admin Dashboard &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}