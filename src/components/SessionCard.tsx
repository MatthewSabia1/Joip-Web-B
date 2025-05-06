// Link is no longer needed since we're using direct navigation
// import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { JoiSession, SharedSession } from '@/types';
import { useJoiSessions } from '@/hooks/useJoiSessions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Star, StarOff, Share2, Trash2, PlayCircle, Copy, Pencil, ImageIcon } from 'lucide-react';
import { UserProfile } from '@/types';

interface SessionCardProps {
  session: JoiSession;
  isShared?: boolean;
  owner?: UserProfile;
  sharedId?: string;
  onDeleteClick?: (session: JoiSession) => void;
}

export function SessionCard({
  session,
  isShared = false,
  owner,
  sharedId,
  onDeleteClick,
}: SessionCardProps) {
  const navigate = useNavigate();
  const { toggleFavorite, saveSharedSession, removeSharedAccess } = useJoiSessions();

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isShared) {
      toggleFavorite(session.id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeleteClick) {
      onDeleteClick(session);
    }
  };

  const handleSaveShared = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isShared) {
      await saveSharedSession(session);
    }
  };

  const handleRemoveShared = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isShared && sharedId) {
      await removeSharedAccess(sharedId);
    }
  };

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      {session.thumbnail_url ? (
        <div className="w-full h-40 overflow-hidden">
          <AspectRatio ratio={16/9}>
            <img 
              src={session.thumbnail_url} 
              alt={`Thumbnail for ${session.title}`} 
              className="w-full h-full object-cover transition-transform hover:scale-105"
              loading="lazy"
            />
          </AspectRatio>
        </div>
      ) : (
        <div className="w-full h-40 bg-muted/40 flex items-center justify-center">
          <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="line-clamp-1">{session.title}</CardTitle>
          {isShared ? (
            <Badge variant="outline">Shared</Badge>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleFavorite}
              title={session.is_favorite ? "Remove from favorites" : "Add to favorites"}
            >
              {session.is_favorite ? (
                <Star className="h-5 w-5 fill-primary text-primary" />
              ) : (
                <StarOff className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
        <CardDescription>
          {isShared && owner ? (
            <>Shared by {(owner as any).display_name ?? owner.username ?? 'Unknown user'}</>
          ) : (
            <>Last updated {format(new Date(session.updated_at), 'MMM d, yyyy')}</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-3 flex-grow">
        <div className="flex flex-wrap gap-2 mb-3">
          {session.subreddits.slice(0, 3).map((subreddit) => (
            <Badge key={subreddit} variant="secondary">
              r/{subreddit}
            </Badge>
          ))}
          {session.subreddits.length > 3 && (
            <Badge variant="outline">
              +{session.subreddits.length - 3} more
            </Badge>
          )}
        </div>
        <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>Interval:</span>
            <span className="font-medium">{session.interval}s</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Transition:</span>
            <span className="font-medium">{session.transition}</span>
          </div>
        </div>
      </CardContent>
      <Separator />
      <CardFooter className="pt-3 flex justify-between">
        <Button 
          variant="default" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/session/play/${session.id}`);
          }}
        >
          <PlayCircle className="h-4 w-4 mr-2" />
          Play
        </Button>
        <div className="flex gap-2">
          {isShared ? (
            <>
              <Button
                variant="outline"
                size="icon"
                title="Save as my own"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveShared(e);
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Remove shared session"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemoveShared(e);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="icon" 
                title="Edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(`/session/edit/${session.id}`);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Share"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(`/session/share/${session.id}`);
                }}
              >
                <Share2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Delete"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

interface SharedSessionCardProps {
  sharedSession: SharedSession;
  onDeleteClick?: (sharedId: string) => void;
}

export function SharedSessionCard({ sharedSession, onDeleteClick }: SharedSessionCardProps) {
  if (!sharedSession.session) {
    return null;
  }

  return (
    <SessionCard
      session={sharedSession.session}
      isShared={true}
      owner={sharedSession.owner}
      sharedId={sharedSession.id}
      onDeleteClick={
        onDeleteClick 
          ? () => onDeleteClick(sharedSession.id) 
          : undefined
      }
    />
  );
}