import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import helmet from "helmet";
import { storage } from "./storage";
import { generateUploadUrl, generateDownloadUrl } from "./utils/s3";
import type { InsertUser, InsertRoom, InsertMessage } from "@shared/schema";

// Track user rooms for cleanup
const userRooms = new Map<string, Set<string>>(); // userId -> Set<roomId>

export async function registerRoutes(app: Express): Promise<Server> {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Allow Vite in development
  }));

  // No-cache headers for privacy
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

      if (!username || username.length < 2 || username.length > 20) {
        return res.json({
          success: false,
          message: "Username must be between 2 and 20 characters",
        });
      }

      // Check if username is already taken
      const existingUser = await storage.getUserByUsername(username.trim());
      if (existingUser) {
        return res.json({
          success: false,
          message: "Username already taken. Please choose another.",
        });
      }

      // Create new user
      const user = await storage.createUser({ username: username.trim() });

      return res.json({
        success: true,
        userId: user.id,
        username: user.username,
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  });

  // Create room endpoint
  app.post("/api/rooms/create", async (req, res) => {
    try {
      const { name, ownerId, ownerUsername, maxUsers = 35 } = req.body as InsertRoom;

      if (!name || !ownerId || !ownerUsername) {
        return res.json({
          success: false,
          message: "Missing required fields",
        });
      }

      const room = await storage.createRoom({
        name: name.trim(),
        ownerId,
        ownerUsername,
        maxUsers,
      });

      return res.json({
        success: true,
        room,
      });
    } catch (error) {
      console.error("Create room error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create room",
      });
    }
  });

  // Get room details
  app.get("/api/rooms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const room = await storage.getRoom(id);

      if (!room) {
        return res.status(404).json({
          success: false,
          message: "Room not found",
        });
      }

      return res.json({
        success: true,
        room,
      });
    } catch (error) {
      console.error("Get room error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get room",
      });
    }
  });

  // Random chat endpoint
  app.post("/api/random-chat/request", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.json({
          success: false,
          message: "User ID required",
        });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.json({
          success: false,
          message: "User not found",
        });
      }

      // Get waiting users
      const waitingUsers = await storage.getRandomQueueUsers();
      const otherUsers = waitingUsers.filter(id => id !== userId);

      if (otherUsers.length > 0) {
        // Match with first waiting user
        const matchedUserId = otherUsers[0];
        const matchedUser = await storage.getUser(matchedUserId);
        
        if (matchedUser) {
          // Create random chat room
          const room = await storage.createRoom({
            name: `Random Chat: ${user.username} & ${matchedUser.username}`,
            ownerId: userId,
            ownerUsername: user.username,
            maxUsers: 2,
          });

          // Remove both users from queue
          await storage.removeFromRandomQueue(userId);
          await storage.removeFromRandomQueue(matchedUserId);

          return res.json({
            success: true,
            roomId: room.id,
          });
        }
      }

      // No match available, add to queue
      await storage.addToRandomQueue(userId);

      return res.json({
        success: false,
        message: "No users available",
      });
    } catch (error) {
      console.error("Random chat error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to match users",
      });
    }
  });

  // File upload pre-signed URL
  app.post("/api/files/upload-url", async (req, res) => {
    try {
      const { filename, fileType, roomId } = req.body;

      if (!filename || !fileType || !roomId) {
        return res.json({
          success: false,
          message: "Missing required fields",
        });
      }

      const result = await generateUploadUrl(filename, fileType, roomId);

      if (!result) {
        return res.json({
          success: false,
          message: "S3 not configured",
        });
      }

      return res.json({
        success: true,
        uploadUrl: result.uploadUrl,
        fileKey: result.fileKey,
      });
    } catch (error) {
      console.error("Upload URL error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate upload URL",
      });
    }
  });

  // File download pre-signed URL
  app.post("/api/files/download-url", async (req, res) => {
    try {
      const { fileKey } = req.body;

      if (!fileKey) {
        return res.json({
          success: false,
          message: "File key required",
        });
      }

      const downloadUrl = await generateDownloadUrl(fileKey);

      if (!downloadUrl) {
        return res.json({
          success: false,
          message: "Failed to generate download URL",
        });
      }

      return res.json({
        success: true,
        downloadUrl,
      });
    } catch (error) {
      console.error("Download URL error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate download URL",
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

  io.on("connection", (socket: Socket) => {
    console.log("Client connected:", socket.id);

    // Join room
    socket.on("join_room", async (data: { roomId: string; userId: string }) => {
      try {
        const { roomId, userId } = data;
        const user = await storage.getUser(userId);
        const room = await storage.getRoom(roomId);

        if (!user || !room) {
          socket.emit("error", { message: "User or room not found" });
          return;
        }

        // Check room capacity
        if (room.users.length >= room.maxUsers) {
          socket.emit("error", { message: "Room is full" });
          return;
        }

        // Add user to room
        await storage.addUserToRoom(roomId, user.username);
        await storage.setSocketUser(socket.id, userId);

        // Track user rooms
        if (!userRooms.has(userId)) {
          userRooms.set(userId, new Set());
        }
        userRooms.get(userId)!.add(roomId);

        // Join socket room
        socket.join(roomId);

        // Get updated room
        const updatedRoom = await storage.getRoom(roomId);

        // Broadcast join message
        const joinMessage = await storage.addMessage({
          roomId,
          username: "System",
          content: `${user.username} joined the room`,
          type: "system",
        });

        io.to(roomId).emit("user_joined", {
          username: user.username,
          room: updatedRoom,
          message: joinMessage,
        });

        // Send room history to new user
        const messages = await storage.getMessages(roomId);
        socket.emit("room_history", { room: updatedRoom, messages });
      } catch (error) {
        console.error("Join room error:", error);
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    // Send message
    socket.on("send_message", async (data: InsertMessage) => {
      try {
        const message = await storage.addMessage(data);
        io.to(data.roomId).emit("new_message", message);
      } catch (error) {
        console.error("Send message error:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Leave room
    socket.on("leave_room", async (data: { roomId: string; userId: string }) => {
      try {
        const { roomId, userId } = data;
        const user = await storage.getUser(userId);

        if (user) {
          await storage.removeUserFromRoom(roomId, user.username);
          userRooms.get(userId)?.delete(roomId);
          socket.leave(roomId);

          const leaveMessage = await storage.addMessage({
            roomId,
            username: "System",
            content: `${user.username} left the room`,
            type: "system",
          });

          const updatedRoom = await storage.getRoom(roomId);
          io.to(roomId).emit("user_left", {
            username: user.username,
            room: updatedRoom,
            message: leaveMessage,
          });
        }
      } catch (error) {
        console.error("Leave room error:", error);
      }
    });

    // Disconnect cleanup
    socket.on("disconnect", async () => {
      try {
        const userId = await storage.getUserBySocket(socket.id);
        
        if (userId) {
          const user = await storage.getUser(userId);
          const rooms = userRooms.get(userId) || new Set();

          // Leave all rooms
          for (const roomId of rooms) {
            if (user) {
              await storage.removeUserFromRoom(roomId, user.username);

              const leaveMessage = await storage.addMessage({
                roomId,
                username: "System",
                content: `${user.username} left the room`,
                type: "system",
              });

              const updatedRoom = await storage.getRoom(roomId);
              io.to(roomId).emit("user_left", {
                username: user.username,
                room: updatedRoom,
                message: leaveMessage,
              });
            }
          }

          // Cleanup
          userRooms.delete(userId);
          await storage.deleteSocketUser(socket.id);
          await storage.deleteUser(userId);
          await storage.removeFromRandomQueue(userId);
        }

        console.log("Client disconnected:", socket.id);
      } catch (error) {
        console.error("Disconnect cleanup error:", error);
      }
    });
  });

  return httpServer;
}
