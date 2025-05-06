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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Save, ArrowLeft, Plus, X } from 'lucide-react';
import { JoiSession, TransitionEffect } from '@/types';
import { TRANSITION_EFFECTS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import React from 'react';

export function SessionSavePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth(); // Auth context needed for protected route
  const { sessions, loading, error, getSessionById, createSession } = useJoiSessions();
  
  const [originalSession, setOriginalSession] = useState<JoiSession | null>(null);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [newSubreddit, setNewSubreddit] = useState<string>('');
  const [interval, setInterval] = useState<number>(10);
  const [transition, setTransition] = useState<TransitionEffect>('fade');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDirectFetching, setIsDirectFetching] = useState<boolean>(false);
  const [notFound, setNotFound] = useState<boolean>(false);
  
  // Flag to prevent multiple notFound state updates
  const hasSetNotFoundRef = React.useRef(false);
  
  // Direct session fetch function to get session data directly from database
  const fetchSessionDirectly = useCallback(async (sessionId: string) => {
    if (!sessionId) return null;
    
    console.log(`Attempting direct session fetch for save page, ID: ${sessionId}`);
    try {
      setIsDirectFetching(true);
      
      // Try to fetch the session directly from the database - for public sessions
      const { data: publicSession, error: publicError } = await supabase
        .from('joi_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('is_public', true)
        .maybeSingle();
      
      if (publicError) {
        console.error('Error fetching public session directly:', publicError);
        return null;
      }
      
      if (publicSession) {
        console.log('Successfully fetched public session directly:', publicSession.title);
        return publicSession;
      }
      
      // If user is logged in, check their own sessions
      if (user) {
        // Try user's own sessions
        const { data: ownSession, error: ownError } = await supabase
          .from('joi_sessions')
          .select('*')
          .eq('id', sessionId)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (ownError) {
          console.error('Error fetching own session directly:', ownError);
          return null;
        }
        
        if (ownSession) {
          console.log('Successfully fetched own session directly:', ownSession.title);
          return ownSession;
        }
        
        // Try shared sessions
        const { data: sharedData, error: sharedError } = await supabase
          .from('shared_sessions')
          .select(`
            id,
            session:joi_sessions(*)
          `)
          .eq('shared_with_id', user.id)
          .eq('session_id', sessionId)
          .maybeSingle();
        
        if (sharedError) {
          console.error('Error fetching shared session directly:', sharedError);
          return null;
        }
        
        if (sharedData?.session) {
          const sessionData = Array.isArray(sharedData.session) 
            ? sharedData.session[0] 
            : sharedData.session;
          
          if (sessionData && typeof sessionData === 'object') {
            console.log('Successfully fetched shared session directly:', sessionData.title);
            return sessionData;
          }
        }
      }
      
      return null;
    } catch (err) {
      console.error('Error in direct session fetch for save page:', err);
      return null;
    } finally {
      setIsDirectFetching(false);
    }
  }, [user]);

  // Handle notFound redirect via a dedicated useEffect
  useEffect(() => {
    if (notFound) {
      console.log("Setting up redirect timer because session not found in save page");
      
      const redirectTimer = setTimeout(() => {
        toast.error('Session not found');
        navigate('/sessions', { replace: true });
      }, 500);
      
      return () => {
        console.log("Cleaning up redirect timer in save page");
        clearTimeout(redirectTimer);
      };
    }
  }, [notFound, navigate]);

  useEffect(() => {
    if (!id) return;
    
    // Skip if we've already found the session or determined it doesn't exist
    if (originalSession || hasSetNotFoundRef.current) return;
    
    // FIRST APPROACH: Check the useJoiSessions hook's sessions array
    const checkSessionsArray = () => {
      // Wait for sessions to load
      if (loading) {
        console.log('Sessions still loading in save page, waiting...');
        return false;
      }

      if (sessions.length > 0) {
        const foundSession = getSessionById(id);
        if (foundSession) {
          console.log('Session found for saving:', foundSession.id);
          setOriginalSession(foundSession);
          
          // Prefill the form with the session data but with a new title
          setTitle(`${foundSession.title} (Copy)`);
          setDescription(foundSession.description || '');
          setSubreddits([...foundSession.subreddits]);
          setInterval(foundSession.interval);
          setTransition(foundSession.transition);
          setSystemPrompt(foundSession.system_prompt || '');
          
          return true;
        } else {
          console.log('Session not found in sessions array for saving');
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
      console.log('Session not found in array for saving, trying direct fetch...');
      
      // SECOND APPROACH: Fetch directly from Supabase as a fallback
      fetchSessionDirectly(id).then(directFetchedSession => {
        if (directFetchedSession) {
          console.log('Session found via direct fetch for saving');
          setOriginalSession(directFetchedSession);
          
          // Prefill the form with the session data but with a new title
          setTitle(`${directFetchedSession.title} (Copy)`);
          setDescription(directFetchedSession.description || '');
          setSubreddits([...directFetchedSession.subreddits]);
          setInterval(directFetchedSession.interval);
          setTransition(directFetchedSession.transition);
          setSystemPrompt(directFetchedSession.system_prompt || '');
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
                setOriginalSession(finalAttempt);
                // Prefill the form with the session data
                setTitle(`${finalAttempt.title} (Copy)`);
                setDescription(finalAttempt.description || '');
                setSubreddits([...finalAttempt.subreddits]);
                setInterval(finalAttempt.interval);
                setTransition(finalAttempt.transition);
                setSystemPrompt(finalAttempt.system_prompt || '');
              } else if (!hasSetNotFoundRef.current) {
                console.log('Session still not found after all attempts for saving - setting notFound to true');
                hasSetNotFoundRef.current = true;
                setNotFound(true);
              }
            }
          }, 2000);
        }
      });
    }
  }, [id, sessions, loading, isDirectFetching, originalSession, getSessionById, fetchSessionDirectly]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Comprehensive validation
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    
    if (title.trim().length < 3) {
      toast.error('Title should be at least 3 characters long');
      return;
    }
    
    if (subreddits.length === 0) {
      toast.error('Please add at least one subreddit');
      return;
    }
    
    if (interval < 5 || interval > 60) {
      toast.error('Interval must be between 5 and 60 seconds');
      return;
    }
    
    setIsProcessing(true);
    try {
      const newSession = {
        title: title.trim(),
        description: description.trim(),
        subreddits,
        interval,
        transition,
        system_prompt: systemPrompt.trim(),
        is_public: false,
        is_favorite: false,
      };
      
      const savedSession = await createSession(newSession);
      
      if (!savedSession) {
        throw new Error('Failed to create session');
      }
      
      toast.success('Session saved successfully');
      navigate(`/session/play/${savedSession.id}`);
    } catch (error) {
      toast.error(`Failed to save session: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddSubreddit = () => {
    if (!newSubreddit.trim()) return;
    
    const formattedSubreddit = newSubreddit.trim().replace(/^r\//, '');
    if (!subreddits.includes(formattedSubreddit)) {
      setSubreddits([...subreddits, formattedSubreddit]);
    }
    setNewSubreddit('');
  };

  const handleRemoveSubreddit = (subreddit: string) => {
    setSubreddits(subreddits.filter(s => s !== subreddit));
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

  if (!originalSession) {
    return (
      <div className="container max-w-4xl mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle>Session Not Found</CardTitle>
            <CardDescription>
              The session you're trying to save doesn't exist or you don't have access to it.
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
            <Save className="h-5 w-5 mr-2" />
            Save Session
          </CardTitle>
          <CardDescription>
            Save a copy of "{originalSession.title}" to your account
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={onSubmit} className="space-y-6">
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter session title"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter a description for this session"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Subreddits</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {subreddits.map((subreddit) => (
                  <Badge key={subreddit} variant="secondary" className="flex items-center gap-1">
                    r/{subreddit}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => handleRemoveSubreddit(subreddit)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add subreddit (e.g. pics)"
                  value={newSubreddit}
                  onChange={(e) => setNewSubreddit(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSubreddit()}
                />
                <Button type="button" onClick={handleAddSubreddit}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interval">Interval (seconds)</Label>
                <Input
                  id="interval"
                  type="number"
                  min={5}
                  max={60}
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transition">Transition Effect</Label>
                <Select
                  value={transition}
                  onValueChange={(value) => setTransition(value as TransitionEffect)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select transition" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSITION_EFFECTS.map((effect) => (
                      <SelectItem key={effect.value} value={effect.value}>
                        {effect.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="systemPrompt">AI System Prompt</Label>
              <Textarea
                id="systemPrompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter instructions for the AI caption generator"
                rows={5}
              />
              <p className="text-sm text-muted-foreground">
                This prompt guides how the AI will generate captions for the media in this session.
              </p>
            </div>
          </CardContent>
          
          <CardFooter className="flex justify-between">
            <Button variant="outline" asChild>
              <Link to="/sessions">Cancel</Link>
            </Button>
            <Button 
              type="submit" 
              disabled={isProcessing || !title.trim() || subreddits.length === 0}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Session
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}