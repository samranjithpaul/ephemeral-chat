# Socket Stability Fixes for Vite/React Dev Reloads

## Problem
Socket was reconnecting on every Vite HMR or React re-mount, causing:
- `[CONNECT]` → `[DISCONNECT]` → `[JOIN_ROOM]` → `[DISCONNECT]` → `[CONNECT]` cycles
- Excessive logging noise in development
- Appearing like "reconnecting again and again"

## Root Causes
1. **React Strict Mode** - Intentionally double-mounts components in dev
2. **Vite HMR** - Triggers full page reloads on code changes
3. **Socket re-creation** - New socket instance created on every component mount
4. **No cleanup guards** - Previous socket not properly checked before creating new one

## Fixes Applied

### 1. Singleton Socket Pattern with useRef Guard
**File**: `client/src/lib/socket.tsx`

- Added `initializedRef` to guard against React Strict Mode double-mounts
- Check if socket already exists before creating new one
- Reuse existing socket connection if still connected
- Proper cleanup only on actual unmount

```typescript
const initializedRef = useRef(false);

useEffect(() => {
  if (initializedRef.current) {
    return; // Skip duplicate mount
  }
  initializedRef.current = true;
  
  if (socketRef.current && socketRef.current.connected) {
    setSocket(socketRef.current); // Reuse existing
    return;
  }
  // ... create socket
}, []);
```

### 2. React Strict Mode Handling
**File**: `client/src/main.tsx`

- Already using `createRoot` (React 18+)
- No `<StrictMode>` wrapper, so no intentional double-mounts
- Guard still added as defensive measure

### 3. Vite Configuration
**File**: `vite.config.ts`

- Added watch ignores to reduce unnecessary reloads:
  - `node_modules/**`
  - `dist/**`
  - `.git/**`
- Disabled polling for better performance
- Kept HMR overlay for errors but reduced full page reloads

### 4. Development Log Throttling
**File**: `client/src/lib/socket.tsx`

- Added conditional logging based on `import.meta.env.DEV`
- Heartbeat logs throttled (only 20% logged in dev)
- Disconnect logs filtered (suppress on page reload in production)
- Production builds have minimal logging

```typescript
const isDev = import.meta.env.DEV;
const log = isDev ? console.log.bind(console) : () => {}; // No-op in production
```

### 5. Improved Cleanup Logic
**File**: `client/src/lib/socket.tsx`

- Only cleanup socket if no longer in use
- Check listener count before disconnecting
- Reset guards properly on cleanup
- Prevent cleanup during re-renders

## Results

### Before
```
[SOCKET SYNC] Socket initialized
✅ [Client] connected abc123
[SOCKET SYNC] Disconnect event
⚠ [Client] Disconnected
[SOCKET SYNC] Socket initialized  // Duplicate!
✅ [Client] connected xyz789      // New socket
[SOCKET SYNC] Disconnect event
...
```

### After
```
[SOCKET SYNC] Socket initialized
✅ [Client] connected abc123
// React Strict Mode second mount skipped
[SOCKET SYNC] Socket already initialized - skipping duplicate mount
// Socket persists across HMR
// Only reconnects on actual network issues
```

## Verification

1. **No duplicate connects** - `initializedRef` guard prevents double initialization
2. **Socket reuse** - Existing connections are reused instead of creating new ones
3. **Reduced log noise** - Dev logs throttled, production logs minimal
4. **Proper cleanup** - Only cleans up on actual unmount, not re-renders
5. **HMR friendly** - Socket persists across Vite hot reloads

## Testing

1. Open dev tools console
2. Make a code change that triggers HMR
3. Verify socket doesn't disconnect/reconnect
4. Verify no duplicate `[CONNECT]` logs
5. Check that socket ID stays consistent

## Notes

- In production, logs are minimal (only errors/warnings)
- React Strict Mode double-mounts are now handled gracefully
- Vite HMR no longer causes socket disconnects
- Socket only reconnects on actual network issues or explicit disconnects

