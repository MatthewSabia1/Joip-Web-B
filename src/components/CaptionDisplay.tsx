import { AIResponse } from '@/types';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon, MoveVertical, Volume2, Copy, CheckCircle2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface CaptionDisplayProps {
  caption: AIResponse;
  onRegenerate: () => void;
  isApiKeySet: boolean;
}

export function CaptionDisplay({
  caption,
  onRegenerate,
  isApiKeySet
}: CaptionDisplayProps) {
  const [fontSize, setFontSize] = useState(1.25); // rem units
  const [copied, setCopied] = useState(false);
  // These state variables will be used in future enhancements
  // const [isDragging, setIsDragging] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Handle text-to-speech
  const speak = () => {
    if (!caption.caption || !window.speechSynthesis) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(caption.caption);
    utterance.rate = 0.9; // Slightly slower than default
    window.speechSynthesis.speak(utterance);
    
    toast.success("Text-to-speech activated");
  };
  
  // Handle copy to clipboard
  const copyToClipboard = () => {
    if (!caption.caption) return;
    
    navigator.clipboard.writeText(caption.caption)
      .then(() => {
        setCopied(true);
        toast.success("Caption copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => {
        console.error("Error copying to clipboard:", err);
        toast.error("Failed to copy caption");
      });
  };
  
  // Increase font size
  const increaseFontSize = () => {
    setFontSize(prev => Math.min(prev + 0.125, 2.5));
  };
  
  // Decrease font size
  const decreaseFontSize = () => {
    setFontSize(prev => Math.max(prev - 0.125, 0.75));
  };
  
  // Reset animation and handle side effects when caption changes
  useEffect(() => {
    // Cancel any ongoing speech synthesis when caption changes
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Scroll to top of the caption panel on new caption
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setShowControls(false);
    
    // Show controls after a short delay
    const timer = setTimeout(() => {
      setShowControls(true);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [caption.caption]);
  
  return (
    <div className="h-full flex flex-col relative overflow-hidden bg-card/60 backdrop-blur-[2px]">
      {/* Caption header with controls */}
      <div className="border-b px-6 py-3 flex items-center justify-between bg-muted/30">
        {/* Title removed as requested */}
        
        {/* Control buttons */}
        <AnimatePresence>
          {showControls && caption.caption && !caption.loading && (
            <motion.div 
              className="flex items-center gap-1"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full"
                onClick={decreaseFontSize}
                title="Decrease font size"
              >
                <MoveVertical className="h-4 w-4 transform scale-y-75" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full"
                onClick={increaseFontSize}
                title="Increase font size"
              >
                <MoveVertical className="h-4 w-4 transform rotate-180 scale-y-75" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full"
                onClick={speak}
                title="Text-to-speech"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full"
                onClick={copyToClipboard}
                title="Copy to clipboard"
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onRegenerate}
                disabled={caption.loading}
                className="h-8 w-8 rounded-full"
                title="Regenerate caption"
              >
                <RefreshCwIcon className={`h-4 w-4 ${caption.loading ? 'animate-spin' : ''}`} />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Main Content Area with scroll */}
      <div 
        className="flex-grow overflow-auto px-6 py-4 scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/30 transition-colors"
        ref={contentRef}
      >
        <AnimatePresence mode="wait">
          {caption.loading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-full"
            >
              <div className="text-center space-y-4">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full"></div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                    <p className="text-xs text-primary/70 font-medium">AI</p>
                  </div>
                </div>
                <p className="text-muted-foreground animate-pulse">Generating commentary...</p>
              </div>
            </motion.div>
          ) : caption.error ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-full"
            >
              <div className="text-center max-w-md bg-destructive/10 p-4 rounded-lg border border-destructive/20">
                <p className="text-destructive font-medium mb-1">Error</p>
                <p className="text-sm text-destructive/80">{caption.error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={onRegenerate}
                >
                  <RefreshCwIcon className="h-3 w-3 mr-2" />
                  Try Again
                </Button>
              </div>
            </motion.div>
          ) : !isApiKeySet ? (
            <motion.div 
              key="no-api-key"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-full"
            >
              <div className="text-center max-w-md">
                <p className="text-muted-foreground text-sm">
                  AI commentary is available for Patreon supporters.<br />
                  Connect your Patreon account in Settings.
                </p>
              </div>
            </motion.div>
          ) : !caption.caption ? (
            <motion.div 
              key="no-caption"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-full"
            >
              <div className="text-center max-w-md bg-muted/50 p-4 rounded-lg">
                <p className="text-muted-foreground text-sm">
                  AI will generate commentary when an image is displayed.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="caption"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="prose dark:prose-invert max-w-none"
            >
              <p 
                className="leading-relaxed whitespace-pre-line"
                style={{ fontSize: `${fontSize}rem` }}
              >
                {caption.caption}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}