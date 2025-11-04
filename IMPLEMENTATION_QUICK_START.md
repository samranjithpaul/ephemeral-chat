# Quick Start: Copy-Paste Implementation Guide

## File-by-File Implementation

### 1. Server: `server/routes.ts`

#### Replace the `io.on("connection")` handler (around line 465):

```typescript
io.on("connection", (socket: TypedSocket) => {
  const connectTs = new Date().toISOString();
  console.log(`[SOCKET SYNC] Connection received socket.id=${socket.id} ts=${connectTs}`);
  console.log(`✅ [CONNECT] ${socket.id}`);

  // Initialize socket data IMMEDIATELY
  socket.data = {
    roomId: null,
    userId: null,
    username: null,
    joining: false,
    leavingRoom: false,
    processingDisconnect: false,
    cleanedUp: false,
    joined: false,
  };

  console.log(`[TRACE:socketBinding] socket=${socket.id} userId=null roomId=null stage=connection`);

  // [PASTE HEARTBEAT HANDLER HERE - see REALTIME_SYSTEM_AUDIT.md]
  // [PASTE JOIN_ROOM HANDLER HERE - see REALTIME_SYSTEM_AUDIT.md]
  // [PASTE SEND_MESSAGE HANDLER HERE - see REALTIME_SYSTEM_AUDIT.md]
  // [PASTE DISCONNECT HANDLER HERE - see REALTIME_SYSTEM_AUDIT.md]
});
```

#### Add `broadcastOnlineUsers` helper function (before `io.on("connection")`, around line 55):

```typescript
async function broadcastOnlineUsers(io: SocketIOServer, roomId: string): Promise<void> {
  try {
    const users = await getRoomUsers(roomId);
    const connectedUsers: string[] = [];
    const socketsInRoom = await io.in(roomId).fetchSockets();
    const connectedUserIds = new Set<string>();
    
    for (const s of socketsInRoom) {
      const socketData = (s as any).data;
      if (socketData?.userId && s.connected) {
        connectedUserIds.add(socketData.userId);
      }
    }
    
    for (const user of users) {
      if (connectedUserIds.has(user.id)) {
        connectedUsers.push(user.username);
      }
    }
    
    io.to(roomId).emit("onlineUsers", connectedUsers);
    
    const ts = new Date().toISOString();
    console.log(`[PRESENCE] broadcast roomId=${roomId} totalUsers=${users.length} connectedUsers=${connectedUsers.length} ts=${ts}`);
  } catch (err: any) {
    logger.error("broadcastOnlineUsers", "Error broadcasting users", { roomId }, err);
  }
}
```

### 2. Client: `client/src/lib/socket.tsx`

#### Replace the `useEffect` that initializes socket (around line 41):

```typescript
useEffect(() => {
  if (initializedRef.current) {
    log(`[SOCKET SYNC] Socket already initialized - skipping`);
    return;
  }
  initializedRef.current = true;
  
  const serverUrl = import.meta.env.DEV 
    ? `http://localhost:8080` 
    : window.location.origin;
  
  const userId = sessionStorage.getItem("userId");
  const roomId = sessionStorage.getItem("roomId");
  const shouldAutoConnect = !!(userId && roomId);
  
  if (socketRef.current && socketRef.current.connected) {
    log(`[SOCKET SYNC] Reusing existing socket socket.id=${socketRef.current.id}`);
    setSocket(socketRef.current);
    setIsConnected(true);
    return;
  }
  
  const newSocket = io(serverUrl, {
    transports: ["websocket", "polling"],
    autoConnect: shouldAutoConnect,
    reconnection: shouldAutoConnect,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    timeout: 20000,
    forceNew: false,
  });
  
  socketRef.current = newSocket;
  setSocket(newSocket);
  setIsConnected(newSocket.connected);
  
  log(`[SOCKET SYNC] Socket initialized autoConnect=${shouldAutoConnect} userId=${userId || 'null'}`);

  // [PASTE ALL EVENT LISTENERS HERE - see REALTIME_SYSTEM_AUDIT.md]
  // Order matters: listeners BEFORE any emit!
  
  // 1. connect listener
  // 2. disconnect listener
  // 3. connect_error listener
  // 4. room_joined listener (CRITICAL - must be before joinRoom function)
  // 5. onlineUsers listener
  // 6. chat_message listener
  // 7. message_ack listener
  
  return () => {
    // Cleanup
    if ((newSocket as any).__heartbeatInterval) {
      clearInterval((newSocket as any).__heartbeatInterval);
    }
    initializedRef.current = false;
  };
}, []);
```

#### Replace the `joinRoom` function (around line 556):

```typescript
const joinRoom = useCallback((roomId: string, userId: string) => {
  const ts = new Date().toISOString();
  log(`[SOCKET SYNC] Join room start socket.id=${socketRef.current?.id || 'null'} roomId=${roomId} userId=${userId} connected=${socketRef.current?.connected || false} isBound=${isBoundRef.current} ts=${ts}`);
  
  if (!socketRef.current || !socketRef.current.connected) {
    console.warn(`[SOCKET SYNC] Socket not connected - cannot join`);
    return;
  }
  
  if (!isBoundRef.current && userId) {
    log(`[SOCKET SYNC] Waiting for heartbeat binding before join`);
    socketRef.current.emit("heartbeat", { userId, clientTimestamp: Date.now() }, (ack: { ok: boolean; userId: string }) => {
      if (ack?.ok) {
        isBoundRef.current = true;
        setTimeout(() => joinRoom(roomId, userId), 100);
      }
    });
    return;
  }
  
  sessionStorage.setItem("roomId", roomId);
  sessionStorage.setItem("userId", userId);
  
  setIsJoined(false);
  joinedRef.current = false;
  console.log(`[CLIENT] Setting isJoined=false before emitting join_room`);
  
  log(`[SOCKET SYNC] Emitting join_room socket.id=${socketRef.current.id} roomId=${roomId} userId=${userId}`);
  console.log(`[CLIENT] Emitting join_room event`, { roomId, userId, socketId: socketRef.current.id, connected: socketRef.current.connected });
  
  socketRef.current.emit("join_room", { roomId, userId }, (ack: { ok: boolean; messages?: Message[]; reason?: string }) => {
    console.log(`[CLIENT] join_room ack received`, ack);
    
    if (!ack?.ok) {
      log(`❌ [Client] join fail ${ack?.reason || 'unknown'}`);
      setIsJoined(false);
      joinedRef.current = false;
      return;
    }
    
    log(`[SOCKET SYNC] Join room ack received - waiting for room_joined event`);
    console.log(`[CLIENT] Join ack ok=true, waiting for room_joined event...`);
    
    if (ack.messages && ack.messages.length > 0) {
      setMessages(ack.messages);
    }
  });
}, []);
```

### 3. Client: `client/src/pages/room.tsx`

#### Ensure join effect checks `socket.connected` directly (around line 54):

```typescript
useEffect(() => {
  const verifyAndJoinRoom = async () => {
    if (!userId || !roomId || hasJoinedRef.current || isJoining) return;

    setIsJoining(true);
    setRoomError(null);

    try {
      // Verify room exists
      const serverUrl = import.meta.env.DEV ? "http://localhost:8080" : window.location.origin;
      const response = await fetch(`${serverUrl}/api/rooms/${roomId}`);
      const data = await response.json();

      if (!data.success || !data.room) {
        setRoomError("Room not found");
        setIsJoining(false);
        setLocation("/dashboard");
        return;
      }

      // Wait for socket connection (check socket.connected directly)
      let connected = socket?.connected || false;
      if (!connected && socket) {
        let attempts = 0;
        while (!connected && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (socket.connected) {
            connected = true;
            break;
          }
          attempts++;
        }
      }

      if ((connected || socket?.connected) && socket) {
        console.log(`[ROOM] Calling joinRoom roomId=${roomId} userId=${userId} socket.connected=${socket.connected}`);
        hasJoinedRef.current = true;
        joinRoom(roomId, userId);
      } else {
        setRoomError("Connection failed");
        setIsJoining(false);
        hasJoinedRef.current = false;
      }
    } catch (error) {
      console.error("Room join error:", error);
      setRoomError("Failed to join room");
      setIsJoining(false);
      hasJoinedRef.current = false;
    }
  };

  // CRITICAL: Check socket.connected directly
  if (userId && roomId && socket && (socket.connected || isConnected) && !isJoined && !isJoining && !hasJoinedRef.current) {
    verifyAndJoinRoom();
  }
}, [socket, isConnected, userId, roomId, isJoined, isJoining, joinRoom, setLocation]);
```

---

## Critical Event Listener Order (Client)

**MUST register in this order:**

1. `connect` → Sets up heartbeat
2. `disconnect` → Cleans up state
3. `connect_error` → Handles errors
4. **`room_joined` → Activates UI (CRITICAL)**
5. `onlineUsers` → Updates presence
6. `chat_message` → Receives messages
7. `message_ack` → Confirms delivery
8. `loadMessages` → Loads history
9. `systemMessage` → Shows system messages

**Then:**
- `joinRoom()` function can be called

---

## Testing Checklist

### 1. Start Server
```bash
npm run dev
```

### 2. Open Browser Console + Network Tab

### 3. Login → Join Room

### 4. Verify Server Logs:
```
✅ [CONNECT]
[HEARTBEAT] Received
📥 [JOIN_ROOM start]
✅ [ADD_USER]
🔗 [SOCKET JOINED]
[SERVER EMIT] room_joined -> socket.id=... usersCount=...
✅ [JOIN_ROOM ok]
```

### 5. Verify Browser Console:
```
[SOCKET SYNC] Connect event
[SOCKET SYNC] Heartbeat ack received
[CLIENT] Emitting join_room event
[CLIENT] join_room ack received
[CLIENT] room_joined received
✅ [CLIENT] Setting isJoined=true
[PRESENCE] Client received onlineUsers count=...
```

### 6. Check UI:
- [ ] Input box enabled
- [ ] Online users tab shows yourself + others
- [ ] Messages appear when sent

---

## Common Issues & Fixes

### Issue: "Online users empty"

**Check:**
1. Server: `[SERVER EMIT] room_joined` shows `usersCount > 0`?
2. Client: `[CLIENT] room_joined received` shows `users: [...]`?
3. Client: `setCurrentRoom` called in `room_joined` handler?

**Fix:**
```typescript
// In room_joined handler, ensure:
setCurrentRoom((prev) => {
  if (prev && prev.id === payload.roomId) {
    return { ...prev, users: payload.users || [] }; // MUST include users
  }
  return { ...prev, users: payload.users || [] };
});
```

### Issue: "Input box disabled"

**Check:**
1. `isJoined` state is `true`?
2. `room_joined` handler called `setIsJoined(true)`?

**Fix:**
```typescript
// In room_joined handler:
if (payload && payload.success) {
  setIsJoined(true); // MUST be called
  joinedRef.current = true; // MUST be set
}
```

### Issue: "Messages not appearing"

**Check:**
1. Server: `io.to(roomId).emit("chat_message", message)` called?
2. Client: `chat_message` listener registered before `join_room` emit?
3. WebSocket tab shows `chat_message` event received?

**Fix:**
```typescript
// Ensure chat_message listener is registered BEFORE joinRoom function
newSocket.on("chat_message", (msg) => { ... });

// Then later:
const joinRoom = useCallback(...);
```

---

## Emergency Debugging Script

Paste this into browser console:

```javascript
// Enable socket event logging
const socket = window.__socket || (() => {
  const context = document.querySelector('[data-socket-context]');
  return context?.__socket;
})();

if (socket) {
  socket.onAny((event, ...args) => {
    console.log(`[WS EVENT] ${event}`, args);
  });
  
  socket.onAnyOutgoing((event, ...args) => {
    console.log(`[WS EMIT] ${event}`, args);
  });
}

// Check state
console.log('userId:', sessionStorage.getItem('userId'));
console.log('roomId:', sessionStorage.getItem('roomId'));
console.log('Socket connected:', socket?.connected);
console.log('Socket ID:', socket?.id);

// Force rejoin (if stuck)
if (socket && socket.connected) {
  const userId = sessionStorage.getItem('userId');
  const roomId = sessionStorage.getItem('roomId');
  if (userId && roomId) {
    console.log('Forcing rejoin...');
    socket.emit('join_room', { roomId, userId }, (ack) => {
      console.log('Rejoin ack:', ack);
    });
  }
}
```

---

**END OF QUICK START GUIDE**

