import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { Send, Paperclip, Users, LogOut, Copy, Check, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { soundManager } from "@/lib/sounds";
import { useSocket } from "@/lib/socket";

export default function RoomPage() {
  const [, params] = useRoute("/room/:id");
  const roomId = params?.id || "";
  
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUsers, setShowUsers] = useState(true);
  const [timeLeft, setTimeLeft] = useState(3600); // 1 hour in seconds
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasJoinedRef = useRef(false);
  const { toast } = useToast();

  const { isConnected, joinRoom, leaveRoom, sendMessage, currentRoom, messages } = useSocket();

  useEffect(() => {
    const storedUsername = sessionStorage.getItem("username");
    const storedUserId = sessionStorage.getItem("userId");
    
    if (!storedUsername || !storedUserId) {
      setLocation(`/?room=${roomId}`);
      return;
    }
    
    setUsername(storedUsername);
    setUserId(storedUserId);
  }, [setLocation, roomId]);

  useEffect(() => {
    // Join room when connected and we have user info
    if (isConnected && userId && roomId && !hasJoinedRef.current) {
      joinRoom(roomId, userId);
      hasJoinedRef.current = true;
    }
  }, [isConnected, userId, roomId, joinRoom]);

  useEffect(() => {
    // Countdown timer
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    
    // Play sound for new messages (except system messages)
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.type !== "system" && lastMessage.username !== username) {
        soundManager.playMessageReceived();
      }
    }
  }, [messages, username]);

  useEffect(() => {
    // Leave room on unmount
    return () => {
      if (userId && roomId && hasJoinedRef.current) {
        leaveRoom(roomId, userId);
      }
    };
  }, [userId, roomId, leaveRoom]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isSending) return;

    setIsSending(true);
    soundManager.playMessageSent();

    sendMessage(roomId, username, inputMessage.trim());
    setInputMessage("");
    setIsSending(false);
  };

  const handleLeaveRoom = () => {
    soundManager.playLeave();
    if (userId && roomId) {
      leaveRoom(roomId, userId);
    }
    setLocation("/dashboard");
  };

  const copyRoomCode = () => {
    const link = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    soundManager.playClick();
    toast({
      title: "Link copied!",
      description: "Share this link with others to invite them",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-bold truncate">
              {currentRoom?.name || "Chat Room"}
            </h1>
            <div className="flex items-center gap-2">
              <code className="hidden sm:inline-block px-2 py-1 bg-muted rounded text-xs font-mono tracking-wider">
                {roomId}
              </code>
              <Button
                size="icon"
                variant="ghost"
                onClick={copyRoomCode}
                className="h-8 w-8"
                data-testid="button-copy-code"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(timeLeft)}
            </Badge>
            {!isConnected && (
              <Badge variant="destructive" className="gap-1 animate-pulse">
                <AlertCircle className="h-3 w-3" />
                Reconnecting...
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowUsers(!showUsers)}
              className="lg:hidden"
              data-testid="button-toggle-users"
            >
              <Users className="h-5 w-5" />
            </Button>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLeaveRoom}
              data-testid="button-leave-room"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Connection Alert */}
      {!isConnected && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Network unstable — trying to reconnect...
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1 p-4">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                  <Users className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No messages yet</h3>
                  <p className="text-muted-foreground max-w-sm">
                    Start the conversation! Your messages will auto-delete after 1 hour.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const isOwn = message.username === username;
                  const isSystem = message.type === "system";

                  if (isSystem) {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <Badge variant="secondary" className="text-xs italic">
                          {message.content}
                        </Badge>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                      data-testid={`message-${message.id}`}
                    >
                      <div
                        className={`max-w-md lg:max-w-lg rounded-2xl px-4 py-3 ${
                          isOwn
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {!isOwn && (
                          <div className="text-sm font-medium mb-1">
                            {message.username}
                          </div>
                        )}
                        <div className="text-base break-words">{message.content}</div>
                        <div
                          className={`text-xs mt-1 ${
                            isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}
                        >
                          {formatMessageTime(message.timestamp)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Message Input */}
          <div className="border-t p-4 bg-card">
            <div className="max-w-4xl mx-auto">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex gap-2"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  disabled
                  data-testid="button-attach-file"
                  title="File sharing coming soon"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Input
                  placeholder="Type a message..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 h-12 text-base rounded-full px-6"
                  disabled={isSending || !isConnected}
                  maxLength={5000}
                  data-testid="input-message"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="shrink-0 rounded-full h-12 w-12"
                  disabled={isSending || !inputMessage.trim() || !isConnected}
                  data-testid="button-send-message"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </form>
            </div>
          </div>
        </div>

        {/* Users Sidebar */}
        {showUsers && (
          <div className="w-80 border-l bg-card hidden lg:block">
            <div className="p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" />
                Online Users
                <Badge variant="secondary" className="ml-auto">
                  {currentRoom?.users.length || 0} / {currentRoom?.maxUsers || 35}
                </Badge>
              </h2>
            </div>
            <ScrollArea className="h-[calc(100vh-130px)]">
              <div className="p-4 space-y-2">
                {currentRoom?.users.map((user, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg hover-elevate"
                    data-testid={`user-${user}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-status-online shrink-0" />
                    <span className="flex-1 truncate">{user}</span>
                    {user === currentRoom.ownerUsername && (
                      <Badge variant="outline" className="text-xs">
                        Owner
                      </Badge>
                    )}
                  </div>
                )) || (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Loading users...
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
