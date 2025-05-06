import { UserPreferences } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ConfigPanel } from '@/components/ConfigPanel';
import { ProfileForm } from '@/components/auth/ProfileForm';

interface AccountSettingsProps {
  preferences: UserPreferences;
  onUpdatePreferences: (preferences: Partial<UserPreferences>) => void;
  onApply: () => void;
}

export function AccountSettings({
  preferences,
  onUpdatePreferences,
  onApply,
}: AccountSettingsProps) {
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardContent className="p-4 md:p-6">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid grid-cols-2 w-full mb-6 p-1 bg-muted/40 rounded-xl">
            <TabsTrigger 
              value="profile" 
              className="rounded-lg py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              Profile
            </TabsTrigger>
            <TabsTrigger 
              value="app" 
              className="rounded-lg py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              App Settings
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="profile" className="mt-0 space-y-6">
            <ProfileForm />
          </TabsContent>
          
          <TabsContent value="app" className="mt-0 space-y-6">
            <ConfigPanel 
              preferences={preferences}
              onUpdatePreferences={onUpdatePreferences}
              onApply={onApply}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}