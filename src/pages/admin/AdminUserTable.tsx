import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, ShieldCheck } from 'lucide-react';

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

interface AdminUserTableProps {
  users: UserProfile[];
  deleteUser: (userId: string) => void;
  makeUserAdmin: (userId: string) => void;
}

export function AdminUserTable({ users, deleteUser, makeUserAdmin }: AdminUserTableProps) {
  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No users found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Joined</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex-shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={user.username ?? ''} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs font-medium">
                            {(user.username ?? 'U')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="truncate max-w-[140px] lg:max-w-xs">
                        <div className="font-medium">{user.username ?? 'Anonymous'}</div>
                        {user.full_name && (
                          <div className="text-xs text-muted-foreground truncate">{user.full_name}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[140px] lg:max-w-xs">
                    {user.email ?? 'No email'}
                  </td>
                  <td className="px-4 py-3">
                    {user.is_patron ? (
                      <div className="flex items-center">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-2"></span>
                        <span className="font-medium">Patron</span>
                        {user.patron_tier && (
                          <span className="ml-1 text-xs text-muted-foreground">({user.patron_tier})</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground mr-2"></span>
                        <span className="text-muted-foreground">Free User</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.updated_at ? new Date(user.updated_at).toLocaleDateString() : 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => deleteUser(user.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => makeUserAdmin(user.id)}>
                      <ShieldCheck className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
} 