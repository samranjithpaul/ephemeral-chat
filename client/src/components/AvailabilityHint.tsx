import { ReactNode } from "react";

interface AvailabilityHintProps {
  status: "available" | "unavailable" | "checking" | "idle";
  message?: string;
  className?: string;
}

/**
 * Shared component for displaying room name/code availability messages
 * Ensures consistent styling across all availability hints
 */
export function AvailabilityHint({ status, message, className = "" }: AvailabilityHintProps) {
  if (status === "idle" || !message) {
    return null;
  }

  const isAvailable = status === "available";
  const isUnavailable = status === "unavailable";
  const isChecking = status === "checking";

  // Consistent styling - matches room name availability message exactly
  const baseClasses = "text-xs text-green-600 dark:text-green-400 mt-1";
  const unavailableClasses = "text-xs text-destructive mt-1";
  const checkingClasses = "text-xs text-muted-foreground mt-1";

  const classes = isAvailable
    ? baseClasses
    : isUnavailable
    ? unavailableClasses
    : checkingClasses;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={`${classes} ${className}`}
      role="status"
    >
      {message}
    </div>
  );
}

