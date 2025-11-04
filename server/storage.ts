// PATCH: 2025-11-02 - Refactor storage for atomic operations, socket tracking, and idempotency
// Fixes: Race conditions in TTL refresh, multi-tab user tracking, atomic mutations
// Test: Join multiple tabs, verify socket counting, check TTL refresh after operations

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
const MIN_ROOM_AGE_TO_DELETE = ROOM_DELETE_GRACE_MS;
const RANDOM_CHAT_TIMEOUT = 60000; // 1 minute in milliseconds

// Track scheduled room deletions - key: roomId, value: { timeout, scheduledAt }
const scheduledDeletions = new Map<string, { timeout: NodeJS.Timeout; scheduledAt: number }>();
const emptySinceKey = (roomId: string) => `room:${roomId}:emptySince`;

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
export async function getRoom(roomId: string, skipAutoDelete = false): Promise<Room | null> {
  logger.info("getRoom", `Fetching room [${roomId}]`, { roomId });
  
  if (!roomId || typeof roomId !== "string") {
    logger.warn("getRoom", "Invalid roomId", { roomId });
    return null;
  }
  
  if (!redis || redis.status !== "ready") {
    logger.warn("getRoom", "Redis not ready", { roomId });
    return null;
  }
  
  const raw = await redis.get(roomKey(roomId));
  if (!raw) {
    logger.debug("getRoom", `Room [${roomId}] not found`, { roomId });
    return null;
  }
  
  try {
    const room = JSON.parse(raw);
    
    // Ensure createdAt exists
    if (!room.createdAt) {
      room.createdAt = Date.now();
      await saveRoom(roomId, room);
    }
    
    // CRITICAL: Compute users array from Redis set (single source of truth)
    // Room.users array is now read-only - computed from set
    const usersFromSet = await getRoomUsers(roomId);
    room.users = usersFromSet.map(u => u.username); // Backward compatibility: populate array from set
    
    // Auto-delete empty rooms ONLY if room is > grace period old AND not skipped
    // Check set, not array, for accuracy
    if (!skipAutoDelete && usersFromSet.length === 0) {
      const age = Date.now() - (room.createdAt || 0);
      if (age < ROOM_DELETE_GRACE_MS) {
        logger.debug("getRoom", `Skipping auto-delete for fresh room`, { roomId, age });
        return room;
      }
      logger.info("getRoom", `Auto-deleting empty room`, { roomId, age });
      await redis.del(roomKey(roomId));
      await redis.del(usersKey(roomId));
      await redis.del(messagesKey(roomId));
      await redis.del(emptySinceKey(roomId));
      return null;
    }
    
    logger.debug("getRoom", `Room found`, { roomId, userCount: usersFromSet.length });
    return room;
  } catch (e: any) {
    logger.error("getRoom", "Failed to parse JSON", { roomId }, e);
    return null;
  }
}

export async function saveRoom(roomId: string, roomObj: Room): Promise<void> {
  if (!redis || redis.status !== "ready") {
    logger.warn("saveRoom", "Redis not ready", { roomId });
    return;
  }
  
  // Atomic: SET + EXPIRE in pipeline to avoid race conditions
  const pipeline = redis.pipeline();
  pipeline.set(roomKey(roomId), JSON.stringify(roomObj));
  pipeline.expire(roomKey(roomId), ROOM_TTL);
  await pipeline.exec();
  
  logger.debug("saveRoom", `Room saved`, { roomId, userCount: roomObj.users?.length || 0 });
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
    const existingRoom = await getRoom(trimmedCode, true);
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
  const roomId = insertRoom.id;
  const room: Room = {
    ...insertRoom,
    id: roomId,
    users: [], // Array is now computed from set - initialize empty
    createdAt: Date.now(),
    messages: [],
  };
  
  await saveRoom(roomId, room);
  
  // Add owner to users set (canonical storage)
  if (insertRoom.ownerId && insertRoom.ownerUsername) {
    await addUserToRoom(roomId, { id: insertRoom.ownerId, username: insertRoom.ownerUsername });
  }
  
  logger.info("createRoom", `Room created`, { roomId, name: room.name, ownerId: insertRoom.ownerId });
  // Return room with computed users array
  const finalRoom = await getRoom(roomId, true);
  return finalRoom || room;
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
export async function addUserToRoom(roomId: string, user: { id: string; username: string }): Promise<boolean> {
  const startTime = new Date().toISOString();
  console.log(`[DEBUG:addUserToRoom] START timestamp=${startTime} roomId=${roomId} userId=${user.id} username=${user.username}`);
  logger.info("addUserToRoom", `${user.username} joining room`, { roomId, userId: user.id, username: user.username });
  
  if (!roomId || !user || typeof roomId !== "string") {
    const endTime = new Date().toISOString();
    console.log(`[DEBUG:addUserToRoom] END timestamp=${endTime} roomId=${roomId || 'undefined'} userId=${user?.id || 'undefined'} result=failed reason=invalid_params`);
    logger.warn("addUserToRoom", "Invalid params", { roomId, userId: user?.id });
    return false;
  }
  
  if (!redis || redis.status !== "ready") {
    const endTime = new Date().toISOString();
    console.log(`[DEBUG:addUserToRoom] END timestamp=${endTime} roomId=${roomId} userId=${user.id} result=failed reason=redis_not_ready`);
    logger.warn("addUserToRoom", "Redis not ready", { roomId, userId: user.id });
    return false;
  }
  
  try {
    // Get room WITHOUT auto-deletion to prevent race condition
    console.log(`[DEBUG:addUserToRoom] Fetching room roomId=${roomId} userId=${user.id}`);
    let room: Room | null = null;
    const raw = await redis.get(roomKey(roomId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const parsedRoom = parsed as Room;
          if (!parsedRoom.createdAt) {
            parsedRoom.createdAt = Date.now();
          }
          room = parsedRoom;
        }
      } catch (e) {
        console.log(`[DEBUG:addUserToRoom] Failed to parse room roomId=${roomId} userId=${user.id}`);
        logger.warn("addUserToRoom", "Failed to parse room", { roomId });
        room = null;
      }
    }
    
    // Create room if it doesn't exist
    if (!room) {
      console.log(`[DEBUG:addUserToRoom] Creating new room roomId=${roomId} userId=${user.id}`);
      logger.info("addUserToRoom", `Creating new room`, { roomId });
      room = {
        id: roomId,
        name: `Room ${roomId}`,
        ownerId: "",
        ownerUsername: "",
        users: [], // Array is computed from set - initialize empty
        maxUsers: 35,
        createdAt: Date.now(),
        messages: [],
      };
      // Save initial room metadata
      await saveRoom(roomId, room);
    }
    
    // CANCEL any scheduled deletion if user is joining
    const scheduled = scheduledDeletions.get(roomId);
    if (scheduled) {
      clearTimeout(scheduled.timeout);
      scheduledDeletions.delete(roomId);
      await redis.del(emptySinceKey(roomId));
      console.log(`⌛ [SCHEDULE_DELETE] roomId=${roomId} cancelled reason=user_joined`);
    }
    
    // Atomic: Add user to set and update room metadata in pipeline
    console.log(`[DEBUG:addUserToRoom] Executing Redis pipeline roomId=${roomId} userId=${user.id} username=${user.username}`);
    const userJson = JSON.stringify({ id: user.id, username: user.username });
    const pipeline = redis.pipeline();
    
    // Check if user already in set (idempotent check)
    const existingMembers = await redis.smembers(usersKey(roomId));
    const wasAlreadyInRoom = existingMembers.some(m => {
      try {
        const parsed = JSON.parse(m);
        return parsed?.id === user.id;
      } catch {
        return false;
      }
    });
    
    if (!wasAlreadyInRoom) {
      pipeline.sadd(usersKey(roomId), userJson);
    }
    
    // Update room metadata with updatedAt timestamp
    const updatedRoom = { ...room, updatedAt: Date.now() };
    pipeline.set(roomKey(roomId), JSON.stringify(updatedRoom));
    
    // Refresh all TTLs atomically (CRITICAL: Active rooms never expire early)
    pipeline.expire(usersKey(roomId), ROOM_TTL);
    pipeline.expire(roomKey(roomId), ROOM_TTL);
    
    // Refresh messages TTL if it exists
    const messagesExist = await redis.exists(messagesKey(roomId));
    if (messagesExist) {
      pipeline.expire(messagesKey(roomId), ROOM_TTL);
    }
    
    await pipeline.exec();
    
    // ASSERTION: Verify user was added to set
    const membersAfter = await redis.smembers(usersKey(roomId));
    
    // CRITICAL: After user joins, if room was empty and now has users, ensure TTL is refreshed
    // This prevents rooms from expiring during active use
    if (membersAfter.length > 0) {
      await refreshRoomTTLs(roomId);
      console.log(`[PRESENCE] TTL refreshed on join roomId=${roomId} userId=${user.id} totalUsers=${membersAfter.length}`);
    }
    const userPresent = membersAfter.some(m => {
      try {
        const parsed = JSON.parse(m);
        return parsed?.id === user.id;
      } catch {
        return false;
      }
    });
    
    if (!userPresent && !wasAlreadyInRoom) {
      const endTime = new Date().toISOString();
      console.log(`❌ [ASSERT] addUserToRoom failed - member missing roomId=${roomId} userId=${user.id}`);
      console.log(`[DEBUG:addUserToRoom] END timestamp=${endTime} roomId=${roomId} userId=${user.id} result=failed reason=assertion_failed`);
      logger.error("addUserToRoom", "Assertion failed - user not in set after add", { roomId, userId: user.id });
      return false;
    }
    
    const finalUserCount = membersAfter.length;
    console.log(`✅ [ADD_USER] roomId=${roomId} userId=${user.id} result=ok wasAlreadyInRoom=${wasAlreadyInRoom} finalCount=${finalUserCount}`);
    
    const endTime = new Date().toISOString();
    console.log(`[DEBUG:addUserToRoom] END timestamp=${endTime} roomId=${roomId} userId=${user.id} username=${user.username} result=success totalUsers=${finalUserCount} wasAlreadyInRoom=${wasAlreadyInRoom}`);
    logger.info("addUserToRoom", `${user.username} added to room`, { roomId, userId: user.id, totalUsers: finalUserCount });
    return true;
  } catch (e: any) {
    const endTime = new Date().toISOString();
    console.log(`[DEBUG:addUserToRoom] END timestamp=${endTime} roomId=${roomId} userId=${user.id} result=failed reason=error`);
    logger.error("addUserToRoom", "Error adding user to room", { roomId, userId: user.id }, e);
    return false;
  }
}

export async function removeUserFromRoom(roomId: string, userId: string): Promise<boolean> {
  const startTime = new Date().toISOString();
  console.log(`[DEBUG:removeUserFromRoom] START timestamp=${startTime} roomId=${roomId} userId=${userId}`);
  logger.info("removeUserFromRoom", `Removing user from room`, { roomId, userId });
  
  if (!roomId || !userId || typeof roomId !== "string") {
    const endTime = new Date().toISOString();
    console.log(`[DEBUG:removeUserFromRoom] END timestamp=${endTime} roomId=${roomId || 'undefined'} userId=${userId || 'undefined'} result=failed reason=invalid_params`);
    logger.warn("removeUserFromRoom", "Invalid params", { roomId, userId });
    return false;
  }
  
  if (!redis || redis.status !== "ready") {
    const endTime = new Date().toISOString();
    console.log(`[DEBUG:removeUserFromRoom] END timestamp=${endTime} roomId=${roomId} userId=${userId} result=failed reason=redis_not_ready`);
    logger.warn("removeUserFromRoom", "Redis not ready", { roomId, userId });
    return false;
  }
  
  try {
    // Get user for username lookup
    console.log(`[DEBUG:removeUserFromRoom] Fetching user roomId=${roomId} userId=${userId}`);
    const user = await getUser(userId);
    if (!user) {
      const endTime = new Date().toISOString();
      console.log(`[DEBUG:removeUserFromRoom] END timestamp=${endTime} roomId=${roomId} userId=${userId} result=failed reason=user_not_found`);
      logger.warn("removeUserFromRoom", "User not found", { roomId, userId });
      return false;
    }
    
    // Get room metadata for age calculation
    const room = await getRoom(roomId, true); // Skip auto-delete during removal
    
    // Remove from users set (idempotent - removing non-existent is no-op)
    console.log(`[DEBUG:removeUserFromRoom] Removing from Redis set roomId=${roomId} userId=${userId} username=${user.username}`);
    const members = await redis.smembers(usersKey(roomId));
    let userJsonToRemove: string | null = null;
    for (const m of members) {
      try {
        const parsed = JSON.parse(m);
        if (parsed?.id === userId) {
          userJsonToRemove = m;
          break;
        }
      } catch (e) {
        // ignore invalid entries
      }
    }
    
    // Atomic pipeline: remove user, update room metadata, refresh TTLs
    const pipeline = redis.pipeline();
    
    if (userJsonToRemove) {
      pipeline.srem(usersKey(roomId), userJsonToRemove);
    } else {
      console.log(`⚠ [REMOVE_USER] user not found in set roomId=${roomId} userId=${userId} - proceeding to ensure idempotency`);
    }
    
    // Update room metadata with updatedAt (if room exists)
    if (room) {
      const updatedRoom = { ...room, updatedAt: Date.now() };
      pipeline.set(roomKey(roomId), JSON.stringify(updatedRoom));
    }
    
    // Refresh TTLs
    pipeline.expire(usersKey(roomId), ROOM_TTL);
    if (room) {
      pipeline.expire(roomKey(roomId), ROOM_TTL);
    }
    
    await pipeline.exec();
    
    // Compute remaining after removal (from set, not array)
    console.log(`[DEBUG:removeUserFromRoom] Computing remaining users roomId=${roomId} userId=${userId}`);
    const remaining = await redis.scard(usersKey(roomId));
    
    // If remaining === 0, handle room deletion with grace period
    if (remaining === 0 && room) {
      const age = Date.now() - (room.createdAt || 0);
      console.log(`[DEBUG:removeUserFromRoom] Room empty check roomId=${roomId} userId=${userId} age=${age}ms gracePeriod=${ROOM_DELETE_GRACE_MS}`);
      
      if (age >= ROOM_DELETE_GRACE_MS) {
        // Room old enough - delete immediately
        // CRITICAL: Verify room is still empty before deleting
        const finalCheck = await redis.scard(usersKey(roomId));
        if (finalCheck === 0) {
          await redis.del(roomKey(roomId));
          await redis.del(usersKey(roomId));
          await redis.del(messagesKey(roomId));
          await redis.del(emptySinceKey(roomId));
          // Cancel any scheduled deletion
          const scheduled = scheduledDeletions.get(roomId);
          if (scheduled) {
            clearTimeout(scheduled.timeout);
            scheduledDeletions.delete(roomId);
          }
          console.log(`🗑️ [ROOM DELETE] roomId=${roomId} reason=empty_and_aged age=${age}ms`);
          console.log(`[DEBUG:removeUserFromRoom] Room deleted roomId=${roomId} userId=${userId} age=${age}ms`);
        } else {
          console.log(`[PRESENCE] Room deletion cancelled - user rejoined roomId=${roomId} finalCheck=${finalCheck}`);
        }
      } else {
        // Room too fresh - schedule deletion after grace period
        const emptySince = Date.now();
        await redis.setex(emptySinceKey(roomId), Math.ceil(ROOM_DELETE_GRACE_MS / 1000), String(emptySince));
        
        // Cancel existing scheduled deletion if any
        const existingScheduled = scheduledDeletions.get(roomId);
        if (existingScheduled) {
          clearTimeout(existingScheduled.timeout);
        }
        
        // Schedule deletion
        const delay = ROOM_DELETE_GRACE_MS - age;
        const scheduledAt = Date.now();
        const timeout = setTimeout(async () => {
          // Re-check before deleting (user might have joined)
          const currentUsers = await getRoomUsers(roomId);
          if (currentUsers.length === 0) {
            const finalRoom = await getRoom(roomId, true);
            if (finalRoom) {
              const finalAge = Date.now() - (finalRoom.createdAt || 0);
              await redis.del(roomKey(roomId));
              await redis.del(usersKey(roomId));
              await redis.del(messagesKey(roomId));
              await redis.del(emptySinceKey(roomId));
              scheduledDeletions.delete(roomId);
              console.log(`🗑️ [ROOM DELETE] roomId=${roomId} reason=empty_and_aged age=${finalAge}ms scheduled`);
            }
          } else {
            // User joined during grace - cancel deletion
            scheduledDeletions.delete(roomId);
            await redis.del(emptySinceKey(roomId));
            console.log(`⌛ [SCHEDULE_DELETE] roomId=${roomId} cancelled reason=user_joined_during_grace`);
          }
        }, delay);
        
        scheduledDeletions.set(roomId, { timeout, scheduledAt });
        console.log(`⌛ [SCHEDULE_DELETE] roomId=${roomId} scheduledAt=${scheduledAt} dueTo=empty_fresh delay=${delay}ms`);
      }
    } else if (remaining > 0) {
      // Refresh TTLs if room still has users
      console.log(`[DEBUG:removeUserFromRoom] Refreshing TTLs roomId=${roomId} userId=${userId} remaining=${remaining}`);
      await refreshRoomTTLs(roomId);
    }
    
    const endTime = new Date().toISOString();
    const isEmpty = remaining === 0;
    console.log(`[DEBUG:removeUserFromRoom] END timestamp=${endTime} roomId=${roomId} userId=${userId} result=success remaining=${remaining} isEmpty=${isEmpty}`);
    logger.info("removeUserFromRoom", `User removed from room`, { roomId, userId, remaining });
    return isEmpty;
  } catch (e: any) {
    const endTime = new Date().toISOString();
    console.log(`[DEBUG:removeUserFromRoom] END timestamp=${endTime} roomId=${roomId} userId=${userId} result=failed reason=error`);
    logger.error("removeUserFromRoom", "Error removing user from room", { roomId, userId }, e);
    return false;
  }
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
export async function saveMessage(roomId: string, message: any): Promise<boolean> {
  if (!roomId || typeof roomId !== "string") {
    logger.error("saveMessage", "Missing or invalid roomId", { roomId });
    throw new Error("saveMessage missing roomId");
  }
  
  if (!redis || redis.status !== "ready") {
    logger.warn("saveMessage", "Redis not ready", { roomId });
    return false;
  }
  
  try {
    // Atomic: RPUSH, LTRIM, EXPIRE in pipeline
    const pipeline = redis.pipeline();
    pipeline.rpush(messagesKey(roomId), JSON.stringify(message));
    pipeline.ltrim(messagesKey(roomId), -100, -1); // Keep last 100
    pipeline.expire(messagesKey(roomId), ROOM_TTL);
    pipeline.expire(roomKey(roomId), ROOM_TTL);
    pipeline.expire(usersKey(roomId), ROOM_TTL);
    await pipeline.exec();
    
    logger.debug("saveMessage", `Message saved`, { roomId, messageId: message.id });
    return true;
  } catch (e: any) {
    logger.error("saveMessage", "Error saving message", { roomId, messageId: message.id }, e);
    return false;
  }
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
export async function setUser(userId: string, userObj: User): Promise<boolean> {
  if (!redis || redis.status !== "ready") return false;
  
  try {
    // User data does not expire - only deleted on explicit logout
    await redis.set(userKey(userId), JSON.stringify(userObj));
    // Username mapping expires
    await redis.setex(usernameKey(userObj.username), ROOM_TTL, userId);
    logger.debug("setUser", `User saved`, { userId, username: userObj.username });
    return true;
  } catch (e: any) {
    logger.error("setUser", "Error saving user", { userId }, e);
    return false;
  }
}

export async function getUser(userId: string): Promise<User | null> {
  if (!redis || redis.status !== "ready") return null;
  
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
  const userId = uuidv4();
  const user: User = {
    ...insertUser,
    id: userId,
  };
  
  await setUser(userId, user);
  logger.info("createUser", `User created`, { userId, username: user.username });
  return user;
}

// Random Chat Queue Operations
export async function addToRandomQueue(userId: string): Promise<{ matched: boolean; partnerUserId?: string; roomId?: string }> {
  logger.info("addToRandomQueue", `User joining queue`, { userId });
  
  if (!redis || redis.status !== "ready") {
    logger.warn("addToRandomQueue", "Redis not ready", { userId });
    return { matched: false };
  }
  
  try {
    const now = Date.now();
    
    // Clean up expired queue entries (older than 1 minute)
    const expiredBefore = now - RANDOM_CHAT_TIMEOUT;
    await redis.zremrangebyscore(randomChatQueueKey, 0, expiredBefore);
    
    // Check if user is already in queue
    const existingScore = await redis.zscore(randomChatQueueKey, userId);
    if (existingScore !== null) {
      logger.debug("addToRandomQueue", "User already in queue", { userId });
      return { matched: false };
    }
    
    // Look for a waiting partner (someone who joined in the last minute)
    const waitingPartners = await redis.zrangebyscore(
      randomChatQueueKey,
      now - RANDOM_CHAT_TIMEOUT,
      now,
      "LIMIT",
      0,
      1
    );
    
    if (waitingPartners.length > 0 && waitingPartners[0] !== userId) {
      // Found a match!
      const partnerUserId = waitingPartners[0];
      
      // Remove both users from queue atomically
      const pipeline = redis.pipeline();
      pipeline.zrem(randomChatQueueKey, userId);
      pipeline.zrem(randomChatQueueKey, partnerUserId);
      await pipeline.exec();
      
      logger.info("addToRandomQueue", `Match found`, { userId, partnerUserId });
      
      return { matched: true, partnerUserId };
    }
    
    // No match - add user to queue with current timestamp as score
    await redis.zadd(randomChatQueueKey, now, userId);
    // Set TTL on queue (cleanup safety)
    await redis.expire(randomChatQueueKey, RANDOM_CHAT_TIMEOUT / 1000 + 10);
    
    logger.info("addToRandomQueue", `User added to queue`, { userId, queueSize: await redis.zcard(randomChatQueueKey) });
    return { matched: false };
  } catch (e: any) {
    logger.error("addToRandomQueue", "Error in random chat queue", { userId }, e);
    return { matched: false };
  }
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
        const pipeline = redis.pipeline();
        pipeline.del(userKey(userId));
        pipeline.del(usernameKey(user.username));
        pipeline.del(userSocketsKey(userId));
        await pipeline.exec();
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
