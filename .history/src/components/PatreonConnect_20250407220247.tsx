import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePatreonAuth } from '@/contexts/PatreonAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { BadgeCheck, DollarSign, RefreshCw, ExternalLink, Heart } from 'lucide-react';

interface PatreonConnectProps {
  className?: string;
}

export function PatreonConnect({ className }: PatreonConnectProps) {
  const { user, profile } = useAuth();
  const { isConnecting, connectPatreon, refreshStatus } = usePatreonAuth();
  
  // Define a tier title and description based on the patron tier
  const getTierInfo = () => {
    if (!profile?.patron_tier) return { title: 'Free', description: 'Basic features', icon: null };
    
    switch (profile.patron_tier) {
      case 'basic':
        return {
          title: 'Basic Patron',
          description: 'Access to premium subreddits and extended slideshow times',
          icon: <Heart className="h-5 w-5 text-pink-500" />
        };
      case 'premium':
        return {
          title: 'Premium Patron',
          description: 'All features unlocked, including unlimited media sources and AI caption customization',
          icon: <BadgeCheck className="h-5 w-5 text-indigo-500" />
        };
      default:
        return {
          title: 'Patron',
          description: 'Thank you for your support!',
          icon: <Heart className="h-5 w-5 text-pink-500" />
        };
    }
  };
  
  const tierInfo = getTierInfo();
  
  // Get color based on tier
  const getTierColor = () => {
    if (!profile?.patron_tier) return 'bg-muted/30';
    
    switch (profile.patron_tier) {
      case 'basic':
        return 'bg-gradient-to-r from-pink-500/10 to-red-500/10 dark:from-pink-800/20 dark:to-red-700/20';
      case 'premium':
        return 'bg-gradient-to-r from-purple-500/10 to-indigo-500/10 dark:from-purple-800/20 dark:to-indigo-700/20';
      default:
        return 'bg-muted/30';
    }
  };
  
  return (
    <Card className={`h-full flex flex-col overflow-hidden border ${className}`}>
      <CardHeader className={`${getTierColor()} pb-3 flex-shrink-0`}>
        <div className="flex justify-between items-center">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            {tierInfo.icon}
            {tierInfo.title}
          </CardTitle>
          {profile?.is_patron && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={refreshStatus}
              className="h-8 px-2 hover:bg-background/50"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              <span className="text-xs">Refresh</span>
            </Button>
          )}
        </div>
        <CardDescription>
          {tierInfo.description}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-4 flex-1 overflow-y-auto">
        {profile?.is_patron ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <img 
                  src={profile.patreon_image_url || profile.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'} 
                  alt={profile.patreon_full_name || profile.username || 'Patron'} 
                  className="w-12 h-12 rounded-full bg-muted"
                />
              </div>
              <div className="flex-grow">
                <h4 className="font-medium text-base">
                  {profile.patreon_full_name || profile.username}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {profile.patron_since ? `Patron since ${new Date(profile.patron_since).toLocaleDateString()}` : 'Thank you for your support!'}
                </p>
              </div>
            </div>
            
            <div className="pt-1">
              <h4 className="text-sm font-medium mb-2">Premium Features</h4>
              <ul className="space-y-2">
                <li className="flex items-center text-sm">
                  <BadgeCheck className="h-4 w-4 mr-2 text-primary/70" />
                  Access to premium subreddits
                </li>
                <li className="flex items-center text-sm">
                  <BadgeCheck className="h-4 w-4 mr-2 text-primary/70" />
                  Extended slideshow durations
                </li>
                {profile.patron_tier === 'premium' && (
                  <>
                    <li className="flex items-center text-sm">
                      <BadgeCheck className="h-4 w-4 mr-2 text-primary/70" />
                      Custom AI model selection
                    </li>
                    <li className="flex items-center text-sm">
                      <BadgeCheck className="h-4 w-4 mr-2 text-primary/70" />
                      Unlimited media sources
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Support Joip AI and unlock premium features by becoming a patron.
            </p>
            
            <div className="pt-1">
              <h4 className="text-sm font-medium mb-2">Premium Features</h4>
              <ul className="space-y-2 opacity-60">
                <li className="flex items-center text-sm">
                  <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
                  Access to premium subreddits
                </li>
                <li className="flex items-center text-sm">
                  <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
                  Extended slideshow durations
                </li>
                <li className="flex items-center text-sm">
                  <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
                  Custom AI model selection
                </li>
                <li className="flex items-center text-sm">
                  <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
                  Unlimited media sources
                </li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
      
      <Separator className="flex-shrink-0" />
      
      <CardFooter className="py-3 flex-shrink-0">
        {profile?.is_patron ? (
          <Button 
            variant="outline" 
            size="sm" 
            asChild
            className="w-full shadow-sm hover:bg-muted/20"
          >
            <a href="https://www.patreon.com" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Visit Patreon
            </a>
          </Button>
        ) : (
          <Button 
            variant="default" 
            onClick={connectPatreon} 
            disabled={isConnecting}
            className="w-full bg-[#F96854] hover:bg-[#F96854]/90 text-white shadow-md transition-colors"
          >
            {isConnecting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Heart className="h-4 w-4 mr-2" />
                Connect Patreon
              </>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}