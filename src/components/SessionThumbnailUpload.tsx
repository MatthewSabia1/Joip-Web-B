import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/lib/supabase'; 
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';

interface SessionThumbnailUploadProps {
  thumbnailUrl: string | undefined;
  onUpload: (url: string) => void;
  onRemove: () => void;
  sessionId?: string;
}

export function SessionThumbnailUpload({ 
  thumbnailUrl, 
  onUpload, 
  onRemove,
  sessionId 
}: SessionThumbnailUploadProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const uploadThumbnail = async (file: File): Promise<string> => {
    if (!user) throw new Error('No user logged in');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${sessionId || 'new'}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/session-thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('session-thumbnails')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('session-thumbnails')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      throw error;
    }
  };
  
  const onDrop = useCallback((acceptedFiles: File[]): void => {
    void (async () => {
      if (!acceptedFiles.length) return;
      try {
        setLoading(true);

        const file = acceptedFiles[0];

        // Check file type and size
        if (!file.type.startsWith('image/')) {
          toast.error('Please upload an image file');
          return;
        }

        if (file.size > 5 * 1024 * 1024) {
          // 5MB limit
          toast.error('File size should be less than 5MB');
          return;
        }

        const url = await uploadThumbnail(file);
        onUpload(url);
        toast.success('Thumbnail uploaded successfully');
      } catch (error) {
        console.error('Error uploading image:', error);
        toast.error('Failed to upload image');
      } finally {
        setLoading(false);
      }
    })();
  }, [onUpload]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
    },
    maxFiles: 1,
    disabled: loading,
  });
  
  const handleRemoveThumbnail = () => {
    onRemove();
  };
  
  return (
    <div className="flex flex-col space-y-3">
      {thumbnailUrl ? (
        <div className="relative w-full rounded-md overflow-hidden border">
          <AspectRatio ratio={16/9}>
            <img 
              src={thumbnailUrl} 
              alt="Session thumbnail" 
              className="w-full h-full object-cover"
            />
          </AspectRatio>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8 rounded-full opacity-90"
            onClick={handleRemoveThumbnail}
            title="Remove thumbnail"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div {...getRootProps()} className="w-full">
          <input {...getInputProps()} />
          <div className="border-dashed border-2 rounded-md p-4 text-center hover:bg-muted/30 transition-colors cursor-pointer">
            <div className="flex flex-col items-center justify-center space-y-2 py-4">
              {loading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </>
              ) : isDragActive ? (
                <>
                  <Upload className="h-8 w-8 text-primary" />
                  <p className="text-sm">Drop thumbnail image here</p>
                </>
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Upload thumbnail image</p>
                  <p className="text-xs text-muted-foreground">
                    Drag & drop or click to select
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground text-center">
        Supports JPG, PNG, GIF and WebP. Max size 5MB.
      </p>
    </div>
  );
} 