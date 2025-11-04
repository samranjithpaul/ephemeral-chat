import { Link } from "wouter";
import { ArrowLeft, Shield, Clock, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { COPY } from "@/lib/copy";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
          <Link href="/dashboard">
            <Button variant="ghost" className="gap-1.5 sm:gap-2 text-sm sm:text-base" data-testid="button-back">
              <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-12">
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="rounded-full bg-primary/10 p-4 sm:p-6">
              <Shield className="h-12 w-12 sm:h-16 sm:w-16 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">{COPY.ABOUT.TITLE}</h1>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            {COPY.ABOUT.SUBTITLE}
          </p>
        </div>

        <div className="space-y-4 sm:space-y-6 mb-8 sm:mb-12">
          <Card>
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="text-lg sm:text-xl">Our Mission</CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
              <p className="text-sm sm:text-base text-muted-foreground whitespace-normal">
                {COPY.ABOUT.MISSION_PARAGRAPH}
              </p>
            </CardContent>
          </Card>

          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            <Card>
              <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                  Privacy First
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  No tracking, no history
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  We don't store your messages, track your behavior, or sell your data. Everything is designed
                  to be temporary and private.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                  Automatic Expiration
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  1-hour auto-deletion
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  All data automatically expires after 1 hour. When you leave, your digital footprint disappears.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Lock className="h-4 w-4 sm:h-5 sm:w-5" />
                  No Accounts
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Username only, no passwords
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Just enter a username and start chatting. No email verification, no password management, no hassle.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  Zero Retention
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Complete data deletion
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  When you close your browser or log out, all your data is immediately purged from our servers.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="mb-8 sm:mb-12">
          <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
            <CardTitle className="text-lg sm:text-xl">Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3 sm:space-y-4">
            <div>
              <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">What We Collect</h4>
              <p className="text-xs sm:text-sm text-muted-foreground">
                We temporarily store only the information necessary to provide the service: usernames, room codes,
                and messages. This data exists only in memory (Redis) and is never written to permanent storage.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">How We Use Data</h4>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Your data is used solely to facilitate real-time messaging. We do not analyze, sell, or share
                your information with third parties.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">Data Retention</h4>
              <p className="text-xs sm:text-sm text-muted-foreground">
                All data is automatically deleted after 1 hour or when you log out, whichever comes first.
                We maintain no logs, backups, or archives of conversations.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">Security</h4>
              <p className="text-xs sm:text-sm text-muted-foreground">
                We use industry-standard security measures including HTTPS encryption, Helmet.js security headers,
                and no-cache policies to protect your communications.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
            <CardTitle className="text-lg sm:text-xl">Technology Stack</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="grid sm:grid-cols-2 gap-4 text-xs sm:text-sm">
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">Frontend</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• React with TypeScript</li>
                  <li>• TailwindCSS for styling</li>
                  <li>• Socket.IO for real-time messaging</li>
                  <li>• Responsive design for mobile & desktop</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">Backend</h4>
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

        <div className="mt-8 sm:mt-12 text-center text-xs sm:text-sm text-muted-foreground px-4">
          <p className="whitespace-normal">{COPY.ABOUT.FOOTER}</p>
          <p className="mt-2 break-words">For questions or support, please contact: support@ephemeralchat.example</p>
        </div>
      </main>
    </div>
  );
}
