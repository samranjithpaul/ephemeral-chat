import Redis from "ioredis";

// Initialize Redis client with connection from environment
// Support both direct REDIS_URL and Upstash credentials
let REDIS_URL = process.env.REDIS_URL;

// If Upstash credentials are provided, construct Redis URL
if (!REDIS_URL && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  // Handle different formats:
  // 1. rediss://host:port (already a Redis URL, just needs token)
  // 2. https://host (needs conversion to rediss://)
  
  if (restUrl.startsWith("rediss://")) {
    // Already a Redis URL, extract host:port and add token
    const match = restUrl.match(/rediss:\/\/([^:]+):(\d+)/);
    if (match) {
      const [, host, port] = match;
      REDIS_URL = `rediss://default:${token}@${host}:${port}`;
    } else {
      // Fallback: try to parse without port
      const host = restUrl.replace("rediss://", "").split(":")[0];
      REDIS_URL = `rediss://default:${token}@${host}:6379`;
    }
  } else {
    // HTTPS format, convert to rediss://
    const host = restUrl.replace("https://", "").replace("http://", "").split(":")[0];
    REDIS_URL = `rediss://default:${token}@${host}:6379`;
  }
  
  console.log(`🔧 Constructed Redis URL from Upstash credentials`);
}

let redis: Redis | null = null;
let redisInitialized = false;

if (REDIS_URL) {
  try {
    console.log(`🔌 Attempting to connect to Redis...`);
    console.log(`   URL format: ${REDIS_URL.split("@")[0]}@****${REDIS_URL.split("@")[1]?.split(":")[1] ? ":" + REDIS_URL.split("@")[1].split(":")[1] : ""}`);
    
    redis = new Redis(REDIS_URL, {
      // Connection timeout settings
      connectTimeout: 10000, // 10 seconds
      commandTimeout: 5000,  // 5 seconds per command
      retryStrategy(times) {
        if (times > 3) {
          console.error(`❌ Redis connection failed after ${times} attempts, falling back to in-memory storage`);
          redis = null;
          redisInitialized = true;
          return null; // Stop retrying
        }
        const delay = Math.min(times * 1000, 5000);
        console.log(`🔄 Redis retry attempt ${times}, waiting ${delay}ms...`);
        return delay;
      },
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false, // Connect immediately
      // TLS settings - explicitly enable for rediss://
      tls: REDIS_URL.startsWith("rediss://") ? {
        rejectUnauthorized: false, // Upstash uses self-signed certs
      } : undefined,
      // Keep alive settings
      keepAlive: 30000,
    });

    redis.on("error", (err) => {
      if (!redisInitialized) {
        console.error("❌ Redis connection error:", err.message);
        console.error("   Error code:", err.code || "N/A");
        // Don't fallback here, let retryStrategy handle it
      }
    });

    redis.on("connect", () => {
      console.log("🔌 Redis connection established (connecting...)");
    });

    redis.on("ready", async () => {
      console.log("✅ Redis is ready and ready to accept commands");
      console.log(`✅ Connected to Redis: ${REDIS_URL?.split("@")[0]}@****`);
      redisInitialized = true;
      
      // Sync in-memory messages to Redis when reconnected
      // Use setTimeout to ensure routes are fully loaded
      setTimeout(async () => {
        try {
          const { syncMessagesToRedis } = await import("../routes");
          await syncMessagesToRedis(redis, REDIS_KEYS, TTL);
        } catch (error: any) {
          console.log(`📝 Note: Message sync delayed (routes not ready yet): ${error.message}`);
        }
      }, 1000);
    });

    redis.on("close", () => {
      console.warn("⚠ Redis connection closed");
    });

    redis.on("reconnecting", () => {
      console.log("🔄 Redis reconnecting...");
    });

    // Test the connection with a ping
    redis.ping()
      .then(() => {
        console.log("✅ Redis PING successful - connection is working");
        redisInitialized = true;
      })
      .catch((err) => {
        console.error("❌ Redis PING failed:", err.message);
        // Connection will fall back via retryStrategy
      });

  } catch (error: any) {
    console.error("❌ Failed to initialize Redis:", error.message);
    redis = null;
    redisInitialized = true;
  }
} else {
  console.warn("⚠ REDIS_URL not configured - using in-memory storage");
  console.warn("⚠ Note: In-memory storage is NOT shared across server instances/restarts");
  console.warn("⚠ Set REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to use persistent storage");
  redisInitialized = true;
}

// Export function to trigger sync when Redis reconnects
export async function triggerMessageSync() {
  if (redis && redis.status === "ready") {
    try {
      const { syncMessagesToRedis } = await import("../routes");
      await syncMessagesToRedis(redis, REDIS_KEYS, TTL);
    } catch (error: any) {
      console.error("Failed to trigger message sync:", error.message);
    }
  }
}

export { redis };

// Redis key constants - New schema
export const REDIS_KEYS = {
  // Room keys
  room: (roomId: string) => `room:${roomId}`,
  
  // User keys
  userData: (userId: string) => `user:${userId}:data`,
  userRooms: (userId: string) => `user:${userId}:rooms`,
  userLastSeen: (userId: string) => `user:${userId}:lastSeen`,
  username: (username: string) => `username:${username}`, // Legacy - username -> userId mapping
  
  // Socket mapping (legacy support)
  socketToUser: (socketId: string) => `socket:${socketId}`,
  
  // Other
  randomChatQueue: "random_chat_queue",
};

// TTL constants (in seconds)
// NOTE: ROOM and MESSAGE TTL removed - they persist until room is empty
export const TTL = {
  USER: 3600, // 1 hour (user sessions)
  RANDOM_CHAT_QUEUE: 300, // 5 minutes
};
