import { Link } from "wouter";
import { ArrowLeft, Shield, Users, MessageSquare, FileUp, Clock, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Help() {
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
          <h1 className="text-4xl font-bold mb-4">Help & Documentation</h1>
          <p className="text-lg text-muted-foreground">
            Learn how to use Ephemeral Chat for secure, private messaging
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy & Security
              </CardTitle>
              <CardDescription>
                How we protect your privacy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">No Persistent Data</h4>
                <p className="text-sm text-muted-foreground">
                  All messages, usernames, and rooms are stored only in temporary memory (Redis).
                  Everything auto-deletes after 1 hour of inactivity.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">No Password Required</h4>
                <p className="text-sm text-muted-foreground">
                  Simply enter a username to start chatting. No accounts, no tracking, no history.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Automatic Cleanup</h4>
                <p className="text-sm text-muted-foreground">
                  When you close your browser or log out, all your data is immediately deleted from our servers.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Creating & Joining Rooms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Create a Room</h4>
                <p className="text-sm text-muted-foreground">
                  From the dashboard, enter a room name and click "Create Room". You'll receive a unique room code to share with others.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Join a Room</h4>
                <p className="text-sm text-muted-foreground">
                  Enter a room code on the dashboard or use a shared link. You can also join via URL: yoursite.com/?room=abc123
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Room Capacity</h4>
                <p className="text-sm text-muted-foreground">
                  Each room supports up to 35 users. The room owner is marked with a special badge.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Messaging
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Send Messages</h4>
                <p className="text-sm text-muted-foreground">
                  Type your message in the input field and press Enter or click Send. Messages are delivered in real-time to all room members.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">System Notifications</h4>
                <p className="text-sm text-muted-foreground">
                  When someone joins or leaves a room, you'll see a system message in the chat.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileUp className="h-5 w-5" />
                File Sharing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Supported Files</h4>
                <p className="text-sm text-muted-foreground">
                  Share images (.jpg, .png, .gif), videos (.mp4), documents (.pdf, .docx) up to 90 MB.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Permission Required</h4>
                <p className="text-sm text-muted-foreground">
                  When you share a file, recipients must accept before viewing. This ensures consent for all file transfers.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">View Only</h4>
                <p className="text-sm text-muted-foreground">
                  Files can be viewed temporarily but not downloaded. All files auto-delete after 1 hour.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shuffle className="h-5 w-5" />
                Random Chat
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Click "Random Chat" to be matched with another online user for a private ephemeral conversation.
                If no users are available, you'll be notified to try again later.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Auto-Deletion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">1-Hour Expiration</h4>
                <p className="text-sm text-muted-foreground">
                  All data (messages, rooms, files) automatically expires after 1 hour. A countdown timer shows time remaining.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">On Exit/Refresh</h4>
                <p className="text-sm text-muted-foreground">
                  Closing your browser tab or refreshing the page will delete your session and remove you from all rooms.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
