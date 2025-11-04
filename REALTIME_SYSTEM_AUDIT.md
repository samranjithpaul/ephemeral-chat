# Real-Time Chat System: Complete Architecture Audit & Fix Guide

## Table of Contents
1. [Server Socket Handlers](#server-socket-handlers)
2. [Client Socket Initialization](#client-socket-initialization)
3. [Presence Synchronization](#presence-synchronization)
4. [Message Acknowledgment Flow](#message-acknowledgment-flow)
5. [Verification Checklist](#verification-checklist)
6. [Debugging Guide: "Online Users Empty"](#debugging-guide-online-users-empty)
7. [Unified Fix Prompt](#unified-fix-prompt)

---

## Server Socket Handlers

### Location: `server/routes.ts` (inside `io.on("connection", ...)`)

### 1. Connection Handler

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
```

### 2. Heartbeat Handler

```typescript
  socket.on("heartbeat", async (
    { userId, clientTimestamp }: { userId: string; clientTimestamp?: number },
    ack?: (response: { ok: boolean; userId: string; timestamp: number; latency?: number }) => void
  ) => {
    const startTime = Date.now();
    const timestamp = Date.now();
    const ts = new Date().toISOString();
    
    console.log(`[HEARTBEAT] Received socket=${socket.id} userId=${userId || 'null'} clientTimestamp=${clientTimestamp || 'null'} ts=${ts}`);
    
    if (userId) {
      // CRITICAL: Bind userId immediately on heartbeat
      const wasBound = socket.data.userId !== null;
      if (!socket.data.userId) {
        socket.data.userId = userId;
        console.log(`[SOCKET SYNC] userId bound via heartbeat socket=${socket.id} userId=${userId} connected=${socket.connected} ts=${ts}`);
        console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=${socket.data.roomId || 'null'} stage=heartbeat_bound`);
      } else if (socket.data.userId !== userId) {
        console.log(`[SOCKET SYNC] userId updated via heartbeat socket=${socket.id} oldUserId=${socket.data.userId} newUserId=${userId} ts=${ts}`);
        socket.data.userId = userId;
        socket.data.roomId = null;
        socket.data.joined = false;
      }
      
      await storage.updateLastSeen(userId);
      
      // Calculate latency
      const latency = clientTimestamp ? Date.now() - clientTimestamp : undefined;
      if (latency !== undefined) {
        console.log(`[HEARTBEAT] latency=${latency}ms userId=${userId} socket=${socket.id}`);
      }
      
      // CRITICAL: Send ack to confirm binding
      if (ack) {
        ack({ ok: true, userId, timestamp, latency });
        console.log(`[SOCKET SYNC] heartbeat ack sent socket=${socket.id} userId=${userId} ok=true latency=${latency || 'N/A'}ms ts=${ts}`);
      }
    } else {
      console.log(`[HEARTBEAT] No userId provided socket=${socket.id} ts=${ts}`);
      if (ack) {
        ack({ ok: false, userId: '', timestamp, latency: undefined });
      }
    }
  });
```

### 3. Join Room Handler (COMPLETE)

```typescript
  socket.on("join_room", async (
    { roomId, userId }: { roomId: string; userId: string },
    ack?: (response: { ok: boolean; messages?: Message[]; reason?: string }) => void
  ) => {
    const startTime = new Date().toISOString();
    console.log(`[SOCKET SYNC] Join room received socket.id=${socket.id} roomId=${roomId} userId=${userId} connected=${socket.connected} socket.data.userId=${socket.data.userId || 'null'} ts=${startTime}`);
    console.log(`[DEBUG:join_room] START timestamp=${startTime} socket=${socket.id} roomId=${roomId} userId=${userId}`);
    console.log(`📥 [JOIN_ROOM start] socket=${socket.id} roomId=${roomId} userId=${userId}`);

    // Guard: Prevent duplicate joins
    if (socket.data.joining) {
      const endTime = new Date().toISOString();
      console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=failed reason=already_joining`);
      ack?.({ ok: false, reason: "already_joining" });
      return;
    }

    // Validate inputs
    if (!roomId || !userId || typeof roomId !== "string" || typeof userId !== "string") {
      const endTime = new Date().toISOString();
      console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId || 'undefined'} userId=${userId || 'undefined'} result=failed reason=missing_room_or_user`);
      ack?.({ ok: false, reason: "missing_room_or_user" });
      return;
    }

    // CRITICAL: Bind userId/roomId IMMEDIATELY before async ops
    const previousUserId = socket.data.userId;
    const previousRoomId = socket.data.roomId;
    socket.data.userId = userId;
    socket.data.roomId = roomId;
    socket.data.joining = true;
    console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=${roomId} stage=join_room_immediate`);

    try {
      // STEP 1: Validate user exists
      console.log(`[DEBUG:join_room] Validating user userId=${userId} socket=${socket.id}`);
      const user = await getUser(userId);
      if (!user) {
        socket.data.userId = null;
        socket.data.roomId = null;
        socket.data.joining = false;
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:join_room] END timestamp=${endTime} result=failed reason=user_not_found`);
        ack?.({ ok: false, reason: "user_not_found" });
        return;
      }

      // STEP 2: Validate room exists
      console.log(`[DEBUG:join_room] Validating room roomId=${roomId} socket=${socket.id}`);
      const room = await getRoom(roomId, true);
      if (!room) {
        socket.data.userId = null;
        socket.data.roomId = null;
        socket.data.joining = false;
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:join_room] END timestamp=${endTime} result=failed reason=room_not_found`);
        ack?.({ ok: false, reason: "room_not_found" });
        return;
      }

      // STEP 3: Add socket to user tracking
      await addSocketToUser(userId, socket.id);
      console.log(`[SOCKET SYNC] Socket added to user tracking userId=${userId} socket=${socket.id}`);

      // STEP 4: Add user to room (atomic Redis operation)
      console.log(`[DEBUG:join_room] Adding user to room roomId=${roomId} userId=${userId}`);
      const added = await addUserToRoom(roomId, { id: user.id, username: user.username });
      if (!added) {
        socket.data.userId = null;
        socket.data.roomId = null;
        socket.data.joining = false;
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:join_room] END timestamp=${endTime} result=failed reason=failed_to_add_user`);
        ack?.({ ok: false, reason: "failed_to_add_user" });
        return;
      }

      // STEP 5: Join socket room (after Redis write succeeds)
      try {
        socket.join(roomId);
        console.log(`🔗 [SOCKET JOINED] socket=${socket.id} roomId=${roomId}`);
      } catch (joinError: any) {
        // ROLLBACK if socket.join fails
        console.log(`❌ [ROLLBACK] socket.join failed - removing user socket=${socket.id} roomId=${roomId}`);
        await removeUserFromRoom(roomId, userId);
        await removeSocketFromUser(userId, socket.id);
        socket.data.userId = null;
        socket.data.roomId = null;
        socket.data.joining = false;
        ack?.({ ok: false, reason: "socket_join_error" });
        return;
      }

      // STEP 6: Propagation delay (120ms for adapter sync)
      await new Promise((r) => setTimeout(r, 120));

      // STEP 7: Update socket metadata
      socket.data.username = user.username;
      socket.data.joined = true;
      socket.data.joining = false;
      console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=${roomId} stage=join_room_success username=${user.username}`);

      // STEP 8: Fetch authoritative user list from Redis
      const verifyUsers = await getRoomUsers(roomId);
      const userIsInRoom = verifyUsers.some(u => u.id === userId);
      
      if (!userIsInRoom) {
        // CRITICAL ERROR: User not in Redis set after add
        console.error(`[ERROR:join_room] User ${userId} not in Redis set - rollback`);
        await removeUserFromRoom(roomId, userId);
        await removeSocketFromUser(userId, socket.id);
        socket.leave(roomId);
        socket.data.userId = null;
        socket.data.roomId = null;
        socket.data.joined = false;
        socket.data.joining = false;
        ack?.({ ok: false, reason: "storage_error" });
        return;
      }

      // STEP 9: Load message history
      const history = await loadMessages(roomId, 50);
      console.log(`[MESSAGE FLOW] Loaded ${history.length} messages for roomId=${roomId}`);

      // STEP 10: Broadcast system message
      io.to(roomId).emit("systemMessage", `${user.username} joined the room`);

      // STEP 11: Broadcast online users (authoritative Redis state)
      await broadcastOnlineUsers(io, roomId);
      console.log(`📨 [ONLINE USERS BROADCAST] roomId=${roomId} count=${verifyUsers.length} socket=${socket.id} userVerified=${userIsInRoom}`);

      // STEP 12: CRITICAL - Emit room_joined to joining socket ONLY after Redis verification
      const roomJoinedPayload = {
        roomId,
        userId,
        success: true,
        users: verifyUsers.map(u => u.username), // Authoritative list
      };
      
      socket.emit("room_joined", roomJoinedPayload);
      console.log(`[SERVER EMIT] room_joined -> socket.id=${socket.id} userId=${userId} roomId=${roomId} usersCount=${verifyUsers.length} verified=true`);
      console.log(`[SERVER EMIT] room_joined payload:`, JSON.stringify(roomJoinedPayload));

      // STEP 13: Broadcast user_joined to OTHER sockets in room
      const ts = new Date().toISOString();
      console.log(`[PRESENCE] join user=${userId} room=${roomId} ok=true socket=${socket.id} ts=${ts}`);
      socket.to(roomId).emit("user_joined", { userId, username: user.username, roomId });

      // STEP 14: Send message history to joining socket
      socket.emit("loadMessages", history);

      // STEP 15: Send ack
      const endTime = new Date().toISOString();
      console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=success`);
      console.log(`✅ [JOIN_ROOM ok] user=${user.username} userId=${userId} roomId=${roomId} socket=${socket.id}`);
      ack?.({ ok: true, messages: history });

    } catch (err: any) {
      // ROLLBACK on any error
      socket.data.userId = null;
      socket.data.roomId = null;
      socket.data.joining = false;
      const endTime = new Date().toISOString();
      console.log(`[DEBUG:join_room] END timestamp=${endTime} result=failed reason=server_error`);
      console.log(`❌ [JOIN_ROOM fail] reason=server_error socket=${socket.id}`);
      logger.error("join_room", "Error in join", { socketId: socket.id, roomId, userId }, err);
      ack?.({ ok: false, reason: "server_error" });
    }
  });
```

### 4. Send Message Handler

```typescript
  socket.on("send_message", async (
    { roomId, userId, text, messageTempId }: { roomId: string; userId: string; text: string; messageTempId?: string },
    ack?: (response: { ok: boolean; id?: string; reason?: string }) => void
  ) => {
    const startTime = new Date().toISOString();
    const tempId = messageTempId || `temp-${Date.now()}`;
    console.log(`[MESSAGE FLOW] send_message received socket=${socket.id} roomId=${roomId} userId=${userId} tempId=${tempId} ts=${startTime}`);
    console.log(`[DEBUG:send_message] START timestamp=${startTime} socket=${socket.id} roomId=${roomId} userId=${userId} messageTempId=${tempId}`);

    // Validate joined state
    if (!socket.data.joined || socket.data.roomId !== roomId || socket.data.userId !== userId) {
      const endTime = new Date().toISOString();
      console.log(`[DEBUG:send_message] END timestamp=${endTime} result=failed reason=not_joined`);
      ack?.({ ok: false, reason: "not_joined" });
      return;
    }

    // Validate inputs
    if (!roomId || !userId || !text?.trim() || typeof roomId !== "string") {
      const endTime = new Date().toISOString();
      console.log(`[DEBUG:send_message] END timestamp=${endTime} result=failed reason=invalid_params`);
      ack?.({ ok: false, reason: "invalid_params" });
      return;
    }

    try {
      // Validate room exists
      const room = await getRoom(roomId, true);
      if (!room) {
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:send_message] END timestamp=${endTime} result=failed reason=room_not_found`);
        ack?.({ ok: false, reason: "room_not_found" });
        return;
      }

      const user = await getUser(userId);
      const username = user?.username || "unknown";

      // Create message object
      const message: any = {
        id: crypto.randomUUID?.() || `msg-${Date.now()}-${Math.random()}`,
        type: "text",
        userId,
        username,
        text: text.trim(),
        content: text.trim(),
        roomId,
        time: new Date().toISOString(),
        timestamp: Date.now(),
      };

      // CRITICAL: Save to Redis FIRST
      console.log(`[MESSAGE FLOW] Saving message to Redis messageId=${message.id} roomId=${roomId}`);
      const saved = await saveMessage(roomId, message);
      
      if (!saved) {
        logger.error("send_message", "Failed to save message to Redis", { roomId, messageId: message.id });
        // Fallback to in-memory
        if (!inMemoryMessages.has(roomId)) {
          inMemoryMessages.set(roomId, []);
        }
        inMemoryMessages.get(roomId)!.push(message);
      }

      // Broadcast to room AFTER Redis save
      const ts = new Date().toISOString();
      console.log(`[MESSAGE FLOW] Broadcasting chat_message roomId=${roomId} messageId=${message.id} saved=${saved} ts=${ts}`);
      io.to(roomId).emit("chat_message", message);
      
      // CRITICAL: Send message_ack to sender
      socket.emit("message_ack", { tempId, delivered: true, messageId: message.id, timestamp: Date.now() });
      console.log(`[MESSAGE FLOW] ack sent tempId=${tempId} messageId=${message.id} socket=${socket.id} ts=${ts}`);

      const endTime = new Date().toISOString();
      console.log(`[DEBUG:send_message] END timestamp=${endTime} socket=${socket.id} messageId=${message.id} result=success`);
      console.log(`💬 [SEND_MESSAGE ok] messageId=${message.id} roomId=${roomId} userId=${userId}`);
      ack?.({ ok: true, id: message.id });

    } catch (err: any) {
      const endTime = new Date().toISOString();
      console.log(`[DEBUG:send_message] END timestamp=${endTime} result=failed reason=server_error`);
      logger.error("send_message", "Error sending message", { socketId: socket.id, roomId, userId }, err);
      ack?.({ ok: false, reason: "server_error" });
    }
  });
```

### 5. Disconnect Handler

```typescript
  socket.on("disconnect", async (reason) => {
    const startTime = new Date().toISOString();
    console.log(`[SOCKET SYNC] Disconnect received socket.id=${socket.id} reason=${reason} ts=${startTime}`);
    console.log(`❌ [DISCONNECT] socket=${socket.id} reason=${reason}`);

    // Guard: Prevent double cleanup
    if (socket.data.cleanedUp) {
      console.log(`[DISCONNECT] Already cleaned up socket=${socket.id}`);
      return;
    }
    socket.data.cleanedUp = true;

    // Get userId and roomId from socket.data
    let actualUserId = socket.data.userId;
    let actualRoomId = socket.data.roomId;

    // Fallback: Try to recover from socket.rooms
    if (!actualRoomId) {
      const rooms = Array.from(socket.rooms);
      const roomRooms = rooms.filter(r => r !== socket.id && !r.startsWith("room:"));
      if (roomRooms.length > 0) {
        actualRoomId = roomRooms[0];
      }
    }

    if (!actualUserId) {
      console.log(`[ERROR:disconnect] Missing userId socket=${socket.id} roomId=${actualRoomId || 'none'}`);
      return;
    }

    // Skip cleanup if socket was recovered (reconnected within 1s)
    if ((socket as any).recovered) {
      console.log(`[PRESENCE] skip cleanup socket=${socket.id} userId=${actualUserId} reason=socket_recovered`);
      return;
    }

    // Debounce cleanup (200ms)
    setTimeout(async () => {
      try {
        if (socket.data.processingDisconnect) return;
        socket.data.processingDisconnect = true;

        // Check for other sockets for same user in same room
        let hasOtherSocketsInRoom = false;
        if (actualRoomId && actualUserId) {
          const socketsInRoom = await io.in(actualRoomId).fetchSockets();
          hasOtherSocketsInRoom = socketsInRoom.some(s => {
            const socketData = (s as any).data;
            return s.id !== socket.id && 
                   socketData?.userId === actualUserId && 
                   socketData?.roomId === actualRoomId;
          });
        }

        // Remove socket from user tracking
        if (actualUserId) {
          const remainingSockets = await removeSocketFromUser(actualUserId, socket.id);

          // Only remove from room if no other sockets exist
          if (!hasOtherSocketsInRoom && remainingSockets === 0 && actualRoomId && actualUserId) {
            const ts = new Date().toISOString();
            console.log(`[PRESENCE] leave user=${actualUserId} room=${actualRoomId} socket=${socket.id} ts=${ts}`);
            
            // Emit user_left IMMEDIATELY
            io.to(actualRoomId).emit("user_left", { userId: actualUserId, roomId: actualRoomId });
            
            // Remove from Redis
            await removeUserFromRoom(actualRoomId, actualUserId);
            
            // Broadcast updated online users
            await broadcastOnlineUsers(io, actualRoomId);
            
            // Send system message
            const user = await getUser(actualUserId);
            if (user) {
              io.to(actualRoomId).emit("systemMessage", `${user.username} left the room`);
            }
            
            console.log(`[PRESENCE] User removed from Redis and broadcasted roomId=${actualRoomId} userId=${actualUserId} ts=${ts}`);
          }
        }

        socket.data.processingDisconnect = false;
      } catch (err: any) {
        logger.error("disconnect", "Error in disconnect cleanup", { socketId: socket.id }, err);
      }
    }, 200);
  });
```

### 6. Broadcast Online Users Helper

```typescript
// Location: `server/routes.ts` (top-level function)

async function broadcastOnlineUsers(io: SocketIOServer, roomId: string): Promise<void> {
  try {
    // Read from authoritative Redis set
    const users = await getRoomUsers(roomId);
    
    // Filter by actual socket connections
    const connectedUsers: string[] = [];
    const socketsInRoom = await io.in(roomId).fetchSockets();
    const connectedUserIds = new Set<string>();
    
    for (const s of socketsInRoom) {
      const socketData = (s as any).data;
      if (socketData?.userId && s.connected) {
        connectedUserIds.add(socketData.userId);
      }
    }
    
    // Only include users that have connected sockets
    for (const user of users) {
      if (connectedUserIds.has(user.id)) {
        connectedUsers.push(user.username);
      }
    }
    
    // Broadcast to all sockets in room
    io.to(roomId).emit("onlineUsers", connectedUsers);
    
    const ts = new Date().toISOString();
    console.log(`[PRESENCE] broadcast roomId=${roomId} totalUsers=${users.length} connectedUsers=${connectedUsers.length} ts=${ts}`);
  } catch (err: any) {
    logger.error("broadcastOnlineUsers", "Error broadcasting users", { roomId }, err);
  }
}
```

---

## Client Socket Initialization

### Location: `client/src/lib/socket.tsx`

### 1. Socket Initialization (useEffect)

```typescript
useEffect(() => {
  // Guard against double-mount
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
  
  // Reuse existing socket if connected
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
```

### 2. Event Listeners (Register BEFORE any emit)

```typescript
  // CRITICAL: All listeners must be registered BEFORE join_room emit
  
  // Connect handler
  newSocket.on("connect", () => {
    const userId = sessionStorage.getItem("userId");
    const ts = new Date().toISOString();
    
    log(`[SOCKET SYNC] Connect event socket.id=${newSocket.id} userId=${userId || 'null'} connected=${newSocket.connected} ts=${ts}`);
    setIsConnected(true);
    isBoundRef.current = false;
    
    // Send heartbeat to bind userId
    if (userId) {
      const clientTimestamp = Date.now();
      newSocket.emit("heartbeat", { userId, clientTimestamp }, (ack: { ok: boolean; userId: string; timestamp: number; latency?: number }) => {
        if (ack?.ok) {
          isBoundRef.current = true;
          log(`[SOCKET SYNC] Heartbeat ack received isBound=true socket.id=${newSocket.id} userId=${ack.userId} latency=${ack.latency || 'N/A'}ms`);
        }
      });
      
      // Set up periodic heartbeat
      const heartbeatInterval = setInterval(() => {
        const currentUserId = sessionStorage.getItem("userId");
        if (newSocket.connected && currentUserId) {
          newSocket.emit("heartbeat", { userId: currentUserId, clientTimestamp: Date.now() }, (ack) => {
            if (ack?.ok) {
              isBoundRef.current = true;
            }
          });
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 20000);
      
      (newSocket as any).__heartbeatInterval = heartbeatInterval;
    }
  });
  
  // Disconnect handler
  newSocket.on("disconnect", (reason) => {
    if (!newSocket.connected) {
      setIsConnected(false);
      setIsJoined(false);
      joinedRef.current = false;
    }
    
    if ((newSocket as any).__heartbeatInterval) {
      clearInterval((newSocket as any).__heartbeatInterval);
      (newSocket as any).__heartbeatInterval = null;
    }
  });
  
  // Connect error handler
  newSocket.on("connect_error", (error) => {
    log(`[SOCKET SYNC] Connect error socket.id=${newSocket.id} error=${error.message}`);
    if (!newSocket.connected) {
      setIsConnected(false);
    }
  });
  
  // CRITICAL: room_joined handler (registers UI activation)
  newSocket.on("room_joined", (payload: { roomId: string; userId: string; success: boolean; users: string[] }) => {
    const ts = new Date().toISOString();
    log(`[CLIENT] room_joined received socket.id=${newSocket.id} roomId=${payload.roomId} userId=${payload.userId} success=${payload.success} usersCount=${payload.users?.length || 0} ts=${ts}`);
    console.log("[CLIENT] room_joined received", payload);
    
    if (payload && payload.success) {
      // CRITICAL: Activate UI
      joinedRef.current = true;
      setIsJoined(true);
      console.log(`✅ [CLIENT] Setting isJoined=true from room_joined event`);
      
      // Update current room with authoritative user list
      setCurrentRoom((prev) => {
        if (prev && prev.id === payload.roomId) {
          return { ...prev, users: payload.users || [] };
        }
        return {
          id: payload.roomId,
          name: prev?.name || "",
          ownerId: prev?.ownerId || "",
          ownerUsername: prev?.ownerUsername || "",
          users: payload.users || [],
          maxUsers: 35,
          createdAt: prev?.createdAt || Date.now(),
        } as Room;
      });
      
      log(`✅ [Client] Room joined confirmed - UI activated roomId=${payload.roomId} onlineUsers=${payload.users?.length || 0}`);
    } else {
      setIsJoined(false);
      joinedRef.current = false;
    }
  });
  
  // onlineUsers handler (authoritative state)
  newSocket.on("onlineUsers", (users: string[]) => {
    const ts = new Date().toISOString();
    const roomId = sessionStorage.getItem("roomId") || "";
    log(`[PRESENCE] Client received onlineUsers count=${users.length} roomId=${roomId} ts=${ts}`);
    console.log(`[PRESENCE] Client updated onlineUsers count=${users.length} users=[${users.join(', ')}]`);
    
    setCurrentRoom((prev) => {
      if (prev && prev.id === roomId) {
        return { ...prev, users: users };
      }
      return prev;
    });
  });
  
  // chat_message handler
  newSocket.on("chat_message", (msg: any) => {
    const message: Message = {
      id: msg.id || `msg-${Date.now()}`,
      roomId: msg.roomId || currentRoom?.id || "",
      username: msg.username,
      content: msg.text || msg.content || "",
      type: msg.type || "text",
      timestamp: msg.timestamp || Date.now(),
      audioData: msg.audio || msg.audioData,
    };
    
    log(`[MESSAGE FLOW] chat_message received messageId=${message.id} roomId=${message.roomId} username=${message.username}`);
    
    setMessages((prev) => {
      // Dedupe by ID
      if (prev.some(m => m.id === message.id)) return prev;
      
      // Replace optimistic message if exists
      const optimisticIndex = prev.findIndex(m => 
        m.id.startsWith("temp-") &&
        m.content === message.content &&
        m.username === message.username &&
        Math.abs(m.timestamp - message.timestamp) < 2000
      );
      
      if (optimisticIndex >= 0) {
        const updated = [...prev];
        updated[optimisticIndex] = message;
        return updated;
      }
      
      return [...prev, message];
    });
  });
  
  // message_ack handler
  newSocket.on("message_ack", (data: { tempId: string; delivered: boolean; messageId: string; timestamp: number }) => {
    console.log(`[MESSAGE FLOW] ack received tempId=${data.tempId} messageId=${data.messageId}`);
    
    if (data.delivered) {
      setMessages((prev) => {
        return prev.map(msg => {
          if (msg.id === data.tempId) {
            return { ...msg, id: data.messageId };
          }
          return msg;
        });
      });
    }
  });
```

### 3. Join Room Function

```typescript
const joinRoom = useCallback((roomId: string, userId: string) => {
  const ts = new Date().toISOString();
  log(`[SOCKET SYNC] Join room start socket.id=${socketRef.current?.id || 'null'} roomId=${roomId} userId=${userId} connected=${socketRef.current?.connected || false} isBound=${isBoundRef.current} ts=${ts}`);
  
  if (!socketRef.current || !socketRef.current.connected) {
    console.warn(`[SOCKET SYNC] Socket not connected - cannot join`);
    return;
  }
  
  // CRITICAL: Wait for userId binding
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
    
    // NOTE: UI activation happens via room_joined event, NOT ack
    log(`[SOCKET SYNC] Join room ack received - waiting for room_joined event`);
    console.log(`[CLIENT] Join ack ok=true, waiting for room_joined event...`);
    
    // Set messages from ack if provided
    if (ack.messages && ack.messages.length > 0) {
      setMessages(ack.messages);
    }
  });
}, []);
```

---

## Presence Synchronization

### Server-Side: After User Joins/Leaves

```typescript
// After addUserToRoom succeeds:
await broadcastOnlineUsers(io, roomId);  // Broadcasts authoritative Redis state

// After removeUserFromRoom succeeds:
await broadcastOnlineUsers(io, roomId);  // Broadcasts updated state immediately
```

### Client-Side: Receive and Update

```typescript
// Listener registered in useEffect above
newSocket.on("onlineUsers", (users: string[]) => {
  // Always trust server - this is authoritative Redis state
  setCurrentRoom((prev) => {
    if (prev) {
      return { ...prev, users: users };
    }
    return prev;
  });
});
```

---

## Message Acknowledgment Flow

### Server: Send Ack After Save

```typescript
// In send_message handler:
const saved = await saveMessage(roomId, message);
io.to(roomId).emit("chat_message", message);
socket.emit("message_ack", { tempId, delivered: true, messageId: message.id, timestamp: Date.now() });
```

### Client: Mark Message as Delivered

```typescript
// Listener registered in useEffect
newSocket.on("message_ack", (data) => {
  if (data.delivered) {
    setMessages((prev) => {
      return prev.map(msg => {
        if (msg.id === data.tempId) {
          return { ...msg, id: data.messageId };
        }
        return msg;
      });
    });
  }
});
```

---

## Verification Checklist

### Terminal Logs (Server)

1. **Connection:**
   ```
   ✅ [CONNECT] <socket.id>
   [SOCKET SYNC] Connection received socket.id=<id>
   ```

2. **Heartbeat:**
   ```
   [HEARTBEAT] Received socket=<id> userId=<userId>
   [SOCKET SYNC] heartbeat ack sent socket=<id> userId=<userId> ok=true
   ```

3. **Join Room:**
   ```
   📥 [JOIN_ROOM start] socket=<id> roomId=<roomId> userId=<userId>
   [DEBUG:join_room] Adding user to room
   ✅ [ADD_USER] roomId=<id> userId=<id> result=ok
   🔗 [SOCKET JOINED] socket=<id> roomId=<id>
   [SERVER EMIT] room_joined -> socket.id=<id> usersCount=<count>
   ✅ [JOIN_ROOM ok] user=<username> roomId=<id>
   ```

4. **Online Users Broadcast:**
   ```
   📨 [ONLINE USERS BROADCAST] roomId=<id> count=<count>
   [PRESENCE] broadcast roomId=<id> connectedUsers=<count>
   ```

5. **Message Send:**
   ```
   [MESSAGE FLOW] send_message received socket=<id> roomId=<id>
   [MESSAGE FLOW] Saving message to Redis messageId=<id>
   [MESSAGE FLOW] Broadcasting chat_message roomId=<id> messageId=<id>
   [MESSAGE FLOW] ack sent tempId=<id> messageId=<id>
   💬 [SEND_MESSAGE ok] messageId=<id>
   ```

### Browser Console (Client)

1. **Connection:**
   ```
   [SOCKET SYNC] Socket initialized autoConnect=true userId=<id> roomId=<id>
   [SOCKET SYNC] Connect event socket.id=<id> userId=<id>
   [SOCKET SYNC] Heartbeat ack received isBound=true
   ```

2. **Join Room:**
   ```
   [ROOM] Calling joinRoom roomId=<id> userId=<id>
   [CLIENT] Emitting join_room event
   [CLIENT] join_room ack received {ok: true}
   [CLIENT] room_joined received {roomId, userId, success: true, users: [...]}
   ✅ [CLIENT] Setting isJoined=true from room_joined event
   ```

3. **Online Users:**
   ```
   [PRESENCE] Client received onlineUsers count=<count>
   [PRESENCE] Client updated onlineUsers count=<count> users=[...]
   ```

4. **Message:**
   ```
   [MESSAGE FLOW] chat_message received messageId=<id>
   [MESSAGE FLOW] ack received tempId=<id> messageId=<id>
   ```

### WebSocket Events (Browser DevTools → Network → WS)

**Outgoing:**
- `heartbeat` with `{userId, clientTimestamp}`
- `join_room` with `{roomId, userId}`
- `send_message` with `{roomId, userId, text, messageTempId}`

**Incoming:**
- `heartbeat` ack with `{ok, userId, timestamp, latency}`
- `join_room` ack with `{ok, messages}`
- `room_joined` with `{roomId, userId, success, users}`
- `onlineUsers` with `string[]`
- `chat_message` with message object
- `message_ack` with `{tempId, delivered, messageId, timestamp}`

---

## Debugging Guide: "Online Users Empty"

### Step 1: Check Redis State

**Server Terminal:**
```bash
# Connect to Redis CLI
redis-cli

# Check room users set
SMEMBERS room:<roomId>:users

# Should return JSON strings like:
# ["{\"id\":\"user-id\",\"username\":\"username\"}"]

# Verify room exists
GET room:<roomId>
```

**Expected:** Users should be in the set as JSON strings.

### Step 2: Check Server Logs

**Look for:**
```
✅ [ADD_USER] roomId=<id> userId=<id> result=ok
[SERVER EMIT] room_joined -> socket.id=<id> usersCount=<count>
📨 [ONLINE USERS BROADCAST] roomId=<id> count=<count>
```

**If missing:** Server didn't complete join flow.

### Step 3: Check Client Received `room_joined`

**Browser Console:**
```
[CLIENT] room_joined received {roomId, userId, success: true, users: [...]}
```

**If missing:**
- Check WebSocket tab: Is `room_joined` event received?
- Check server logs: Did server emit it?
- Check socket.id matches between server emit and client receive

### Step 4: Check React State

**Browser Console:**
```javascript
// Open React DevTools → Components → SocketProvider
// Or manually check:
const socket = window.__socket; // If exposed
console.log('isJoined:', socket?.isJoined);
console.log('currentRoom:', socket?.currentRoom);
```

**Expected:** `isJoined: true`, `currentRoom.users.length > 0`

### Step 5: Check `onlineUsers` Broadcast

**Browser Console:**
```
[PRESENCE] Client received onlineUsers count=<count>
```

**If missing:**
- Server didn't call `broadcastOnlineUsers()`
- Client listener not registered
- WebSocket connection dropped

### Diagnostic Script (Add to Browser Console)

```javascript
// Check socket state
const checkSocketState = () => {
  const socket = window.__socket || document.querySelector('[data-socket-id]');
  console.log('Socket connected:', socket?.connected);
  console.log('Socket ID:', socket?.id);
  
  // Check sessionStorage
  console.log('userId:', sessionStorage.getItem('userId'));
  console.log('roomId:', sessionStorage.getItem('roomId'));
  
  // Check React state (if accessible)
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    // Use React DevTools to inspect state
    console.log('Use React DevTools to inspect SocketProvider state');
  }
};

checkSocketState();

// Listen for all socket events
if (window.__socket) {
  const originalEmit = window.__socket.emit;
  window.__socket.emit = function(...args) {
    console.log('[DEBUG EMIT]', args);
    return originalEmit.apply(this, args);
  };
  
  window.__socket.onAny((event, ...args) => {
    console.log('[DEBUG ON]', event, args);
  });
}
```

---

## Unified Fix Prompt

**Use this prompt when chat room bugs recur:**

```
You are debugging a real-time chat application (Socket.IO + Redis + React).

SYMPTOMS:
- [Describe symptoms: e.g., "Online users list is empty", "Messages not appearing", "Input box disabled"]

VERIFICATION STEPS:

1. Server Terminal Logs:
   - [ ] ✅ [CONNECT] appears when user connects
   - [ ] [HEARTBEAT] appears with userId
   - [ ] [JOIN_ROOM start] appears with roomId and userId
   - [ ] ✅ [ADD_USER] appears with result=ok
   - [ ] [SERVER EMIT] room_joined appears with usersCount > 0
   - [ ] 📨 [ONLINE USERS BROADCAST] appears with count > 0

2. Browser Console Logs:
   - [ ] [SOCKET SYNC] Connect event appears
   - [ ] [SOCKET SYNC] Heartbeat ack received isBound=true
   - [ ] [CLIENT] Emitting join_room event appears
   - [ ] [CLIENT] join_room ack received with ok=true
   - [ ] [CLIENT] room_joined received with success=true and users array
   - [ ] ✅ [CLIENT] Setting isJoined=true from room_joined event
   - [ ] [PRESENCE] Client received onlineUsers with count > 0

3. WebSocket Events (DevTools → Network → WS):
   - [ ] Outgoing: heartbeat, join_room
   - [ ] Incoming: heartbeat ack, join_room ack, room_joined, onlineUsers

4. Redis State:
   ```bash
   redis-cli SMEMBERS room:<roomId>:users
   ```
   - [ ] Returns JSON strings with user data

ROOT CAUSE ANALYSIS:

If server logs show:
- Missing [ADD_USER]: Redis write failed
- Missing [SERVER EMIT] room_joined: Server didn't emit event
- [SERVER EMIT] room_joined with usersCount=0: Redis set is empty

If client logs show:
- Missing [CLIENT] room_joined received: Client didn't receive event
- Missing ✅ [CLIENT] Setting isJoined=true: room_joined handler didn't fire
- Missing [PRESENCE] Client received onlineUsers: Broadcast didn't reach client

FIX CHECKLIST:

Server Side:
1. Verify addUserToRoom() returns true
2. Verify getRoomUsers() returns non-empty array
3. Verify socket.emit("room_joined", payload) is called
4. Verify broadcastOnlineUsers() is called after join
5. Check socket.id matches between server emit and client receive

Client Side:
1. Verify room_joined listener is registered BEFORE join_room emit
2. Verify setIsJoined(true) is called in room_joined handler
3. Verify setCurrentRoom() is called with users array
4. Verify onlineUsers listener updates currentRoom.users
5. Check socket.connected === true before emitting join_room

MINIMAL CODE FIX:

If "online users empty" after join:
- Server: Ensure socket.emit("room_joined", {users: verifyUsers.map(u => u.username)}) is called
- Client: Ensure room_joined handler calls setIsJoined(true) AND setCurrentRoom({...prev, users: payload.users})

If "input box disabled":
- Client: Check isJoined state is true after room_joined event
- Client: Verify joinedRef.current === true

If "messages not appearing":
- Server: Verify io.to(roomId).emit("chat_message", message) is called
- Client: Verify chat_message listener is registered before join_room emit
```

---

## Quick Reference: Event Flow Diagram

```
CLIENT                          SERVER                         REDIS
  |                              |                              |
  |---heartbeat----------------->|                              |
  |                              |--updateLastSeen------------->|
  |<--heartbeat ack--------------|                              |
  |                              |                              |
  |---join_room----------------->|                              |
  |                              |--addSocketToUser------------>|
  |                              |--addUserToRoom-------------->|
  |                              |                              |--SMEMBERS-->|
  |                              |--socket.join(roomId)         |
  |                              |--getRoomUsers--------------->|
  |                              |--broadcastOnlineUsers--------|
  |<--room_joined----------------|                              |
  |<--onlineUsers----------------|                              |
  |                              |                              |
  |---send_message-------------->|                              |
  |                              |--saveMessage----------------->|
  |                              |--io.to(roomId).emit----------|
  |<--chat_message---------------|                              |
  |<--message_ack----------------|                              |
```

---

**END OF AUDIT DOCUMENT**

