import { useState, useEffect } from 'react';
import { useJoiSessions } from '@/hooks/useJoiSessions';
import { JoiSession, TransitionEffect } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SessionThumbnailUpload } from '@/components/SessionThumbnailUpload';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { TRANSITION_EFFECTS, DEFAULT_SYSTEM_PROMPT } from '@/lib/constants';
import { parseSubreddits } from '@/lib/utils/subreddit-parser';
import { SaveIcon, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface SessionFormProps {
  sessionId?: string;
  defaultValues?: Partial<JoiSession>;
  isEditing?: boolean;
}

export function SessionForm({
  sessionId,
  defaultValues,
  isEditing = false,
}: SessionFormProps) {
  const navigate = useNavigate();
  const {
    createSession,
    updateSession,
    sessions,
    loading: sessionsLoading,
  } = useJoiSessions();

  // Initialize form state
  const [formData, setFormData] = useState<Partial<JoiSession>>({
    title: defaultValues?.title || 'New Session',
    subreddits: defaultValues?.subreddits || [],
    system_prompt: defaultValues?.system_prompt || DEFAULT_SYSTEM_PROMPT,
    interval: defaultValues?.interval || 10,
    transition: defaultValues?.transition || 'fade',
    is_favorite: defaultValues?.is_favorite || false,
    is_public: defaultValues?.is_public || false,
    thumbnail_url: defaultValues?.thumbnail_url || undefined,
    // TTS feature removed for now
  });

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [subredditsInput, setSubredditsInput] = useState(
    formData.subreddits?.join(', ') || ''
  );
  const [formErrors, setFormErrors] = useState({
    title: '',
    subreddits: '',
    systemPrompt: ''
  });
  // Track if there are unsaved changes to warn user before navigation
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  

  // Load session data if editing
  useEffect(() => {
    if (isEditing && sessionId && sessions.length > 0) {
      const sessionToEdit = sessions.find(s => s.id === sessionId);
      if (sessionToEdit) {
        setFormData({
          title: sessionToEdit.title,
          subreddits: sessionToEdit.subreddits,
          system_prompt: sessionToEdit.system_prompt,
          interval: sessionToEdit.interval,
          transition: sessionToEdit.transition,
          is_favorite: sessionToEdit.is_favorite,
          is_public: sessionToEdit.is_public,
          thumbnail_url: sessionToEdit.thumbnail_url,
        });
        setSubredditsInput(sessionToEdit.subreddits.join(', '));
        // Reset unsaved changes flag after loading data
        setHasUnsavedChanges(false);
      }
    }
  }, [isEditing, sessionId, sessions]);
  
  // Warn user before leaving if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Standard way to show a browser warning
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Update form handlers
  const handleChange = (
    field: keyof JoiSession,
    value: string | number | boolean | string[]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
    
    // Clear error for the field being edited
    if (field === 'title' || field === 'subreddits' || field === 'system_prompt') {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate form field on blur
  const validateField = (field: 'title' | 'subreddits' | 'systemPrompt', value: any) => {
    let error = '';
    
    switch (field) {
      case 'title':
        if (!value || typeof value !== 'string' || value.trim() === '') {
          error = 'Session title is required';
        } else if (value.length > 100) {
          error = 'Title must be less than 100 characters';
        }
        break;
      case 'subreddits':
        if (!Array.isArray(value) || value.length === 0) {
          error = 'At least one subreddit is required';
        }
        break;
      case 'systemPrompt':
        if (!value || typeof value !== 'string' || value.trim() === '') {
          error = 'System prompt is required';
        } else if (value.length > 2000) {
          error = 'System prompt must be less than 2000 characters';
        }
        break;
    }
    
    setFormErrors(prev => ({ ...prev, [field]: error }));
    return error === '';
  };

  const handleSubredditsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const inputValue = e.target.value;
    setSubredditsInput(inputValue);
    setHasUnsavedChanges(true);
    
    try {
      const parsedSubreddits = parseSubreddits(inputValue);
      if (parsedSubreddits.length === 0) {
        setFormErrors(prev => ({ ...prev, subreddits: 'No valid subreddits detected.' }));
      } else {
        setFormErrors(prev => ({ ...prev, subreddits: '' }));
        handleChange('subreddits', parsedSubreddits);
      }
    } catch (error) {
      setFormErrors(prev => ({ 
        ...prev, 
        subreddits: 'Failed to parse subreddits. Please check your input.' 
      }));
    }
  };

  const handleIntervalChange = (values: number[]) => {
    const newInterval = values[0];
    handleChange('interval', newInterval);
  };

  const handleTransitionChange = (value: TransitionEffect) => {
    handleChange('transition', value);
  };

  const handleThumbnailUpload = (url: string) => {
    handleChange('thumbnail_url', url);
  };

  const handleThumbnailRemove = () => {
    handleChange('thumbnail_url', '');
  };

  const validateForm = () => {
    // Validate all fields
    const titleValid = validateField('title', formData.title);
    const subredditsValid = validateField('subreddits', formData.subreddits);
    const systemPromptValid = validateField('systemPrompt', formData.system_prompt);
    
    return titleValid && subredditsValid && systemPromptValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Comprehensive validation
    if (!validateForm()) {
      // Scroll to the first error
      const errorField = document.querySelector('.form-error');
      if (errorField) {
        errorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      toast.error('Please fix the form errors before submitting');
      return;
    }
    
    // Add network connectivity check
    if (!navigator.onLine) {
      toast.error('You appear to be offline. Please check your internet connection and try again.');
      return;
    }
    
    // Set timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setSubmitting(false);
      toast.error('Operation timed out. Please try again.');
      console.error('Session operation timed out');
    }, 15000); // 15 second timeout
    
    setSubmitting(true);
    
    try {
      console.log(`Starting session ${isEditing ? 'update' : 'creation'}...`);
      
      // Clone and clean the form data
      const cleanedData = {
        title: formData.title?.trim(),
        subreddits: [...(formData.subreddits || [])],
        system_prompt: formData.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT,
        interval: formData.interval || 10,
        transition: formData.transition || 'fade',
        is_favorite: !!formData.is_favorite,
        is_public: !!formData.is_public,
        thumbnail_url: formData.thumbnail_url || ''
      };
      
      // Session operation with automatic retry
      const performOperation = async (attempt = 1): Promise<JoiSession | null> => {
        try {
          if (isEditing && sessionId) {
            console.log(`Updating session (attempt ${attempt})...`);
            return await updateSession(sessionId, cleanedData);
          } else {
            console.log(`Creating session (attempt ${attempt})...`);
            return await createSession(cleanedData);
          }
        } catch (err) {
          // Only retry network errors, not validation errors
          if (attempt < 3 && err instanceof Error && 
              (err.message.includes('network') || err.message.includes('timeout'))) {
            console.log(`Retrying operation (attempt ${attempt + 1})...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
            return performOperation(attempt + 1);
          }
          throw err;
        }
      };
      
      const result = await performOperation();
      
      if (result) {
        clearTimeout(timeoutId); // Clear timeout as operation succeeded
        setHasUnsavedChanges(false);
        toast.success(`Session ${isEditing ? 'updated' : 'created'} successfully`);
        
        // Navigate back to sessions page
        navigate('/sessions', { replace: true });
      } else {
        throw new Error(`Failed to ${isEditing ? 'update' : 'create'} session - no data returned`);
      }
    } catch (error) {
      clearTimeout(timeoutId); // Clear timeout as operation errored
      console.error('Error saving session:', error);
      
      // More specific error message
      if (error instanceof Error) {
        if (error.message.includes('duplicate')) {
          toast.error('A session with this title already exists. Please choose a different title.');
        } else if (error.message.includes('permission') || error.message.includes('not the owner')) {
          toast.error('You don\'t have permission to edit this session.');
        } else if (error.message.includes('network') || error.message.includes('offline')) {
          toast.error('Network error. Please check your connection and try again.');
        } else {
          toast.error(`Session ${isEditing ? 'update' : 'creation'} failed: ${error.message}`);
        }
      } else {
        toast.error(`Failed to ${isEditing ? 'update' : 'create'} session. Please try again.`);
      }
      
      // Don't force navigation - let the user stay on the form to fix issues
    } finally {
      setSubmitting(false);
    }
  };

  if (isEditing && sessionsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="border bg-card">
        <CardHeader className="pb-4">
          <CardTitle>{isEditing ? 'Edit Session' : 'Create New Session'}</CardTitle>
          <CardDescription>
            {isEditing 
              ? 'Update your JOIP Session settings' 
              : 'Configure a new JOIP Session'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-base">Session Title</Label>
            <Input
              id="title"
              placeholder="Enter a name for this session"
              value={formData.title || ''}
              onChange={(e) => handleChange('title', e.target.value)}
              onBlur={() => validateField('title', formData.title)}
              className={`bg-background/50 focus:bg-background transition-colors ${
                formErrors.title ? 'border-destructive' : ''
              }`}
            />
            {formErrors.title && (
              <p className="text-sm text-destructive form-error">{formErrors.title}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label className="text-base">Session Thumbnail</Label>
            <SessionThumbnailUpload
              thumbnailUrl={formData.thumbnail_url}
              onUpload={handleThumbnailUpload}
              onRemove={handleThumbnailRemove}
              sessionId={sessionId}
            />
            <p className="text-sm text-muted-foreground">
              Upload a custom thumbnail for your session or leave empty to use an image from your selected subreddits.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="subreddits" className="text-base">Subreddits</Label>
            <Textarea
              id="subreddits"
              placeholder="Enter subreddit names (e.g., pics, EarthPorn, aww)"
              value={subredditsInput}
              onChange={handleSubredditsChange}
              onBlur={() => validateField('subreddits', formData.subreddits)}
              className={`min-h-[80px] resize-none bg-background/50 focus:bg-background transition-colors ${
                formErrors.subreddits ? 'border-destructive' : ''
              }`}
            />
            {formErrors.subreddits && (
              <p className="text-sm text-destructive form-error">{formErrors.subreddits}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Comma-separated subreddit names. Can also include r/subreddit or full URLs.
            </p>
          </div>
          
          <div className="space-y-4 pt-1">
            <div className="flex justify-between items-center">
              <Label htmlFor="interval" className="text-base">JOIP Interval</Label>
              <span className="text-sm font-medium bg-primary/10 text-primary px-2 py-1 rounded-md">
                {formData.interval} seconds
              </span>
            </div>
            <Slider
              id="interval"
              min={3}
              max={30}
              step={1}
              value={[formData.interval || 10]}
              onValueChange={handleIntervalChange}
              className="py-2"
            />
          </div>
          
          <div className="space-y-2 pt-1">
            <Label htmlFor="transition" className="text-base">Transition Effect</Label>
            <Select
              value={formData.transition as string}
              onValueChange={handleTransitionChange as (value: string) => void}
            >
              <SelectTrigger className="bg-background/50 focus:bg-background transition-colors">
                <SelectValue placeholder="Select a transition effect" />
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
          
          <div className="space-y-2 pt-2">
            <Label htmlFor="systemPrompt" className="text-base">AI Caption Prompt</Label>
            <Textarea
              id="systemPrompt"
              placeholder="Enter system prompt for the AI..."
              value={formData.system_prompt || ''}
              onChange={(e) => handleChange('system_prompt', e.target.value)}
              onBlur={() => validateField('systemPrompt', formData.system_prompt)}
              className={`min-h-[100px] bg-background/50 focus:bg-background transition-colors ${
                formErrors.systemPrompt ? 'border-destructive' : ''
              }`}
            />
            {formErrors.systemPrompt && (
              <p className="text-sm text-destructive form-error">{formErrors.systemPrompt}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Instructions for how the AI should generate captions for each image.
            </p>
          </div>
          
          <div className="border-t border-b py-4 my-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="tts-enabled" className="text-base cursor-pointer flex items-center gap-2">
                  Text-to-Speech
                  <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">
                    Coming Soon
                  </span>
                </Label>
                <p className="text-sm text-muted-foreground">
                  Have captions read aloud during the session (feature will be available soon)
                </p>
              </div>
              <Switch
                id="tts-enabled"
                checked={false}
                disabled={true}
              />
            </div>
          </div>

          <div className="space-y-5 pt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="favorite" className="text-base cursor-pointer">
                  Add to Favorites
                </Label>
                <p className="text-sm text-muted-foreground">
                  Mark this session as a favorite for quick access
                </p>
              </div>
              <Switch
                id="favorite"
                checked={formData.is_favorite || false}
                onCheckedChange={(checked) => handleChange('is_favorite', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="public" className="text-base cursor-pointer">
                  Make Public
                </Label>
                <p className="text-sm text-muted-foreground">
                  Allow sharing this session with others
                </p>
              </div>
              <Switch
                id="public"
                checked={formData.is_public || false}
                onCheckedChange={(checked) => handleChange('is_public', checked)}
              />
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="pt-2">
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button
              type="button"
              variant="outline"
              className="sm:flex-1"
              onClick={() => {
                if (hasUnsavedChanges) {
                  if (window.confirm('You have unsaved changes. Are you sure you want to cancel?')) {
                    navigate('/sessions');
                  }
                } else {
                  navigate('/sessions');
                }
              }}
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              className="sm:flex-1"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <SaveIcon className="h-4 w-4 mr-2" />
                  {isEditing ? 'Update Session' : 'Create Session'}
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}