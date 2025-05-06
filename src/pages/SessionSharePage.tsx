import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useJoiSessions } from '@/hooks/useJoiSessions';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, Link as LinkIcon, Users, ArrowLeft, Copy, Share } from 'lucide-react';
import { JoiSession } from '@/types';
import { supabase } from '@/lib/supabase';
import React from 'react';

export function SessionSharePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { sessions, loading, error, getSessionById, shareSession, togglePublic } = useJoiSessions();
  
  const [session, setSession] = useState<JoiSession | null>(null);
  const [sharingMode, setSharingMode] = useState<'link' | 'users'>('link');
  const [shareableLink, setShareableLink] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDirectFetching, setIsDirectFetching] = useState<boolean>(false);
  const [notFound, setNotFound] = useState<boolean>(false);
  
  // Flag to prevent multiple notFound state updates
  const hasSetNotFoundRef = React.useRef(false);
  
  // Direct session fetch function to get session data directly from database
  const fetchSessionDirectly = useCallback(async (sessionId: string) => {
    if (!user || !sessionId) return null;
    
    console.log(`Attempting direct session fetch from database for ID: ${sessionId}`);
    try {
      setIsDirectFetching(true);
      
      // Try to fetch the session directly from the database
      const { data: ownSession, error: ownError } = await supabase
        .from('joi_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (ownError) {
        console.error('Error fetching session directly:', ownError);
        return null;
      }
      
      if (ownSession) {
        console.log('Successfully fetched session directly:', ownSession.title);
        return ownSession;
      }
      
      return null;
    } catch (err) {
      console.error('Error in direct session fetch:', err);
      return null;
    } finally {
      setIsDirectFetching(false);
    }
  }, [user]);

  // Handle notFound redirect with a dedicated useEffect
  useEffect(() => {
    if (notFound) {
      console.log("Setting up redirect timer because session not found in share page");
      
      const redirectTimer = setTimeout(() => {
        toast.error('Session not found');
        navigate('/sessions', { replace: true });
      }, 500);
      
      return () => {
        console.log("Cleaning up redirect timer in share page");
        clearTimeout(redirectTimer);
      };
    }
  }, [notFound, navigate]);

  useEffect(() => {
    if (!id) return;
    
    // Skip if we've already found the session or determined it doesn't exist
    if (session || hasSetNotFoundRef.current) return;
    
    // FIRST APPROACH: Check the useJoiSessions hook's sessions array
    const checkSessionsArray = () => {
      // Wait for sessions to load
      if (loading) {
        console.log('Sessions still loading in share page, waiting...');
        return false;
      }

      if (sessions.length > 0) {
        const foundSession = getSessionById(id);
        if (foundSession) {
          console.log('Session found for sharing:', foundSession.id);
          setSession(foundSession);
          setIsPublic(foundSession.is_public || false);
          return true;
        } else {
          console.log('Session not found in sessions array for sharing');
        }
      } else {
        console.log('No sessions loaded but loading is complete');
      }
      
      return false;
    };
    
    // Try to find the session in the array
    const foundInArray = checkSessionsArray();
    
    // If not found in array and not currently loading, try fetching directly from database
    if (!foundInArray && !loading && !isDirectFetching) {
      console.log('Session not found in array for sharing, trying direct fetch...');
      
      // SECOND APPROACH: Fetch directly from Supabase as a fallback
      fetchSessionDirectly(id).then(directFetchedSession => {
        if (directFetchedSession) {
          console.log('Session found via direct fetch for sharing');
          setSession(directFetchedSession);
          setIsPublic(directFetchedSession.is_public || false);
        } else {
          console.log('Session not found via direct fetch, will try one more time in 2 seconds');
          
          // Final retry after a short delay
          setTimeout(async () => {
            // Try checking arrays one more time
            const foundInArrayFinal = checkSessionsArray();
            
            if (!foundInArrayFinal) {
              // Try one more direct fetch
              const finalAttempt = await fetchSessionDirectly(id);
              
              if (finalAttempt) {
                setSession(finalAttempt);
                setIsPublic(finalAttempt.is_public || false);
              } else if (!hasSetNotFoundRef.current) {
                console.log('Session still not found after all attempts for sharing - setting notFound to true');
                hasSetNotFoundRef.current = true;
                setNotFound(true);
              }
            }
          }, 2000);
        }
      });
    }
  }, [id, sessions, loading, isDirectFetching, session, getSessionById, fetchSessionDirectly]);

  // Check if the session belongs to the current user
  useEffect(() => {
    if (session && profile && session.user_id !== profile.id) {
      toast.error('You can only share your own sessions');
      navigate('/sessions', { replace: true });
    }
  }, [session, profile, navigate]);

  const handleTogglePublic = async () => {
    if (!session) {
      toast.error('No session found to update');
      return;
    }
    
    setIsProcessing(true);
    try {
      // Use togglePublic instead of updateSession for better semantics
      const success = await togglePublic(session.id);
      
      if (!success) {
        throw new Error('Failed to toggle public status');
      }
      
      // Update local state
      setIsPublic(!isPublic);
      
      if (!isPublic) {
        // Generate shareable link when making public
        const baseUrl = window.location.origin;
        setShareableLink(`${baseUrl}/session/save/${session.id}`);
        toast.success('Session is now public and can be shared via link');
      } else {
        setShareableLink('');
        toast.success('Session is now private');
      }
    } catch (error) {
      toast.error('Failed to update session visibility');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyLink = () => {
    if (shareableLink) {
      navigator.clipboard.writeText(shareableLink);
      toast.success('Link copied to clipboard');
    }
  };

  const handleShareWithUser = async () => {
    if (!session) {
      toast.error('No session found to share');
      return;
    }
    
    if (!username.trim()) {
      toast.error('Please enter a valid username');
      return;
    }
    
    setIsProcessing(true);
    try {
      const success = await shareSession(session.id, username.trim());
      if (success) {
        toast.success(`Session shared with ${username}`);
        setUsername('');
      } else {
        throw new Error('Share operation failed');
      }
    } catch (error) {
      toast.error('Failed to share session. Check that the username exists.');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading session...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-4xl mx-auto py-10">
        <div className="bg-red-100 dark:bg-red-900 p-4 rounded">
          <p className="text-red-700 dark:text-red-100">Error: {error}</p>
          <Button variant="outline" asChild className="mt-2">
            <Link to="/sessions">Back to Sessions</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container max-w-4xl mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle>Session Not Found</CardTitle>
            <CardDescription>
              The session you're looking for doesn't exist or you don't have access to it.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link to="/sessions">Back to Sessions</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-10">
      <Button variant="ghost" asChild className="mb-6">
        <Link to="/sessions">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sessions
        </Link>
      </Button>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Share className="h-5 w-5 mr-2" />
            Share Session
          </CardTitle>
          <CardDescription>
            Share your session "{session.title}" with others
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="mb-6">
            <h3 className="text-lg font-medium">Session Details</h3>
            <div className="mt-2 text-sm text-muted-foreground">
              <p className="mb-1"><span className="font-medium">Description:</span> {session.description ?? 'No description'}</p>
              <p className="mb-1">
                <span className="font-medium">Subreddits:</span>{' '}
                <span className="flex flex-wrap gap-1 mt-1">
                  {session.subreddits.map((subreddit) => (
                    <Badge key={subreddit} variant="secondary">r/{subreddit}</Badge>
                  ))}
                </span>
              </p>
              <p className="mb-1"><span className="font-medium">Interval:</span> {session.interval}s</p>
              <p><span className="font-medium">Transition:</span> {session.transition}</p>
            </div>
          </div>
          
          <Separator className="my-6" />
          
          <div className="flex items-center space-x-2 mb-6">
            <Switch
              id="public-mode"
              checked={isPublic}
              onCheckedChange={handleTogglePublic}
              disabled={isProcessing}
            />
            <Label htmlFor="public-mode">Public Session</Label>
            <span className="ml-2 text-sm text-muted-foreground">
              {isPublic ? 'Anyone with the link can view this session' : 'Only you and people you share with can access this session'}
            </span>
          </div>
          
          <Tabs defaultValue="link" value={sharingMode} onValueChange={(v) => setSharingMode(v as 'link' | 'users')}>
            <TabsList className="mb-4">
              <TabsTrigger value="link" disabled={!isPublic}>
                <LinkIcon className="h-4 w-4 mr-2" />
                Shareable Link
              </TabsTrigger>
              <TabsTrigger value="users">
                <Users className="h-4 w-4 mr-2" />
                Share with Users
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="link">
              {isPublic ? (
                <div className="flex items-center space-x-2">
                  <Input
                    value={shareableLink}
                    readOnly
                    className="flex-1"
                  />
                  <Button onClick={() => { void handleCopyLink(); }} type="button">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
              ) : (
                <div className="p-4 bg-muted rounded-md">
                  <p className="text-center text-muted-foreground">
                    Enable "Public Session" to generate a shareable link
                  </p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="users">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="username">Username</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <Input
                      id="username"
                      placeholder="Enter username to share with"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isProcessing}
                    />
                    <Button 
                      onClick={() => { void handleShareWithUser(); }} 
                      disabled={isProcessing || !username.trim()}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Share
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    The user will be able to view and save this session to their account
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <Button variant="outline" asChild>
            <Link to="/sessions">Cancel</Link>
          </Button>
          <Button asChild>
            <Link to={`/session/play/${session.id}`}>Play Session</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}