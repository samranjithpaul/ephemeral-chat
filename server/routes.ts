import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import helmet from "helmet";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import { 
  storage, 
  getRoom, 
  getUser, 
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
import type { Message, Room } from "@shared/schema";
import { redis } from "./utils/redis";
import { logger } from "./utils/logger";

interface SocketData {
  roomId: string | null;
  userId: string | null;
}

type RoomPayload = { roomId: string; userId: string };
type SendPayload = RoomPayload & { text?: string; audioBase64?: string; messageTempId?: string };
type TypingPayload = { roomId: string; username: string; isTyping: boolean };
type SocketAck = (result: {
  ok: boolean;
  reason?: string;
  id?: string;
  room?: Omit<Room, "ownerId">;
  messages?: Message[];
}) => void;

interface ClientEvents {
  heartbeat_bind: (payload: { userId?: string } | undefined, ack?: SocketAck) => void;
  join_room: (payload: RoomPayload | undefined, ack?: SocketAck) => void;
  leave_room: (payload: RoomPayload | undefined, ack?: SocketAck) => void;
  send_message: (payload: SendPayload | undefined, ack?: SocketAck) => void;
  send_audio: (payload: SendPayload | undefined, ack?: SocketAck) => void;
  typing: (payload: TypingPayload | undefined) => void;
}

interface ServerEvents {
  heartbeat_bound: (payload: { userId: string }) => void;
  onlineUsers: (users: string[], roomId: string) => void;
  room_closed: (payload: { reason: string; roomId: string }) => void;
  systemMessage: (payload: { type: string; username: string; message: string; roomId: string; totalUsers: number }) => void;
  chat_message: (message: Message) => void;
  user_typing: (payload: TypingPayload) => void;
  random_chat_matched: (payload: { roomId: string; partnerUsername: string }) => void;
}

type ChatServer = SocketIOServer<ClientEvents, ServerEvents, Record<string, never>, SocketData>;

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_PAYLOAD = Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 128;
const RANDOM_RECONNECT_MS = 5000;

async function broadcastOnlineUsers(io: ChatServer, roomId: string) {
  const sockets = await io.in(roomId).fetchSockets();
  const connected = new Set(sockets.map(socket => socket.data.userId));
  const users = (await getRoomUsers(roomId))
    .filter(user => connected.has(user.id))
    .map(user => user.username);
  io.to(roomId).emit("onlineUsers", users, roomId);
  return users;
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
      const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
      if (!username || username.length < 2 || username.length > 20) {
        logger.warn("login", `Invalid username length`, { length: username?.length || 0 });
        return res.json({
          success: false,
          message: "Username must be between 2 and 20 characters",
        });
      }

      const user = await storage.createUser({ username });
      return res.json({ success: true, userId: user.id, username: user.username });
    } catch (error: any) {
      if (error?.message === "Username already taken. Please choose another.") {
        return res.status(409).json({ success: false, message: error.message });
      }
      logger.error("login", "Could not create session", {}, error);
      return res.status(503).json({ success: false, message: "Chat storage is unavailable. Please try again." });
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
      const { name, ownerId, customCode } = req.body ?? {};
      const owner = await getUser(ownerId);
      const ownerUsername = owner?.username;
      logger.info("createRoom", `POST /api/rooms/create`, { ownerUsername, customCode });

      if (typeof name !== "string" || !name.trim() || name.trim().length > 50 || !ownerUsername || (customCode != null && typeof customCode !== "string")) {
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
        const existingRoom = await storage.getRoom(trimmedCode);
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
        maxUsers: 35,
      });


      logger.info("createRoom", `Room created`, { roomId: room.id, name: room.name });
      const { ownerId: _ownerId, ...publicRoom } = room;
      return res.json({ success: true, room: publicRoom });
    } catch (error: any) {
      console.error("[createRoom] error", error);
      logger.error("createRoom", "Error creating room", {}, error);
      // Return specific error message if available, otherwise generic message
      const codeTaken = error?.message === "Room code already exists";
      const errorMessage = codeTaken ? error.message : "Failed to create room";
      return res.status(codeTaken ? 409 : 503).json({
        success: false,
        message: errorMessage,
      });
    }
  });

  // Get room details
  app.get("/api/rooms/:id", async (req, res) => {
    try {
      const id = req.params.id.toLowerCase();
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
      const { ownerId: _ownerId, ...publicRoom } = room;
      return res.json({ success: true, room: publicRoom });
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
      
      if (!name || name.trim().length > 50) {
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
  app.get("/api/rooms/check-code/:code", async (req, res) => {
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
      const existingRoom = await storage.getRoom(normalizedCode);
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
      
      const user = await getUser(userId);
      if (!user || !(await io.in(`user:${userId}`).fetchSockets()).length) {
        return res.status(409).json({ success: false, message: "Connect to chat before searching." });
      }

      let result = await addToRandomQueue(userId);
      while (result.matched && result.partnerUserId) {
        const partner = await getUser(result.partnerUserId);
        if (!partner || !(await io.in(`user:${partner.id}`).fetchSockets()).length) {
          result = await addToRandomQueue(userId);
          continue;
        }

        const room = await storage.createRoom({
          name: "Random Chat",
          ownerId: user.id,
          ownerUsername: user.username,
          maxUsers: 2,
        });
        if (await addUserToRoom(room.id, partner) !== "joined") {
          await storage.deleteRoom(room.id);
          throw new Error("Could not reserve room for both users");
        }

        io.to(`user:${partner.id}`).emit("random_chat_matched", {
          roomId: room.id, partnerUsername: user.username,
        });
        return res.json({ success: true, roomId: room.id, partnerUsername: partner.username });
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
        const room = await getRoom(roomId);
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
  const io = new SocketIOServer<ClientEvents, ServerEvents, Record<string, never>, SocketData>(httpServer, {
    maxHttpBufferSize: MAX_AUDIO_PAYLOAD + 1024,
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const roomTransitions = new Map<string, Promise<void>>();

  function inRoomOrder<T>(roomId: string, action: () => Promise<T>) {
    const result = (roomTransitions.get(roomId) ?? Promise.resolve()).then(action);
    const finished = result.then(cleanup, cleanup);
    roomTransitions.set(roomId, finished);
    return result;

    function cleanup() {
      if (roomTransitions.get(roomId) === finished) roomTransitions.delete(roomId);
    }
  }

  io.on("connection", socket => {
    socket.data = { roomId: null, userId: null };
    let transitions = Promise.resolve();

    function transition<T>(action: () => Promise<T>) {
      const next = transitions.then(action);
      transitions = next.then(() => {}, error => {
        logger.error("socket", "Room transition failed", { socketId: socket.id }, error);
      });
      return next;
    }

    async function releaseRoom(roomId: string, userId: string) {
      const sockets = await io.in(roomId).fetchSockets();
      if (sockets.some(peer => peer.data.userId === userId)) return;

      const removed = await removeUserFromRoom(roomId, userId);
      if (!removed) return;
      const room = await getRoom(roomId);
      if (!room) return;

      const onlineUsers = await broadcastOnlineUsers(io, roomId);
      if (room.maxUsers === 2 && room.users.length < 2) {
        await storage.deleteRoom(roomId);
        io.to(roomId).emit("room_closed", { reason: "not_enough_users", roomId });
        for (const peer of await io.in(roomId).fetchSockets()) {
          peer.data.roomId = null;
        }
        io.in(roomId).socketsLeave(roomId);
        return;
      }

      const user = await getUser(userId);
      if (user) {
        io.to(roomId).emit("systemMessage", {
          type: "user_left", username: user.username,
          message: `${user.username} left the room.`, roomId, totalUsers: onlineUsers.length,
        });
      }
    }

    async function leaveCurrentRoom() {
      const { roomId, userId } = socket.data;
      if (!roomId || !userId) return;
      socket.data.roomId = null;
      await socket.leave(roomId);
      await inRoomOrder(roomId, () => releaseRoom(roomId, userId));
    }

    async function bindUser(userId: unknown) {
      if (!socket.connected || typeof userId !== "string") return null;
      const user = await getUser(userId);
      if (!user || !socket.connected) return null;

      const previousUserId = socket.data.userId;
      if (previousUserId !== userId) {
        if (previousUserId) {
          await leaveCurrentRoom();
          await socket.leave(`user:${previousUserId}`);
          await removeSocketFromUser(previousUserId, socket.id);
        }
        if (!socket.connected) return null;
        socket.data.userId = userId;
        await socket.join(`user:${userId}`);
        await addSocketToUser(userId, socket.id);
      }
      return user;
    }

    socket.on("heartbeat_bind", (payload, ack) => {
      void transition(async () => {
        const user = await bindUser(payload?.userId);
        if (user) socket.emit("heartbeat_bound", { userId: user.id });
        ack?.({ ok: !!user, ...(!user && { reason: redis?.status === "ready" ? "user_not_found" : "server_error" }) });
      }).catch(() => ack?.({ ok: false }));
    });

    socket.on("join_room", (payload, ack) => {
      void transition(async () => {
        const { roomId, userId } = payload ?? {};
        if (typeof roomId !== "string" || typeof userId !== "string") {
          return { ok: false, reason: "invalid_params" };
        }
        if (redis?.status !== "ready") return { ok: false, reason: "server_error" };
        const user = await bindUser(userId);
        if (!user) return { ok: false, reason: "user_not_found" };
        const alreadyJoined = socket.data.roomId === roomId;
        if (!alreadyJoined && socket.data.roomId) {
          if (!(await getRoom(roomId))) return { ok: false, reason: "room_not_found" };
          await leaveCurrentRoom();
        }

        return inRoomOrder(roomId, async () => {
          const room = await getRoom(roomId);
          if (!room) return { ok: false, reason: "room_not_found" };
          if (!socket.connected) return { ok: false, reason: "disconnected" };

          if (!alreadyJoined) {
            const result = await addUserToRoom(roomId, user);
            if (result !== "joined") return { ok: false, reason: result };
            if (!socket.connected) {
              await releaseRoom(roomId, userId);
              return { ok: false, reason: "disconnected" };
            }
            socket.data.roomId = roomId;
            await socket.join(roomId);
          }

          const messages = await loadMessages(roomId, 50);
          const users = await broadcastOnlineUsers(io, roomId);
          if (!alreadyJoined) {
            socket.to(roomId).emit("systemMessage", {
              type: "user_joined", username: user.username,
              message: `${user.username} joined the room.`, roomId, totalUsers: users.length,
            });
          }
          const { ownerId: _ownerId, ...publicRoom } = room;
          return { ok: true, room: { ...publicRoom, users }, messages };
        });
      }).then(result => ack?.(result), () => ack?.({ ok: false, reason: "server_error" }));
    });

    socket.on("leave_room", (payload, ack) => {
      void transition(async () => {
        if (socket.data.userId === payload?.userId && socket.data.roomId === payload?.roomId) {
          await leaveCurrentRoom();
        }
        ack?.({ ok: true });
      }).catch(() => ack?.({ ok: false, reason: "server_error" }));
    });

    async function send(payload: SendPayload | undefined, type: "text" | "audio") {
      const { roomId, userId, text, audioBase64, messageTempId } = payload ?? {};
      if (!roomId || socket.data.roomId !== roomId || socket.data.userId !== userId) {
        return { ok: false, reason: "not_joined" };
      }
      const content = typeof text === "string" ? text.trim() : "";
      if (type === "text" && (!content || content.length > 5000)) {
        return { ok: false, reason: "invalid_message" };
      }
      if (type === "audio" && (
        typeof audioBase64 !== "string" || audioBase64.length > MAX_AUDIO_PAYLOAD ||
        !audioBase64.startsWith("data:audio/") || !audioBase64.includes(";base64,")
      )) {
        return { ok: false, reason: "invalid_audio" };
      }

      const user = await getUser(userId);
      if (!user) return { ok: false, reason: "user_not_found" };
      const message: Message = {
        id: uuidv4(), roomId, username: user.username, type, timestamp: Date.now(),
        content: type === "text" ? content : "[Audio message]",
        ...(type === "audio" && { audioData: audioBase64 }),
      };
      if (!(await saveMessage(roomId, message))) return { ok: false, reason: "save_failed" };
      socket.to(roomId).emit("chat_message", message);
      socket.emit("chat_message", { ...message, tempId: messageTempId });
      return { ok: true, id: message.id };
    }

    socket.on("send_message", (payload, ack) => {
      void transition(() => send(payload, "text"))
        .then(result => ack?.(result), () => ack?.({ ok: false, reason: "server_error" }));
    });

    socket.on("send_audio", (payload, ack) => {
      void transition(() => send(payload, "audio"))
        .then(result => ack?.(result), () => ack?.({ ok: false, reason: "server_error" }));
    });

    socket.on("typing", payload => {
      const { roomId, username, isTyping } = payload ?? {};
      if (roomId && socket.data.roomId === roomId && typeof username === "string" && typeof isTyping === "boolean") {
        socket.to(roomId).emit("user_typing", { roomId, username, isTyping });
      }
    });

    socket.on("disconnect", () => {
      void transition(async () => {
        const { roomId, userId } = socket.data;
        if (!userId) return;
        await removeSocketFromUser(userId, socket.id);
        if (roomId) {
          const room = await getRoom(roomId);
          if (room?.maxUsers === 2) {
            await broadcastOnlineUsers(io, roomId);
            setTimeout(() => {
              void inRoomOrder(roomId, () => releaseRoom(roomId, userId)).catch(() => {});
            }, RANDOM_RECONNECT_MS).unref();
          } else {
            await inRoomOrder(roomId, () => releaseRoom(roomId, userId));
          }
        }
        if (!(await io.in(`user:${userId}`).fetchSockets()).length) {
          await removeFromRandomQueue(userId);
        }
      }).catch(() => {});
    });
  });

  return httpServer;
}
