import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ImageIcon, Loader2, Upload } from 'lucide-react';

export function ProfileImageUpload() {
  const { profile, uploadAvatar } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    
    try {
      setLoading(true);
      
      const file = acceptedFiles[0];
      
      // Check file type and size
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file');
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('File size should be less than 5MB');
        return;
      }
      
      await uploadAvatar(file);
      toast.success('Profile image updated successfully');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setLoading(false);
    }
  }, [uploadAvatar]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif'],
    },
    maxFiles: 1,
    disabled: loading,
  });
  
  const initials = profile?.username 
    ? profile.username.substring(0, 2).toUpperCase() 
    : '??';
  
  return (
    <div className="flex flex-col items-center space-y-5">
      <Avatar className="w-28 h-28 border-2 border-primary/10 shadow-md">
        <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.username || ''} />
        <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      
      <div {...getRootProps()} className="w-full max-w-xs">
        <input {...getInputProps()} />
        <Button 
          type="button" 
          variant="outline" 
          size="lg"
          className="w-full h-auto py-3 border-dashed border-2 bg-muted/30 hover:bg-muted/50 transition-colors shadow-sm"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span>Uploading...</span>
            </>
          ) : isDragActive ? (
            <>
              <Upload className="mr-2 h-5 w-5 text-primary" />
              <span>Drop image here</span>
            </>
          ) : (
            <>
              <ImageIcon className="mr-2 h-5 w-5 text-primary" />
              <span>Upload profile image</span>
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Supports JPG, PNG and GIF. Max size 5MB.
      </p>
    </div>
  );
}