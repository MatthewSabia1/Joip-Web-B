import { Card, CardContent } from '@/components/ui/card';
import { ProfileForm } from '@/components/auth/ProfileForm';

export function AccountSettings() {
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardContent className="p-6 md:p-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">User Profile</h2>
            <p className="text-muted-foreground mb-4">
              Update your account information and preferences
            </p>
          </div>
          
          <ProfileForm />
        </div>
      </CardContent>
    </Card>
  );
}