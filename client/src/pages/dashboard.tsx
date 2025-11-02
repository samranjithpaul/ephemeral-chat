import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Plus, LogIn, Shuffle, HelpCircle, Info, LogOut, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { soundManager } from "@/lib/sounds";

export default function Dashboard() {
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [copied, setCopied] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const storedUsername = sessionStorage.getItem("username");
    if (!storedUsername) {
      setLocation("/");
      return;
    }
    setUsername(storedUsername);
  }, [setLocation]);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) {
      toast({
        title: "Room name required",
        description: "Please enter a name for your room",
        variant: "destructive",
      });
      soundManager.playError();
      return;
    }

    setIsCreating(true);
    soundManager.playClick();

    try {
      const response = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoomName.trim(),
          ownerId: sessionStorage.getItem("userId"),
          ownerUsername: username,
          maxUsers: 35,
        }),
      });

      const data = await response.json();

      if (data.success && data.room) {
        setCreatedRoomId(data.room.id);
        soundManager.playJoin();
        toast({
          title: "Room created!",
          description: "Share the code with others to invite them",
        });
        
        // Auto-join the room after a brief delay
        setTimeout(() => {
          setLocation(`/room/${data.room.id}`);
        }, 2000);
      } else {
        toast({
          title: "Failed to create room",
          description: data.message || "Please try again",
          variant: "destructive",
        });
        soundManager.playError();
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: "Unable to create room",
        variant: "destructive",
      });
      soundManager.playError();
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    if (!roomCode.trim()) {
      toast({
        title: "Room code required",
        description: "Please enter a room code",
        variant: "destructive",
      });
      soundManager.playError();
      return;
    }

    soundManager.playClick();
    setLocation(`/room/${roomCode.trim()}`);
  };

  const handleRandomChat = async () => {
    soundManager.playClick();
    toast({
      title: "Finding a match...",
      description: "Looking for someone to chat with",
    });
    
    try {
      const response = await fetch("/api/random-chat/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: sessionStorage.getItem("userId") }),
      });

      const data = await response.json();

      if (data.success && data.roomId) {
        soundManager.playJoin();
        setLocation(`/room/${data.roomId}`);
      } else {
        toast({
          title: "No users available",
          description: "Currently no users are online. Try joining a room.",
        });
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: "Unable to find a match",
        variant: "destructive",
      });
      soundManager.playError();
    }
  };

  const handleLogout = () => {
    soundManager.playLeave();
    sessionStorage.clear();
    setLocation("/");
  };

  const copyRoomLink = () => {
    if (!createdRoomId) return;
    const link = `${window.location.origin}/?room=${createdRoomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    soundManager.playClick();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Ephemeral Chat</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Hello, <span className="font-medium text-foreground">{username}</span>
            </span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Create Room Card */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create Room
              </CardTitle>
              <CardDescription>
                Start a new private chat room
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  placeholder="My Private Chat"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  maxLength={50}
                  data-testid="input-room-name"
                />
              </div>
              <Button
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="w-full"
                data-testid="button-create-room"
              >
                {isCreating ? "Creating..." : "Create Room"}
              </Button>

              {createdRoomId && (
                <div className="pt-4 border-t space-y-2">
                  <Label className="text-xs">Room Code</Label>
                  <div className="flex gap-2">
                    <code className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono tracking-wider">
                      {createdRoomId}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={copyRoomLink}
                      data-testid="button-copy-link"
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share this code or link with others
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Join Room Card */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                Join Room
              </CardTitle>
              <CardDescription>
                Enter a room code to join
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="room-code">Room Code</Label>
                <Input
                  id="room-code"
                  placeholder="abc123"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="font-mono tracking-wider"
                  data-testid="input-room-code"
                />
              </div>
              <Button
                onClick={handleJoinRoom}
                disabled={isJoining}
                className="w-full"
                data-testid="button-join-room"
              >
                Join Room
              </Button>
            </CardContent>
          </Card>

          {/* Random Chat Card */}
          <Card className="shadow-md border-2 border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shuffle className="h-5 w-5" />
                Random Chat
              </CardTitle>
              <CardDescription>
                Connect with a random user
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Get matched with another online user for a private ephemeral conversation.
              </p>
              <Button
                onClick={handleRandomChat}
                variant="outline"
                className="w-full"
                data-testid="button-random-chat"
              >
                <Shuffle className="h-4 w-4 mr-2" />
                Start Random Chat
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Info Links */}
        <div className="mt-12 flex justify-center gap-6">
          <Link href="/help">
            <Button variant="ghost" className="gap-2" data-testid="link-help">
              <HelpCircle className="h-4 w-4" />
              Help
            </Button>
          </Link>
          <Link href="/about">
            <Button variant="ghost" className="gap-2" data-testid="link-about">
              <Info className="h-4 w-4" />
              About
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
