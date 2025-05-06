import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { ChangeEvent } from 'react';
import { AdminUserTable } from './AdminUserTable';

interface AdminStats {
  userCount: number;
  newUsersLastMonth: number;
  newUsersLastWeek: number;
  totalSessions: number;
  totalPatrons: number;
  monthlyRevenue: number;
}

interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  updated_at: string | null;
  email: string | null;
  is_admin: boolean;
  is_patron: boolean | null;
  patron_tier: string | null;
}

interface GlobalSettings {
  openrouter_api_key: string;
  openrouter_model: string;
  default_system_prompt: string;
}

interface AdminTabsProps {
  stats: AdminStats | null;
  users: UserProfile[];
  settings: GlobalSettings;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSaveSettings: () => void;
  savingSettings: boolean;
  deleteUser: (userId: string) => void;
  makeUserAdmin: (userId: string) => void;
  setSettings: (value: GlobalSettings) => void;
}

export function AdminTabs({
  stats,
  users,
  settings,
  searchTerm,
  onSearchChange,
  onSaveSettings,
  savingSettings,
  deleteUser,
  makeUserAdmin,
  setSettings,
}: AdminTabsProps) {
  const filteredUsers = users.filter((user) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (user.username && user.username.toLowerCase().includes(searchLower)) ||
      (user.full_name && user.full_name.toLowerCase().includes(searchLower)) ||
      (user.email && user.email.toLowerCase().includes(searchLower))
    );
  });

  return (
    <Tabs defaultValue="dashboard" className="w-full">
      <TabsList className="grid w-full grid-cols-3 mb-8">
        <TabsTrigger value="dashboard" className="flex items-center gap-2">
          <span>Dashboard</span>
        </TabsTrigger>
        <TabsTrigger value="users" className="flex items-center gap-2">
          <span>Users</span>
        </TabsTrigger>
        <TabsTrigger value="settings" className="flex items-center gap-2">
          <span>Settings</span>
        </TabsTrigger>
      </TabsList>

      {/* Dashboard Tab */}
      <TabsContent value="dashboard" className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.userCount ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                +{stats?.newUsersLastMonth ?? 0} in the last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Patrons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalPatrons ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {((stats?.totalPatrons ?? 0) / (stats?.userCount ?? 1) * 100).toFixed(1)}% of users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats?.monthlyRevenue ?? 0}</div>
              <p className="text-xs text-muted-foreground">From Patreon integrations</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>User Growth</CardTitle>
              <CardDescription>New user registrations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-muted-foreground text-sm">Chart visualization coming soon</p>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Session Activity</CardTitle>
              <CardDescription>Total: {stats?.totalSessions ?? 0} sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-muted-foreground text-sm">Chart visualization coming soon</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Users Tab */}
      <TabsContent value="users" className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold">User Management</h2>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-10 w-full sm:w-[300px]"
              value={searchTerm}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        <AdminUserTable
          users={filteredUsers}
          deleteUser={deleteUser}
          makeUserAdmin={makeUserAdmin}
        />
      </TabsContent>

      {/* Settings Tab */}
      <TabsContent value="settings" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Global Settings</CardTitle>
            <CardDescription>Configure application-wide settings</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="grid gap-6 pt-4">
            <div className="grid gap-2">
              <Label htmlFor="openrouter_api_key">OpenRouter API Key</Label>
              <Input
                id="openrouter_api_key"
                value={settings.openrouter_api_key}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSettings({ ...settings, openrouter_api_key: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="openrouter_model">OpenRouter Model</Label>
              <Input
                id="openrouter_model"
                value={settings.openrouter_model}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSettings({ ...settings, openrouter_model: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="default_system_prompt">Default Prompt</Label>
              <Textarea
                id="default_system_prompt"
                value={settings.default_system_prompt}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setSettings({ ...settings, default_system_prompt: e.target.value })
                }
              />
            </div>
          </CardContent>
          <Separator />
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => toast.info('Changes reverted')}>Cancel</Button>
            <Button onClick={onSaveSettings} disabled={savingSettings}>Save Changes</Button>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  );
} 