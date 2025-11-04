# Race Condition & Presence Bug Fixes - Summary

## Changes Applied

### A. Unified Room User Storage (Single Source of Truth)
**File**: `server/storage.ts`

- **Removed**: All writes to `room.users` array
- **Added**: `getRoom()` now computes `room.users` array from Redis set `room:<id>:users` (read-only)
- **Result**: Eliminates drift between set and array - set is authoritative

**Side-effects & Mitigations**:
1. Code expecting `room.users` may see empty array initially → Fixed by computing from set in `getRoom()`
2. Slight performance cost parsing set → Negligible (users typically < 35)
3. Migration: existing rooms will populate array on first read → Automatic via `getRoom()`

### B. Atomic Add/Remove Operations
**File**: `server/storage.ts`

- **`addUserToRoom()`**: Uses Redis pipeline for atomic SADD + room metadata update + TTL refresh
- **`removeUserFromRoom()`**: Uses Redis pipeline for atomic SREM + room metadata update + TTL refresh
- **Assertion**: Verifies user presence in set after add (logs error if missing)

**Side-effects & Mitigations**:
1. More Redis operations per add/remove → Mitigated by batching in pipeline
2. Assertion adds overhead → Acceptable for correctness guarantees
3. Pipeline failures require rollback → Handled with try/catch and explicit error logs

### C. Cancellable Room Deletion Scheduling
**File**: `server/storage.ts`

- **Increased**: `ROOM_DELETE_GRACE_MS` from 10s → 60s (configurable via `ROOM_DELETE_GRACE_MS` env var)
- **Added**: Scheduled deletion with cancellation when user joins during grace period
- **Mechanism**: `scheduledDeletions` Map tracks pending deletions, `emptySinceKey` Redis key tracks empty timestamp

**Side-effects & Mitigations**:
1. More memory usage for scheduled timers → Limited (only for empty rooms, auto-cleaned)
2. Delayed deletion might leave stale rooms longer → Acceptable tradeoff for preventing race conditions
3. Redis key `room:<id>:emptySince` added → Small storage overhead, cleaned on deletion

### D. Sequential Join Flow
**File**: `server/routes.ts`

- **Sequence**: validate → addSocketToUser → addUserToRoom → socket.join → delay → update metadata → fetch users → load messages → broadcast → ack
- **Rollback**: If `socket.join()` fails, removes user from room via `removeUserFromRoom()`
- **Logging**: Added `🔗 [SOCKET JOINED]` and `📨 [ONLINE USERS BROADCAST]` logs

**Side-effects & Mitigations**:
1. More sequential awaits → Necessary for correctness, minimal latency impact
2. Rollback on socket.join failure → Prevents ghost users, logs error clearly
3. Broadcast happens after all storage writes → Ensures authoritative state

### E. Robust Disconnect Cleanup
**File**: `server/routes.ts`

- **Idempotency**: `cleanedUp` flag prevents double cleanup
- **Recovery**: Attempts to recover `userId`/`roomId` from `socket.rooms` and socket mapping
- **Multi-socket check**: Scans all sockets before removing user from room
- **Graceful skip**: If no `userId`, logs error and emits `forceLogout` to client

**Side-effects & Mitigations**:
1. Debounce delay (500ms) might delay cleanup → Acceptable for preventing race conditions
2. Multi-socket check adds overhead → Necessary for correctness, uses efficient `fetchSockets()`
3. Force logout might disconnect clients unnecessarily → Only on invalid state, helps reset corrupted sessions

### F. Enhanced Logging
**Files**: `server/storage.ts`, `server/routes.ts`

- **Added**: `✅ [ADD_USER]`, `⚠ [REMOVE_USER]`, `⌛ [SCHEDULE_DELETE]`, `❌ [ASSERT]`, `🔗 [SOCKET JOINED]`, `📨 [ONLINE USERS BROADCAST]`
- **Format**: Consistent with requested patterns

**Side-effects & Mitigations**:
1. More log volume → Acceptable for production debugging
2. Log parsing might need updates → Standard format maintained
3. Performance impact → Negligible (console.log is fast)

## Environment Variable

- `ROOM_DELETE_GRACE_MS`: Room deletion grace period in milliseconds (default: 60000 = 60 seconds)

## Testing Checklist

### Test 1: Multi-tab Same User
1. Open two tabs as same user
2. Join same room in both tabs
3. Close tab A
4. **Expected**: User remains in `onlineUsers` on tab B (hasOtherSocketsInRoom check)
5. Close tab B
6. **Expected**: After grace period, room deleted once with log `🗑️ [ROOM DELETE] reason=empty_and_aged`

### Test 2: Parallel Join Race
1. Create room from tab A
2. Immediately join from tab B (within 60s of creation)
3. **Expected**: Room not deleted; both tabs show online users
4. **Logs**: Should show `⌛ [SCHEDULE_DELETE] cancelled reason=user_joined`

### Test 3: Message Delivery
1. Join room in tab A
2. Wait for join ack
3. Send message immediately
4. **Expected**: Message appears in both tabs, server logs `💬 [SEND_MESSAGE ok]`
5. **Logs**: No "message vanished" errors

### Test 4: Early Disconnect
1. Start login flow
2. Abort before join completes (close tab)
3. **Expected**: Server logs `[ERROR:disconnect] Missing userId` but no room deletion
4. **Expected**: Client receives `forceLogout` event and redirects to login

### Test 5: Failure Rollback
1. Force `socket.join()` to fail (simulate error)
2. **Expected**: Server logs `❌ [ROLLBACK]` and removes user from room
3. **Expected**: No ghost users in Redis set
4. **Expected**: Client receives `{ ok: false, reason: "socket_join_error" }`

## Redis Flush Script (Local Testing)

```bash
# WARNING: This will delete ALL Redis keys. Use only for local testing.
redis-cli FLUSHALL
echo "✅ Redis flushed (local testing only)"
```

## Verification Log Patterns

### Good Join:
```
📥 [JOIN_ROOM start] socket=... roomId=... userId=...
✅ [ADD_USER] roomId=... userId=... result=ok
🔗 [SOCKET JOINED] socket=... roomId=...
✅ [JOIN_ROOM ok] user=... roomId=... socket=...
📨 [ONLINE USERS BROADCAST] roomId=... count=...
```

### Good Remove:
```
❌ [DISCONNECT] socket=... reason=...
👋 [LEAVE] userId=... roomId=... cleanedUp=true
⚠ [REMOVE_USER] user not found in set ... (if idempotent)
⌛ [SCHEDULE_DELETE] roomId=... scheduledAt=... dueTo=empty_fresh delay=...
🗑️ [ROOM DELETE] roomId=... reason=empty_and_aged age=...ms
```

