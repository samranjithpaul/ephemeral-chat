// PATCH: 2025-11-02 - Add random chat with 1-minute countdown and real-time matching
// Fixes: Random chat pairing, countdown timer, Socket.IO notifications for matches
// Test: Open two tabs, click random chat in both, verify they get paired and redirected

import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Plus, LogIn, Shuffle, HelpCircle, Info, LogOut, Copy, Check, X, Loader2 } from "lucide-react";
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
  const [isJoining, setIsJoining] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimeLeft, setSearchTimeLeft] = useState(60); // 60 seconds countdown
  const [searchingMessageIndex, setSearchingMessageIndex] = useState(0);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  const roomCodeCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { socket } = useSocket();

  useEffect(() => {
    const storedUsername = sessionStorage.getItem("username");
    if (!storedUsername) {
      setLocation("/");
      return;
    }
    setUsername(storedUsername);
  }, [setLocation]);

  // Listen for random chat match
  useEffect(() => {
    if (!socket) return;

    // Remove any existing listeners first to avoid stale handlers
    socket.off("random_chat_matched");

    const handleMatch = (data: { roomId: string; partnerUsername: string; status?: string }) => {
      if (import.meta.env.DEV) {
        console.log(`[RANDOM_CHAT] Match found event received roomId=${data.roomId} partnerUsername=${data.partnerUsername}`);
      }
      soundManager.playJoin();
      setIsSearching(false);
      setSearchTimeLeft(60);
      setSearchingMessageIndex(0);
      
      // Clear timers
      if (searchTimerRef.current) {
        clearInterval(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      if (searchMessageTimerRef.current) {
        clearInterval(searchMessageTimerRef.current);
        searchMessageTimerRef.current = null;
      }
      
      // Show match success message
      toast({
        title: " Matched!",
        description: `Matched with ${data.partnerUsername}`,
      });
      
      // CRITICAL: Set roomId in sessionStorage BEFORE navigation so socket can auto-join
      sessionStorage.setItem("roomId", data.roomId);
      const userId = sessionStorage.getItem("userId");
      if (userId) {
        sessionStorage.setItem("userId", userId);
        if (import.meta.env.DEV) {
          console.log(`[RANDOM_CHAT] Set roomId in sessionStorage: ${data.roomId} - navigating to room`);
        }
      }
      
      // Redirect to room immediately - room page will handle join_room
      setLocation(`/room/${data.roomId}`);
    };

    socket.on("random_chat_matched", handleMatch);
    
    // Listen for random chat errors (socket not ready)
    const handleError = (data: { message: string; roomId?: string }) => {
      toast({
        title: "Connection unstable",
        description: data.message || "Trying again...",
        variant: "destructive",
      });
      // If we have a roomId, still try to redirect (room was created)
      if (data.roomId) {
        setTimeout(() => {
          setLocation(`/room/${data.roomId}`);
        }, 2000);
      }
    };
    socket.on("random_chat_error", handleError);

    return () => {
      socket.off("random_chat_matched", handleMatch);
      socket.off("random_chat_error", handleError);
    };
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
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (searchMessageTimerRef.current) {
        clearInterval(searchMessageTimerRef.current);
      }
      if (nameCheckTimeoutRef.current) {
        clearTimeout(nameCheckTimeoutRef.current);
      }
      // NEW: Cleanup room code check timeout
      if (roomCodeCheckTimeoutRef.current) {
        clearTimeout(roomCodeCheckTimeoutRef.current);
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
    if (name.length < 2 || name.length > 50) {
      setRoomNameAvailable(false);
      setIsCheckingName(false);
      return;
    }

    // Debounce the check (500ms delay)
    setIsCheckingName(true);
    nameCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const encodedName = encodeURIComponent(name);
        const response = await fetch(`/api/rooms/check/${encodedName}`);
        const data = await response.json();
        
        if (data.success !== undefined) {
          setRoomNameAvailable(data.available);
        } else {
          setRoomNameAvailable(null);
        }
      } catch (error) {
        // On error, assume available to allow creation
        setRoomNameAvailable(null);
        if (import.meta.env.DEV) {
          console.error("[RoomNameCheck] Error checking availability:", error);
        }
      } finally {
        setIsCheckingName(false);
      }
    }, 500);

    return () => {
      if (nameCheckTimeoutRef.current) {
        clearTimeout(nameCheckTimeoutRef.current);
      }
    };
  }, [newRoomName]);

  // Note: Room code availability is now checked via HTTP endpoint in the onChange handler
  // This keeps the socket events intact while using the simpler HTTP check

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

      // If not available (idle or unavailable), show warning
      if (roomCheckStatus !== "available") {
        toast({
          title: "Please wait",
          description: "Room code availability check must complete before creating",
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
          ownerUsername: username,
          maxUsers: 35,
          customCode: newRoomCode.trim() ? newRoomCode.trim() : undefined, // NEW: custom room code
        }),
      });

      const data = await response.json();

      if (data.success && data.room) {
        setCreatedRoomId(data.room.id);
        soundManager.playJoin();
        toast({
          title: "Room created!",
          description: `Room code: ${data.room.id}`,
        });
        
        // NEW: Reset custom code input and availability state after successful creation
        setNewRoomCode("");
        setRoomCheckStatus("idle");
        setRoomCheckMessage("");
        
        // CRITICAL: Set roomId in sessionStorage BEFORE navigation so socket can auto-join
        sessionStorage.setItem("roomId", data.room.id);
        sessionStorage.setItem("userId", sessionStorage.getItem("userId") || "");
        console.log(`[DASHBOARD] Set roomId in sessionStorage: ${data.room.id} - navigating to room`);
        
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
    
    // CRITICAL: Set roomId in sessionStorage BEFORE navigation so socket can auto-join
    const trimmedCode = roomCode.trim();
    sessionStorage.setItem("roomId", trimmedCode);
    sessionStorage.setItem("userId", sessionStorage.getItem("userId") || "");
    console.log(`[DASHBOARD] Set roomId in sessionStorage: ${trimmedCode} - navigating to room`);
    
    setLocation(`/room/${trimmedCode}`);
  };

  const handleRandomChat = async () => {
    if (isSearching) {
      // Cancel search
      handleCancelRandomChat();
      return;
    }

    soundManager.playClick();
    setIsSearching(true);
    setSearchTimeLeft(60);
    
    const userId = sessionStorage.getItem("userId");
    if (import.meta.env.DEV) {
      console.log(`[RANDOM_CHAT] User queued for random match userId=${userId}`);
    }
    
    try {
      const response = await fetch("/api/random-chat/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (data.success && data.roomId) {
        // Immediate match - redirect
        if (import.meta.env.DEV) {
          console.log(`[RANDOM_CHAT] Match found immediately roomId=${data.roomId}`);
        }
        soundManager.playJoin();
        setIsSearching(false);
        toast({
          title: "Match found!",
          description: "You've been matched with someone",
        });
        setLocation(`/room/${data.roomId}`);
      } else if (data.success && data.queued) {
        // User is in queue - start countdown
        if (import.meta.env.DEV) {
          console.log(`[RANDOM_CHAT] User added to queue, waiting for match userId=${userId}`);
        }
        toast({
          title: "Waiting for partner...",
          description: "Searching for someone to chat with",
        });
        
        // Start countdown timer
        searchTimerRef.current = setInterval(() => {
          setSearchTimeLeft((prev) => {
            if (prev <= 1) {
              if (searchTimerRef.current) {
                clearInterval(searchTimerRef.current);
                searchTimerRef.current = null;
              }
              handleRandomChatTimeout();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        // Set timeout to check for match failure
        searchTimeoutRef.current = setTimeout(() => {
          if (isSearching) {
            handleRandomChatTimeout();
          }
        }, 60000);
      } else {
        setIsSearching(false);
        toast({
          title: "No users available",
          description: "Currently no users are online. Try joining a room.",
        });
      }
    } catch (error) {
      setIsSearching(false);
      toast({
        title: "Connection error",
        description: "Unable to find a match",
        variant: "destructive",
      });
      soundManager.playError();
    }
  };

  const handleCancelRandomChat = async () => {
    try {
      await fetch("/api/random-chat/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: sessionStorage.getItem("userId") }),
      });
    } catch (error) {
      // Ignore cancel errors
    }
    
    setIsSearching(false);
    setSearchTimeLeft(60);
    setSearchingMessageIndex(0);
    
    if (searchTimerRef.current) {
      clearInterval(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (searchMessageTimerRef.current) {
      clearInterval(searchMessageTimerRef.current);
      searchMessageTimerRef.current = null;
    }
    
    toast({
      title: "Search cancelled",
      description: "Random chat search has been cancelled",
    });
  };

  const handleRandomChatTimeout = async () => {
    setIsSearching(false);
    setSearchTimeLeft(60);
    setSearchingMessageIndex(0);
    
    if (searchTimerRef.current) {
      clearInterval(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (searchMessageTimerRef.current) {
      clearInterval(searchMessageTimerRef.current);
      searchMessageTimerRef.current = null;
    }
    
    // Remove from queue
    await handleCancelRandomChat();
    
    toast({
      title: "No match found",
      description: "No other users are searching right now. Try again later!",
      variant: "destructive",
    });
    soundManager.playError();
  };

  const handleLogout = () => {
    soundManager.playLeave();
    
    // Cancel random chat search if active
    if (isSearching) {
      handleCancelRandomChat();
    }
    
    // Clear ALL user data (sessionStorage, localStorage, and any room references)
    sessionStorage.clear();
    localStorage.clear();
    
    // Clear URL to remove any room parameters
    window.history.replaceState({}, "", "/");
    
    // Redirect to login (socket will disconnect automatically on page navigation)
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
                    onChange={(e) => {
                      const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                      if (value.length <= 20) {
                        setNewRoomCode(value);
                        setRoomCheckStatus("checking");
                        setRoomCheckMessage(COPY.ROOM.CODE_CHECKING);

                        if (roomCodeCheckTimeoutRef.current)
                          clearTimeout(roomCodeCheckTimeoutRef.current);

                        roomCodeCheckTimeoutRef.current = setTimeout(async () => {
                          if (!value) {
                            setRoomCheckStatus("idle");
                            setRoomCheckMessage("");
                            return;
                          }

                          try {
                            const res = await fetch(`/api/rooms/check/${encodeURIComponent(value)}`);
                            const data = await res.json();

                            if (data.success && data.available) {
                              setRoomCheckStatus("available");
                              setRoomCheckMessage(COPY.ROOM.CODE_AVAILABLE);

                            } else {
                              setRoomCheckStatus("unavailable");
                              setRoomCheckMessage(COPY.ROOM.CODE_UNAVAILABLE);
                            }
                          } catch (error) {
                            setRoomCheckStatus("unavailable");
                            setRoomCheckMessage(COPY.ROOM.CODE_UNAVAILABLE);
                          }
                        }, 500);
                      }
                    }}
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
                    Share this code with others to join
                  </p>
                </div>
              )}
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
                <Label htmlFor="room-code" className="text-sm">Room Code</Label>
                <Input
                  id="room-code"
                  placeholder="abc123"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="font-mono tracking-wider text-sm sm:text-base h-10 sm:h-11"
                  data-testid="input-room-code"
                  disabled={isSearching}
                />
              </div>
              <Button
                onClick={handleJoinRoom}
                disabled={isJoining || isSearching}
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
                  disabled={isSearching}
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

