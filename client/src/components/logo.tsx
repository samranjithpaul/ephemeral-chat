import { useLocation } from "wouter";

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className = "", showText = true, size = "md" }: LogoProps) {
  const [, setLocation] = useLocation();
  
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };
  
  const textSizeClasses = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-xl",
  };

  return (
    <button
      onClick={() => setLocation("/dashboard")}
      className={`flex items-center gap-2 group transition-opacity hover:opacity-80 ${className}`}
      aria-label="Ephemeral Chat - Go to dashboard"
    >
      {/* Logo Icon - Chat bubble with fade effect */}
      <svg
        className={`${sizeClasses[size]} text-primary`}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`fadeGradient-${size}`} x1="8" y1="8" x2="24" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Main chat bubble */}
        <path
          d="M8 12C8 9.79086 9.79086 8 12 8H20C22.2091 8 24 9.79086 24 12V18C24 20.2091 22.2091 22 20 22H14L10 26V22C8.89543 22 8 21.1046 8 20V12Z"
          fill="currentColor"
          className="opacity-90"
        />
        {/* Fade effect overlay - suggesting ephemeral/temporary */}
        <path
          d="M8 12C8 9.79086 9.79086 8 12 8H20C22.2091 8 24 9.79086 24 12V18C24 20.2091 22.2091 22 20 22H14L10 26V22C8.89543 22 8 21.1046 8 20V12Z"
          fill={`url(#fadeGradient-${size})`}
          className="opacity-60"
        />
        {/* Two dots representing messages - white for better visibility */}
        <circle cx="13.5" cy="14.5" r="2" fill="white" className="opacity-90" />
        <circle cx="18.5" cy="14.5" r="2" fill="white" className="opacity-90" />
      </svg>
      
      {/* Logo Text */}
      {showText && (
        <span className={`font-bold ${textSizeClasses[size]} text-foreground group-hover:text-primary transition-colors`}>
          Ephemeral Chat
        </span>
      )}
    </button>
  );
}

