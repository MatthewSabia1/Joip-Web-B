import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Heart } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function PatreonBadge() {
  const { profile } = useAuth();
  
  if (!profile?.is_patron) {
    return null;
  }
  
  const getTierInfo = () => {
    switch (profile.patron_tier) {
      case 'basic':
        return {
          label: 'Basic Patron',
          variant: 'default',
          className: 'bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-500 hover:to-red-500'
        };
      case 'premium':
        return {
          label: 'Premium Patron',
          variant: 'default',
          className: 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-500 hover:to-indigo-500'
        };
      default:
        return {
          label: 'Patron',
          variant: 'default',
          className: 'bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-500 hover:to-red-500'
        };
    }
  };
  
  const tierInfo = getTierInfo();
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="default"
            className={`${tierInfo.className} cursor-pointer`}
          >
            <Heart className="h-3 w-3 mr-1" />
            {tierInfo.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">Thank you for supporting this project!</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}