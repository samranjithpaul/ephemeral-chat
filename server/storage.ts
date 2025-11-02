import { v4 as uuidv4 } from "uuid";
import { redis, REDIS_KEYS, TTL } from "./utils/redis";
import type { User, InsertUser, Room, InsertRoom, Message, InsertMessage } from "@shared/schema";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  deleteUser(id: string): Promise<void>;
  
  // Room operations
  getRoom(id: string): Promise<Room | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  addUserToRoom(roomId: string, username: string): Promise<void>;
  removeUserFromRoom(roomId: string, username: string): Promise<void>;
  deleteRoom(id: string): Promise<void>;
  
  // Message operations
  getMessages(roomId: string): Promise<Message[]>;
  addMessage(message: InsertMessage): Promise<Message>;
  
  // Socket mapping
  setSocketUser(socketId: string, userId: string): Promise<void>;
  getUserBySocket(socketId: string): Promise<string | null>;
  deleteSocketUser(socketId: string): Promise<void>;
  
  // Random chat queue
  addToRandomQueue(userId: string): Promise<void>;
  removeFromRandomQueue(userId: string): Promise<void>;
  getRandomQueueUsers(): Promise<string[]>;
}

export class RedisStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    if (!redis) return undefined;
    const data = await redis.get(REDIS_KEYS.user(id));
    return data ? JSON.parse(data) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!redis) return undefined;
    const userId = await redis.get(REDIS_KEYS.username(username));
    if (!userId) return undefined;
    return this.getUser(userId);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = uuidv4();
    const user: User = { ...insertUser, id };
    
    if (redis) {
      // Store user object
      await redis.setex(REDIS_KEYS.user(id), TTL.USER, JSON.stringify(user));
      // Store username -> userId mapping
      await redis.setex(REDIS_KEYS.username(user.username), TTL.USER, id);
    }
    
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    if (!redis) return;
    const user = await this.getUser(id);
    if (user) {
      await redis.del(REDIS_KEYS.user(id));
      await redis.del(REDIS_KEYS.username(user.username));
    }
  }

  // Room operations
  async getRoom(id: string): Promise<Room | undefined> {
    if (!redis) return undefined;
    const data = await redis.get(REDIS_KEYS.room(id));
    return data ? JSON.parse(data) : undefined;
  }

  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const id = uuidv4().slice(0, 8); // Short room codes
    const room: Room = {
      ...insertRoom,
      id,
      users: [insertRoom.ownerUsername],
      createdAt: Date.now(),
    };
    
    if (redis) {
      await redis.setex(REDIS_KEYS.room(id), TTL.ROOM, JSON.stringify(room));
    }
    
    return room;
  }

  async addUserToRoom(roomId: string, username: string): Promise<void> {
    if (!redis) return;
    const room = await this.getRoom(roomId);
    if (room && !room.users.includes(username)) {
      room.users.push(username);
      await redis.setex(REDIS_KEYS.room(roomId), TTL.ROOM, JSON.stringify(room));
    }
  }

  async removeUserFromRoom(roomId: string, username: string): Promise<void> {
    if (!redis) return;
    const room = await this.getRoom(roomId);
    if (room) {
      room.users = room.users.filter(u => u !== username);
      if (room.users.length === 0) {
        await this.deleteRoom(roomId);
      } else {
        await redis.setex(REDIS_KEYS.room(roomId), TTL.ROOM, JSON.stringify(room));
      }
    }
  }

  async deleteRoom(id: string): Promise<void> {
    if (!redis) return;
    await redis.del(REDIS_KEYS.room(id));
    await redis.del(REDIS_KEYS.messages(id));
  }

  // Message operations
  async getMessages(roomId: string): Promise<Message[]> {
    if (!redis) return [];
    const messages = await redis.lrange(REDIS_KEYS.messages(roomId), 0, -1);
    return messages.map(msg => JSON.parse(msg));
  }

  async addMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = uuidv4();
    const message: Message = {
      ...insertMessage,
      id,
      timestamp: Date.now(),
    };
    
    if (redis) {
      await redis.rpush(REDIS_KEYS.messages(message.roomId), JSON.stringify(message));
      await redis.expire(REDIS_KEYS.messages(message.roomId), TTL.MESSAGE);
    }
    
    return message;
  }

  // Socket mapping
  async setSocketUser(socketId: string, userId: string): Promise<void> {
    if (redis) {
      await redis.setex(REDIS_KEYS.socketToUser(socketId), TTL.USER, userId);
    }
  }

  async getUserBySocket(socketId: string): Promise<string | null> {
    if (!redis) return null;
    return await redis.get(REDIS_KEYS.socketToUser(socketId));
  }

  async deleteSocketUser(socketId: string): Promise<void> {
    if (redis) {
      await redis.del(REDIS_KEYS.socketToUser(socketId));
    }
  }

  // Random chat queue
  async addToRandomQueue(userId: string): Promise<void> {
    if (redis) {
      await redis.sadd(REDIS_KEYS.randomChatQueue, userId);
      await redis.expire(REDIS_KEYS.randomChatQueue, TTL.RANDOM_CHAT_QUEUE);
    }
  }

  async removeFromRandomQueue(userId: string): Promise<void> {
    if (redis) {
      await redis.srem(REDIS_KEYS.randomChatQueue, userId);
    }
  }

  async getRandomQueueUsers(): Promise<string[]> {
    if (!redis) return [];
    return await redis.smembers(REDIS_KEYS.randomChatQueue);
  }
}

// In-memory fallback for development without Redis
export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private usernames: Map<string, string> = new Map();
  private rooms: Map<string, Room> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private socketUsers: Map<string, string> = new Map();
  private randomQueue: Set<string> = new Set();

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const userId = this.usernames.get(username);
    return userId ? this.users.get(userId) : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = uuidv4();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    this.usernames.set(user.username, id);
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      this.users.delete(id);
      this.usernames.delete(user.username);
    }
  }

  async getRoom(id: string): Promise<Room | undefined> {
    return this.rooms.get(id);
  }

  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const id = uuidv4().slice(0, 8);
    const room: Room = {
      ...insertRoom,
      id,
      users: [insertRoom.ownerUsername],
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    return room;
  }

  async addUserToRoom(roomId: string, username: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room && !room.users.includes(username)) {
      room.users.push(username);
    }
  }

  async removeUserFromRoom(roomId: string, username: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      room.users = room.users.filter(u => u !== username);
      if (room.users.length === 0) {
        this.rooms.delete(roomId);
        this.messages.delete(roomId);
      }
    }
  }

  async deleteRoom(id: string): Promise<void> {
    this.rooms.delete(id);
    this.messages.delete(id);
  }

  async getMessages(roomId: string): Promise<Message[]> {
    return this.messages.get(roomId) || [];
  }

  async addMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = uuidv4();
    const message: Message = {
      ...insertMessage,
      id,
      timestamp: Date.now(),
    };
    
    const roomMessages = this.messages.get(message.roomId) || [];
    roomMessages.push(message);
    this.messages.set(message.roomId, roomMessages);
    
    return message;
  }

  async setSocketUser(socketId: string, userId: string): Promise<void> {
    this.socketUsers.set(socketId, userId);
  }

  async getUserBySocket(socketId: string): Promise<string | null> {
    return this.socketUsers.get(socketId) || null;
  }

  async deleteSocketUser(socketId: string): Promise<void> {
    this.socketUsers.delete(socketId);
  }

  async addToRandomQueue(userId: string): Promise<void> {
    this.randomQueue.add(userId);
  }

  async removeFromRandomQueue(userId: string): Promise<void> {
    this.randomQueue.delete(userId);
  }

  async getRandomQueueUsers(): Promise<string[]> {
    return Array.from(this.randomQueue);
  }
}

// Use Redis if configured, otherwise fallback to in-memory storage
// This allows the app to work without external dependencies
export const storage = process.env.REDIS_URL ? new RedisStorage() : new MemStorage();
