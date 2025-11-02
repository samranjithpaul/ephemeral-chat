import { Link } from "wouter";
import { ArrowLeft, Shield, Clock, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard">
            <Button variant="ghost" className="gap-2" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="rounded-full bg-primary/10 p-6">
              <Shield className="h-16 w-16 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-4">About Ephemeral Chat</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A privacy-first messaging platform designed for secure, temporary communication with zero data retention
          </p>
        </div>

        <div className="space-y-6 mb-12">
          <Card>
            <CardHeader>
              <CardTitle>Our Mission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                In an era where digital privacy is increasingly rare, Ephemeral Chat provides a solution for
                truly private conversations. We believe that not all communication needs to be permanent, and
                that privacy should be the default, not an afterthought.
              </p>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Privacy First
                </CardTitle>
                <CardDescription>
                  No tracking, no history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  We don't store your messages, track your behavior, or sell your data. Everything is designed
                  to be temporary and private.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Automatic Expiration
                </CardTitle>
                <CardDescription>
                  1-hour auto-deletion
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  All data automatically expires after 1 hour. When you leave, your digital footprint disappears.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  No Accounts
                </CardTitle>
                <CardDescription>
                  Username only, no passwords
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Just enter a username and start chatting. No email verification, no password management, no hassle.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  Zero Retention
                </CardTitle>
                <CardDescription>
                  Complete data deletion
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  When you close your browser or log out, all your data is immediately purged from our servers.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="mb-12">
          <CardHeader>
            <CardTitle>Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">What We Collect</h4>
              <p className="text-sm text-muted-foreground">
                We temporarily store only the information necessary to provide the service: usernames, room codes,
                and messages. This data exists only in memory (Redis) and is never written to permanent storage.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">How We Use Data</h4>
              <p className="text-sm text-muted-foreground">
                Your data is used solely to facilitate real-time messaging. We do not analyze, sell, or share
                your information with third parties.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Data Retention</h4>
              <p className="text-sm text-muted-foreground">
                All data is automatically deleted after 1 hour or when you log out, whichever comes first.
                We maintain no logs, backups, or archives of conversations.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Security</h4>
              <p className="text-sm text-muted-foreground">
                We use industry-standard security measures including HTTPS encryption, Helmet.js security headers,
                and no-cache policies to protect your communications.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Technology Stack</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2">Frontend</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• React with TypeScript</li>
                  <li>• TailwindCSS for styling</li>
                  <li>• Socket.IO for real-time messaging</li>
                  <li>• Responsive design for mobile & desktop</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Backend</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Node.js + Express</li>
                  <li>• Socket.IO server</li>
                  <li>• Redis for temporary storage</li>
                  <li>• AWS S3 for ephemeral file sharing</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>Built with privacy in mind • All data auto-deletes after 1 hour</p>
          <p className="mt-2">For questions or support, please contact: support@ephemeralchat.example</p>
        </div>
      </main>
    </div>
  );
}
