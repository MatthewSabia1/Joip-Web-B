import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { InfoIcon, SaveIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

import { UserPreferences, TransitionEffect } from '@/types';
import { TRANSITION_EFFECTS } from '@/lib/constants';
import { parseSubreddits } from '@/lib/utils/subreddit-parser';

interface ConfigPanelProps {
  preferences: UserPreferences;
  onUpdatePreferences: (preferences: Partial<UserPreferences>) => void;
  onApply: () => void;
  hasPendingChanges?: boolean;
  syncing?: boolean;
}

export function ConfigPanel({
  preferences,
  onUpdatePreferences,
  onApply,
  hasPendingChanges = false,
  syncing = false,
}: ConfigPanelProps) {
  const [subredditsInput, setSubredditsInput] = useState(
    preferences.subreddits.join(', ')
  );

  const handleSubredditsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const inputValue = e.target.value;
    setSubredditsInput(inputValue);
    try {
      const parsedSubreddits = parseSubreddits(inputValue);
      if (parsedSubreddits.length === 0) {
        toast({ title: 'Warning', description: 'No valid subreddits detected.', variant: 'destructive' });
      } else {
        onUpdatePreferences({ subreddits: parsedSubreddits });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to parse subreddits. Please check your input.', variant: 'destructive' });
    }
  };

  const handleIntervalChange = (values: number[]) => {
    const newInterval = values[0];
    if (newInterval < 3 || newInterval > 30) {
      toast({ title: 'Warning', description: 'Interval must be between 3 and 30 seconds.', variant: 'destructive' });
    } else {
      onUpdatePreferences({ interval: newInterval });
    }
  };

  const handleTransitionChange = (value: TransitionEffect) => {
    onUpdatePreferences({ transition: value });
  };

  const handleSystemPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdatePreferences({ systemPrompt: e.target.value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Configuration</h2>
        <p className="text-muted-foreground mb-4">
          Customize your content slideshow and AI captions
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="subreddits" className="text-base">Subreddits</Label>
          <Textarea
            id="subreddits"
            placeholder="Enter subreddit names (e.g., pics, EarthPorn, aww)"
            value={subredditsInput}
            onChange={handleSubredditsChange}
            className="min-h-[80px] resize-none bg-background/50 focus:bg-background transition-colors"
          />
          <p className="text-sm text-muted-foreground">
            Comma-separated subreddit names. Will automatically parse r/subreddit formats.
          </p>
        </div>

        <div className="space-y-4 pt-1">
          <div className="flex justify-between items-center">
            <Label htmlFor="interval" className="text-base">Slideshow Interval</Label>
            <span className="text-sm font-medium bg-primary/10 text-primary px-2 py-1 rounded-md">
              {preferences.interval} seconds
            </span>
          </div>
          <Slider
            id="interval"
            min={3}
            max={30}
            step={1}
            value={[preferences.interval]}
            onValueChange={handleIntervalChange}
            className="py-2"
          />
        </div>

        <div className="space-y-2 pt-1">
          <Label htmlFor="transition" className="text-base">Transition Effect</Label>
          <Select
            value={preferences.transition}
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

        <Accordion type="single" collapsible className="w-full pt-1">
          <AccordionItem value="advanced" className="border-b-0">
            <AccordionTrigger className="py-3 font-medium text-base hover:no-underline">
              Advanced Settings
            </AccordionTrigger>
            <AccordionContent className="space-y-5 pb-2">
              <div className="space-y-2">
                <Label htmlFor="systemPrompt" className="text-base">AI System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  placeholder="Enter system prompt for the AI..."
                  value={preferences.systemPrompt}
                  onChange={handleSystemPromptChange}
                  className="min-h-[100px] bg-background/50 focus:bg-background transition-colors"
                />
                <p className="text-sm text-muted-foreground">
                  Instructions for how the AI should generate captions.
                </p>
              </div>

              <div className="bg-muted/40 p-4 rounded-lg flex gap-3 items-start">
                <InfoIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-medium text-sm">Secure AI Integration</h4>
                  <p className="text-sm text-muted-foreground">
                    Our AI captions are powered by OpenRouter, with API keys securely stored on the server. 
                    For custom API usage, please contact an administrator.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Button 
          className="w-full mt-6 py-5 text-base font-medium bg-primary hover:bg-primary/90 shadow-md"
          onClick={onApply}
          disabled={syncing || !hasPendingChanges}
        >
          {syncing ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              Saving Changes...
            </>
          ) : hasPendingChanges ? (
            <>
              <SaveIcon className="h-4 w-4 mr-2" />
              Save Changes
            </>
          ) : (
            'All Changes Saved'
          )}
        </Button>
      </div>
    </div>
  );
}