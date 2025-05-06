import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/hooks/useTheme';

// Import logo images properly
import logoLight from '../assets/Joip App Logo Light.png';
import logoDark from '../assets/Joip App Logo Dark.png';

export function RegisterPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  
  useEffect(() => {
    if (user && !loading) {
      console.log("RegisterPage: User already authenticated, redirecting to sessions");
      navigate('/sessions', { replace: true });
    }
  }, [user, loading, navigate]);
  
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Link to="/">
            <img 
              src={theme === 'dark' ? logoDark : logoLight} 
              alt="Joip AI" 
              className="h-auto w-auto max-h-10 object-contain"
            />
          </Link>
        </div>
        <ThemeToggle />
      </header>
      
      <main className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold">Create an account</h2>
            <p className="text-muted-foreground mt-2">
              Sign up to start using Joip AI
            </p>
          </div>
          
          <div className="bg-card p-6 rounded-lg border">
            <RegisterForm />
            
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <Button variant="link" asChild className="p-0">
                  <Link to="/login">Login</Link>
                </Button>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}