import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { UserProfile } from '@/types';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ProfileImageUpload } from './ProfileImageUpload';
import { PatreonConnect } from '@/components/PatreonConnect';
import { SaveIcon } from 'lucide-react';

const formSchema = z.object({
  display_name: z.string().min(3, 'Display name must be at least 3 characters').max(30, 'Display name must be at most 30 characters'),
});

type FormValues = z.infer<typeof formSchema>;

export function ProfileForm() {
  const { profile, updateProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Get the most appropriate name to use as default value
  const defaultDisplayName = (profile as any)?.display_name || profile?.username || profile?.full_name || '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      display_name: defaultDisplayName,
    },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      await updateProfile({
        display_name: values.display_name,
        // Also update legacy fields for backward compatibility
        username: values.display_name,
        full_name: null,
      } as Partial<UserProfile>);
      
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Profile update error:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Profile Settings</h2>
        <p className="text-muted-foreground mb-4">
          Manage your personal information and account preferences
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-muted/20 p-4 rounded-xl">
            <ProfileImageUpload />
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-base">Display Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter your display name" 
                        {...field} 
                        className="bg-background/50 focus:bg-background transition-colors"
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-muted-foreground">
                      This is your public display name visible to other users.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button 
                type="submit" 
                className="w-full mt-6 py-5 text-base font-medium bg-primary hover:bg-primary/90 shadow-md flex items-center justify-center gap-2" 
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : (
                  <>
                    <SaveIcon className="h-5 w-5" />
                    Save Profile
                  </>
                )}
              </Button>
            </form>
          </Form>
        </div>
        
        <div className="space-y-6">
          <PatreonConnect className="h-full" />
        </div>
      </div>
    </div>
  );
}