import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserAvatar } from '@/components/UserAvatar';
import { ArrowLeft, RefreshCw } from 'lucide-react';

interface AdminHeaderProps {
  theme: string;
  onRefresh: () => void;
  logoLight: string;
  logoDark: string;
}

export function AdminHeader({ theme, onRefresh, logoLight, logoDark }: AdminHeaderProps) {
  return (
    <header className="flex items-center justify-between p-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="mr-2">
          <Link to="/">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back to Home</span>
          </Link>
        </Button>
        <img
          src={theme === 'dark' ? logoDark : logoLight}
          alt="Joip AI"
          className="h-auto w-auto max-h-9 object-contain"
        />
        <h1 className="text-xl font-bold hidden sm:block">Admin Dashboard</h1>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onRefresh} className="flex items-center gap-1">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <ThemeToggle />
        <UserAvatar />
      </div>
    </header>
  );
} 