import { useEffect } from 'react';
import { AccountSettings } from '@/components/AccountSettings';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RedditConnect } from '@/components/RedditConnect';
import { PatreonConnect } from '@/components/PatreonConnect';
import { toast } from 'sonner';

// Import logo images properly
import logoLight from '../assets/Joip App Logo Light.png';
import logoDark from '../assets/Joip App Logo Dark.png';

export function SettingsPage() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  
  // Check for reddit_success parameter and show toast if present
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('reddit_success')) {
      // Show success toast message
      toast.success('Reddit account successfully connected!', {
        description: 'You can now view content from your Reddit account.',
        duration: 5000,
      });
      
      // Clean URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, []);
  
  if (loading) {
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
  
  if (!user) {
    console.log("SettingsPage: User not authenticated, redirecting to login");
    return <Navigate to="/login" replace />;
  }
  
  return (
    <div className="flex flex-col bg-background min-h-screen">
      <header className="flex items-center justify-between px-5 py-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="mr-2">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <img 
            src={theme === 'dark' ? logoDark : logoLight} 
            alt="Joip AI" 
            className="h-auto w-auto max-h-9 object-contain"
          />
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <UserAvatar />
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8 bg-background/50">
        <div className="max-w-3xl mx-auto mb-8 bg-card rounded-xl shadow p-6 md:p-8">
          <Tabs defaultValue="account" className="w-full">
            <div className="relative mb-8">
              <TabsList className="relative z-10 flex w-full justify-center gap-1 overflow-hidden rounded-full border bg-card p-1">
                <TabsTrigger 
                  value="account" 
                  className="flex-1 rounded-full px-8 py-2.5 text-sm font-medium ring-offset-background transition-all hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  Account
                </TabsTrigger>
                <TabsTrigger 
                  value="connections" 
                  className="flex-1 rounded-full px-8 py-2.5 text-sm font-medium ring-offset-background transition-all hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  Connections
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="account" className="mt-0 space-y-6 animate-in fade-in-50 data-[state=inactive]:animate-out data-[state=inactive]:fade-out-0 data-[state=active]:duration-300">
              <AccountSettings />
            </TabsContent>
            
            <TabsContent value="connections" className="mt-0 space-y-6 animate-in fade-in-50 data-[state=inactive]:animate-out data-[state=inactive]:fade-out-0 data-[state=active]:duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RedditConnect className="h-full" />
                <PatreonConnect className="h-full" />
              </div>
            </TabsContent>
            
          </Tabs>
        </div>
        
        <div className="max-w-3xl mx-auto bg-card rounded-xl shadow p-6 md:p-8">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-semibold">Looking for App Settings?</h2>
            <p className="text-muted-foreground">
              Settings for slideshow timing, transitions, and subreddits are now managed per-session. 
              These settings can be customized when creating or editing a session.
            </p>
            <div className="pt-3">
              <Button asChild>
                <Link to="/sessions">
                  View Your Sessions
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      
      <footer className="py-5 border-t bg-card/50 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Joip AI &copy; {new Date().getFullYear()} • All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}