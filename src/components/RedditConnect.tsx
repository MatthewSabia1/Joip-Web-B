import { useRedditAuth } from '@/contexts/RedditAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { RefreshCw, ExternalLink, LogIn, LogOut, CheckSquare, LockIcon } from 'lucide-react';

interface RedditConnectProps {
  className?: string;
}

export function RedditConnect({ className }: RedditConnectProps) {
  const { authState, connectReddit, disconnectReddit, isLoading } = useRedditAuth();
  
  // Handle the Reddit connection flow
  const handleConnectReddit = () => {
    connectReddit();
  };

  // Handle the disconnection flow
  const handleDisconnectReddit = async () => {
    try {
      await disconnectReddit();
    } catch (error) {
      console.error('Error disconnecting from Reddit:', error);
      toast.error('Error disconnecting from Reddit');
    }
  };
  
  // Calculate time until token expiration
  const getExpirationTime = () => {
    if (!authState.expiresAt) return 'Unknown';
    
    const timeLeft = authState.expiresAt - Date.now();
    if (timeLeft <= 0) return 'Expired';
    
    const minutes = Math.floor(timeLeft / 60000);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };
  
  return (
    <Card className={`h-full flex flex-col overflow-hidden border backdrop-blur-sm ${className}`}>
      <CardHeader className={`${authState.isAuthenticated ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 dark:from-green-900/20 dark:to-emerald-900/20' : 'bg-muted/30'} pb-3 flex-shrink-0`}>
        <div className="flex justify-between items-center">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <img src="/reddit-logo.svg" alt="Reddit" className="w-5 h-5" />
            Reddit Connection
          </CardTitle>
        </div>
        <CardDescription>
          {authState.isAuthenticated 
            ? 'Your Reddit account is connected' 
            : 'Connect your Reddit account to view content'}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-4 flex-1 overflow-y-auto">
        
        {authState.isAuthenticated ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-grow">
                <h4 className="font-medium text-base flex items-center gap-2">
                  <LockIcon className="h-4 w-4 text-green-500" />
                  Authenticated with Reddit
                </h4>
                <p className="text-sm text-muted-foreground">
                  Token expires in: {getExpirationTime()}
                </p>
              </div>
            </div>
            
            <div className="pt-1">
              <h4 className="text-sm font-medium mb-2">Available Permissions</h4>
              <ul className="space-y-2">
                {authState.scope?.split(' ').map(scope => (
                  <li key={scope} className="flex items-center text-sm">
                    <CheckSquare className="h-4 w-4 mr-2 text-primary/70" />
                    {scope}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Reddit account to browse content from your favorite subreddits.
            </p>
            
            <div className="pt-1">
              <h4 className="text-sm font-medium mb-2">Benefits of connecting</h4>
              <ul className="space-y-2">
                <li className="flex items-center text-sm">
                  <CheckSquare className="h-4 w-4 mr-2 text-primary/70" />
                  Access content from private subreddits you subscribe to
                </li>
                <li className="flex items-center text-sm">
                  <CheckSquare className="h-4 w-4 mr-2 text-primary/70" />
                  No CORS or API limitations
                </li>
                <li className="flex items-center text-sm">
                  <CheckSquare className="h-4 w-4 mr-2 text-primary/70" />
                  Better reliability for content loading
                </li>
                <li className="flex items-center text-sm">
                  <CheckSquare className="h-4 w-4 mr-2 text-primary/70" />
                  Access to NSFW content if enabled in your Reddit settings
                </li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
      
      <Separator className="flex-shrink-0" />
      
      <CardFooter className="py-3 flex-shrink-0">
        {authState.isAuthenticated ? (
          <div className="flex w-full space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              asChild
              className="flex-1 shadow-sm hover:bg-muted/20"
            >
              <a href="https://www.reddit.com" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Visit Reddit
              </a>
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => { void handleDisconnectReddit(); }}
              disabled={isLoading}
              className="flex-1 shadow-sm"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4 mr-2" />
                  Disconnect
                </>
              )}
            </Button>
          </div>
        ) : (
          <Button 
            variant="default" 
            onClick={() => { void handleConnectReddit(); }}
            disabled={isLoading}
            className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90 text-white shadow-md transition-all"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4 mr-2" />
                Connect Reddit Account
              </>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}