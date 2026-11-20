// PATCH: 2025-11-02 - Add random chat with 1-minute countdown and real-time matching
// Fixes: Random chat pairing, countdown timer, Socket.IO notifications for matches
// Test: Open two tabs, click random chat in both, verify they get paired and redirected

import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Plus, LogIn, Shuffle, HelpCircle, Info, LogOut, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { AvailabilityHint } from "@/components/AvailabilityHint";
import { COPY } from "@/lib/copy";
import { soundManager } from "@/lib/sounds";
import { useSocket } from "@/lib/socket";

export default function Dashboard() {
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimeLeft, setSearchTimeLeft] = useState(60); // 60 seconds countdown
  const [searchingMessageIndex, setSearchingMessageIndex] = useState(0);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cancellingSearch = useRef<Promise<void> | null>(null);
  const searchRef = useRef<{ userId: string; request?: Promise<Response> } | null>(null);
  const searchMessageTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Dynamic rotating messages for searching phase

  const searchingMessages = [
    "Searching for match…",
    "Finding another user…",
    "Looking for match…",
    "Connecting…",
    "Waiting for match…",
  ];
  
  const longSearchingMessages = [
    "Still searching…",
    "Finding match…",
    "Looking for you…",
    "Hold on…",
    "Almost there…",
  ];
  
    
  
  const [roomNameAvailable, setRoomNameAvailable] = useState<boolean | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const nameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // NEW: Room code availability state with better status tracking
  const [newRoomCode, setNewRoomCode] = useState("");
  const [roomCheckStatus, setRoomCheckStatus] = useState<"idle" | "checking" | "available" | "unavailable">("idle");
  const [roomCheckMessage, setRoomCheckMessage] = useState("");

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { socket, isBound, sessionExpired } = useSocket();

  useEffect(() => {
    const storedUsername = sessionStorage.getItem("username");
    if (!storedUsername) {
      setLocation("/");
      return;
    }
    setUsername(storedUsername);
  }, [setLocation]);

  useEffect(() => {
    if (!sessionExpired) return;
    sessionStorage.removeItem("userId");
    sessionStorage.removeItem("username");
    toast({ title: "Session expired", description: "Enter your username to sign in again." });
    setLocation("/", { replace: true });
  }, [sessionExpired, toast, setLocation]);

  const resetSearch = () => {
    searchRef.current = null;
    setIsSearching(false);
    setSearchTimeLeft(60);
    clearInterval(searchTimerRef.current ?? undefined);
  };

  const enterMatch = (data: { roomId: string; partnerUsername: string }) => {
    if (!searchRef.current) return;
    resetSearch();
    soundManager.playJoin();
    toast({ title: "Match found!", description: `Matched with ${data.partnerUsername}` });
    setLocation(`/room/${data.roomId}`);
  };

  useEffect(() => {
    if (!socket) return;
    socket.on("random_chat_matched", enterMatch);
    return () => { socket.off("random_chat_matched", enterMatch); };
  }, [socket, setLocation, toast]);

  // Rotate searching messages every 2.5 seconds
  useEffect(() => {
    if (isSearching) {
      const elapsedSeconds = 60 - searchTimeLeft;
      const messages = elapsedSeconds >= 10 ? longSearchingMessages : searchingMessages;
      
      // Rotate messages
      searchMessageTimerRef.current = setInterval(() => {
        setSearchingMessageIndex((prev) => (prev + 1) % messages.length);
      }, 2500);
      
      // Reset to first message when switching message sets
      if (elapsedSeconds >= 10) {
        setSearchingMessageIndex(0);
      }
      
      return () => {
        if (searchMessageTimerRef.current) {
          clearInterval(searchMessageTimerRef.current);
          searchMessageTimerRef.current = null;
        }
      };
    } else {
      // Reset when not searching
      setSearchingMessageIndex(0);
      if (searchMessageTimerRef.current) {
        clearInterval(searchMessageTimerRef.current);
        searchMessageTimerRef.current = null;
      }
    }
  }, [isSearching, searchTimeLeft]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearInterval(searchTimerRef.current);
      }
      const search = searchRef.current;
      searchRef.current = null;
      if (search) void cancelSearch(search);
      if (searchMessageTimerRef.current) {
        clearInterval(searchMessageTimerRef.current);
      }
      if (nameCheckTimeoutRef.current) {
        clearTimeout(nameCheckTimeoutRef.current);
      }
    };
  }, []);

  // Check room name availability with debouncing
  useEffect(() => {
    const name = newRoomName.trim();
    
    // Clear existing timeout
    if (nameCheckTimeoutRef.current) {
      clearTimeout(nameCheckTimeoutRef.current);
    }

    // Reset state if name is empty
    if (!name) {
      setRoomNameAvailable(null);
      setIsCheckingName(false);
      return;
    }

    // Validate length
    if (name.length > 50) {
      setRoomNameAvailable(false);
      setIsCheckingName(false);
      return;
    }

    const controller = new AbortController();
    setRoomNameAvailable(null);
    setIsCheckingName(true);
    nameCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const encodedName = encodeURIComponent(name);
        const response = await fetch(`/api/rooms/check/${encodedName}`, { signal: controller.signal });
        const data = await response.json();
        
        if (controller.signal.aborted) return;
        if (data.success) {
          setRoomNameAvailable(data.available);
        } else {
          setRoomNameAvailable(null);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setRoomNameAvailable(null);
        if (import.meta.env.DEV) {
          console.error("[RoomNameCheck] Error checking availability:", error);
        }
      } finally {
        if (!controller.signal.aborted) setIsCheckingName(false);
      }
    }, 500);

    return () => {
      controller.abort();
      if (nameCheckTimeoutRef.current) {
        clearTimeout(nameCheckTimeoutRef.current);
      }
    };
  }, [newRoomName]);

  useEffect(() => {
    if (!newRoomCode) {
      setRoomCheckStatus("idle");
      setRoomCheckMessage("");
      return;
    }
    const controller = new AbortController();
    setRoomCheckStatus("checking");
    setRoomCheckMessage(COPY.ROOM.CODE_CHECKING);
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/rooms/check-code/${encodeURIComponent(newRoomCode)}`, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !data.success) throw new Error("Room code check failed");
        setRoomCheckStatus(data.available ? "available" : "unavailable");
        setRoomCheckMessage(data.available ? COPY.ROOM.CODE_AVAILABLE : COPY.ROOM.CODE_UNAVAILABLE);
      } catch {
        if (controller.signal.aborted) return;
        setRoomCheckStatus("idle");
        setRoomCheckMessage("");
      }
    }, 500);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [newRoomCode]);

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

    // Check if name is available
    if (roomNameAvailable === false) {
      toast({
        title: "Room name unavailable",
        description: "This room name is already taken. Please choose another.",
        variant: "destructive",
      });
      soundManager.playError();
      return;
    }

    // NEW: Check if custom room code is available (if provided)
    if (newRoomCode.trim()) {
      if (roomCheckStatus === "unavailable") {
        toast({
          title: "Room code unavailable",
          description: "Please choose another code",
          variant: "destructive",
        });
        soundManager.playError();
        return;
      }
      
      // If still checking, wait a bit
      if (roomCheckStatus === "checking") {
        toast({
          title: "Checking availability...",
          description: "Please wait while we check if the room code is available",
          variant: "default",
        });
        return;
      }

    }

    setIsCreating(true);
    soundManager.playClick();

    try {
      // NEW: Include custom room code if provided and available
      const response = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoomName.trim(),
          ownerId: sessionStorage.getItem("userId"),
          customCode: newRoomCode.trim() ? newRoomCode.trim() : undefined, // NEW: custom room code
        }),
      });

      const data = await response.json();

      if (data.success && data.room) {
        soundManager.playJoin();
        toast({
          title: "Room created!",
          description: `Room code: ${data.room.id}`,
        });
        
        // NEW: Reset custom code input and availability state after successful creation
        setNewRoomCode("");
        setRoomCheckStatus("idle");
        setRoomCheckMessage("");
        
        setLocation(`/room/${data.room.id}`);
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
    const code = roomCode.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,20}$/.test(code)) {
      toast({ title: "Invalid room code", description: "Use 2–20 letters, numbers, or hyphens.", variant: "destructive" });
      return;
    }
    soundManager.playClick();
    setLocation(`/room/${code}`);
  };

  async function cancelSearch(search: { userId: string; request?: Promise<Response> }) {
    try {
      await search.request?.catch(() => {});
      await fetch("/api/random-chat/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: search.userId }),
        keepalive: true,
      });
    } catch {
      // The queue entry expires automatically.
    }
  }

  const handleRandomChat = async () => {
    const userId = sessionStorage.getItem("userId");
    if (!userId || !isBound || searchRef.current || cancellingSearch.current) return;

    soundManager.playClick();
    setIsSearching(true);
    setSearchTimeLeft(60);
    const request = fetch("/api/random-chat/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const search = { userId, request };
    searchRef.current = search;

    try {
      const response = await request;
      const data = await response.json();
      if (searchRef.current !== search) return;
      if (data.success && data.roomId) {
        enterMatch(data);
      } else if (data.success && data.queued) {
        const expiresAt = Date.now() + data.timeout;
        searchTimerRef.current = setInterval(() => {
          const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
          setSearchTimeLeft(seconds);
          if (seconds === 0 && searchRef.current === search) {
            resetSearch();
            void cancelSearch(search);
            toast({ title: "No match found", description: "Try again when someone else is searching." });
          }
        }, 1000);
      } else {
        resetSearch();
        toast({ title: "Could not start random chat", description: data.message, variant: "destructive" });
      }
    } catch {
      if (searchRef.current !== search) return;
      resetSearch();
      toast({ title: "Connection error", description: "Unable to find a match", variant: "destructive" });
    }
  };

  const handleCancelRandomChat = () => {
    const search = searchRef.current;
    if (!search) return;
    resetSearch();
    cancellingSearch.current = cancelSearch(search).finally(() => { cancellingSearch.current = null; });
    toast({ title: "Search cancelled" });
  };

  const handleLogout = () => {
    soundManager.playLeave();
    const userId = sessionStorage.getItem("userId");
    const search = searchRef.current;
    if (search) {
      resetSearch();
      void cancelSearch(search);
    }
    if (userId) {
      void fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        keepalive: true,
      }).catch(() => {});
    }
    sessionStorage.removeItem("userId");
    sessionStorage.removeItem("username");
    setLocation("/", { replace: true });
  };

  const formatTime = (seconds: number) => {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
          <Logo size="md" showText={true} />
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">
              Hello, <span className="font-medium text-foreground">{username}</span>
            </span>
            <span className="text-xs text-muted-foreground sm:hidden truncate max-w-[80px]">
              {username}
            </span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-8 w-8 sm:h-10 sm:w-10"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Create Room Card */}
          <Card className="shadow-md">
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                Create Room
              </CardTitle>
              <CardDescription className="text-sm">
                Start a new private chat room
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="space-y-2">
                <Label htmlFor="room-name" className="text-sm">Room Name</Label>
                <div className="relative">
                  <Input
                    id="room-name"
                    placeholder="My Private Chat"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    maxLength={50}
                    data-testid="input-room-name"
                    disabled={isSearching}
                    className={`text-sm sm:text-base h-10 sm:h-11 ${roomNameAvailable === false ? "pr-10 border-destructive" : roomNameAvailable === true ? "pr-10 border-green-500" : ""}`}
                  />
                  {newRoomName.trim() && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isCheckingName ? (
                        <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                      ) : roomNameAvailable === true ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : roomNameAvailable === false ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : null}
                    </div>
                  )}
                </div>
                <AvailabilityHint
                  status={roomNameAvailable === true ? "available" : roomNameAvailable === false ? "unavailable" : "idle"}
                  message={roomNameAvailable === true ? COPY.ROOM.NAME_AVAILABLE : roomNameAvailable === false ? COPY.ROOM.NAME_UNAVAILABLE : undefined}
                />
              </div>
              {/* CUSTOM ROOM CODE INPUT WITH AVAILABILITY CHECK */}
              <div className="space-y-2">
                <Label htmlFor="room-code" className="text-sm">Custom Room Code (optional)</Label>
                <div className="relative">
                  <Input
                    id="room-code"
                    placeholder="e.g., sam-room, team-alpha"
                    value={newRoomCode}
                    onChange={event => setNewRoomCode(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    maxLength={20}
                    data-testid="input-room-code"
                    disabled={isSearching || isCreating}
                    className={`text-sm sm:text-base h-10 sm:h-11 pr-10 transition-colors ${
                      roomCheckStatus === "available"
                        ? "border-green-500 focus:ring-green-500"
                        : roomCheckStatus === "unavailable"
                        ? "border-red-500 focus:ring-red-500"
                        : roomCheckStatus === "checking"
                        ? "border-gray-400"
                        : ""
                    }`}
                  />

                  {/* STATUS ICONS */}
                  {newRoomCode.trim() && roomCheckStatus !== "idle" && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {roomCheckStatus === "checking" && (
                        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                      )}
                      {roomCheckStatus === "available" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                      {roomCheckStatus === "unavailable" && (
                        <X className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  )}
                </div>

                {/* STATUS TEXT - Use AvailabilityHint for consistent styling */}
                <AvailabilityHint
                  status={roomCheckStatus}
                  message={roomCheckMessage || (roomCheckStatus === "checking" ? COPY.ROOM.CODE_CHECKING : undefined)}
                />
              </div>
              {/* CREATE ROOM BUTTON */}
              <Button
                onClick={handleCreateRoom}
                disabled={Boolean(
                  isCreating ||
                  isSearching ||
                  roomNameAvailable === false ||
                  roomCheckStatus === "checking" ||
                  (newRoomCode.trim() && roomCheckStatus === "unavailable")
                )}
                className="w-full"
                data-testid="button-create-room"
              >
                {isCreating ? "Creating Room..." : "Create Room"}
              </Button>

            </CardContent>
          </Card>

          {/* Join Room Card */}
          <Card className="shadow-md">
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <LogIn className="h-4 w-4 sm:h-5 sm:w-5" />
                Join Room
              </CardTitle>
              <CardDescription className="text-sm">
                Enter a room code to join
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="space-y-2">
                <Label htmlFor="join-room-code" className="text-sm">Room Code</Label>
                <Input
                  id="join-room-code"
                  placeholder="abc123"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="font-mono tracking-wider text-sm sm:text-base h-10 sm:h-11"
                  data-testid="input-join-room-code"
                  disabled={isSearching}
                />
              </div>
              <Button
                onClick={handleJoinRoom}
                disabled={isSearching}
                className="w-full h-10 sm:h-11 text-sm sm:text-base"
                data-testid="button-join-room"
              >
                Join Room
              </Button>
            </CardContent>
          </Card>

          {/* Random Chat Card */}
          <Card className={`shadow-md border-2 ${isSearching ? "border-primary" : "border-dashed"}`}>
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Shuffle className="h-4 w-4 sm:h-5 sm:w-5" />
                Random Chat
              </CardTitle>
              <CardDescription className="text-sm">
                Get matched with another online user
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Start a random chat to be automatically matched with another online user. Messages auto-delete after 1 hour.
              </p>
              
              {isSearching ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-lg gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* Typing indicator - bouncing dots */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                      </div>
                      <span className="text-xs sm:text-sm font-medium truncate min-w-0">
                        {(() => {
                          const elapsedSeconds = 60 - searchTimeLeft;
                          const messages = elapsedSeconds >= 10 ? longSearchingMessages : searchingMessages;
                          return messages[searchingMessageIndex];
                        })()}
                      </span>
                    </div>
                    <div className="text-lg sm:text-2xl font-mono font-bold tabular-nums shrink-0">
                      {formatTime(searchTimeLeft)}
                    </div>
                  </div>
                  <Button
                    onClick={handleCancelRandomChat}
                    variant="outline"
                    className="w-full h-10 sm:h-11 text-sm sm:text-base"
                    data-testid="button-cancel-random-chat"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel Search
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Waiting for a match...
                  </p>
                </div>
              ) : (
                <Button
                  onClick={handleRandomChat}
                  variant="outline"
                  className="w-full h-10 sm:h-11 text-sm sm:text-base"
                  disabled={!isBound}
                  data-testid="button-random-chat"
                >
                  <Shuffle className="h-4 w-4 mr-2" />
                  Start Random Chat
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info Links */}
        <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-6">
          <Link href="/help">
            <Button variant="ghost" className="gap-2 text-sm sm:text-base" data-testid="link-help">
              <HelpCircle className="h-4 w-4" />
              Help
            </Button>
          </Link>
          <Link href="/about">
            <Button variant="ghost" className="gap-2 text-sm sm:text-base" data-testid="link-about">
              <Info className="h-4 w-4" />
              About
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

