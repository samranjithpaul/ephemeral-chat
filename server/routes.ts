// PATCH: 2025-11-02 - Comprehensive refactor for deterministic, observable socket lifecycle
// Fixes: Race conditions, duplicate joins/leaves, missing socket tracking, inconsistent acks
// Test: Multi-tab join/leave, rapid message send, reconnect scenarios

import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import helmet from "helmet";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import { 
  storage, 
  getRoom, 
  getUser, 
  getUserByUsername, 
  saveRoom, 
  saveMessage, 
  loadMessages, 
  addUserToRoom, 
  removeUserFromRoom, 
  getRoomUsers,
  addSocketToUser,
  removeSocketFromUser,
  getUserSocketCount,
  addToRandomQueue,
  removeFromRandomQueue,
  getRandomQueueSize,
} from "./storage";
import type { InsertUser, InsertRoom, Message } from "@shared/schema";
import { redis } from "./utils/redis";
import { logger } from "./utils/logger";

// Redis key helpers
const messagesKey = (id: string) => `room:${id}:messages`;

// Socket data interface
interface SocketData {
  roomId: string | null;
  userId: string | null;
  username: string | null;
  joining?: boolean; // Guard for duplicate join attempts
  leavingRoom?: boolean;
  processingDisconnect?: boolean;
  cleanedUp?: boolean;
  joined?: boolean;
}

interface TypedSocket extends Socket {
  data: SocketData;
}

// In-memory message cache (fallback only - Redis is source of truth)
const inMemoryMessages = new Map<string, Message[]>();

// Helper: Broadcast online users (filtered by actual socket connections)
async function broadcastOnlineUsers(io: SocketIOServer, roomId: string): Promise<void> {
  try {
    // Always read from authoritative Redis set (single source of truth)
    const users = await getRoomUsers(roomId);
    
    // CRITICAL: Filter by actual socket connections - only include users with connected sockets
    const connectedUsers: string[] = [];
    const socketsInRoom = await io.in(roomId).fetchSockets();
    const connectedUserIds = new Set<string>();
    
    // Build set of connected userIds in this room
    for (const s of socketsInRoom) {
      const socketData = (s as any).data;
      if (socketData?.userId && socketData?.connected !== false) {
        connectedUserIds.add(socketData.userId);
      }
    }
    
    // Only include usernames for users with connected sockets
    for (const user of users) {
      if (connectedUserIds.has(user.id)) {
        connectedUsers.push(user.username);
      }
    }
    
    const ts = new Date().toISOString();
    io.to(roomId).emit("onlineUsers", connectedUsers);
    console.log(`[PRESENCE] broadcast room=${roomId} count=${connectedUsers.length} totalInRedis=${users.length} ts=${ts}`);
    console.log(`[INFO] [broadcastOnlineUsers] roomId="${roomId}" count=${connectedUsers.length} msg="Broadcasted users"`);
    logger.info("broadcastOnlineUsers", `Broadcasted users`, { roomId, count: connectedUsers.length, totalInRedis: users.length });
  } catch (error: any) {
    logger.error("broadcastOnlineUsers", "Error broadcasting users", { roomId }, error);
  }
}

// Helper: Check if user has other sockets in room
async function hasOtherSocketsInRoom(io: SocketIOServer, roomId: string, userId: string, excludeSocketId: string): Promise<boolean> {
  try {
    const socketCount = await getUserSocketCount(userId);
    if (socketCount > 1) {
      // User has other sockets - check if any are in this room
      const socketsInRoom = await io.in(roomId).fetchSockets();
      return socketsInRoom.some(s => {
        const socketData = (s as any).data;
        return s.id !== excludeSocketId && socketData?.userId === userId;
      });
    }
    return false;
  } catch (error: any) {
    logger.error("hasOtherSocketsInRoom", "Error checking sockets", { roomId, userId }, error);
    return false;
  }
}

// Helper: Wait for socket to be ready in user room (for random chat matching)
async function waitForSocketReady(userId: string, io: SocketIOServer, maxRetries = 5): Promise<Socket | null> {
  for (let i = 0; i < maxRetries; i++) {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    if (sockets.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[RANDOM_CHAT] Socket ready for userId=${userId} after ${i + 1} attempts`);
      }
      return sockets[0] as any;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[RANDOM_CHAT] Socket not ready for userId=${userId} after ${maxRetries} attempts`);
  }
  return null;
}

// Helper: Delete room deterministically with grace period
// Note: Grace period is now handled in storage.ts with scheduling
// This function is kept for backward compatibility but defers to storage logic
async function deleteRoomIfEmpty(roomId: string, io: SocketIOServer, reason: string): Promise<void> {
  try {
    const users = await getRoomUsers(roomId);
    if (users.length === 0) {
      const room = await getRoom(roomId, true); // Skip auto-delete check
      if (room) {
        const age = Date.now() - (room.createdAt || 0);
        // Use same grace period as storage (60s default)
        const ROOM_DELETE_GRACE_MS = parseInt(process.env.ROOM_DELETE_GRACE_MS || "60000", 10);
        if (age >= ROOM_DELETE_GRACE_MS) {
          await storage.deleteRoom(roomId);
          io.to(roomId).emit("roomDeleted");
          console.log(`🗑️ [ROOM DELETE] roomId=${roomId} reason=${reason} age=${age}ms`);
        } else {
          logger.debug("deleteRoomIfEmpty", `Room too fresh to delete`, { roomId, age });
        }
      }
    }
  } catch (error: any) {
    logger.error("deleteRoomIfEmpty", "Error deleting room", { roomId }, error);
  }
}

// Helper: Handle user leave cleanup - removes from Redis, broadcasts events, deletes random chat if needed
async function handleUserLeaveCleanup(
  roomId: string,
  userId: string,
  io: SocketIOServer,
  reason: string = "user_left"
): Promise<void> {
  try {
    // Remove user from Redis set
    await removeUserFromRoom(roomId, userId);
    
    // Get remaining users count
    const remainingUsers = await getRoomUsers(roomId);
    const totalUsers = remainingUsers.length;
    
    // Emit user_left event
    console.log(`[PRESENCE] user_left room=${roomId} user=${userId}`);
    io.to(roomId).emit("user_left", { userId: userId, roomId: roomId });
    
    // Broadcast updated online users (emits both onlineUsers and online_users for compatibility)
    await broadcastOnlineUsers(io, roomId);
    // Also emit online_users event (with underscore) as requested
    const connectedUsers = await getRoomUsers(roomId);
    const socketsInRoom = await io.in(roomId).fetchSockets();
    const connectedUserIds = new Set<string>();
    for (const s of socketsInRoom) {
      const socketData = (s as any).data;
      if (socketData?.userId && socketData?.connected !== false) {
        connectedUserIds.add(socketData.userId);
      }
    }
    const onlineUserNames = connectedUsers
      .filter(u => connectedUserIds.has(u.id))
      .map(u => u.username);
    io.to(roomId).emit("online_users", onlineUserNames);
    console.log(`[BROADCAST] updated online users for room=${roomId}`);
    
    // Send system message
    const user = await getUser(userId);
    if (user) {
      io.to(roomId).emit("systemMessage", {
        type: "user_left",
        message: `${user.username} left the room.`,
        username: user.username,
        userId: userId,
        totalUsers: totalUsers,
      });
    }
    
    // Check if random chat room should be deleted (< 2 users)
    if (totalUsers < 2) {
      const room = await getRoom(roomId, true);
      if (room && room.maxUsers === 2) {
        // Random chat room - delete immediately
        console.log(`[ROOM CLEANUP] deleted room=${roomId} (reason: no users)`);
        
        // Notify remaining user FIRST (before deleting room)
        io.to(roomId).emit("systemMessage", {
          type: "room_deleted",
          message: "The other user left. This room will be closed.",
          username: "System",
        });
        
        // Emit room_closed event immediately (client will handle redirect)
        io.to(roomId).emit("room_closed", { reason: "not_enough_users", roomId: roomId });
        
        // Delete room from Redis
        await storage.deleteRoom(roomId);
        
        // Clean up Socket.IO room
        const socketsInRoom = await io.in(roomId).fetchSockets();
        for (const s of socketsInRoom) {
          s.leave(roomId);
        }
        
        console.log(`[ROOM CLEANUP] ✅ Room deleted and cleaned up roomId=${roomId} socketsRemoved=${socketsInRoom.length}`);
      }
    }
  } catch (error: any) {
    console.error(`[PRESENCE] Error in handleUserLeaveCleanup room=${roomId} user=${userId}:`, error);
    logger.error("handleUserLeaveCleanup", "Error in cleanup", { roomId, userId }, error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false,
  }));

  // Request logging
  app.use(morgan("[:date[iso]] :method :url :status - :response-time ms"));

  // No-cache headers
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  // Authentication endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username } = req.body as InsertUser;
      logger.info("login", `POST /api/auth/login`, { username: username?.substring(0, 10) });

      if (!username || username.length < 2 || username.length > 20) {
        logger.warn("login", `Invalid username length`, { length: username?.length || 0 });
        return res.json({
          success: false,
          message: "Username must be between 2 and 20 characters",
        });
      }

      // Check if username exists
      try {
        const existingUser = await storage.getUserByUsername(username.trim());
        if (existingUser) {
          logger.warn("login", `Username already taken`, { username });
          return res.json({
            success: false,
            message: "Username already taken. Please choose another.",
          });
        }
      } catch (error: any) {
        logger.warn("login", "Error checking existing user", { username, error: error?.message || String(error) });
      }

      // Create user
      try {
        const user = await storage.createUser({ username: username.trim() });
        logger.info("login", `User created`, { userId: user.id, username: user.username });

        return res.json({
          success: true,
          userId: user.id,
          username: user.username,
        });
      } catch (error: any) {
        logger.error("login", "Error creating user", { username }, error);
        return res.status(500).json({
          success: false,
          message: "Server error: Failed to create user. Please try again.",
        });
      }
    } catch (error: any) {
      logger.error("login", "Unexpected error", {}, error);
      return res.status(500).json({
        success: false,
        message: "Server error: Unexpected error occurred. Please try again.",
      });
    }
  });

  // Logout endpoint - explicitly delete user data
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const { userId } = req.body;
      if (userId) {
        await storage.deleteUser(userId);
        logger.info("logout", `User logged out`, { userId });
      }
      return res.json({ success: true });
    } catch (error: any) {
      logger.error("logout", "Error during logout", {}, error);
      return res.status(500).json({ success: false });
    }
  });

  // Create room endpoint - NEW: supports custom room codes
  app.post("/api/rooms/create", async (req, res) => {
    try {
      const { name, ownerId, ownerUsername, maxUsers = 35, customCode } = req.body as InsertRoom & { customCode?: string };
      logger.info("createRoom", `POST /api/rooms/create`, { ownerUsername, customCode });

      if (!name || !ownerId || !ownerUsername) {
        logger.warn("createRoom", `Missing required fields`, { hasName: !!name, hasOwnerId: !!ownerId, hasOwnerUsername: !!ownerUsername });
        return res.json({
          success: false,
          message: "Missing required fields",
        });
      }

      // NEW: Validate custom room code if provided
      let roomId: string;
      if (customCode && customCode.trim().length > 0) {
        const trimmedCode = customCode.trim().toLowerCase();
        
        // Validate room code format: alphanumeric and hyphens only, 2-20 chars
        if (!/^[a-z0-9-]{2,20}$/.test(trimmedCode)) {
          logger.warn("createRoom", `Invalid room code format`, { customCode: trimmedCode });
          return res.json({
            success: false,
            message: "Room code must be 2-20 characters (letters, numbers, and hyphens only)",
          });
        }

        // Check if room code already exists
        const existingRoom = await storage.getRoom(trimmedCode, true);
        if (existingRoom) {
          logger.warn("createRoom", `Room code already exists`, { customCode: trimmedCode });
          return res.json({
            success: false,
            message: "Room code already exists",
          });
        }

        roomId = trimmedCode;
      } else {
        // Generate random ID if no custom code provided or empty string
        roomId = uuidv4().slice(0, 8);
      }

      // NEW: Create room with custom or generated ID
      const room = await storage.createRoomWithId({
        id: roomId,
        name: name.trim(),
        ownerId,
        ownerUsername,
        maxUsers,
      });

      inMemoryMessages.set(room.id, []);

      // NEW: Emit room_created event via socket to all connected clients
      const createTimestamp = new Date().toISOString();
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ROOM CREATED] roomId=${room.id} name=${room.name} owner=${ownerUsername} ts=${createTimestamp}`);
      }
      
      // Emit to all sockets (broadcast)
      io.emit("room_created", {
        roomId: room.id,
        name: room.name,
        ownerUsername: ownerUsername,
        timestamp: Date.now(),
      });

      logger.info("createRoom", `Room created`, { roomId: room.id, name: room.name });
      return res.json({ success: true, room });
    } catch (error: any) {
      console.error("[createRoom] error", error);
      logger.error("createRoom", "Error creating room", {}, error);
      // Return specific error message if available, otherwise generic message
      const errorMessage = error?.message || "Failed to create room";
      return res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  });

  // Get room details
  app.get("/api/rooms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      logger.debug("getRoom", `GET /api/rooms/${id}`);

      const room = await storage.getRoom(id);

      if (!room) {
        logger.warn("getRoom", `Room not found`, { roomId: id });
        return res.status(404).json({
          success: false,
          message: "Room not found",
        });
      }

      logger.debug("getRoom", `Room found`, { roomId: id, userCount: room.users.length });
      return res.json({ success: true, room });
    } catch (error: any) {
      logger.error("getRoom", "Error getting room", { roomId: req.params.id }, error);
      return res.status(500).json({
        success: false,
        message: "Failed to get room",
      });
    }
  });

  // Check room name availability - case-insensitive check
  app.get("/api/rooms/check/:name", async (req, res) => {
    try {
      const { name } = req.params;
      
      if (!name || name.trim().length < 2 || name.trim().length > 50) {
        return res.json({
          success: true,
          available: false, // Invalid names are not available
        });
      }

      const normalizedName = name.trim().toLowerCase();
      logger.debug("checkRoomName", `Checking room name availability`, { name: normalizedName });

      // Check Redis for existing rooms with this name (case-insensitive)
      // We scan room keys and check their names
      if (!redis || redis.status !== "ready") {
        logger.warn("checkRoomName", "Redis not ready", { name });
        // If Redis is unavailable, assume available to allow room creation to proceed
        return res.json({
          success: true,
          available: true,
        });
      }

      try {
        // Get all room keys (room:* pattern, excluding :users, :messages, etc.)
        const roomKeys = await redis.keys("room:*");
        const filteredKeys = roomKeys.filter(k => !k.includes(":users") && !k.includes(":messages") && !k.includes(":emptySince"));
        
        // Check each room's name (case-insensitive)
        for (const key of filteredKeys) {
          try {
            const roomData = await redis.get(key);
            if (roomData) {
              const room = JSON.parse(roomData);
              if (room.name && room.name.toLowerCase() === normalizedName) {
                logger.debug("checkRoomName", `Room name already taken`, { name: normalizedName, roomId: room.id });
                return res.json({
                  success: true,
                  available: false,
                });
              }
            }
          } catch (e) {
            // Skip invalid room data
            continue;
          }
        }

        // Name is available
        logger.debug("checkRoomName", `Room name available`, { name: normalizedName });
        return res.json({
          success: true,
          available: true,
        });
      } catch (error: any) {
        logger.error("checkRoomName", "Error checking room name", { name }, error);
        // On error, assume available to allow room creation
        return res.json({
          success: true,
          available: true,
        });
      }
    } catch (error: any) {
      logger.error("checkRoomName", "Unexpected error", {}, error);
      // On unexpected error, assume available
      return res.json({
        success: true,
        available: true,
      });
    }
  });

  // Check room code availability (by room ID) - for custom room codes
  app.get("/api/rooms/check/:code", async (req, res) => {
    try {
      const { code } = req.params;
      
      if (!code || code.trim().length < 2 || code.trim().length > 20) {
        return res.json({
          success: true,
          available: false, // Invalid codes are not available
        });
      }

      const normalizedCode = code.trim().toLowerCase();
      
      // Validate format: lowercase letters, numbers, and hyphens only
      if (!/^[a-z0-9-]{2,20}$/.test(normalizedCode)) {
        return res.json({
          success: true,
          available: false,
        });
      }

      logger.debug("checkRoomCode", `Checking room code availability`, { code: normalizedCode });

      // Check if room with this ID already exists
      const existingRoom = await storage.getRoom(normalizedCode, true);
      if (existingRoom) {
        logger.debug("checkRoomCode", `Room code already taken`, { code: normalizedCode });
        return res.json({
          success: true,
          available: false,
        });
      }

      // Code is available
      logger.debug("checkRoomCode", `Room code available`, { code: normalizedCode });
      return res.json({
        success: true,
        available: true,
      });
    } catch (error: any) {
      logger.error("checkRoomCode", "Error checking room code", { code: req.params.code }, error);
      // On error, assume unavailable to be safe
      return res.json({
        success: true,
        available: false,
      });
    }
  });

  // Random chat endpoint - Queue-based matching with 1-minute timeout
  app.post("/api/random-chat/request", async (req, res) => {
    try {
      const { userId } = req.body;
      logger.info("randomChat", `Random chat request`, { userId });
      
      if (!userId) {
        return res.json({
          success: false,
          message: "User ID required",
        });
      }
      
      // Add user to queue and check for match
      const result = await addToRandomQueue(userId);
      
      if (result.matched && result.partnerUserId) {
        // Match found! Create a room for both users
        const user1 = await getUser(userId);
        const user2 = await getUser(result.partnerUserId);
        
        if (!user1 || !user2) {
          logger.warn("randomChat", "User not found for match", { userId, partnerUserId: result.partnerUserId });
          return res.json({
            success: false,
            message: "Match failed - user not found",
          });
        }
        
        // Create room with both users
        const room = await storage.createRoom({
          name: `Chat with ${user2.username}`,
          ownerId: user1.id,
          ownerUsername: user1.username,
          maxUsers: 2,
        });
        
        // Add both users to room
        await addUserToRoom(room.id, { id: user1.id, username: user1.username });
        await addUserToRoom(room.id, { id: user2.id, username: user2.username });
        
        // CRITICAL: Wait for both sockets to be ready in their user rooms before emitting
        // This ensures both users receive the match notification reliably
        // Retry up to 5 times with 100ms interval (as per requirements: 50-100ms, max 5 tries)
        const socket1 = await waitForSocketReady(user1.id, io, 5);
        const socket2 = await waitForSocketReady(user2.id, io, 5);
        
        // If sockets are ready, ensure they're in their user rooms (should already be from heartbeat_bind)
        // Double-check by joining again (idempotent operation - safe to call multiple times)
        if (socket1) {
          socket1.join(`user:${user1.id}`);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[RANDOM_CHAT] Socket1 confirmed in user room userId=${user1.id}`);
          }
        }
        if (socket2) {
          socket2.join(`user:${user2.id}`);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[RANDOM_CHAT] Socket2 confirmed in user room userId=${user2.id}`);
          }
        }
        
        // Notify both users via socket - use user-specific rooms for reliable delivery
        const matchData1 = { roomId: room.id, partnerUsername: user2.username };
        const matchData2 = { roomId: room.id, partnerUsername: user1.username };
        
        // Emit to user rooms (will reach all sockets for each user)
        io.to(`user:${user1.id}`).emit("random_chat_matched", matchData1);
        io.to(`user:${user2.id}`).emit("random_chat_matched", matchData2);
        
        // CRITICAL: Enhanced logging for match confirmation
        console.log(`[RANDOM_CHAT] Match found - roomId=${room.id} user1=${user1.username} user2=${user2.username}`);
        logger.info("randomChat", `Match found - roomId=${room.id} user1=${user1.username} user2=${user2.username}`);
        
        const sockets1Count = await io.in(`user:${user1.id}`).fetchSockets().then(s => s.length);
        const sockets2Count = await io.in(`user:${user2.id}`).fetchSockets().then(s => s.length);
        console.log(`[RANDOM_CHAT] Socket1 ready=${!!socket1} (${sockets1Count} sockets), Socket2 ready=${!!socket2} (${sockets2Count} sockets)`);
        
        // Check if both sockets are ready (with retry logic)
        if (!socket1 || !socket2) {
          console.warn(`[RANDOM_CHAT] ⚠️ Socket not ready after 5 attempts - socket1=${!!socket1} socket2=${!!socket2}`);
          logger.warn("randomChat", "Socket not ready after max retries", { 
            roomId: room.id, 
            user1: user1.username, 
            user2: user2.username,
            socket1Ready: !!socket1,
            socket2Ready: !!socket2
          });
          
          // Emit error to clients if socket not ready (but still create room)
          if (!socket1) {
            io.to(`user:${user1.id}`).emit("random_chat_error", { 
              message: "⚠️ Connection unstable. Trying again...",
              roomId: room.id 
            });
          }
          if (!socket2) {
            io.to(`user:${user2.id}`).emit("random_chat_error", { 
              message: "⚠️ Connection unstable. Trying again...",
              roomId: room.id 
            });
          }
        } else {
          // Both sockets ready - emit success message
          io.to(`user:${user1.id}`).emit("random_chat_matched", { ...matchData1, status: "matched" });
          io.to(`user:${user2.id}`).emit("random_chat_matched", { ...matchData2, status: "matched" });
        }
        
        return res.json({
          success: true,
          roomId: room.id,
          partnerUsername: user2.username,
        });
      }
      
      // No match yet - user is in queue, wait for timeout or another user
      logger.info("randomChat", `User added to queue`, { userId, queueSize: await getRandomQueueSize() });
      return res.json({
        success: true,
        queued: true,
        timeout: 60000, // 1 minute
      });
      
    } catch (error: any) {
      logger.error("randomChat", "Error in random chat", {}, error);
      return res.status(500).json({
        success: false,
        message: "Failed to match users",
      });
    }
  });
  
  // Cancel random chat request
  app.post("/api/random-chat/cancel", async (req, res) => {
    try {
      const { userId } = req.body;
      if (userId) {
        await removeFromRandomQueue(userId);
        logger.info("randomChatCancel", `User removed from queue`, { userId });
      }
      return res.json({ success: true });
    } catch (error: any) {
      logger.error("randomChatCancel", "Error canceling", {}, error);
      return res.status(500).json({ success: false });
    }
  });

  // Debug endpoints (non-production only)
  if (process.env.NODE_ENV !== "production") {
    app.get("/debug/room/:roomId", async (req, res) => {
      try {
        const { roomId } = req.params;
        const room = await getRoom(roomId, true);
        const users = await getRoomUsers(roomId);
        const messages = await loadMessages(roomId, 10);
        
        return res.json({
          room,
          users,
          messages,
          redis: redis?.status || "not connected",
        });
      } catch (error: any) {
        logger.error("debugRoom", "Error in debug endpoint", { roomId: req.params.roomId }, error);
        return res.status(500).json({ error: error.message });
      }
    });

    app.get("/debug/user/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        const user = await getUser(userId);
        const socketCount = await getUserSocketCount(userId);
        
        return res.json({
          user,
          socketCount,
          redis: redis?.status || "not connected",
        });
      } catch (error: any) {
        logger.error("debugUser", "Error in debug endpoint", { userId: req.params.userId }, error);
        return res.status(500).json({ error: error.message });
      }
    });

    app.get("/debug/health", async (req, res) => {
      try {
        const ping = redis ? await redis.ping() : "not connected";
        return res.json({
          redis: {
            status: redis?.status || "not connected",
            ping,
          },
          uptime: process.uptime(),
        });
      } catch (error: any) {
        logger.error("debugHealth", "Error in health check", {}, error);
        return res.status(500).json({ error: error.message });
      }
    });
  }

  // Presence API endpoint
  app.get("/api/presence/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const presence = await storage.getPresence(userId);
      return res.json({
        success: true,
        online: presence.online,
        lastSeen: presence.lastSeen,
      });
    } catch (error: any) {
      logger.error("getPresence", "Error getting presence", { userId: req.params.userId }, error);
      return res.status(500).json({
        success: false,
        message: "Failed to get presence",
      });
    }
  });

  const httpServer = createServer(app);

  // Socket.IO setup
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Periodic Redis health check
  setInterval(async () => {
    if (redis && redis.status === "ready") {
      try {
        await redis.ping();
        logger.debug("healthCheck", `Redis ping OK`);
      } catch (error: any) {
        logger.error("healthCheck", "Redis ping failed", {}, error);
      }
    }
  }, 60000); // Every minute

  io.on("connection", (socket: TypedSocket) => {
    console.log(`✅ [CONNECT] ${socket.id}`);

    // Initialize socket data
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

    // Track pending userId from early events (heartbeat, etc.)
    let pendingUserId: string | null = null;

    console.log(`[TRACE:socketBinding] socket=${socket.id} userId=null roomId=null stage=connection`);

    // CRITICAL: heartbeat_bind handler - binds userId immediately and confirms before join_room
    // This ensures userId is always bound before join_room, especially on reconnects
    socket.on("heartbeat_bind", ({ userId }: { userId: string }) => {
      const ts = new Date().toISOString();
      console.log(`[SOCKET SYNC] heartbeat_bind received socket=${socket.id} userId=${userId || 'null'} ts=${ts}`);
      
      if (userId) {
        const wasBound = socket.data.userId !== null;
        const previousUserId = socket.data.userId;
        
        if (!socket.data.userId) {
          socket.data.userId = userId;
          console.log(`[SOCKET SYNC] userId bound via heartbeat_bind socket=${socket.id} userId=${userId} connected=${socket.connected} ts=${ts}`);
          console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=${socket.data.roomId || 'null'} stage=heartbeat_bind`);
        } else if (socket.data.userId !== userId) {
          // User changed - leave old user room
          if (previousUserId) {
            socket.leave(`user:${previousUserId}`);
            if (process.env.NODE_ENV === 'development') {
              console.log(`[RANDOM_CHAT] Left old user room socket=${socket.id} oldUserId=${previousUserId}`);
            }
          }
          console.log(`[SOCKET SYNC] userId updated via heartbeat_bind socket=${socket.id} oldUserId=${socket.data.userId} newUserId=${userId} ts=${ts}`);
          socket.data.userId = userId;
          socket.data.roomId = null;
          socket.data.joined = false;
        }
        
        // CRITICAL: Join socket to user-specific room for random chat matching
        // This allows io.to(\`user:${userId}\`) to work correctly
        socket.join(`user:${userId}`);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[RANDOM_CHAT] Socket joined user room socket=${socket.id} userId=${userId}`);
        }
        
        // Update last seen
        storage.updateLastSeen(userId).catch(err => {
          logger.error("heartbeat_bind", "Failed to update last seen", { userId }, err);
        });
        
        // CRITICAL: Emit heartbeat_bound to confirm binding - client waits for this before join_room
        socket.emit("heartbeat_bound", { userId });
        console.log(`[SOCKET SYNC] heartbeat_bound emitted socket=${socket.id} userId=${userId} ts=${ts}`);
      } else {
        console.log(`[SOCKET SYNC] heartbeat_bind received without userId socket=${socket.id} ts=${ts}`);
      }
    });

    // Heartbeat handler - periodic health check (kept for compatibility and latency tracking)
    socket.on("heartbeat", async ({ userId, clientTimestamp }: { userId: string; clientTimestamp?: number }, ack?: (response: { ok: boolean; userId: string; timestamp: number; latency?: number }) => void) => {
      const startTime = Date.now();
      const timestamp = Date.now();
      
      if (userId) {
        // Update binding if needed
        const wasBound = socket.data.userId !== null;
        if (!socket.data.userId) {
          socket.data.userId = userId;
          console.log(`[SOCKET SYNC] userId bound via heartbeat socket=${socket.id} userId=${userId} connected=${socket.connected} ts=${new Date(timestamp).toISOString()}`);
          console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=${socket.data.roomId || 'null'} stage=heartbeat_bound`);
        } else if (socket.data.userId !== userId) {
          console.log(`[SOCKET SYNC] userId updated via heartbeat socket=${socket.id} oldUserId=${socket.data.userId} newUserId=${userId} ts=${new Date(timestamp).toISOString()}`);
          socket.data.userId = userId;
          socket.data.roomId = null;
          socket.data.joined = false;
        }
        
        await storage.updateLastSeen(userId);
        
        // Calculate latency if client sent timestamp
        const latency = clientTimestamp ? Date.now() - clientTimestamp : undefined;
        if (latency !== undefined) {
          console.log(`[HEARTBEAT] latency=${latency}ms userId=${userId} socket=${socket.id}`);
          logger.info("heartbeat", `Latency measured`, { latency, userId, socketId: socket.id });
        }
        
        logger.debug("heartbeat", `Heartbeat received`, { socketId: socket.id, userId, latency });
        
        // Send acknowledgment
        if (ack) {
          ack({ ok: true, userId, timestamp, latency });
          console.log(`[SOCKET SYNC] heartbeat ack sent socket=${socket.id} userId=${userId} ok=true ts=${new Date(timestamp).toISOString()} latency=${latency || 'N/A'}ms`);
        }
      } else {
        if (ack) {
          ack({ ok: false, userId: '', timestamp, latency: undefined });
          console.log(`[SOCKET SYNC] heartbeat ack sent (no userId) socket=${socket.id} ok=false ts=${new Date(timestamp).toISOString()}`);
        }
      }
    });

    // Join room - FULLY ACKED with message history
    socket.on("join_room", async ({ roomId, userId }: { roomId: string; userId: string }, ack?: (response: { ok: boolean; messages?: Message[]; reason?: string }) => void) => {
      const startTime = new Date().toISOString();
      console.log(`[SOCKET SYNC] Join room received - socket.id=${socket.id} roomId=${roomId} userId=${userId} connected=${socket.connected} socket.data.userId=${socket.data.userId || 'null'}`);
      console.log(`[DEBUG:join_room] START timestamp=${startTime} socket=${socket.id} roomId=${roomId} userId=${userId}`);
      console.log(`📥 [JOIN_ROOM start] socket=${socket.id} roomId=${roomId} userId=${userId}`);

      // Check if already joining - if joining to same room, wait and return success
      if (socket.data.joining) {
        // Check if it's the same room - if so, wait for the existing join to complete
        if (socket.data.roomId === roomId && socket.data.userId === userId) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[JOIN_ROOM] Already joining same room - waiting for completion socket=${socket.id} roomId=${roomId} userId=${userId}`);
          }
          
          // Wait for the existing join to complete (polling with timeout)
          const maxWaitTime = 2000; // 2 seconds max wait
          const checkInterval = 100; // Check every 100ms
          let waited = 0;
          
          const waitForJoin = async () => {
            while (waited < maxWaitTime) {
              if (!socket.data.joining) {
                // Join process completed
                if (socket.data.joined && socket.data.roomId === roomId) {
                  // Join succeeded - send ack with success
                  const users = await getRoomUsers(roomId);
                  const history = await loadMessages(roomId, 50);
                  ack?.({ ok: true, messages: history });
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`[JOIN_ROOM] Duplicate request resolved - join successful socket=${socket.id} roomId=${roomId}`);
                  }
                } else {
                  // Join failed - send error
                  ack?.({ ok: false, reason: "join_failed" });
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`[JOIN_ROOM] Duplicate request resolved - join failed socket=${socket.id} roomId=${roomId}`);
                  }
                }
                return;
              }
              waited += checkInterval;
              await new Promise(r => setTimeout(r, checkInterval));
            }
            
            // Timeout - still joining
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[JOIN_ROOM] Duplicate request timeout - still joining socket=${socket.id} roomId=${roomId}`);
            }
            ack?.({ ok: false, reason: "join_timeout" });
          };
          
          waitForJoin().catch(err => {
            logger.error("join_room", "Error waiting for join completion", { socketId: socket.id, roomId, userId }, err);
            ack?.({ ok: false, reason: "join_error" });
          });
          
          return;
        } else {
          // Different room - this is an error
          const endTime = new Date().toISOString();
          console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=failed reason=already_joining_different_room`);
          console.log(`❌ [JOIN_ROOM fail] reason=already_joining_different_room socket=${socket.id} currentRoomId=${socket.data.roomId}`);
          ack?.({ ok: false, reason: "already_joining" });
          return;
        }
      }

      // Validate inputs (types, non-empty)
      if (!roomId || !userId || typeof roomId !== "string" || typeof userId !== "string") {
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId || 'undefined'} userId=${userId || 'undefined'} result=failed reason=missing_room_or_user`);
        console.log(`❌ [JOIN_ROOM fail] reason=missing_room_or_user socket=${socket.id}`);
        ack?.({ ok: false, reason: "missing_room_or_user" });
        return;
      }

      // CRITICAL: Immediately bind userId and roomId to socket BEFORE async validation
      // This ensures disconnect handler always has these values, even if validation fails
      const previousUserId = socket.data.userId;
      const previousRoomId = socket.data.roomId;
      socket.data.userId = userId;
      socket.data.roomId = roomId;
      console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=${roomId} stage=join_room_immediate previousUserId=${previousUserId || 'null'} previousRoomId=${previousRoomId || 'null'}`);

      socket.data.joining = true;

      try {
        // Validate user exists
        console.log(`[DEBUG:join_room] Validating user userId=${userId} socket=${socket.id} roomId=${roomId}`);
        const user = await getUser(userId);
        if (!user) {
          // Validation failed - reset socket.data but keep trace
          socket.data.userId = null;
          socket.data.roomId = null;
          const endTime = new Date().toISOString();
          console.log(`[TRACE:socketBinding] socket=${socket.id} userId=null roomId=null stage=join_room_validation_failed reason=user_not_found`);
          console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=failed reason=user_not_found`);
          console.log(`❌ [JOIN_ROOM fail] reason=user_not_found socket=${socket.id}`);
          socket.data.joining = false;
          ack?.({ ok: false, reason: "user_not_found" });
          return;
        }

        // Validate room exists
        console.log(`[DEBUG:join_room] Validating room roomId=${roomId} socket=${socket.id} userId=${userId}`);
        const room = await getRoom(roomId, true); // Skip auto-delete during join
        if (!room) {
          // Validation failed - reset socket.data but keep trace
          socket.data.userId = null;
          socket.data.roomId = null;
          const endTime = new Date().toISOString();
          console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=null stage=join_room_validation_failed reason=room_not_found`);
          console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=failed reason=room_not_found`);
          console.log(`❌ [JOIN_ROOM fail] reason=room_not_found socket=${socket.id}`);
          socket.data.joining = false;
          ack?.({ ok: false, reason: "room_not_found" });
          return;
        }

        // STEP 1: Add socket to user tracking
        await addSocketToUser(userId, socket.id);

        // STEP 2: Add user to room (idempotent) - MUST be atomic and complete before socket.join
        console.log(`[DEBUG:join_room] Adding user to room roomId=${roomId} userId=${userId} socket=${socket.id}`);
        const added = await addUserToRoom(roomId, { id: user.id, username: user.username });
        if (!added) {
          // Validation failed - reset socket.data but keep trace
          socket.data.userId = null;
          socket.data.roomId = null;
          const endTime = new Date().toISOString();
          console.log(`[TRACE:socketBinding] socket=${socket.id} userId=null roomId=null stage=join_room_validation_failed reason=failed_to_add_user`);
          console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=failed reason=failed_to_add_user`);
          console.log(`❌ [JOIN_ROOM fail] reason=failed_to_add_user socket=${socket.id}`);
          socket.data.joining = false;
          ack?.({ ok: false, reason: "failed_to_add_user" });
          return;
        }

        // STEP 3: Join socket room (after storage write succeeds)
        // Note: socket.join is synchronous but we wait for propagation
        try {
          socket.join(roomId);
          console.log(`🔗 [SOCKET JOINED] socket=${socket.id} roomId=${roomId}`);
          // Small delay to ensure socket room is ready before any emits
          await new Promise((r) => setTimeout(r, 50));
        } catch (joinError: any) {
          // ROLLBACK: socket.join failed - remove user from room
          console.log(`❌ [ROLLBACK] socket.join failed - removing user from room socket=${socket.id} roomId=${roomId} userId=${userId}`);
          await removeUserFromRoom(roomId, userId);
          socket.data.userId = null;
          socket.data.roomId = null;
          const endTime = new Date().toISOString();
          console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=failed reason=socket_join_error`);
          console.log(`❌ [JOIN_ROOM fail] reason=socket_join_error socket=${socket.id}`);
          socket.data.joining = false;
          logger.error("join_room", "socket.join failed", { socketId: socket.id, roomId, userId }, joinError);
          ack?.({ ok: false, reason: "socket_join_error" });
          return;
        }

        // STEP 4: Small propagation delay to ensure adapter propagation
        await new Promise((r) => setTimeout(r, 120));

        // STEP 5: Update socket metadata (userId and roomId already set above, now set remaining fields)
        socket.data.username = user.username;
        socket.data.joined = true;
        socket.data.joining = false;
        
        // Confirm binding is complete
        console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=${roomId} stage=join_room_success username=${user.username}`);

        // STEP 6: Fetch users after join (from authoritative Redis set)
        const users = await getRoomUsers(roomId);

        // STEP 7: Load message history
        const history = await loadMessages(roomId, 50);

        // STEP 8: Broadcast system message (will be replaced by enhanced message in STEP 9.6)
        // Keep this for backward compatibility, but enhanced message is sent in STEP 9.6
        
        // STEP 9: Broadcast online users AFTER storage write + socket.join + delay (authoritative state)
        // CRITICAL: Verify user is actually in Redis set before confirming join
        const verifyUsers = await getRoomUsers(roomId);
        const userIsInRoom = verifyUsers.some(u => u.id === userId);
        
        if (!userIsInRoom) {
          // User was added but somehow not in set - this is a critical error
          console.error(`[ERROR:join_room] User ${userId} not found in room set after addUserToRoom - rollback required`);
          await removeUserFromRoom(roomId, userId);
          await removeSocketFromUser(userId, socket.id);
          socket.leave(roomId);
          socket.data.userId = null;
          socket.data.roomId = null;
          socket.data.joined = false;
          socket.data.joining = false;
          const endTime = new Date().toISOString();
          console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=failed reason=user_not_in_redis_set`);
          ack?.({ ok: false, reason: "storage_error" });
          return;
        }
        
        await broadcastOnlineUsers(io, roomId);
        console.log(`📨 [ONLINE USERS BROADCAST] roomId=${roomId} count=${verifyUsers.length} socket=${socket.id} userVerified=${userIsInRoom}`);

        // STEP 9.5: Emit explicit room_joined event to joining socket ONLY after Redis verification
        // This ensures frontend receives confirmation only when Redis and socket are both synced
        const roomJoinedPayload = {
          roomId,
          userId,
          success: true,
          users: verifyUsers.map(u => u.username), // Authoritative user list from Redis set
        };
        
        // CRITICAL: Use socket.emit directly to the specific socket to ensure delivery
        // io.to(socket.id) should work, but socket.emit is more direct
        socket.emit("room_joined", roomJoinedPayload);
        console.log(`[SERVER EMIT] room_joined -> socket.id=${socket.id} userId=${userId} roomId=${roomId} usersCount=${verifyUsers.length} verified=true`);
        console.log(`[SERVER EMIT] room_joined payload:`, JSON.stringify(roomJoinedPayload));

        // STEP 9.6: Broadcast user_joined to other sockets in the room (not the joining socket)
        const ts = new Date().toISOString();
        console.log(`[PRESENCE] join user=${userId} room=${roomId} ok=true socket=${socket.id} ts=${ts}`);
        console.log(`[INFO] [addUserToRoom] roomId="${roomId}" totalUsers=${verifyUsers.length} msg="${user.username} joined the room"`);
        
        // Send system message to all users in room (including the joining user) with totalUsers count
        io.to(roomId).emit("systemMessage", {
          type: "user_joined",
          message: `${user.username} joined the room.`,
          username: user.username,
          userId: userId,
          totalUsers: verifyUsers.length,
        });
        
        socket.to(roomId).emit("user_joined", { userId, username: user.username, roomId, totalUsers: verifyUsers.length });

        // STEP 10: Send loadMessages to joining socket
        socket.emit("loadMessages", history);

        const endTime = new Date().toISOString();
        console.log(`[SOCKET SYNC] Join room complete - socket.id=${socket.id} roomId=${roomId} userId=${userId} username=${user.username} socket.data.userId=${socket.data.userId} socket.data.roomId=${socket.data.roomId}`);
        console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=success username=${user.username}`);
        console.log(`✅ [JOIN_ROOM ok] user=${user.username} userId=${userId} roomId=${roomId} socket=${socket.id}`);

        // STEP 11: Send ack with messages
        ack?.({ ok: true, messages: history });

      } catch (err: any) {
        // Server error - reset socket.data but keep trace
        socket.data.userId = null;
        socket.data.roomId = null;
        const endTime = new Date().toISOString();
        console.log(`[TRACE:socketBinding] socket=${socket.id} userId=null roomId=null stage=join_room_error reason=server_error`);
        console.log(`[DEBUG:join_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId || 'unknown'} userId=${userId || 'unknown'} result=failed reason=server_error`);
        console.log(`❌ [JOIN_ROOM fail] reason=server_error socket=${socket.id}`);
        logger.error("join_room", "Error in join", { socketId: socket.id, roomId, userId }, err);
        socket.data.joining = false;
        ack?.({ ok: false, reason: "server_error" });
      }
    });

    // Send message - ACKED with message ID
    socket.on("send_message", async ({ roomId, userId, text, messageTempId }: { roomId: string; userId: string; text: string; messageTempId?: string }, ack?: (response: { ok: boolean; id?: string; reason?: string }) => void) => {
      const startTime = new Date().toISOString();
      const tempId = messageTempId || `temp-${Date.now()}`;
      console.log(`[DEBUG:send_message] START timestamp=${startTime} socket=${socket.id} roomId=${roomId} userId=${userId} messageTempId=${tempId}`);
      console.log(`📨 [SEND_MESSAGE recv] socket=${socket.id} roomId=${roomId} userId=${userId} messageTempId=${tempId}`);

      // Validate joined state
      if (!socket.data.joined || socket.data.roomId !== roomId || socket.data.userId !== userId) {
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:send_message] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} messageTempId=${tempId} result=failed reason=not_joined`);
        console.log(`❌ [SEND_MESSAGE error] reason=not_joined messageTempId=${tempId}`);
        ack?.({ ok: false, reason: "not_joined" });
        return;
      }

      if (!roomId || !userId || !text?.trim() || typeof roomId !== "string") {
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:send_message] END timestamp=${endTime} socket=${socket.id} roomId=${roomId || 'undefined'} userId=${userId || 'undefined'} messageTempId=${tempId} result=failed reason=invalid_params`);
        console.log(`❌ [SEND_MESSAGE error] reason=invalid_params messageTempId=${tempId}`);
        ack?.({ ok: false, reason: "invalid_params" });
        return;
      }

      try {
        // Validate room exists
        console.log(`[DEBUG:send_message] Validating room roomId=${roomId} socket=${socket.id} userId=${userId} messageTempId=${tempId}`);
        const room = await getRoom(roomId, true);
        if (!room) {
          const endTime = new Date().toISOString();
          console.log(`[DEBUG:send_message] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} messageTempId=${tempId} result=failed reason=room_not_found`);
          console.log(`❌ [SEND_MESSAGE error] reason=room_not_found messageTempId=${tempId}`);
          ack?.({ ok: false, reason: "room_not_found" });
          return;
        }

        const user = await getUser(userId);
        const username = user?.username || "unknown";

        // Create canonical message with id, type, username, userId, time
        const message: any = {
          id: crypto.randomUUID?.() || `msg-${Date.now()}-${Math.random()}`,
          type: "text",
          userId,
          username,
          text: text.trim(),
          content: text.trim(), // For schema compatibility
          roomId,
          time: new Date().toISOString(),
          timestamp: Date.now(),
        };

        // CRITICAL: Persist message to Redis FIRST before broadcasting
        // This ensures messages are never lost even if client disconnects mid-broadcast
        console.log(`[DEBUG:send_message] Saving message to Redis roomId=${roomId} userId=${userId} socket=${socket.id} messageTempId=${tempId} messageId=${message.id}`);
        const saved = await saveMessage(roomId, message);
        
        if (!saved) {
          // If Redis save fails, still try to broadcast but log error
          logger.error("send_message", "Failed to save message to Redis", { roomId, messageId: message.id });
          // Fallback: store in memory as backup
          if (!inMemoryMessages.has(roomId)) {
            inMemoryMessages.set(roomId, []);
          }
          inMemoryMessages.get(roomId)!.push(message);
        }

        // Broadcast to room AFTER Redis persistence is confirmed
        const ts = new Date().toISOString();
        console.log(`[MESSAGE FLOW] Broadcasting chat_message roomId=${roomId} messageId=${message.id} saved=${saved} ts=${ts}`);
        io.to(roomId).emit("chat_message", message);
        
        // CRITICAL: Send message_ack to sender to confirm delivery
        console.log(`[MESSAGE FLOW] ack tempId=${tempId} delivered=true user=${userId} messageId=${message.id} socket=${socket.id} ts=${ts}`);
        socket.emit("message_ack", { tempId, delivered: true, messageId: message.id, timestamp: Date.now() });

        const endTime = new Date().toISOString();
        console.log(`[DEBUG:send_message] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} messageTempId=${tempId} messageId=${message.id} result=success`);
        console.log(`💬 [SEND_MESSAGE ok] messageId=${message.id} roomId=${roomId} userId=${userId}`);

        ack?.({ ok: true, id: message.id });

      } catch (err: any) {
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:send_message] END timestamp=${endTime} socket=${socket.id} roomId=${roomId || 'unknown'} userId=${userId || 'unknown'} messageTempId=${tempId} result=failed reason=server_error`);
        console.log(`❌ [SEND_MESSAGE error] reason=server_error messageTempId=${tempId}`);
        logger.error("send_message", "Error sending message", { socketId: socket.id, roomId, userId }, err);
        ack?.({ ok: false, reason: "server_error" });
      }
    });

    // Send audio - ACKED with size limit check
    socket.on("send_audio", async ({ roomId, userId, audioBase64 }: { roomId: string; userId: string; audioBase64: string }, ack?: (response: { ok: boolean; id?: string; reason?: string }) => void) => {
      logger.info("send_audio", `Send audio request`, { socketId: socket.id, roomId, userId });

      // Validate joined state
      if (!socket.data.joined || socket.data.roomId !== roomId || socket.data.userId !== userId) {
        logger.warn("send_audio", `Not in room`, { socketId: socket.id, roomId, userId });
        ack?.({ ok: false, reason: "not_in_room" });
        return;
      }

      if (!roomId || !userId || !audioBase64 || typeof roomId !== "string") {
        logger.warn("send_audio", `Invalid params`, { socketId: socket.id, roomId, userId });
        ack?.({ ok: false, reason: "invalid_params" });
        return;
      }

      // Check audio size (base64 is ~33% larger than raw, limit to ~5MB raw = ~6.7MB base64)
      const audioSizeBytes = (audioBase64.length * 3) / 4;
      const maxSizeBytes = 5 * 1024 * 1024; // 5MB
      if (audioSizeBytes > maxSizeBytes) {
        logger.warn("send_audio", `Audio too large`, { socketId: socket.id, size: audioSizeBytes });
        ack?.({ ok: false, reason: "file_too_large" });
        return;
      }

      try {
        const room = await getRoom(roomId, true);
        if (!room) {
          logger.warn("send_audio", `Room not found`, { socketId: socket.id, roomId });
          ack?.({ ok: false, reason: "room_not_found" });
          return;
        }

        const user = await getUser(userId);
        const username = user?.username || "unknown";

        const message: any = {
          id: crypto.randomUUID?.() || `audio-${Date.now()}-${Math.random()}`,
          type: "audio",
          userId,
          username,
          audio: audioBase64,
          audioData: audioBase64, // For schema compatibility
          content: "[Audio message]",
          roomId,
          time: new Date().toISOString(),
          timestamp: Date.now(),
        };

        await saveMessage(roomId, message);
        
        // CRITICAL: Broadcast audio_message to ALL sockets in room (including sender)
        // This ensures both tabs receive the audio message instantly
        const sockets = await io.in(roomId).fetchSockets();
        const audioTimestamp = new Date().toISOString();
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[AUDIO FLOW] broadcast room=${roomId} messageId=${message.id} userId=${userId} username=${username} count=${sockets.length} ts=${audioTimestamp}`);
        }
        
        // Emit audio_message event to all users in room
        io.to(roomId).emit("audio_message", message);
        
        // Also emit chat_message for backward compatibility
        io.to(roomId).emit("chat_message", message);
        
        // Send message_ack to sender to update status (sending → sent)
        socket.emit("message_ack", { 
          tempId: message.id, // Server sends message.id as tempId for matching
          delivered: true, 
          messageId: message.id, 
          timestamp: Date.now() 
        });

        logger.info("send_audio", `Audio sent`, { socketId: socket.id, roomId, messageId: message.id });

        ack?.({ ok: true, id: message.id });

      } catch (err: any) {
        logger.error("send_audio", "Error sending audio", { socketId: socket.id, roomId, userId }, err);
        ack?.({ ok: false, reason: "server_error" });
      }
    });

    // NEW: Handle room_name_check socket event (for custom room code availability)
    socket.on("room_name_check", async (data: { name: string }, ack?: (response: { available: boolean; reason?: string }) => void) => {
      try {
        const { name } = data;
        if (!name || typeof name !== "string") {
          ack?.({ available: false, reason: "Invalid name" });
          return;
        }

        const normalizedName = name.trim().toLowerCase();
        
        // Validate format: lowercase letters, numbers, and hyphens only, 2-20 chars
        if (!/^[a-z0-9-]{2,20}$/.test(normalizedName)) {
          ack?.({ available: false, reason: "Invalid format" });
          return;
        }

        // Check if room ID already exists (by ID, not by name)
        const existingRoom = await storage.getRoom(normalizedName, true);
        if (existingRoom) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[ROOM_NAME_CHECK] Room code already exists: ${normalizedName}`);
          }
          ack?.({ available: false, reason: "Room code already exists" });
          return;
        }

        // Room code is available
        if (process.env.NODE_ENV === 'development') {
          console.log(`[ROOM_NAME_CHECK] Room code available: ${normalizedName}`);
        }
        ack?.({ available: true });
      } catch (error: any) {
        logger.error("room_name_check", "Error checking room name", {}, error);
        // On error, assume unavailable to be safe
        ack?.({ available: false, reason: "Server error" });
      }
    });

    // WhatsApp-like typing indicators
    socket.on("typing", ({ roomId, username, isTyping }: { roomId: string; username: string; isTyping: boolean }) => {
      if (socket.data.joined && socket.data.roomId === roomId) {
        // Broadcast typing status to other users in the room (not the sender)
        socket.to(roomId).emit("user_typing", { username, roomId, isTyping });
        const ts = new Date().toISOString();
        console.log(`[TYPING] user=${username} room=${roomId} isTyping=${isTyping} socket=${socket.id} ts=${ts}`);
      }
    });

    // Leave room - ACKED, idempotent
    socket.on("leave_room", async ({ roomId, userId }: { roomId: string; userId: string }, ack?: (response: { ok: boolean; reason?: string }) => void) => {
      const startTime = new Date().toISOString();
      console.log(`[DEBUG:leave_room] START timestamp=${startTime} socket=${socket.id} roomId=${roomId} userId=${userId} cleanedUp=${socket.data.cleanedUp || false}`);
      console.log(`👋 [LEAVE] userId=${userId} roomId=${roomId} socket=${socket.id} cleanedUp=${socket.data.cleanedUp || false}`);
      console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=${roomId} stage=leave_room_start`);

      if (!roomId || !userId || typeof roomId !== "string") {
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:leave_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId || 'undefined'} userId=${userId || 'undefined'} result=failed reason=invalid_params`);
        console.log(`❌ [LEAVE] Invalid params socket=${socket.id}`);
        ack?.({ ok: false, reason: "invalid_params" });
        return;
      }

      // Prevent duplicate leave
      if (socket.data.leavingRoom) {
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:leave_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} result=failed reason=already_leaving`);
        console.log(`❌ [LEAVE] Already processing leave socket=${socket.id}`);
        ack?.({ ok: false, reason: "already_leaving" });
        return;
      }

      socket.data.leavingRoom = true;

      try {
        // Remove socket from user tracking first
        await removeSocketFromUser(userId, socket.id);

        // Leave socket room
        socket.leave(roomId);
        socket.data.joined = false;
        socket.data.roomId = null;
        socket.data.leavingRoom = false;
        
        console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId} roomId=null stage=leave_room_complete`);

        // Use helper function to handle cleanup, broadcasts, and random chat deletion
        // This will remove from Redis, emit events, and delete random chat if needed
        await handleUserLeaveCleanup(roomId, userId, io, "user_left_room");

        const endTime = new Date().toISOString();
        console.log(`[DEBUG:leave_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId} userId=${userId} cleanedUp=${socket.data.cleanedUp || false} result=success`);
        console.log(`✅ [LEAVE] userId=${userId} roomId=${roomId} socket=${socket.id} cleanedUp=${socket.data.cleanedUp || false}`);

        ack?.({ ok: true });

      } catch (err: any) {
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:leave_room] END timestamp=${endTime} socket=${socket.id} roomId=${roomId || 'unknown'} userId=${userId || 'unknown'} result=failed reason=server_error`);
        console.log(`❌ [LEAVE] Error socket=${socket.id} reason=server_error`);
        logger.error("leave_room", "Error in leave", { socketId: socket.id, roomId, userId }, err);
        socket.data.leavingRoom = false;
        ack?.({ ok: false, reason: "server_error" });
      }
    });

    // Disconnect - debounced, idempotent cleanup
    socket.on("disconnect", async (reason) => {
      const startTime = new Date().toISOString();
      console.log(`[DEBUG:disconnect] START timestamp=${startTime} socket=${socket.id} reason=${reason}`);
      console.log(`❌ [DISCONNECT] socket=${socket.id} reason=${reason}`);

      // Guard: prevent double cleanup
      if (socket.data.cleanedUp) {
        const endTime = new Date().toISOString();
        console.log(`[DEBUG:disconnect] END timestamp=${endTime} socket=${socket.id} roomId=${socket.data.roomId || 'none'} userId=${socket.data.userId || 'none'} result=skipped reason=already_cleaned_up`);
        console.log(`⚠ [DISCONNECT] Already cleaned up socket=${socket.id}`);
        return;
      }

      // Set cleanedUp immediately on first disconnect handler execution
      socket.data.cleanedUp = true;

      const { roomId, userId } = socket.data;
      console.log(`[DEBUG:disconnect] Initial socket.data roomId=${roomId || 'null'} userId=${userId || 'null'} socket=${socket.id}`);
      console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${userId || 'null'} roomId=${roomId || 'null'} stage=disconnect_start`);

      // Verify socket.data.userId and socket.data.roomId
      // If missing but socket.rooms shows room membership, attempt safe read
      let actualUserId = userId;
      let actualRoomId = roomId;

      if (!actualUserId || !actualRoomId) {
        // Try to recover from socket.rooms
        const rooms = Array.from(socket.rooms);
        const roomRooms = rooms.filter(r => r !== socket.id && r.startsWith("room:"));
        if (roomRooms.length > 0) {
          actualRoomId = roomRooms[0].replace("room:", "");
          logger.warn("disconnect", `Recovered roomId from socket.rooms`, { socketId: socket.id, roomId: actualRoomId });
        }
        
        // Try to find userId from socket mapping (if available)
        if (!actualUserId) {
          try {
            const mappedUserId = await storage.getUserBySocket(socket.id);
            if (mappedUserId) {
              actualUserId = mappedUserId;
              logger.warn("disconnect", `Recovered userId from socket mapping`, { socketId: socket.id, userId: actualUserId });
            }
          } catch (e) {
            // Ignore
          }
        }
      }

      if (!actualUserId) {
        const endTime = new Date().toISOString();
        console.log(`[ERROR:disconnect] Missing userId — possible early disconnect before join socket=${socket.id} roomId=${actualRoomId || 'none'}`);
        console.log(`[DEBUG:disconnect] END timestamp=${endTime} socket=${socket.id} roomId=${actualRoomId || 'none'} userId=none result=skipped reason=no_user_id`);
        console.log(`⚠ [DISCONNECT] No userId - skipping cleanup socket=${socket.id}`);
        
        // Emit forceLogout to client so it resets cleanly (only if socket still connected)
        try {
          if (socket.connected) {
            socket.emit("forceLogout", { reason: "missing_user_id", message: "Session invalid - please refresh" });
            console.log(`[TRACE:socketBinding] socket=${socket.id} userId=null roomId=${actualRoomId || 'null'} stage=disconnect_force_logout`);
          }
        } catch (e) {
          // Socket may already be disconnected - ignore
        }
        return;
      }

      console.log(`[DEBUG:disconnect] Resolved actualUserId=${actualUserId} actualRoomId=${actualRoomId || 'none'} socket=${socket.id}`);

      // Debounce cleanup with max 200ms delay to allow pending emits to finish (reduced from 500ms for faster cleanup)
      const debounceDelay = 200;
      
      // Check if socket was recovered (reconnected within 1 second) - skip cleanup if so
      if ((socket as any).recovered) {
        console.log(`[PRESENCE] skip cleanup socket=${socket.id} userId=${actualUserId} reason=socket_recovered ts=${new Date().toISOString()}`);
        return;
      }
      
      setTimeout(async () => {
        const cleanupStartTime = new Date().toISOString();
        console.log(`[DEBUG:disconnect] CLEANUP_START timestamp=${cleanupStartTime} socket=${socket.id} roomId=${actualRoomId || 'none'} userId=${actualUserId}`);
        try {
          if (socket.data.processingDisconnect) {
            const cleanupEndTime = new Date().toISOString();
            console.log(`[DEBUG:disconnect] CLEANUP_END timestamp=${cleanupEndTime} socket=${socket.id} roomId=${actualRoomId || 'none'} userId=${actualUserId} result=skipped reason=already_processing`);
            return;
          }
          socket.data.processingDisconnect = true;

          // BEFORE calling removeUserFromRoom, scan all connected sockets to see if ANY other socket has same userId and same roomId
          let hasOtherSocketsInRoom = false;
          if (actualRoomId && actualUserId) {
            try {
              const socketsInRoom = await io.in(actualRoomId).fetchSockets();
              hasOtherSocketsInRoom = socketsInRoom.some(s => {
                const socketData = (s as any).data;
                return s.id !== socket.id && 
                       socketData?.userId === actualUserId && 
                       socketData?.roomId === actualRoomId;
              });
              
              if (hasOtherSocketsInRoom) {
                console.log(`👋 [LEAVE] userId=${actualUserId} roomId=${actualRoomId} socket=${socket.id} cleanedUp=true - other sockets found, skipping removal`);
              }
            } catch (e: any) {
              logger.error("disconnect", "Error checking other sockets", { socketId: socket.id }, e);
            }
          }

          // Remove socket from user tracking
          if (actualUserId) {
            const remainingSockets = await removeSocketFromUser(actualUserId, socket.id);

            // CRITICAL: Clean up Upstash presence keys if no other sockets remain (keeps usage low)
            if (remainingSockets === 0) {
              console.log(`[CLEANUP] Cleaning up presence keys for userId=${actualUserId} (no remaining sockets)`);
              
              try {
                const { REDIS_KEYS } = await import("./utils/redis");
                const pipeline = redis.pipeline();
                
                // Delete presence keys from Upstash
                pipeline.del(REDIS_KEYS.userLastSeen(actualUserId));
                pipeline.del(REDIS_KEYS.userData(actualUserId));
                pipeline.del(REDIS_KEYS.socketToUser(socket.id)); // Legacy socket mapping
                
                await pipeline.exec();
                console.log(`[CLEANUP] ✅ Presence keys deleted for userId=${actualUserId}`);
                logger.info("disconnect", "Presence keys cleaned up", { userId: actualUserId, socketId: socket.id });
              } catch (e: any) {
                logger.error("disconnect", "Error cleaning up presence keys", { userId: actualUserId, socketId: socket.id }, e);
              }
            }

            // Only remove user from room if no other sockets remain in room
            if (!hasOtherSocketsInRoom && remainingSockets === 0 && actualRoomId && actualUserId) {
              const ts = new Date().toISOString();
              console.log(`[PRESENCE] leave user=${actualUserId} room=${actualRoomId} socket=${socket.id} ok=true ts=${ts}`);
              
              // Use helper function to handle cleanup, broadcasts, and random chat deletion
              await handleUserLeaveCleanup(actualRoomId, actualUserId, io, "user_disconnected");
              
              // Check if room is empty for non-random chat cleanup
              const remainingUsers = await getRoomUsers(actualRoomId);
              const roomIsEmpty = remainingUsers.length === 0;
              
              // CRITICAL: Clean up room keys from Upstash if room is empty (keeps usage low)
              // (Random chat rooms are already handled by handleUserLeaveCleanup)
              if (roomIsEmpty) {
                const room = await getRoom(actualRoomId, true);
                if (room && room.maxUsers !== 2) {
                  // Only delete non-random chat rooms here (random chat handled in helper)
                  console.log(`[CLEANUP] Room is empty - deleting room keys from Upstash roomId=${actualRoomId}`);
                  try {
                    await storage.deleteRoom(actualRoomId);
                    console.log(`[CLEANUP] ✅ Room keys deleted from Upstash roomId=${actualRoomId}`);
                    logger.info("disconnect", "Room keys cleaned up (empty)", { roomId: actualRoomId });
                  } catch (e: any) {
                    logger.error("disconnect", "Error cleaning up room keys", { roomId: actualRoomId }, e);
                  }
                }
              }
              
              console.log(`[PRESENCE] User removed from Redis and broadcasted roomId=${actualRoomId} userId=${actualUserId} roomIsEmpty=${roomIsEmpty} totalUsers=${remainingUsers.length} ts=${ts}`);

              // Check room deletion with grace period
              const room = await getRoom(actualRoomId, true);
              if (room) {
                const age = Date.now() - (room.createdAt || 0);
              const isOwner = room.ownerId === actualUserId;
              if ((isOwner || roomIsEmpty) && actualRoomId && actualUserId) {
                // Delayed deletion with grace period to allow reconnects
                const roomIdToDelete = actualRoomId; // Capture in closure
                setTimeout(() => {
                  deleteRoomIfEmpty(roomIdToDelete, io, isOwner ? "owner_disconnected" : "empty_after_disconnect");
                }, 2000);
              }
              }
            }

            const cleanupEndTime = new Date().toISOString();
            console.log(`[DEBUG:disconnect] CLEANUP_END timestamp=${cleanupEndTime} socket=${socket.id} roomId=${actualRoomId || 'none'} userId=${actualUserId} result=success remainingSockets=${remainingSockets} hasOtherInRoom=${hasOtherSocketsInRoom}`);
            console.log(`👋 [LEAVE] userId=${actualUserId} roomId=${actualRoomId || 'none'} socket=${socket.id} cleanedUp=true remainingSockets=${remainingSockets} hasOtherInRoom=${hasOtherSocketsInRoom}`);
          }

          socket.data.processingDisconnect = false;
          const finalEndTime = new Date().toISOString();
          console.log(`[TRACE:socketBinding] socket=${socket.id} userId=${actualUserId || 'null'} roomId=${actualRoomId || 'null'} stage=disconnect_cleanup_complete`);
          console.log(`[DEBUG:disconnect] END timestamp=${finalEndTime} socket=${socket.id} roomId=${actualRoomId || 'none'} userId=${actualUserId} result=success`);

      } catch (error: any) {
        const cleanupEndTime = new Date().toISOString();
        console.log(`[DEBUG:disconnect] CLEANUP_END timestamp=${cleanupEndTime} socket=${socket.id} roomId=${actualRoomId || 'none'} userId=${actualUserId || 'none'} result=failed reason=error`);
        console.log(`❌ [DISCONNECT] Error in cleanup socket=${socket.id}`);
        logger.error("disconnect", "Error in cleanup", { socketId: socket.id, userId: actualUserId || undefined, roomId: actualRoomId || undefined }, error instanceof Error ? error : new Error(String(error)));
        socket.data.processingDisconnect = false;
        const finalEndTime = new Date().toISOString();
        console.log(`[DEBUG:disconnect] END timestamp=${finalEndTime} socket=${socket.id} roomId=${actualRoomId || 'none'} userId=${actualUserId || 'none'} result=failed`);
      }
      }, debounceDelay);
    });

    // Stale user cleanup - less aggressive, debounced
    const staleUserCleanupInProgress = new Set<string>();
    setInterval(async () => {
      try {
        if (!redis || redis.status !== "ready") return;

        const roomKeys = await redis.keys("room:*");
        const filteredKeys = roomKeys.filter(k => !k.includes(":messages") && !k.includes(":users"));

        for (const key of filteredKeys) {
          const roomId = key.split(":")[1];
          if (!roomId || roomId.includes(":")) continue;

          if (staleUserCleanupInProgress.has(roomId)) continue;

          const room = await getRoom(roomId);
          // Use getRoomUsers (authoritative set) instead of room.users array
          const currentUsers = await getRoomUsers(roomId);
          if (!room || currentUsers.length === 0) continue;

          const age = Date.now() - (room.createdAt || 0);
          if (age < 10000) continue; // Skip fresh rooms

          staleUserCleanupInProgress.add(roomId);

          try {
            // room.users is computed from set, so compare against it
            const currentUsernames = currentUsers.map(u => u.username);
            const staleUsers = room.users.filter(u => !currentUsernames.includes(u));

            if (staleUsers.length > 0) {
              const removedUsers: string[] = [];
              for (const staleUsername of staleUsers) {
                const staleUser = await getUserByUsername(staleUsername);
                if (staleUser) {
                  const socketCount = await getUserSocketCount(staleUser.id);
                  if (socketCount === 0) {
                    await removeUserFromRoom(roomId, staleUser.id);
                    removedUsers.push(staleUsername);
                  }
                }
              }

              if (removedUsers.length > 0) {
                console.log(`🧹 [STALE CLEANUP] roomId=${roomId} removedUsers=[${removedUsers.join(', ')}]`);
                await broadcastOnlineUsers(io, roomId);
              }
            }
          } finally {
            setTimeout(() => {
              staleUserCleanupInProgress.delete(roomId);
            }, 5000);
          }
        }
      } catch (error: any) {
        logger.error("staleUserCleanup", "Error in cleanup", {}, error);
      }
    }, 60000); // Every 60 seconds
  });

  return httpServer;
}

// Export function to sync in-memory messages to Redis
// Called when Redis reconnects to persist any messages that were stored in memory
export async function syncMessagesToRedis(redisClient: any, REDIS_KEYS: any, TTL: number): Promise<void> {
  if (!redisClient || redisClient.status !== "ready") {
    logger.warn("syncMessagesToRedis", "Redis not ready for sync", {});
    return;
  }

  try {
    const roomsToSync: string[] = [];
    
    // Collect all room IDs from inMemoryMessages
    // Use Array.from() for compatibility with TypeScript target
    const entries = Array.from(inMemoryMessages.entries());
    for (const [roomId, messages] of entries) {
      if (messages && messages.length > 0) {
        roomsToSync.push(roomId);
      }
    }

    if (roomsToSync.length === 0) {
      logger.debug("syncMessagesToRedis", "No in-memory messages to sync", {});
      return;
    }

    logger.info("syncMessagesToRedis", `Syncing ${roomsToSync.length} rooms to Redis`, { roomCount: roomsToSync.length });

    // Sync each room's messages to Redis
    for (const roomId of roomsToSync) {
      const messages = inMemoryMessages.get(roomId) || [];
      
      if (messages.length === 0) continue;

      try {
        // Check if Redis already has messages (don't overwrite if Redis has newer data)
        const existingCount = await redisClient.llen(messagesKey(roomId));
        
        if (existingCount > 0) {
          logger.debug("syncMessagesToRedis", `Redis already has messages for room`, { roomId, existingCount, inMemoryCount: messages.length });
          // For simplicity, we append new messages - Redis will keep last 100 via LTRIM
          const pipeline = redisClient.pipeline();
          for (const msg of messages) {
            pipeline.rpush(messagesKey(roomId), JSON.stringify(msg));
          }
          pipeline.ltrim(messagesKey(roomId), -100, -1); // Keep last 100
          pipeline.expire(messagesKey(roomId), TTL);
          await pipeline.exec();
        } else {
          // Redis is empty - restore all messages
          const pipeline = redisClient.pipeline();
          for (const msg of messages) {
            pipeline.rpush(messagesKey(roomId), JSON.stringify(msg));
          }
          pipeline.ltrim(messagesKey(roomId), -100, -1); // Keep last 100
          pipeline.expire(messagesKey(roomId), TTL);
          await pipeline.exec();
        }

        logger.info("syncMessagesToRedis", `Synced messages for room`, { roomId, messageCount: messages.length });
      } catch (error: any) {
        logger.error("syncMessagesToRedis", "Error syncing room messages", { roomId }, error);
      }
    }

    logger.info("syncMessagesToRedis", `Sync complete`, { roomsSynced: roomsToSync.length });
  } catch (error: any) {
    logger.error("syncMessagesToRedis", "Error during sync", {}, error);
  }
}
