import { Link } from "wouter";
import { ArrowLeft, Shield, Users, MessageSquare, FileUp, Clock, Shuffle, Github, Linkedin, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { COPY } from "@/lib/copy";

export default function Help() {
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

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-12 text-center sm:text-left">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">{COPY.HELP.TITLE}</h1>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground whitespace-normal">
            {COPY.HELP.SUBTITLE}
          </p>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                Privacy & Security
              </CardTitle>
              <CardDescription className="text-sm">
                How we protect your privacy
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3 sm:space-y-4">
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">{COPY.HELP.FAQ.HOW_LONG_STORED.QUESTION}</h4>
                <p className="text-xs sm:text-sm text-muted-foreground whitespace-normal">
                  {COPY.HELP.FAQ.HOW_LONG_STORED.ANSWER}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">{COPY.HELP.FAQ.CAN_OTHERS_SEE_HISTORY.QUESTION}</h4>
                <p className="text-xs sm:text-sm text-muted-foreground whitespace-normal">
                  {COPY.HELP.FAQ.CAN_OTHERS_SEE_HISTORY.ANSWER}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">{COPY.HELP.FAQ.WHO_DEVELOPED.QUESTION}</h4>
                <p className="text-xs sm:text-sm text-muted-foreground whitespace-normal">
                  {COPY.HELP.FAQ.WHO_DEVELOPED.ANSWER}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">No Password Required</h4>
                <p className="text-xs sm:text-sm text-muted-foreground whitespace-normal">
                  Simply enter a username to start chatting. No accounts, no tracking, no history.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                Creating & Joining Rooms
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3 sm:space-y-4">
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">{COPY.HELP.FAQ.HOW_CREATE_ROOM.QUESTION}</h4>
                <p className="text-xs sm:text-sm text-muted-foreground whitespace-normal">
                  {COPY.HELP.FAQ.HOW_CREATE_ROOM.ANSWER}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">Join a Room</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Enter a room code on the dashboard or use a shared link. You can also join via URL: yoursite.com/?room=abc123
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">Room Capacity</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Each room supports up to 35 users. The room owner is marked with a special badge.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
                Messaging
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3 sm:space-y-4">
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">Send Messages</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Type your message in the input field and press Enter or click Send. Messages are delivered in real-time to all room members.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">System Notifications</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  When someone joins or leaves a room, you'll see a system message in the chat.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <FileUp className="h-4 w-4 sm:h-5 sm:w-5" />
                File Sharing
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3 sm:space-y-4">
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">Supported Files</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Share images (.jpg, .png, .gif), videos (.mp4), documents (.pdf, .docx) up to 90 MB.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">Permission Required</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  When you share a file, recipients must accept before viewing. This ensures consent for all file transfers.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">View Only</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Files can be viewed temporarily but not downloaded. All files auto-delete after 1 hour.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Shuffle className="h-4 w-4 sm:h-5 sm:w-5" />
                Random Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Click "Random Chat" to be matched with another online user for a private ephemeral conversation.
                If no users are available, you'll be notified to try again later.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                Auto-Deletion
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3 sm:space-y-4">
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">1-Hour Expiration</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  All data (messages, rooms, files) automatically expires after 1 hour. A countdown timer shows time remaining.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1.5 sm:mb-2 text-sm sm:text-base">On Exit/Refresh</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Closing your browser tab or refreshing the page will delete your session and remove you from all rooms.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Developer Attribution Footer */}
        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t">
          <Card>
            <CardContent className="px-4 sm:px-6 py-4 sm:py-6">
              <div className="text-center space-y-4">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Built by{" "}
                  <a
                    href={COPY.DEVELOPER.GITHUB}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    {COPY.DEVELOPER.NAME}
                  </a>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm">
                  <a
                    href={COPY.DEVELOPER.GITHUB}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Github className="h-4 w-4" />
                    <span>GitHub</span>
                  </a>
                  <a
                    href={COPY.DEVELOPER.LINKEDIN}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Linkedin className="h-4 w-4" />
                    <span>LinkedIn</span>
                  </a>
                  <a
                    href={`mailto:${COPY.DEVELOPER.EMAIL}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    <span>Email</span>
                  </a>
                </div>
                <p className="text-xs text-muted-foreground mt-4">{COPY.DEVELOPER.FOOTER_TEXT}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
