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
  const roomId = params?.id || "";
  
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUsers, setShowUsers] = useState(true);
  const [showMobileUsers, setShowMobileUsers] = useState(false);
  // Removed countdown timer - messages persist until room is empty
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const hasJoinedRef = useRef(false);
  const { toast } = useToast();

  const { socket, isConnected, isJoined, joinRoom, leaveRoom, sendMessage, sendAudioBase64, currentRoom, messages, setMessages, typingUsers, setTyping } = useSocket();

  useEffect(() => {
    const storedUsername = sessionStorage.getItem("username");
    const storedUserId = sessionStorage.getItem("userId");
    
    // If not logged in, redirect to login immediately (don't preserve room ID in URL)
    if (!storedUsername || !storedUserId) {
      // Clear any room reference from URL to prevent redirect loops
      window.history.replaceState({}, "", "/");
      setLocation("/");
      return;
    }
    
    setUsername(storedUsername);
    setUserId(storedUserId);
    
    // CRITICAL: Set roomId in sessionStorage when entering room page (before join attempt)
    // This ensures socket auto-join works and heartbeat_bound handler can find the roomId
    if (roomId) {
      sessionStorage.setItem("roomId", roomId);
      console.log(`[ROOM] Set roomId in sessionStorage: ${roomId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]); // setLocation is stable from wouter, no need in deps

  // Memoize verifyAndJoinRoom to prevent recreation on every render
  const verifyAndJoinRoomRef = useRef<(() => Promise<void>) | null>(null);
  
  useEffect(() => {
    // Verify room exists and join when connected
    const verifyAndJoinRoom = async () => {
      console.log(`[ROOM] verifyAndJoinRoom called: userId=${userId} roomId=${roomId} hasJoinedRef=${hasJoinedRef.current} isJoining=${isJoining}`);
      
      if (!userId || !roomId || hasJoinedRef.current || isJoining) {
        console.log(`[ROOM] verifyAndJoinRoom skipped: userId=${!!userId} roomId=${!!roomId} hasJoinedRef=${hasJoinedRef.current} isJoining=${isJoining}`);
        return;
      }

      console.log(`[ROOM] Starting verifyAndJoinRoom process`);
      setIsJoining(true);
      setRoomError(null);

      try {
        // First verify room exists via API
        const serverUrl = import.meta.env.DEV ? "http://localhost:8080" : window.location.origin;
        const response = await fetch(`${serverUrl}/api/rooms/${roomId}`);
        const data = await response.json();

        if (!data.success || !data.room) {
          setRoomError("Room not found");
          setIsJoining(false);
          // Clear URL immediately to prevent re-trying or showing error multiple times
          window.history.replaceState({}, "", "/dashboard");
          
          toast({
            variant: "destructive",
            title: "Room not found",
            description: "The room has been deleted or doesn't exist.",
          });
          
          // Redirect immediately (don't wait)
          setLocation("/dashboard");
          return;
        }

        // CRITICAL: Wait for socket connection using actual socket state, not just isConnected
        let connected = socket?.connected || false;
        if (!connected && socket) {
          // Wait up to 10 seconds for connection
          let attempts = 0;
          while (!connected && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 500));
            // Check connection status from socket directly
            if (socket.connected) {
              connected = true;
              break;
            }
            attempts++;
          }
        }

        // CRITICAL: Use socket.connected as source of truth
        if ((connected || socket?.connected) && socket) {
          console.log(`[ROOM] ✅ Calling joinRoom roomId=${roomId} userId=${userId} socket.connected=${socket.connected} socket.id=${socket.id}`);
          hasJoinedRef.current = true; // Prevent duplicate joins
          
          // CRITICAL: Ensure roomId is in sessionStorage before calling joinRoom
          sessionStorage.setItem("roomId", roomId);
          sessionStorage.setItem("userId", userId);
          
          joinRoom(roomId, userId);
          // Note: isJoined will be set to true by room_joined event handler
        } else {
          console.error(`[ROOM] ❌ Connection check failed: connected=${connected} socket.connected=${socket?.connected} socket=${!!socket}`);
          setRoomError("Connection failed");
          setIsJoining(false);
          hasJoinedRef.current = false;
          toast({
            variant: "destructive",
            title: "Connection error",
            description: "Unable to connect to the server. Please try again.",
          });
        }
      } catch (error) {
        console.error("Room join error:", error);
        setRoomError("Failed to join room");
        setIsJoining(false);
        hasJoinedRef.current = false;
        
        // Clear URL to prevent retries
        window.history.replaceState({}, "", "/dashboard");
        
        toast({
          variant: "destructive",
          title: "Connection error",
          description: "Unable to connect to the room. Redirecting to dashboard...",
        });
        
        // Redirect to dashboard on error
        setTimeout(() => {
          setLocation("/dashboard");
        }, 1500);
      }
    };
    
    // Store ref to verifyAndJoinRoom so it can be called from other effects
    verifyAndJoinRoomRef.current = verifyAndJoinRoom;

    // CRITICAL: If socket exists but not connected, try to connect it
    if (userId && roomId && socket && !socket.connected) {
      console.log(`[ROOM] Socket exists but not connected - manually connecting socket.id=${socket.id}`);
      socket.connect();
      return; // Wait for connection before proceeding
    }
    
    // CRITICAL: Wait for socket to exist before trying to join
    if (!socket) {
      console.log(`[ROOM] Socket not initialized yet - waiting... userId=${userId} roomId=${roomId}`);
      return; // Wait for socket initialization
    }
    
    // CRITICAL: Check socket.connected directly, not just isConnected state
    // Also check that socket exists and we haven't already joined
    if (userId && roomId) {
      if (socket && socket.connected && !isJoined && !isJoining && !hasJoinedRef.current) {
        console.log(`[ROOM] ✅ Conditions met for join: userId=${userId} roomId=${roomId} socket.connected=${socket.connected} isJoined=${isJoined} isJoining=${isJoining} hasJoinedRef=${hasJoinedRef.current}`);
        verifyAndJoinRoom();
      } else {
        // Log why join is not being triggered (detailed debug)
        console.log(`[ROOM] ⚠️ Join conditions not met: userId=${userId} roomId=${roomId} socket=${!!socket} socket.connected=${socket?.connected} isConnected=${isConnected} isJoined=${isJoined} isJoining=${isJoining} hasJoinedRef=${hasJoinedRef.current}`);
        
        // If socket is connected but we haven't joined and aren't joining, try to trigger join
        // This handles the case where verifyAndJoinRoom wasn't called
        if (socket && socket.connected && !isJoined && !isJoining && !hasJoinedRef.current) {
          console.log(`[ROOM] 🔄 Attempting to trigger verifyAndJoinRoom (fallback)`);
          verifyAndJoinRoom();
        }
      }
    } else {
      console.log(`[ROOM] ⚠️ Missing userId or roomId: userId=${userId} roomId=${roomId}`);
    }
  }, [socket, isConnected, userId, roomId, isJoined, isJoining, joinRoom, setLocation, toast]);

  // Clear messages immediately when roomId changes to prevent old chat from flashing
  useEffect(() => {
    if (roomId) {
      console.log(`[CLIENT] Chat cleared when switching room roomId=${roomId}`);
      setMessages([]);
    }
    // Cleanup on unmount
    return () => {
      if (roomId) {
        setMessages([]);
      }
    };
  }, [roomId, setMessages]);

  // Reset join state when roomId changes
  useEffect(() => {
    setRoomError(null);
    setIsJoining(false);
    hasJoinedRef.current = false; // Reset join flag when room changes
    shouldAutoScrollRef.current = true; // Reset scroll behavior on room change
    console.log(`[ROOM] Room ID changed to ${roomId}, resetting join state`);
    
    // CRITICAL: If socket is already connected when roomId changes, trigger join immediately
    // This handles the case where user navigates to a new room while socket is connected
    if (roomId && userId && socket && socket.connected && !isJoined && !isJoining) {
      console.log(`[ROOM] Socket already connected on room change - triggering join immediately roomId=${roomId}`);
      setTimeout(() => {
        if (socket && socket.connected && !hasJoinedRef.current && !isJoined && verifyAndJoinRoomRef.current) {
          verifyAndJoinRoomRef.current();
        }
      }, 300); // Small delay to let state reset
    }
  }, [roomId]);
  
  // CRITICAL: Reset hasJoinedRef when isJoined becomes true (successful join)
  useEffect(() => {
    if (isJoined) {
      console.log(`[ROOM] isJoined=true, ensuring hasJoinedRef is set`);
      hasJoinedRef.current = true;
    }
  }, [isJoined]);

  // Log when both users have joined successfully (for random chat debugging)
  useEffect(() => {
    if (isJoined && currentRoom && currentRoom.maxUsers === 2 && currentRoom.users && currentRoom.users.length === 2) {
      if (import.meta.env.DEV) {
        console.log(`[RANDOM_CHAT] ✅ Both users have joined successfully roomId=${roomId} users=[${currentRoom.users.join(', ')}]`);
        console.log(`[RANDOM_CHAT] Room is ready for chat - both sides are connected`);
      }
    }
  }, [isJoined, currentRoom, roomId]);
  
  // CRITICAL: Additional fallback - if socket connects while on room page, trigger join
  useEffect(() => {
    if (socket && socket.connected && userId && roomId && !isJoined && !isJoining && !hasJoinedRef.current) {
      console.log(`[ROOM] Fallback: Socket connected while on room page - triggering join roomId=${roomId} userId=${userId}`);
      setTimeout(() => {
        if (socket && socket.connected && !hasJoinedRef.current && !isJoined && verifyAndJoinRoomRef.current) {
          verifyAndJoinRoomRef.current();
        }
      }, 500);
    }
  }, [socket?.connected, userId, roomId, isJoined, isJoining]); // Watch socket.connected specifically

  // Removed countdown timer - messages persist until room is empty

  // CRITICAL: When room_joined event sets isJoined=true, immediately hide "Joining room..." UI
  // This prevents flicker and ensures UI activates instantly when join confirmation arrives
  useEffect(() => {
    if (isJoined && isJoining) {
      console.log(`[ROOM UI] room_joined confirmed - hiding 'Joining room...' UI immediately`);
      setIsJoining(false);
    }
  }, [isJoined, isJoining]);

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
    // Leave room on unmount and clear all room data
    return () => {
      if (userId && roomId && isJoined) {
        leaveRoom(roomId, userId);
      }
      // Clear any room references from storage to prevent redirects
      sessionStorage.removeItem("lastRoomId");
      localStorage.removeItem("lastRoomId");
    };
  }, [userId, roomId, isJoined, leaveRoom]);
  
  // Listen for user left and room closed events to show toast notifications
  useEffect(() => {
    const handleUserLeft = (event: CustomEvent) => {
      console.log(`[TOAST] User left event received`, event.detail);
      toast({
        title: "User Left",
        description: "A user has left the chat.",
        variant: "default",
      });
    };
    
    const handleRoomClosed = (event: CustomEvent) => {
      const { reason } = event.detail || {};
      console.log(`[TOAST] Room closed event received`, event.detail);
      
      // Ensure username and userId are preserved before redirect
      const username = sessionStorage.getItem("username");
      const userId = sessionStorage.getItem("userId");
      if (!username || !userId) {
        console.warn(`[ROOM_CLEANUP] Missing session data - username=${!!username} userId=${!!userId}`);
      }
      
      toast({
        title: "Room Closed",
        description: reason === "not_enough_users" 
          ? "The other user left. This room will be closed and you'll be redirected to the dashboard."
          : "This room has been closed.",
        variant: "destructive",
        duration: 2000,
      });
      
      // Redirect to dashboard after toast (using setLocation to preserve session)
      setTimeout(() => {
        console.log(`[ROOM_CLEANUP] Redirecting to dashboard from room page`);
        setLocation("/dashboard");
      }, 2000);
    };
    
    const handleSystemMessage = (event: CustomEvent) => {
      const { type, message, username } = event.detail || {};
      if (type === "user_left") {
        // Show toast when user leaves
        toast({
          title: "User Left",
          description: message || `${username || "User"} left the room.`,
          variant: "default",
        });
        console.log(`[TOAST] User left - ${username || "User"}`);
      } else if (type === "room_deleted") {
        // Show toast when room is deleted
        toast({
          title: "Room Closed",
          description: message || "The room has been closed.",
          variant: "destructive",
          duration: 2000,
        });
        console.log(`[TOAST] Room deleted - ${message}`);
      }
    };
    
    window.addEventListener("user-left", handleUserLeft as EventListener);
    window.addEventListener("room-closed", handleRoomClosed as EventListener);
    window.addEventListener("system-message", handleSystemMessage as EventListener);
    
    return () => {
      window.removeEventListener("user-left", handleUserLeft as EventListener);
      window.removeEventListener("room-closed", handleRoomClosed as EventListener);
      window.removeEventListener("system-message", handleSystemMessage as EventListener);
    };
  }, [toast]);

  const handleSendMessage = async () => {
    const messageText = inputMessage.trim();
    if (!messageText || isSending || !(socket?.connected)) return;

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

  // Audio recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          sendAudioBase64(base64Audio);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      soundManager.playClick();
    } catch (error: any) {
      console.error("Failed to start recording:", error);
      toast({
        variant: "destructive",
        title: "Recording failed",
        description: "Could not access microphone. Please check permissions.",
      });
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
    if (userId && roomId) {
      leaveRoom(roomId, userId);
    }
    setLocation("/dashboard");
  };

  // NEW: Copy Room Code button - enhanced with share option
  const copyRoomCode = () => {
    // Copy just the room ID, not the full URL
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    soundManager.playClick();
    toast({
      title: "Room code copied!",
      description: `Room code "${roomId}" copied to clipboard. Share it with others so they can join this room.`,
    });
    setTimeout(() => setCopied(false), 2000);
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
              ) : socket.io && socket.io._reconnecting ? (
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
            Joining room...
          </AlertDescription>
        </Alert>
      )}
      
      {/* Connection Status (only show if not connected AND have joined before) */}
      {socket && !socket.connected && isJoined && !isJoining && !roomError && (
        <Alert 
          variant="default" 
          className="rounded-none border-x-0 border-t-0 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950"
        >
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            {socket.io && socket.io._reconnecting
              ? "Connection lost — reconnecting..." 
              : "Disconnected"}
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
                  disabled={!(socket?.connected) || !isJoined}
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
