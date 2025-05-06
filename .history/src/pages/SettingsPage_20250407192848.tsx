import { AccountSettings } from '@/components/AccountSettings';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RedditConnect } from '@/components/RedditConnect';
import { PatreonConnect } from '@/components/PatreonConnect';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

// Import logo images properly
import logoLight from '../assets/Joip App Logo Light.png';
import logoDark from '../assets/Joip App Logo Dark.png';

export function SettingsPage() {
  const { user, loading } = useAuth();
  const { preferences, updatePreferences } = useUserSettings();
  const { theme } = useTheme();
  
  // Apply changes function
  const handleApplyChanges = () => {
    // This is now handled by the useUserSettings hook
    // which automatically syncs with the database
  };
  
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
    return <Navigate to="/login" />;
  }
  
  return (
    <div className="flex flex-col bg-background h-screen">
      <header className="flex items-center justify-between p-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
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
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-8">
        <div className="max-w-2xl mx-auto mb-8">
          <Tabs defaultValue="account" className="w-full">
            <TabsList className="grid grid-cols-3 w-full mb-6 p-1 bg-muted/40 rounded-xl">
              <TabsTrigger 
                value="account" 
                className="rounded-lg py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              >
                Account
              </TabsTrigger>
              <TabsTrigger 
                value="connections" 
                className="rounded-lg py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              >
                Connections
              </TabsTrigger>
              <TabsTrigger 
                value="debug" 
                className="rounded-lg py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              >
                Debug
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="account" className="mt-0 space-y-6">
              <AccountSettings 
                preferences={preferences}
                onUpdatePreferences={updatePreferences}
                onApply={handleApplyChanges}
              />
            </TabsContent>
            
            <TabsContent value="connections" className="mt-0 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RedditConnect className="h-full" />
                <PatreonConnect className="h-full" />
              </div>
            </TabsContent>
            
            <TabsContent value="debug" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Debug Tools</CardTitle>
                  <CardDescription>
                    Tools to help troubleshoot application issues
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Reddit Connection</h3>
                    <div className="flex flex-col gap-2">
                      <Button 
                        variant="destructive" 
                        onClick={() => {
                          updatePreferences({
                            redditAuth: {
                              accessToken: null,
                              refreshToken: null,
                              expiresAt: null,
                              scope: null,
                              isAuthenticated: false
                            }
                          });
                          toast.success('Reddit auth state has been reset');
                        }}
                      >
                        Reset Reddit Auth
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          localStorage.clear();
                          toast.success('Local storage cleared');
                        }}
                      >
                        Clear Local Storage
                      </Button>
                      <Button 
                        variant="secondary" 
                        onClick={() => {
                          window.location.reload();
                        }}
                      >
                        Reload Application
                      </Button>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Media Test</h3>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Test with a specific subreddit to verify image/video loading
                      </p>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            updatePreferences({
                              subreddits: ['EarthPorn']
                            });
                            toast.success('Set to r/EarthPorn for testing');
                          }}
                        >
                          Test with r/EarthPorn
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            updatePreferences({
                              subreddits: ['pics']
                            });
                            toast.success('Set to r/pics for testing');
                          }}
                        >
                          Test with r/pics
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      
      <footer className="py-4 border-t">
        <div className="max-w-2xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Joip AI &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}