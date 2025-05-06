import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useJoiSessions } from '@/hooks/useJoiSessions';
import { JoiSession } from '@/types';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
// format is no longer needed since we're using SessionCard
// import { format } from 'date-fns';
import { toast } from 'sonner';
import { SessionCard, SharedSessionCard } from '@/components/SessionCard';

// Import logo images
import logoLight from '../assets/Joip App Logo Light.png';
import logoDark from '../assets/Joip App Logo Dark.png';

export function SessionsPage() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate(); // Used for programmatic navigation
  const { 
    sessions, 
    sharedWithMe, 
    loading: sessionsLoading, 
    // toggleFavorite is no longer needed here as it's used in the SessionCard component
    deleteSession
  } = useJoiSessions();
  
  // State for search and filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'favorites' | 'shared'>('all');
  const [sessionToDelete, setSessionToDelete] = useState<JoiSession | null>(null);

  // Handle navigation state from SessionPlayPage
  useEffect(() => {
    // Check if we came from SessionPlayPage with state
    if (location.state && 'fromSessionPlay' in location.state && location.state.sessionId) {
      const sessionId = location.state.sessionId;
      
      // Clear location state to avoid persisting it
      navigate(location.pathname, { replace: true });
      
      // Find the session in the list and scroll to it
      setTimeout(() => {
        const sessionElement = document.getElementById(`session-${sessionId}`);
        if (sessionElement) {
          sessionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sessionElement.classList.add('highlight-session');
          
          // Remove highlight after animation
          setTimeout(() => {
            sessionElement.classList.remove('highlight-session');
          }, 2000);
        }
      }, 100);
    }
  }, [location, navigate, sessions]);

  // Filter sessions based on search term and selected filter
  const filteredSessions = sessions.filter(session => {
    // Filter by search term (title or subreddits)
    const matchesSearch = 
      searchTerm === '' || 
      session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.subreddits.some(sub => sub.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Filter by tab selection
    if (selectedFilter === 'favorites') {
      return matchesSearch && session.is_favorite;
    }
    
    return matchesSearch;
  });

  // Handle session deletion confirmation
  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;
    
    const success = await deleteSession(sessionToDelete.id);
    if (success) {
      toast.success(`"${sessionToDelete.title}" deleted successfully`);
    }
    setSessionToDelete(null);
  };

  // Loading state
  if (loading || sessionsLoading) {
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
  
  // If not authenticated, redirect to login
  if (!user) {
    console.log("SessionsPage: User not authenticated, redirecting to login");
    return <Navigate to="/login" replace />;
  }
  
  return (
    <div className="flex flex-col bg-background min-h-screen">
      <header className="flex items-center justify-between p-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="mr-2">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back</span>
            </Button>
          </Link>
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
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Your Sessions</h1>
              <p className="text-muted-foreground mt-1">
                Create and manage your JOIP sessions
              </p>
            </div>
            <Link to="/session/new">
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>New Session</span>
              </Button>
            </Link>
          </div>
          
          <div className="bg-card rounded-xl border shadow-sm p-4 md:p-6 mb-8">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search sessions..." 
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <Tabs 
              defaultValue="all" 
              onValueChange={(value) => setSelectedFilter(value as 'all' | 'favorites' | 'shared')}
            >
              <TabsList className="mb-6">
                <TabsTrigger value="all">All Sessions</TabsTrigger>
                <TabsTrigger value="favorites">Favorites</TabsTrigger>
                <TabsTrigger value="shared">Shared with me ({sharedWithMe.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="all" className="mt-0">
                {filteredSessions.length === 0 ? (
                  <div className="text-center py-12">
                    <h3 className="text-lg font-medium mb-2">No sessions found</h3>
                    <p className="text-muted-foreground mb-6">
                      {searchTerm ? 'Try a different search term' : 'Create your first session to get started'}
                    </p>
                    {!searchTerm && (
                      <Link to="/session/new">
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Create New Session
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSessions.map((session) => (
                      <div 
                        key={session.id} 
                        id={`session-${session.id}`}
                      >
                        <SessionCard 
                          session={session} 
                          onDeleteClick={(session) => setSessionToDelete(session)} 
                        />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="favorites" className="mt-0">
                {filteredSessions.length === 0 ? (
                  <div className="text-center py-12">
                    <h3 className="text-lg font-medium mb-2">No favorite sessions</h3>
                    <p className="text-muted-foreground">
                      Add sessions to your favorites to see them here
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSessions.map((session) => (
                      <div 
                        key={session.id} 
                        id={`session-${session.id}`}
                      >
                        <SessionCard 
                          session={session} 
                          onDeleteClick={(session) => setSessionToDelete(session)} 
                        />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="shared" className="mt-0">
                {sharedWithMe.length === 0 ? (
                  <div className="text-center py-12">
                    <h3 className="text-lg font-medium mb-2">No shared sessions</h3>
                    <p className="text-muted-foreground">
                      Sessions shared with you will appear here
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sharedWithMe.map((shared) => {
                      if (!shared.session) return null;
                      
                      return (
                        <div 
                          key={shared.id} 
                          id={`session-${shared.session.id}`}
                        >
                          <SharedSessionCard 
                            sharedSession={shared}
                            onDeleteClick={(sharedId) => {
                              console.log(`Removing shared session with ID: ${sharedId}`);
                              // Find the shared session to confirm
                              const sharedSession = sharedWithMe.find(s => s.id === sharedId);
                              if (sharedSession?.session) {
                                setSessionToDelete(sharedSession.session);
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      
      <footer className="py-4 border-t">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Joip AI &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{sessionToDelete?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}