// NEW: Username color assignment utility using color hashing
// Assigns consistent colors to usernames using deterministic hashing

// Color palette optimized for both light and dark modes with good contrast
const COLOR_PALETTE = [
  { name: "blue", light: "text-blue-600", dark: "text-blue-400" },
  { name: "green", light: "text-green-600", dark: "text-green-400" },
  { name: "amber", light: "text-amber-600", dark: "text-amber-400" },
  { name: "violet", light: "text-violet-600", dark: "text-violet-400" },
  { name: "pink", light: "text-pink-600", dark: "text-pink-400" },
  { name: "red", light: "text-red-600", dark: "text-red-400" },
  { name: "teal", light: "text-teal-600", dark: "text-teal-400" },
  { name: "indigo", light: "text-indigo-600", dark: "text-indigo-400" },
  { name: "orange", light: "text-orange-600", dark: "text-orange-400" },
  { name: "cyan", light: "text-cyan-600", dark: "text-cyan-400" },
];

/**
 * Hash a string to a number (simple but effective for color assignment)
 * Same string always produces same hash
 */
function stringToHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get color class for a username using hash-based assignment
 * Same username always gets the same color across all rooms and sessions
 */
export function getUsernameColorClass(roomId: string, username: string): string {
  if (!username) return "text-foreground";
  
  // Use combined roomId + username for room-specific coloring
  // Or just username for consistent coloring across all rooms
  const hashKey = `${roomId}:${username}`;
  const hash = stringToHash(hashKey);
  const colorIndex = hash % COLOR_PALETTE.length;
  const color = COLOR_PALETTE[colorIndex];
  
  // Return classes that work in both light and dark modes
  return `${color.light} dark:${color.dark}`;
}

/**
 * Get username color name (for potential future use)
 */
export function getUsernameColor(roomId: string, username: string): string {
  if (!username) return "foreground";
  const hashKey = `${roomId}:${username}`;
  const hash = stringToHash(hashKey);
  const colorIndex = hash % COLOR_PALETTE.length;
  return COLOR_PALETTE[colorIndex].name;
}

/**
 * Clear color cache (not needed for hash-based system, but kept for compatibility)
 */
export function clearRoomColors(roomId: string): void {
  // Hash-based system doesn't need caching, but function kept for API compatibility
}

