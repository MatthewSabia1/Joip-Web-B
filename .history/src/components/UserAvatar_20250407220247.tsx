import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Settings, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export function UserAvatar() {
  const { user, profile, signOut } = useAuth();
  
  if (!user) {
    return null;
  }
  
  const initials = profile?.username 
    ? profile.username.substring(0, 2).toUpperCase() 
    : user.email?.substring(0, 2).toUpperCase() || '??';
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="h-9 w-9 cursor-pointer border-2 border-primary/10 hover:border-primary/30 transition-colors">
          <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.username || ''} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/" className="flex items-center">
            <Home className="mr-2 h-4 w-4" />
            <span>Slideshow</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}