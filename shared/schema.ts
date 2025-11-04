import { z } from "zod";

// User Schema - No passwords, username only for ephemeral chat
export const userSchema = z.object({
  id: z.string(),
  username: z.string().min(2).max(20),
  socketId: z.string().optional(),
});

export const insertUserSchema = userSchema.omit({ id: true });

export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Room Schema
export const roomSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  ownerId: z.string(),
  ownerUsername: z.string(),
  users: z.array(z.string()), // Array of usernames
  maxUsers: z.number().default(35),
  createdAt: z.number(), // Unix timestamp
  messages: z.array(messageSchema).optional(), // Messages stored in room
});

export const insertRoomSchema = roomSchema.omit({ id: true, users: true, createdAt: true });

export type Room = z.infer<typeof roomSchema>;
export type InsertRoom = z.infer<typeof insertRoomSchema>;

// Message Schema - WhatsApp-like with status tracking
export const messageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  username: z.string(),
  content: z.string().min(1).max(5000),
  timestamp: z.number(),
  type: z.enum(["text", "system", "audio"]).default("text"),
  audioData: z.string().optional(), // Base64 encoded audio for audio messages
  status: z.enum(["sending", "sent", "delivered"]).optional(), // WhatsApp-like message status
  tempId: z.string().optional(), // For optimistic updates tracking
});

export const insertMessageSchema = messageSchema.omit({ id: true, timestamp: true });

export type Message = z.infer<typeof messageSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// File Metadata Schema
export const fileMetadataSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  uploadedBy: z.string(),
  filename: z.string(),
  fileSize: z.number().max(90 * 1024 * 1024), // 90 MB max
  fileType: z.string(),
  s3Key: z.string(),
  uploadedAt: z.number(),
  expiresAt: z.number(),
});

export const insertFileMetadataSchema = fileMetadataSchema.omit({ id: true, uploadedAt: true, expiresAt: true });

export type FileMetadata = z.infer<typeof fileMetadataSchema>;
export type InsertFileMetadata = z.infer<typeof insertFileMetadataSchema>;

// Socket Events Schema
export const socketEventSchema = z.object({
  event: z.enum([
    "user_joined",
    "user_left",
    "message",
    "file_request",
    "file_response",
    "random_chat_request",
    "random_chat_matched",
  ]),
  data: z.any(),
});

// API Response Schemas
export const loginResponseSchema = z.object({
  success: z.boolean(),
  userId: z.string().optional(),
  username: z.string().optional(),
  message: z.string().optional(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const roomResponseSchema = z.object({
  success: z.boolean(),
  room: roomSchema.optional(),
  message: z.string().optional(),
});

export type RoomResponse = z.infer<typeof roomResponseSchema>;
