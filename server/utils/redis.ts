import Redis from "ioredis";

// Initialize Redis client with connection from environment
const REDIS_URL = process.env.REDIS_URL;

let redis: Redis | null = null;

if (REDIS_URL) {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redis.on("error", (err) => {
    console.error("Redis connection error:", err);
  });

  redis.on("connect", () => {
    console.log("✓ Connected to Redis");
  });
} else {
  console.warn("⚠ REDIS_URL not configured - using in-memory storage");
}

export { redis };

// Redis key constants
export const REDIS_KEYS = {
  user: (userId: string) => `user:${userId}`,
  username: (username: string) => `username:${username}`,
  room: (roomId: string) => `room:${roomId}`,
  messages: (roomId: string) => `messages:${roomId}`,
  randomChatQueue: "random_chat_queue",
  socketToUser: (socketId: string) => `socket:${socketId}`,
};

// TTL constants (in seconds)
export const TTL = {
  USER: 3600, // 1 hour
  ROOM: 3600, // 1 hour
  MESSAGE: 3600, // 1 hour
  RANDOM_CHAT_QUEUE: 300, // 5 minutes
};
