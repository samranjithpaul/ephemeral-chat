import { redis } from "./utils/redis";
import { v4 as uuidv4 } from "uuid";
import type { User, InsertUser, Room, InsertRoom, Message } from "@shared/schema";
import { logger } from "./utils/logger";

// Redis key helpers - single source of truth
const roomKey = (id: string) => `room:${id}`;
const usersKey = (id: string) => `room:${id}:users`;
const messagesKey = (id: string) => `room:${id}:messages`;
const userKey = (id: string) => `user:${id}:data`;
const userSocketsKey = (id: string) => `user:${id}:sockets`;
const usernameKey = (username: string) => `username:${username}`;
const randomChatQueueKey = "random_chat_queue"; // Sorted set: score = timestamp, value = userId

const ROOM_TTL = 3600; // 1 hour
// Room deletion grace period - configurable via env, default 60 seconds
const ROOM_DELETE_GRACE_MS = parseInt(process.env.ROOM_DELETE_GRACE_MS || "60000", 10); // 60 seconds default
const RANDOM_CHAT_TIMEOUT = 60000; // 1 minute in milliseconds

// Helper: Atomic TTL refresh using pipeline
async function refreshRoomTTLs(roomId: string): Promise<void> {
  if (!redis || redis.status !== "ready") return;
  
  const pipeline = redis.pipeline();
  pipeline.expire(roomKey(roomId), ROOM_TTL);
  pipeline.expire(usersKey(roomId), ROOM_TTL);
  pipeline.expire(messagesKey(roomId), ROOM_TTL);
  await pipeline.exec();
  
  logger.debug("refreshRoomTTLs", `TTLs refreshed for room [${roomId}]`, { roomId });
}

// Room operations
export async function getRoom(roomId: string): Promise<Room | null> {
  if (typeof roomId !== "string" || !roomId || redis?.status !== "ready") return null;

  const raw = await redis.get(roomKey(roomId));
  if (!raw) return null;

  const room: Room = JSON.parse(raw);
  room.users = (await getRoomUsers(roomId)).map(user => user.username);
  return room;
}

export async function createRoom(insertRoom: InsertRoom): Promise<Room> {
  const roomId = uuidv4().slice(0, 8);
  return createRoomWithId({ ...insertRoom, id: roomId });
}

// NEW: Create room with specified ID (for custom room codes)
// Supports two signatures:
// 1. createRoomWithId(insertRoom: InsertRoom & { id: string }) - full object
// 2. createRoomWithId(ownerUsername: string, customCode: string) - simplified
export async function createRoomWithId(
  insertRoomOrOwnerUsername: (InsertRoom & { id: string }) | string,
  customCode?: string
): Promise<Room> {
  // Handle simplified signature: createRoomWithId(ownerUsername, customCode)
  if (typeof insertRoomOrOwnerUsername === "string" && customCode !== undefined) {
    const ownerUsername = insertRoomOrOwnerUsername;
    const trimmedCode = customCode.trim().toLowerCase();
    
    // Check if room with this code already exists
    const existingRoom = await getRoom(trimmedCode);
    if (existingRoom) {
      throw new Error("Room already exists");
    }

    // Get user by username to retrieve ownerId
    const user = await getUserByUsername(ownerUsername);
    if (!user) {
      throw new Error(`User not found: ${ownerUsername}`);
    }

    // Create room with default name (using customCode as fallback)
    const roomName = trimmedCode.charAt(0).toUpperCase() + trimmedCode.slice(1).replace(/-/g, ' ');
    
    // Convert to full object format and call the main implementation
    const insertRoom: InsertRoom & { id: string } = {
      id: trimmedCode,
      name: roomName,
      ownerId: user.id,
      ownerUsername: ownerUsername,
      maxUsers: 35, // Default maxUsers
    };
    
    return createRoomWithIdImpl(insertRoom);
  }
  
  // Handle full object signature: createRoomWithId(insertRoom)
  if (typeof insertRoomOrOwnerUsername === "object" && insertRoomOrOwnerUsername !== null) {
    return createRoomWithIdImpl(insertRoomOrOwnerUsername as InsertRoom & { id: string });
  }
  
  throw new Error("Invalid arguments: createRoomWithId requires either (insertRoom) or (ownerUsername, customCode)");
}

// Internal implementation of createRoomWithId
async function createRoomWithIdImpl(insertRoom: InsertRoom & { id: string }): Promise<Room> {
  if (redis?.status !== "ready") throw new Error("Room storage is unavailable");

  const room: Room = { ...insertRoom, users: [], createdAt: Date.now() };
  const owner = JSON.stringify({ id: room.ownerId, username: room.ownerUsername });
  const created = await redis.eval(`
    if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
    redis.call('DEL', KEYS[2], KEYS[3])
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
    if ARGV[2] ~= '' then
      redis.call('SADD', KEYS[2], ARGV[2])
      redis.call('EXPIRE', KEYS[2], ARGV[3])
    end
    return 1
  `, 3, roomKey(room.id), usersKey(room.id), messagesKey(room.id),
    JSON.stringify(room), room.maxUsers === 2 ? owner : "", ROOM_TTL);
  if (created !== 1) throw new Error("Room code already exists");
  return room;
}

// Socket tracking per user (multi-tab support)
export async function addSocketToUser(userId: string, socketId: string): Promise<void> {
  if (!redis || redis.status !== "ready") return;
  
  try {
    await redis.sadd(userSocketsKey(userId), socketId);
    await redis.expire(userSocketsKey(userId), ROOM_TTL);
    logger.debug("addSocketToUser", `Socket added to user`, { userId, socketId });
  } catch (e: any) {
    logger.error("addSocketToUser", "Failed to add socket", { userId, socketId }, e);
  }
}

export async function removeSocketFromUser(userId: string, socketId: string): Promise<number> {
  if (!redis || redis.status !== "ready") return 0;
  
  try {
    const removed = await redis.srem(userSocketsKey(userId), socketId);
    const remaining = await redis.scard(userSocketsKey(userId));
    logger.debug("removeSocketFromUser", `Socket removed from user`, { userId, socketId, remaining });
    return remaining;
  } catch (e: any) {
    logger.error("removeSocketFromUser", "Failed to remove socket", { userId, socketId }, e);
    return 0;
  }
}

export async function getUserSocketCount(userId: string): Promise<number> {
  if (!redis || redis.status !== "ready") return 0;
  
  try {
    return await redis.scard(userSocketsKey(userId));
  } catch (e: any) {
    logger.error("getUserSocketCount", "Failed to get socket count", { userId }, e);
    return 0;
  }
}

// User room operations - atomic and idempotent
export async function addUserToRoom(
  roomId: string,
  user: { id: string; username: string },
): Promise<"joined" | "room_not_found" | "room_full" | "server_error"> {
  if (redis?.status !== "ready") return "server_error";

  const member = JSON.stringify({ id: user.id, username: user.username });
  const result = await redis.eval(`
    local raw = redis.call('GET', KEYS[1])
    if not raw then return 'room_not_found' end
    local room = cjson.decode(raw)
    local members = redis.call('SMEMBERS', KEYS[2])
    local alreadyJoined = false
    for _, entry in ipairs(members) do
      local ok, existing = pcall(cjson.decode, entry)
      if ok and type(existing) == 'table' and existing.id == ARGV[1] then
        alreadyJoined = true
        break
      end
    end
    if not alreadyJoined then
      if #members >= (room.maxUsers or 35) then return 'room_full' end
      redis.call('SADD', KEYS[2], ARGV[2])
    end
    for _, key in ipairs(KEYS) do redis.call('EXPIRE', key, ARGV[3]) end
    return 'joined'
  `, 3, roomKey(roomId), usersKey(roomId), messagesKey(roomId), user.id, member, ROOM_TTL);
  return result as "joined" | "room_not_found" | "room_full";
}

export async function removeUserFromRoom(roomId: string, userId: string): Promise<boolean> {
  if (redis?.status !== "ready") return false;

  const removed = await redis.eval(`
    local removed = 0
    for _, entry in ipairs(redis.call('SMEMBERS', KEYS[2])) do
      local ok, member = pcall(cjson.decode, entry)
      if ok and type(member) == 'table' and member.id == ARGV[1] then
        removed = removed + redis.call('SREM', KEYS[2], entry)
      end
    end
    if removed > 0 and redis.call('SCARD', KEYS[2]) == 0 then
      for _, key in ipairs(KEYS) do
        local ttl = redis.call('PTTL', key)
        if ttl == -1 or ttl > tonumber(ARGV[2]) then
          redis.call('PEXPIRE', key, ARGV[2])
        end
      end
    end
    return removed
  `, 3, roomKey(roomId), usersKey(roomId), messagesKey(roomId),
    userId, Number.isFinite(ROOM_DELETE_GRACE_MS) ? Math.max(1, ROOM_DELETE_GRACE_MS) : 60000);
  return Number(removed) > 0;
}

export async function getRoomUsers(roomId: string): Promise<{ id: string; username: string }[]> {
  if (!redis || redis.status !== "ready") return [];
  
  try {
    const members = await redis.smembers(usersKey(roomId));
    const parsed: { id: string; username: string }[] = [];
    for (const m of members) {
      try {
        parsed.push(JSON.parse(m));
      } catch (e) {
        // ignore invalid entries
      }
    }
    return parsed;
  } catch (e: any) {
    logger.error("getRoomUsers", "Error getting room users", { roomId }, e);
    return [];
  }
}

// Message operations - atomic with TTL refresh
export async function saveMessage(roomId: string, message: Message): Promise<boolean> {
  if (redis?.status !== "ready") return false;

  const saved = await redis.eval(`
    if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
    redis.call('RPUSH', KEYS[3], ARGV[1])
    redis.call('LTRIM', KEYS[3], -100, -1)
    for _, key in ipairs(KEYS) do redis.call('EXPIRE', key, ARGV[2]) end
    return 1
  `, 3, roomKey(roomId), usersKey(roomId), messagesKey(roomId), JSON.stringify(message), ROOM_TTL);
  return saved === 1;
}

export async function loadMessages(roomId: string, count = 50): Promise<Message[]> {
  if (!redis || redis.status !== "ready") return [];
  
  try {
    const raw = await redis.lrange(messagesKey(roomId), -count, -1);
    const messages = raw
      .map((r) => {
        try {
          const msg = JSON.parse(r);
          // Normalize message format - ensure content field exists
          if (msg && !msg.content && msg.text) {
            msg.content = msg.text;
          }
          // Ensure all required fields
          return {
            id: msg.id,
            roomId: msg.roomId || roomId,
            username: msg.username,
            content: msg.content || msg.text || "",
            type: msg.type || "text",
            timestamp: msg.timestamp || new Date(msg.time || Date.now()).getTime(),
            audioData: msg.audioData || msg.audio,
          } as Message;
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean) as Message[];
    
    logger.debug("loadMessages", `Loaded messages`, { roomId, count: messages.length });
    return messages;
  } catch (e: any) {
    logger.error("loadMessages", "Error loading messages", { roomId }, e);
    return [];
  }
}

// User operations
export async function getUser(userId: string): Promise<User | null> {
  if (typeof userId !== "string" || !userId || redis?.status !== "ready") return null;
  
  try {
    const raw = await redis.get(userKey(userId));
    if (!raw) {
      logger.debug("getUser", `User not found`, { userId });
      return null;
    }
    return JSON.parse(raw);
  } catch (e: any) {
    logger.error("getUser", "Error getting user", { userId }, e);
    return null;
  }
}

export async function getUserByUsername(username: string): Promise<User | null> {
  if (!redis || redis.status !== "ready") return null;
  
  try {
    const userId = await redis.get(usernameKey(username));
    if (!userId) return null;
    return getUser(userId);
  } catch (e: any) {
    logger.error("getUserByUsername", "Error getting user by username", { username }, e);
    return null;
  }
}

export async function createUser(insertUser: InsertUser): Promise<User> {
  if (redis?.status !== "ready") throw new Error("User storage is unavailable");

  const user: User = { ...insertUser, id: uuidv4() };
  const created = await redis.eval(`
    local existingId = redis.call('GET', KEYS[1])
    if existingId then
      return 0
    end
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
    redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
    return 1
  `, 2, usernameKey(user.username), userKey(user.id), user.id, JSON.stringify(user), ROOM_TTL);
  if (created !== 1) throw new Error("Username already taken. Please choose another.");
  return user;
}

export async function addToRandomQueue(userId: string): Promise<{ matched: boolean; partnerUserId?: string }> {
  if (redis?.status !== "ready") throw new Error("Random chat storage is unavailable");

  const now = Date.now();
  const partner = await redis.eval(`
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
    if redis.call('ZSCORE', KEYS[1], ARGV[2]) then return false end
    local match = redis.call('ZRANGE', KEYS[1], 0, 0)[1]
    if match then
      redis.call('ZREM', KEYS[1], match)
      return match
    end
    redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
    redis.call('EXPIRE', KEYS[1], ARGV[4])
    return false
  `, 1, randomChatQueueKey, now - RANDOM_CHAT_TIMEOUT, userId, now, RANDOM_CHAT_TIMEOUT / 1000 + 10);
  return typeof partner === "string" ? { matched: true, partnerUserId: partner } : { matched: false };
}

export async function removeFromRandomQueue(userId: string): Promise<void> {
  if (!redis || redis.status !== "ready") return;
  
  try {
    await redis.zrem(randomChatQueueKey, userId);
    logger.debug("removeFromRandomQueue", `User removed from queue`, { userId });
  } catch (e: any) {
    logger.error("removeFromRandomQueue", "Error removing from queue", { userId }, e);
  }
}

export async function getRandomQueueSize(): Promise<number> {
  if (!redis || redis.status !== "ready") return 0;
  
  try {
    const now = Date.now();
    // Count only users who joined in the last minute
    return await redis.zcount(randomChatQueueKey, now - RANDOM_CHAT_TIMEOUT, now);
  } catch (e: any) {
    logger.error("getRandomQueueSize", "Error getting queue size", {}, e);
    return 0;
  }
}

// Legacy compatibility exports
export const storage = {
  getUser,
  getUserByUsername,
  createUser,
  getRoom,
  createRoom,
  createRoomWithId, // NEW: Export createRoomWithId - supports both (insertRoom) and (ownerUsername, customCode) signatures
  addUserToRoom,
  removeUserFromRoom: async (roomId: string, username: string) => {
    const user = await getUserByUsername(username);
    if (user) {
      return removeUserFromRoom(roomId, user.id);
    }
    return false;
  },
  getMessages: loadMessages,
  getRoomUsers, // Add getRoomUsers to storage object for backward compatibility
  addMessage: async (roomId: string, messageData: Omit<Message, "id" | "timestamp">) => {
    const message: Message = {
      id: uuidv4(),
      ...messageData,
      timestamp: Date.now(),
    };
    await saveMessage(roomId, message);
    return message;
  },
  updateLastSeen: async (userId: string) => {
    // Presence is tracked via socket count - no need for lastSeen timestamp
    logger.debug("updateLastSeen", `Last seen updated (socket-based)`, { userId });
  },
  getPresence: async (userId: string) => {
    try {
      const user = await getUser(userId);
      if (!user) return { online: false, lastSeen: 0 };
      
      const socketCount = await getUserSocketCount(userId);
      const online = socketCount > 0;
      
      return { online, lastSeen: 0 };
    } catch (e: any) {
      logger.error("getPresence", "Error getting presence", { userId }, e);
      return { online: false, lastSeen: 0 };
    }
  },
  setSocketUser: async (socketId: string, userId: string) => {
    await addSocketToUser(userId, socketId);
  },
  getUserBySocket: async (socketId: string) => {
    // Find user by scanning socket sets (expensive but necessary)
    if (!redis || redis.status !== "ready") return null;
    try {
      const keys = await redis.keys("user:*:sockets");
      for (const key of keys) {
        const hasSocket = await redis.sismember(key, socketId);
        if (hasSocket) {
          const userId = key.replace("user:", "").replace(":sockets", "");
          return userId;
        }
      }
    } catch (e: any) {
      logger.error("getUserBySocket", "Error finding user by socket", { socketId }, e);
    }
    return null;
  },
  deleteSocketUser: async (socketId: string) => {
    const userId = await storage.getUserBySocket(socketId);
    if (userId) {
      await removeSocketFromUser(userId, socketId);
    }
  },
  refreshRoomTTL: refreshRoomTTLs,
  deleteRoom: async (roomId: string) => {
    if (!redis || redis.status !== "ready") return;
    try {
      const pipeline = redis.pipeline();
      pipeline.del(roomKey(roomId));
      pipeline.del(usersKey(roomId));
      pipeline.del(messagesKey(roomId));
      await pipeline.exec();
      logger.info("deleteRoom", `Room deleted`, { roomId });
    } catch (e: any) {
      logger.error("deleteRoom", "Error deleting room", { roomId }, e);
    }
  },
  deleteUser: async (userId: string) => {
    if (!redis || redis.status !== "ready") return;
    try {
      const user = await getUser(userId);
      if (user) {
        await redis.eval(`
          if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
          redis.call('DEL', KEYS[1], KEYS[3])
        `, 3, userKey(userId), usernameKey(user.username), userSocketsKey(userId), userId);
        logger.info("deleteUser", `User deleted`, { userId, username: user.username });
      }
    } catch (e: any) {
      logger.error("deleteUser", "Error deleting user", { userId }, e);
    }
  },
  removeFromRandomQueue,
  // Export new functions
  addSocketToUser,
  removeSocketFromUser,
  getUserSocketCount,
  addToRandomQueue,
  getRandomQueueSize,
};
