import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { Send, Mic, Users, LogOut, Copy, Check, AlertCircle, CheckCheck, Play, Pause, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { soundManager } from "@/lib/sounds";
import { useSocket } from "@/lib/socket";
import { getUsernameColorClass } from "@/lib/usernameColors"; // NEW: username color utility

// WhatsApp/Instagram-style Audio Player Component
function AudioPlayer({ src, isOwn }: { src: string; isOwn: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnd = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnd);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnd);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    // Pause all other audio players (single playback behavior)
    document.querySelectorAll('audio').forEach(a => {
      if (a !== audio && !a.paused) {
        a.pause();
      }
    });

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(err => console.error("Audio play failed:", err));
      setIsPlaying(true);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 w-full max-w-xs">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <button
        onClick={togglePlay}
        className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors ${
          isOwn 
            ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground" 
            : "bg-muted hover:bg-muted/80 text-foreground"
        }`}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="h-3 w-3 sm:h-4 sm:w-4 ml-0.5" />
        ) : (
          <Play className="h-3 w-3 sm:h-4 sm:w-4 ml-0.5" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`h-1 rounded-full overflow-hidden ${
          isOwn ? "bg-primary-foreground/20" : "bg-muted-foreground/20"
        }`}>
          <div
            className={`h-full transition-all ${
              isOwn ? "bg-primary-foreground" : "bg-primary"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={`text-[10px] sm:text-xs mt-0.5 sm:mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  );
}

export default function RoomPage() {
  const [, params] = useRoute("/room/:id");
  const roomId = params?.id?.toLowerCase() || "";
  
  const [, setLocation] = useLocation();
  const username = sessionStorage.getItem("username") ?? "";
  const userId = sessionStorage.getItem("userId") ?? "";
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUsers, setShowUsers] = useState(true);
  const [showMobileUsers, setShowMobileUsers] = useState(false);
  // Removed countdown timer - messages persist until room is empty
  const [roomError, setRoomError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingActive = useRef(false);
  const { toast } = useToast();

  const { socket, isConnected, joinedRoomId, joinRoom, leaveRoom, sendMessage, sendAudioBase64, currentRoom, messages, typingUsers, setTyping } = useSocket();
  const isJoined = joinedRoomId === roomId;
  const isJoining = !isJoined && !roomError;

  useEffect(() => {
    if (!/^[a-z0-9-]{2,20}$/.test(roomId)) {
      setRoomError("Invalid room code.");
    } else if (!userId || !username) {
      setLocation(`/?room=${roomId}`, { replace: true });
    }
    return () => {
      if (userId) leaveRoom(roomId, userId);
    };
  }, [roomId, userId, username, leaveRoom, setLocation]);

  useEffect(() => {
    if (!userId || !/^[a-z0-9-]{2,20}$/.test(roomId) || !socket) return;
    let cancelled = false;
    setRoomError(null);

    if (!isConnected) {
      socket.connect();
      const timeout = setTimeout(() => setRoomError("Cannot connect to chat. Try again."), 10000);
      return () => clearTimeout(timeout);
    }

    void joinRoom(roomId, userId).then(result => {
      if (cancelled || result.ok) return;
      if (result.reason === "user_not_found") {
        sessionStorage.removeItem("userId");
        sessionStorage.removeItem("username");
        toast({ title: "Session expired", description: "Enter your username to rejoin the room." });
        setLocation(`/?room=${roomId}`, { replace: true });
        return;
      }

      const errors: Record<string, string> = {
        room_not_found: "This room does not exist or has expired.",
        room_full: "This room is full.",
      };
      setRoomError(errors[result.reason] ?? "Could not join the room. Try again.");
    });
    return () => { cancelled = true; };
  }, [roomId, userId, socket, isConnected, joinRoom, retry, setLocation, toast]);

  // CRITICAL: Auto-scroll to bottom when new messages arrive or when user sends message
  // Use scrollIntoView with instant behavior for immediate response
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true); // Track if user has manually scrolled up

  useEffect(() => {
    // Only auto-scroll if user hasn't manually scrolled up
    if (shouldAutoScrollRef.current && messagesEndRef.current) {
      // Use instant scroll for immediate response (prevents lag)
      messagesEndRef.current.scrollIntoView({ behavior: "instant", block: "end" });
    }
    
    // Play sound for new messages (except system messages)
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.type !== "system" && lastMessage.username !== username) {
        soundManager.playMessageReceived();
      }
    }
  }, [messages, username]);

  // Track user scroll position to detect manual scroll-up
  // Radix ScrollArea wraps content in a Viewport, so we check the actual scrollable viewport element
  useEffect(() => {
    let scrollCleanup: (() => void) | null = null;
    
    // Use a timeout to ensure DOM is rendered and ScrollArea viewport exists
    const timeoutId = setTimeout(() => {
      // Find the actual scrollable viewport element (Radix ScrollArea creates a viewport)
      const scrollAreaElement = scrollAreaRef.current;
      if (!scrollAreaElement) return;
      
      // Radix ScrollArea viewport has data-radix-scroll-area-viewport attribute
      const viewport = scrollAreaElement.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (!viewport) return;

      const handleScroll = () => {
        const container = viewport;
        const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100; // 100px threshold
        shouldAutoScrollRef.current = isAtBottom;
      };

      viewport.addEventListener('scroll', handleScroll, { passive: true });
      scrollCleanup = () => viewport.removeEventListener('scroll', handleScroll);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (scrollCleanup) scrollCleanup();
    };
  }, []);

  useEffect(() => {
    const handleRoomClosed = (event: Event) => {
      if ((event as CustomEvent).detail?.roomId !== roomId) return;
      toast({ title: "Room closed", description: "The other user left the chat." });
      setLocation("/dashboard", { replace: true });
    };
    window.addEventListener("room-closed", handleRoomClosed);
    return () => window.removeEventListener("room-closed", handleRoomClosed);
  }, [roomId, setLocation, toast]);

  const handleSendMessage = async () => {
    const messageText = inputMessage.trim();
    if (!messageText || isSending || !isJoined) return;

    setIsSending(true);
    soundManager.playMessageSent();

    // Clear input immediately for better UX (like WhatsApp)
    setInputMessage("");
    
    // CRITICAL: Ensure auto-scroll is enabled when user sends a message
    shouldAutoScrollRef.current = true;
    
    try {
      // Send message via socket - the server will broadcast it back
      sendMessage(messageText);
      // Message will appear in chat when server broadcasts it via chat_message event
      
      // CRITICAL: Force scroll to bottom immediately after sending
      // This ensures the message appears visible even before server confirmation
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "instant", block: "end" });
        }
      }, 50);
    } catch (error) {
      console.error("Failed to send message:", error);
      // Restore message if sending failed
      setInputMessage(messageText);
      toast({
        variant: "destructive",
        title: "Failed to send",
        description: "Message could not be sent. Please try again.",
      });
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    recordingActive.current = true;
    return () => {
      recordingActive.current = false;
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
    };
  }, [roomId]);

  const startRecording = async () => {
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!recordingActive.current || mediaStreamRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const recordingStream = stream;
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        recordingStream.getTracks().forEach(track => track.stop());
        if (mediaStreamRef.current !== recordingStream) return;
        mediaStreamRef.current = null;
        if (!recordingActive.current || !chunks.length) return;
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || chunks[0].type });
        if (audioBlob.size > 5 * 1024 * 1024) {
          toast({ title: "Voice message is too large", description: "Record a shorter message.", variant: "destructive" });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (!recordingActive.current || mediaRecorderRef.current !== recorder || typeof reader.result !== "string") return;
          try {
            sendAudioBase64(reader.result);
          } catch {
            toast({ title: "Could not send voice message", variant: "destructive" });
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.start();
      setIsRecording(true);
      soundManager.playClick();
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      toast({ title: "Recording failed", description: "Check microphone permissions.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      soundManager.playMessageSent();
    }
  };

  const handleLeaveRoom = () => {
    soundManager.playLeave();
    setLocation("/dashboard");
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      soundManager.playClick();
      toast({ title: "Room code copied", description: roomId });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy room code", description: roomId, variant: "destructive" });
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
      toast({ title: "Invite link copied" });
    } catch {
      toast({ title: "Could not copy invite link", description: window.location.href, variant: "destructive" });
    }
  };

  // Removed formatTime - no longer needed without countdown timer

  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b bg-card shrink-0">
        <div className="px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Logo size="sm" showText={false} className="shrink-0" />
            <h1 className="text-base sm:text-lg md:text-xl font-bold truncate">
              {currentRoom?.name || "Chat Room"}
            </h1>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <code className="hidden sm:inline-block px-2 py-1 bg-muted rounded text-xs font-mono tracking-wider">
                {roomId}
              </code>
              <Button
                size="icon"
                variant="ghost"
                onClick={copyRoomCode}
                className="h-7 w-7 sm:h-8 sm:w-8"
                data-testid="button-copy-code"
              >
                {copied ? (
                  <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                ) : (
                  <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* WhatsApp-like connection status */}
            {socket ? (
              socket.connected && isJoined ? (
                <Badge variant="outline" className="text-[10px] sm:text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="hidden sm:inline">Online</span>
                </Badge>
              ) : socket.connected && !isJoined ? (
                <Badge variant="outline" className="text-[10px] sm:text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-yellow-500 rounded-full animate-pulse" />
                  <span className="hidden sm:inline">Connecting...</span>
                </Badge>
              ) : socket.active ? (
                <Badge variant="destructive" className="gap-1 sm:gap-1.5 animate-pulse text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-destructive rounded-full animate-pulse" />
                  <span className="hidden sm:inline">Reconnecting...</span>
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] sm:text-xs gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-muted-foreground rounded-full" />
                  <span className="hidden sm:inline">Offline</span>
                </Badge>
              )
            ) : (
              <Badge variant="secondary" className="text-[10px] sm:text-xs gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5">
                <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-muted-foreground rounded-full" />
                <span className="hidden sm:inline">Initializing...</span>
              </Badge>
            )}
            <Sheet open={showMobileUsers} onOpenChange={setShowMobileUsers}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMobileUsers(true)}
                className="lg:hidden h-7 w-7 sm:h-8 sm:w-8"
                data-testid="button-toggle-users"
                title="Online Users"
              >
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <SheetContent side="right" className="w-[85%] sm:w-[400px] p-0 [&>button]:hidden">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                    Online Users
                    <Badge variant="secondary" className="ml-auto mr-2 text-xs">
                      {currentRoom?.users?.length || 0} / {currentRoom?.maxUsers || 35}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowMobileUsers(false)}
                      className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950 shrink-0"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-80px)]">
                  <div className="p-3 sm:p-4 space-y-2">
                    {/* CRITICAL: Only show loading spinner if joining AND not yet joined (prevents flicker) */}
                    {isJoining && !isJoined && (!currentRoom?.users || currentRoom.users.length === 0) ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      </div>
                    ) : currentRoom?.users && currentRoom.users.length > 0 ? (
                      currentRoom.users.map((user, index) => {
                        // WhatsApp-like user display with typing indicator
                        const displayName = user || `Unknown#${index}`;
                        const isCurrentUser = user === username;
                        const isTyping = typingUsers.includes(user);
                        
                        return (
                          <div
                            key={`${user}-${index}`}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                            data-testid={`user-${user}`}
                          >
                            {/* WhatsApp-like online indicator with pulse */}
                            <div className="relative shrink-0">
                              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                              {isTyping && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center animate-bounce">
                                  <span className="text-[8px] text-primary-foreground">✎</span>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className="truncate font-medium text-sm sm:text-base">{displayName}</span>
                                {isCurrentUser && (
                                  <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">(You)</span>
                                )}
                              </div>
                              {isTyping && (
                                <div className="text-[10px] sm:text-xs text-muted-foreground italic mt-0.5">
                                  typing...
                                </div>
                              )}
                            </div>
                            
                            {user === currentRoom?.ownerUsername && (
                              <Badge variant="outline" className="text-[10px] sm:text-xs shrink-0">
                                Owner
                              </Badge>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No users online
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={copyInvite} className="h-7 sm:h-8">
              Copy invite
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLeaveRoom}
              className="h-7 w-7 sm:h-8 sm:w-8"
              data-testid="button-leave-room"
            >
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Connection Alert */}
      {roomError && (
        <Alert 
          variant="destructive" 
          className="rounded-none border-x-0 border-t-0"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {roomError}
            <Button variant="ghost" onClick={() => setRetry(value => value + 1)}>Try again</Button>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Joining Alert - CRITICAL: Hide immediately when room_joined event confirms success */}
      {isJoining && !roomError && !isJoined && (
        <Alert 
          variant="default" 
          className="rounded-none border-x-0 border-t-0"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {isConnected ? "Joining room…" : "Connecting to chat…"}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* CRITICAL: Make ScrollArea scrollable with overflow-y: auto and proper height */}
          <ScrollArea 
            ref={scrollAreaRef}
            className="flex-1 p-2 sm:p-3 md:p-4 min-h-0" 
            style={{ maxHeight: '100%', height: '100%' }}
          >
            <div 
              className="max-w-4xl mx-auto w-full"
              style={{ minHeight: '100%' }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] sm:min-h-[400px] text-center px-4">
                  <Users className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mb-3 sm:mb-4" />
                  <h3 className="text-lg sm:text-xl font-semibold mb-2">No messages yet</h3>
                  <p className="text-sm sm:text-base text-muted-foreground max-w-sm">
                    Start the conversation! Messages persist until everyone leaves the room.
                  </p>
                </div>
              ) : (
                messages.map((message, index) => {
                  const isOwn = message.username === username;
                  const isSystem = message.type === "system";
                  const prevMessage = index > 0 ? messages[index - 1] : null;
                  const showAvatar = !isOwn && (prevMessage === null || prevMessage.username !== message.username || prevMessage.type === "system");
                  const showTime = index === messages.length - 1 || 
                    (index < messages.length - 1 && messages[index + 1].username !== message.username) ||
                    (index < messages.length - 1 && (new Date(messages[index + 1].timestamp).getTime() - new Date(message.timestamp).getTime()) > 300000); // 5 minutes

                  if (isSystem) {
                    return (
                      <div key={message.id} className="flex justify-center my-2">
                        <Badge variant="secondary" className="text-xs italic px-3 py-1">
                          {message.content}
                        </Badge>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1 px-1 sm:px-2 ${
                        showAvatar ? "mt-2 sm:mt-3" : "mt-0.5"
                      }`}
                      data-testid={`message-${message.id}`}
                    >
                      {!isOwn && (
                        <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/20 flex items-center justify-center mr-1.5 sm:mr-2 mt-auto">
                          <span className="text-[10px] sm:text-xs font-semibold text-primary">
                            {message.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} max-w-[85%] xs:max-w-[75%] sm:max-w-[70%] md:max-w-[65%] lg:max-w-[60%]`}>
                        {/* NEW: Display username with assigned color before message */}
                        {!isOwn && showAvatar && (
                          <div className={`text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1 px-1.5 sm:px-2 ${getUsernameColorClass(roomId, message.username)}`}>
                            {message.username}
                          </div>
                        )}
                        {/* NEW: Also show colored username for own messages when needed */}
                        {isOwn && showAvatar && (
                          <div className={`text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1 px-1.5 sm:px-2 ${getUsernameColorClass(roomId, message.username)}`}>
                            {message.username}
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 shadow-sm ${
                            isOwn
                              ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : "bg-muted text-foreground rounded-tl-sm"
                          }`}
                        >
                          {message.type === "audio" && message.audioData ? (
                            <AudioPlayer 
                              src={message.audioData}
                              isOwn={isOwn}
                            />
                          ) : (
                            <div className="text-xs sm:text-sm break-words whitespace-pre-wrap leading-relaxed">
                              {message.content}
                            </div>
                          )}
                          {showTime && (
                            <div
                              className={`text-[10px] mt-1.5 flex items-center gap-1 ${
                                isOwn ? "text-primary-foreground/60 justify-end" : "text-muted-foreground justify-start"
                              }`}
                            >
                              <span>{formatMessageTime(message.timestamp)}</span>
                              {isOwn && (
                                <div className="flex items-center gap-0.5">
                                  {message.status === "failed" && (
                                    <span className="text-xs" title="This message could not be confirmed">Send failed</span>
                                  )}
                                  {message.status === "sending" && (
                                    <Check className="w-3 h-3 opacity-50" />
                                  )}
                                  {message.status === "sent" && (
                                    <CheckCheck className="w-3 h-3 opacity-75" />
                                  )}
                                  {message.status === "delivered" && (
                                    <CheckCheck className="w-3 h-3" />
                                  )}
                                  {!message.status && (
                                    <CheckCheck className="w-3 h-3 opacity-50" />
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
              
              {/* WhatsApp-like typing indicator */}
              {typingUsers.length > 0 && (
                <div className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-muted-foreground italic">
                  {typingUsers.length === 1 
                    ? `${typingUsers[0]} is typing...`
                    : `${typingUsers.length} people are typing...`}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Message Input - Sticky at bottom on mobile */}
          <div className="border-t p-2 sm:p-3 md:p-4 bg-card shrink-0">
            <div className="max-w-4xl mx-auto">
              {/* Recording Indicator */}
              {isRecording && (
                <div className="mb-2 sm:mb-3 flex items-center justify-center gap-2 text-xs sm:text-sm text-red-600 dark:text-red-400">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-600 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                  </span>
                  <span className="font-medium">Recording...</span>

                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex gap-1.5 sm:gap-2"
              >
                <Button
                  type="button"
                  size="icon"
                  className={`shrink-0 rounded-full h-10 w-10 sm:h-12 sm:w-12 ${isRecording ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                  disabled={!isRecording && (!socket?.connected || !isJoined)}
                  onClick={isRecording ? stopRecording : startRecording}
                  title={isRecording ? "Click to stop recording" : "Click to record audio"}
                >
                  <Mic className={`h-4 w-4 sm:h-5 sm:w-5 ${isRecording ? "animate-pulse" : ""}`} />
                </Button>
                <Input
                  placeholder={isJoined ? "Type a message..." : "Joining room..."}
                  value={inputMessage}
                  onChange={(e) => {
                    setInputMessage(e.target.value);
                    // WhatsApp-like typing indicators
                    if (isJoined && socket?.connected) {
                      if (e.target.value.length > 0 && e.target.value.trim().length > 0) {
                        setTyping(true);
                      } else {
                        setTyping(false);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    // Stop typing when Enter is pressed (message sent)
                    if (e.key === "Enter" && inputMessage.trim()) {
                      setTyping(false);
                    }
                  }}
                  onBlur={() => {
                    // Stop typing when input loses focus
                    setTyping(false);
                  }}
                  className="flex-1 h-10 sm:h-12 text-sm sm:text-base rounded-full px-4 sm:px-6"
                  disabled={isSending || !(socket?.connected) || !isJoined}
                  maxLength={5000}
                  data-testid="input-message"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="shrink-0 rounded-full h-10 w-10 sm:h-12 sm:w-12"
                  disabled={isSending || !inputMessage.trim() || !(socket?.connected) || !isJoined}
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </form>
            </div>
          </div>
        </div>

        {/* Users Sidebar */}
        {showUsers && (
          <div className="w-full sm:w-64 lg:w-80 border-l bg-card hidden lg:block">
            <div className="p-3 sm:p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                Online Users
                <Badge variant="secondary" className="ml-auto text-xs">
                  {currentRoom?.users?.length || 0} / {currentRoom?.maxUsers || 35}
                </Badge>
              </h2>
            </div>
            <ScrollArea className="h-[calc(100vh-130px)]">
              <div className="p-3 sm:p-4 space-y-2">
                {/* CRITICAL: Only show loading spinner if joining AND not yet joined (prevents flicker) */}
                {isJoining && !isJoined && (!currentRoom?.users || currentRoom.users.length === 0) ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : currentRoom?.users && currentRoom.users.length > 0 ? (
                  currentRoom.users.map((user, index) => {
                    // WhatsApp-like user display with typing indicator
                    const displayName = user || `Unknown#${index}`;
                    const isCurrentUser = user === username;
                    const isTyping = typingUsers.includes(user);
                    
                    return (
                      <div
                        key={`${user}-${index}`}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                        data-testid={`user-${user}`}
                      >
                        {/* WhatsApp-like online indicator with pulse */}
                        <div className="relative shrink-0">
                          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                          {isTyping && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center animate-bounce">
                              <span className="text-[8px] text-primary-foreground">✎</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <span className="truncate font-medium text-sm sm:text-base">{displayName}</span>
                            {isCurrentUser && (
                              <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">(You)</span>
                            )}
                          </div>
                          {isTyping && (
                            <div className="text-[10px] sm:text-xs text-muted-foreground italic mt-0.5">
                              typing...
                            </div>
                          )}
                        </div>
                        
                        {user === currentRoom?.ownerUsername && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs shrink-0">
                            Owner
                          </Badge>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No users online
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
