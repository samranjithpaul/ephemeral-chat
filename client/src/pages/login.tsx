import { useState } from "react";
import { useLocation } from "wouter";
import { Shield, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { COPY } from "@/lib/copy";
import { soundManager } from "@/lib/sounds";

export default function Login() {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      toast({
        title: "Username required",
        description: "Please enter a username to continue",
        variant: "destructive",
      });
      soundManager.playError();
      return;
    }

    if (username.length < 2 || username.length > 20) {
      toast({
        title: "Invalid username",
        description: "Username must be between 2 and 20 characters",
        variant: "destructive",
      });
      soundManager.playError();
      return;
    }

    setIsLoading(true);
    soundManager.playClick();

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        // Clear ALL old session data first (fresh start - no room redirects)
        sessionStorage.clear();
        localStorage.clear(); // Also clear localStorage to remove any room references
        
        // Explicitly remove roomId if it exists
        localStorage.removeItem('roomId');
        sessionStorage.removeItem('roomId');
        
        // Clear URL parameters to prevent redirect to old rooms
        window.history.replaceState({}, "", window.location.pathname);
        
        // Set new session data FIRST (before any socket operations)
        sessionStorage.setItem("userId", data.userId);
        sessionStorage.setItem("username", data.username);
        
        console.log("[SOCKET SYNC] Login successful - userId set in sessionStorage", { userId: data.userId, username: data.username });
        
        // Do NOT disconnect socket during login - socket will automatically update userId via heartbeat
        // Socket is already connected and will pick up new userId on next heartbeat
        // Only disconnect on explicit logout, not on login
        
        soundManager.playJoin();
        
        // Always redirect to dashboard (never auto-redirect to old rooms)
        setLocation("/dashboard");
      } else {
        toast({
          title: "Login failed",
          description: data.message || "Username already taken",
          variant: "destructive",
        });
        soundManager.playError();
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: "Unable to connect to server",
        variant: "destructive",
      });
      soundManager.playError();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-3 sm:space-y-4 px-4 sm:px-6 pt-6 sm:pt-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3 sm:p-4">
              <Logo size="lg" showText={false} className="pointer-events-none animate-pulse" />
            </div>
          </div>
          <CardTitle className="text-2xl sm:text-3xl md:text-4xl font-bold">{COPY.LOGIN.TITLE}</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {COPY.LOGIN.SUBTITLE}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-6">
          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm sm:text-base">
                {COPY.LOGIN.USERNAME_LABEL}
              </Label>
              <div className="relative">
                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder={COPY.LOGIN.USERNAME_PLACEHOLDER}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9 sm:pl-10 h-11 sm:h-12 text-sm sm:text-base"
                  disabled={isLoading}
                  autoFocus
                  maxLength={20}
                  data-testid="input-username"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {COPY.LOGIN.USERNAME_HELPER}
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? COPY.LOGIN.BUTTON_LOADING : COPY.LOGIN.BUTTON_TEXT}
            </Button>

            <div className="pt-3 sm:pt-4 border-t space-y-2">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                <Shield className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                <span>{COPY.LOGIN.BULLET_1}</span>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                <Shield className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                <span>{COPY.LOGIN.BULLET_2}</span>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="absolute bottom-2 sm:bottom-4 left-0 right-0 text-center text-xs sm:text-sm text-muted-foreground px-4">
        <p>{COPY.LOGIN.FOOTER}</p>
      </div>
    </div>
  );
}
