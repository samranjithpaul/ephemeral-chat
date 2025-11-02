import { useState } from "react";
import { useLocation } from "wouter";
import { Shield, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
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
        sessionStorage.setItem("userId", data.userId);
        sessionStorage.setItem("username", data.username);
        soundManager.playJoin();
        
        // Check if there's a room parameter in URL
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get("room");
        
        if (roomId) {
          setLocation(`/room/${roomId}`);
        } else {
          setLocation("/dashboard");
        }
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Shield className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-4xl font-bold">Ephemeral Chat</CardTitle>
          <CardDescription className="text-base">
            Secure, private, and temporary messaging
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-base">
                Username
              </Label>
              <div className="relative">
                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 h-12 text-base"
                  disabled={isLoading}
                  autoFocus
                  maxLength={20}
                  data-testid="input-username"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                No password required • 2-20 characters
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? "Connecting..." : "Enter Chat"}
            </Button>

            <div className="pt-4 border-t space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>All data auto-deletes after 1 hour</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>No chat history or user tracking</span>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="absolute bottom-4 text-center text-sm text-muted-foreground">
        <p>Privacy-first ephemeral messaging</p>
      </div>
    </div>
  );
}
