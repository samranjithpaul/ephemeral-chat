/* @refresh reload */
// PATCH: 2025-11-02 - Fix client-side acked flows, message persistence, and UI enable/disable
// Fixes: Messages disappearing, input/audio buttons disabled, online users not updating
// Test: Join room, verify input enabled after ack, send messages, verify they persist

import { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { Message, Room } from "@shared/schema";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isJoined: boolean; // Export joined state for UI
  joinRoom: (roomId: string, userId: string) => void;
  leaveRoom: (roomId: string, userId: string) => void;
  sendMessage: (text: string) => void;
  sendAudio: (roomId: string, username: string, audioData: string) => void;
  sendAudioBase64: (audioBase64: string) => void;
  currentRoom: Room | null;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>; // Expose setMessages for clearing messages on room switch
  typingUsers: string[]; // WhatsApp-like typing indicators
  setTyping: (isTyping: boolean) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false); // Public joined state
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]); // WhatsApp-like typing indicators
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef(false); // Internal joined flag
  const pendingMessagesRef = useRef<{ text?: string; audioBase64?: string }[]>([]);
  const isBoundRef = useRef(false); // Track if userId is bound via heartbeat ack
  const initializedRef = useRef(false); // Guard against double initialization (React Strict Mode)

  // Consolidated logging constants - no redeclaration/shadowing
  const isDev = import.meta.env.DEV;
  const log = isDev ? console.log.bind(console) : () => {}; // No-op in production

  useEffect(() => {
    // CRITICAL: Guard against React Strict Mode double-mount in dev
    if (initializedRef.current) {
      log(`[SOCKET SYNC] Socket already initialized - skipping duplicate mount (React Strict Mode guard)`);
      return;
    }
    
    initializedRef.current = true;
    
    const serverUrl = import.meta.env.DEV 
      ? `http://localhost:8080` 
      : window.location.origin;
    
    // Check if userId exists - connect if logged in (roomId not required for initial connection)
    const userId = sessionStorage.getItem("userId");
    const roomId = sessionStorage.getItem("roomId");
    const shouldAutoConnect = !!userId; // Auto-connect if user is logged in (userId exists)
    
    // CRITICAL: Only create socket if one doesn't already exist
    if (socketRef.current && socketRef.current.connected) {
      log(`[SOCKET SYNC] Reusing existing socket connection socket.id=${socketRef.current.id}`);
      setSocket(socketRef.current);
      setIsConnected(true); // Sync state with actual connection
      return;
    }
    
    const newSocket = io(serverUrl, {
      transports: ["websocket", "polling"],
      autoConnect: shouldAutoConnect, // Only auto-connect if userId and roomId exist
      reconnection: shouldAutoConnect,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5, // Limited attempts to prevent loops
      timeout: 20000,
      forceNew: false, // Reuse existing connection if available
    });
    
    log(`[SOCKET SYNC] Socket initialized autoConnect=${shouldAutoConnect} userId=${userId || 'null'} roomId=${roomId || 'null'}`);

    socketRef.current = newSocket;
    setSocket(newSocket);
    
    // Sync initial connection state with actual socket state
    setIsConnected(newSocket.connected);
    
    // CRITICAL: If socket was created but didn't auto-connect, manually connect if userId exists
    if (!newSocket.connected && userId) {
      console.log(`[SOCKET SYNC] Socket created but not connected - manually connecting userId=${userId}`);
      newSocket.connect();
    }
    
    // CRITICAL: Add socket event tracing for debugging
    // This logs ALL socket events for troubleshooting
    newSocket.onAny((event, ...args) => {
      if (isDev) {
        log(`[SOCKET TRACE] ${event}`, args);
      }
      console.log(`[SOCKET TRACE] ${event}`, args);
    });

    // CRITICAL: Connect handler - triggers heartbeat_bind before any join_room
    newSocket.on("connect", () => {
      const userId = sessionStorage.getItem("userId");
      const username = sessionStorage.getItem("username");
      const roomId = sessionStorage.getItem("roomId");
      const ts = new Date().toISOString();
      
      log(`[SOCKET SYNC] Connect event socket.id=${newSocket.id} userId=${userId || 'null'} roomId=${roomId || 'null'} connected=${newSocket.connected} ts=${ts}`);
      console.log(`[SOCKET TRACE] connect []`);
      console.log(`[SOCKET] connected: ${newSocket.id}`);
      setIsConnected(true);
      isBoundRef.current = false; // Reset binding flag on new connection
      setIsJoined(false); // Reset joined state on new connection
      joinedRef.current = false;
      
      // CRITICAL: Use heartbeat_bind pattern - client waits for heartbeat_bound before join_room
      // This ensures userId is always bound, especially on reconnects
      if (userId) {
        log(`[SOCKET SYNC] Sending heartbeat_bind socket.id=${newSocket.id} userId=${userId} roomId=${roomId || 'null'} ts=${ts}`);
        console.log(`[SOCKET] emitting heartbeat_bind for userId: ${userId} roomId: ${roomId || 'none'}`);
        
        // Emit heartbeat_bind - server will respond with heartbeat_bound event
        newSocket.emit("heartbeat_bind", { userId });
        
        // Log if we have roomId and expect to auto-join
        if (roomId) {
          console.log(`[CONNECT] roomId found in sessionStorage - will auto-join after heartbeat_bound roomId=${roomId}`);
        }
      } else {
        log(`[SOCKET SYNC] No userId in sessionStorage - waiting for login socket.id=${newSocket.id} ts=${ts}`);
      }
    });
    
    // CRITICAL: heartbeat_bound handler - confirms userId binding, triggers join_room if needed
    newSocket.on("heartbeat_bound", (data: { userId: string }) => {
      const ts = new Date().toISOString();
      log(`[SOCKET SYNC] heartbeat_bound received socket.id=${newSocket.id} userId=${data.userId} ts=${ts}`);
      console.log(`[SOCKET TRACE] heartbeat_bound`, [{ userId: data.userId }]);
      console.log(`[SOCKET] heartbeat bound, user linked: ${data.userId}`);
      
      if (data.userId) {
        isBoundRef.current = true;
        console.log(`[HEARTBEAT_BOUND] isBoundRef set to true userId=${data.userId}`);
        
        // Check if there's a pending join from joinRoom() function
        const pendingJoin = (newSocket as any).__pendingJoin;
        if (pendingJoin) {
          log(`[SOCKET SYNC] Executing pending join after heartbeat_bound roomId=${pendingJoin.roomId} userId=${pendingJoin.userId} ts=${ts}`);
          console.log(`[HEARTBEAT_BOUND] Found pending join: roomId=${pendingJoin.roomId} userId=${pendingJoin.userId}`);
          delete (newSocket as any).__pendingJoin;
          
          // Small delay to ensure binding is complete
          setTimeout(() => {
            if (socketRef.current && socketRef.current.connected && isBoundRef.current) {
              console.log(`[HEARTBEAT_BOUND] Executing pending join roomId=${pendingJoin.roomId} userId=${pendingJoin.userId}`);
              joinRoom(pendingJoin.roomId, pendingJoin.userId);
            } else {
              console.warn(`[HEARTBEAT_BOUND] Cannot execute pending join: socket.connected=${socketRef.current?.connected} isBound=${isBoundRef.current}`);
            }
          }, 150);
          return;
        }
        
        // If no pending join, check if we should auto-join from sessionStorage
        const roomId = sessionStorage.getItem("roomId");
        if (roomId && !joinedRef.current) {
          log(`[SOCKET SYNC] Auto-joining room after heartbeat_bound roomId=${roomId} userId=${data.userId} ts=${ts}`);
          console.log(`[AUTO_JOIN] Triggering join_room after heartbeat_bound roomId=${roomId} userId=${data.userId}`);
          console.log(`[SOCKET TRACE] auto_join_triggered`, [{ roomId, userId: data.userId }]);
          // Small delay to ensure binding is complete
          setTimeout(() => {
            if (socketRef.current && socketRef.current.connected && isBoundRef.current) {
              console.log(`[AUTO_JOIN] Executing auto-join roomId=${roomId} userId=${data.userId} socket.connected=${socketRef.current.connected} isBound=${isBoundRef.current}`);
              joinRoom(roomId, data.userId);
            } else {
              console.warn(`[AUTO_JOIN] Cannot auto-join: socket.connected=${socketRef.current?.connected} isBound=${isBoundRef.current}`);
            }
          }, 150);
        } else {
          console.log(`[HEARTBEAT_BOUND] No auto-join: roomId=${roomId || 'null'} joinedRef=${joinedRef.current}`);
        }
      }
      
      // Set up periodic heartbeat for health checks (doesn't block join)
      const currentUserId = sessionStorage.getItem("userId");
      if (currentUserId) {
        const heartbeatInterval = setInterval(() => {
          if (newSocket.connected && currentUserId) {
            const clientTimestamp = Date.now();
            newSocket.emit("heartbeat", { userId: currentUserId, clientTimestamp }, (ack: { ok: boolean; userId: string; timestamp: number; latency?: number }) => {
              if (ack?.ok) {
                // Periodic heartbeat just confirms connection, doesn't block
                if (isDev && Math.random() < 0.2) {
                  log(`[SOCKET SYNC] Periodic heartbeat ok socket.id=${newSocket.id} latency=${ack.latency || 'N/A'}ms`);
                }
              }
            });
          } else {
            clearInterval(heartbeatInterval);
            (newSocket as any).__heartbeatInterval = null;
          }
        }, 20000);
        
        (newSocket as any).__heartbeatInterval = heartbeatInterval;
      }
    });

    newSocket.on("disconnect", (reason) => {
      const userId = sessionStorage.getItem("userId");
      
      // Only log disconnect if it's not a forced disconnect (page reload/navigation)
      const isPageReload = reason === "io client disconnect" || reason === "transport close";
      if (!isPageReload || isDev) {
        log(`[SOCKET SYNC] Disconnect event socket.id=${newSocket.id} userId=${userId || 'null'} reason=${reason} connected=${newSocket.connected}`);
        log("%c⚠ [Client] Disconnected", "color:orange", reason);
      }
      
      // CRITICAL: Only update state if socket is actually disconnected
      // Check actual socket state, not just the event
      if (!newSocket.connected) {
        setIsConnected(false);
        setIsJoined(false);
        joinedRef.current = false;
      }
      
      if ((newSocket as any).__heartbeatInterval) {
        clearInterval((newSocket as any).__heartbeatInterval);
        (newSocket as any).__heartbeatInterval = null;
      }

      // Only disable reconnection if explicitly disconnected by server/client
      // Network issues should allow reconnection
      if (reason === "io server disconnect" || reason === "io client disconnect") {
        log(`[SOCKET SYNC] Explicit disconnect - disabling reconnection socket.id=${newSocket.id}`);
        newSocket.io.opts.reconnection = false;
      } else {
        // Network issues - allow reconnection
        log(`[SOCKET SYNC] Network disconnect - enabling reconnection socket.id=${newSocket.id} reason=${reason}`);
        if (!newSocket.io.opts.reconnection) {
          newSocket.io.opts.reconnection = true;
        }
      }
    });
    
    // CRITICAL: Handle connect_error to prevent false reconnecting states
    newSocket.on("connect_error", (error) => {
      log(`[SOCKET SYNC] Connect error socket.id=${newSocket.id} error=${error.message} connected=${newSocket.connected}`);
      // Only update state if socket is actually not connected
      if (!newSocket.connected) {
        setIsConnected(false);
      }
    });

    // CRITICAL: Handle audio_message events - must be registered BEFORE join_room
    // This ensures audio messages are received instantly in both tabs
    newSocket.off("audio_message");
    newSocket.on("audio_message", (msg: any) => {
      const audioTimestamp = new Date().toISOString();
      const currentUserId = sessionStorage.getItem("userId");
      const currentRoomId = sessionStorage.getItem("roomId");
      const isOwnMessage = currentUserId && msg.userId === currentUserId;
      
      if (import.meta.env.DEV) {
        console.log(`[AUDIO FLOW] receive audio_message messageId=${msg.id || 'unknown'} user=${currentUserId || 'unknown'} room=${currentRoomId || msg.roomId || 'unknown'} username=${msg.username || 'unknown'} isOwn=${isOwnMessage} ts=${audioTimestamp}`);
      }
      
      const message: Message = {
        id: msg.id || `audio-${Date.now()}-${Math.random()}`,
        roomId: msg.roomId || currentRoom?.id || "",
        username: msg.username,
        content: msg.content || "[Audio message]",
        type: "audio",
        timestamp: msg.timestamp || new Date(msg.time || Date.now()).getTime(),
        audioData: msg.audio || msg.audioData,
        status: "delivered" as const, // Server message = delivered (double tick)
        tempId: msg.tempId,
      };
      
      setMessages((prev) => {
        // Check if message already exists by ID (dedupe)
        const existsById = prev.some(m => m.id === message.id);
        if (existsById) {
          if (import.meta.env.DEV) {
            console.log(`[AUDIO FLOW] Message already exists (dedupe) messageId=${message.id}`);
          }
          return prev;
        }
        
        // For optimistic messages: replace by tempId or by (user + timestamp ±2s)
        const optimisticIndex = prev.findIndex(m => {
          // Match by tempId if provided
          if (msg.tempId && (m.id === msg.tempId || m.tempId === msg.tempId)) return true;
          
          // Match by type + username + timestamp (within 2 seconds) for own messages
          if (isOwnMessage && m.type === "audio") {
            return m.id.startsWith("temp-audio-") &&
                   m.username === message.username &&
                   Math.abs(m.timestamp - message.timestamp) < 2000;
          }
          return false;
        });
        
        if (optimisticIndex >= 0) {
          // Replace optimistic message with server message - update status to delivered (double tick)
          if (import.meta.env.DEV) {
            console.log(`[AUDIO FLOW] replace optimistic tempId=${prev[optimisticIndex].tempId || prev[optimisticIndex].id} -> id=${message.id} status=sending→delivered`);
          }
          const updated = [...prev];
          updated[optimisticIndex] = { 
            ...message, 
            status: "delivered" as const // Double tick - broadcast confirmed
          };
          return updated;
        }
        
        // New message from other users - add it immediately with delivered status
        if (import.meta.env.DEV) {
          console.log(`[AUDIO FLOW] Adding new audio message messageId=${message.id} totalMessages=${prev.length + 1}`);
        }
        return [...prev, message];
      });
    });

    // Handle chat messages (text only - audio handled by audio_message listener above)
    // CRITICAL: This listener must be registered BEFORE any join_room emit
    newSocket.on("chat_message", (msg: any) => {
      // Skip audio messages here since they're handled by audio_message listener
      if (msg.type === "audio") {
        return;
      }
      const message: Message = {
        id: msg.id || `msg-${Date.now()}-${Math.random()}`,
        roomId: msg.roomId || currentRoom?.id || "",
        username: msg.username,
        content: msg.text || msg.content || "[Audio message]",
        type: msg.type || "text",
        timestamp: msg.timestamp || new Date(msg.time || Date.now()).getTime(),
        audioData: msg.audio || msg.audioData,
        status: "delivered" as const, // Server message = delivered
        tempId: msg.tempId,
      };
      
      // CRITICAL: Ensure message appears instantly for both sender and receiver
      // This is called for ALL clients in the room, including the sender
      log(`[MESSAGE FLOW] chat_message received messageId=${message.id} roomId=${message.roomId} username=${message.username} socket.id=${newSocket.id}`);
      
      const currentUserId = sessionStorage.getItem("userId");
      const isOwnMessage = currentUserId && msg.userId === currentUserId;
      
      setMessages((prev) => {
        // Check if message already exists by ID (most reliable)
        const existsById = prev.some(m => m.id === message.id);
        if (existsById) {
          log(`[MESSAGE FLOW] Message already exists (dedupe) messageId=${message.id}`);
          return prev;
        }
        
        // For optimistic messages: replace by tempId or by content + username + timestamp
        const optimisticIndex = prev.findIndex(m => {
          // Match by tempId if provided
          if (msg.tempId && (m.id === msg.tempId || m.tempId === msg.tempId)) return true;
          // Match by content + username + timestamp (within 2 seconds) for own messages
          return isOwnMessage &&
                 m.id.startsWith("temp-") &&
                 m.content === message.content &&
                 m.username === message.username &&
                 Math.abs(m.timestamp - message.timestamp) < 2000;
        });
        
        if (optimisticIndex >= 0) {
          // Replace optimistic message with server message - update status to delivered
          // This is the WhatsApp-like flow: sending → sent → delivered
          log(`[MESSAGE FLOW] Replacing optimistic message with server message messageId=${message.id} status=sent→delivered`);
          const updated = [...prev];
          // If it was "sent", now it's "delivered" (broadcast received)
          updated[optimisticIndex] = { 
            ...message, 
            status: "delivered" as const
          };
          return updated;
        }
        
        // New message from other users - add it immediately with delivered status
        log(`[MESSAGE FLOW] Adding new message messageId=${message.id} totalMessages=${prev.length + 1}`);
        return [...prev, message];
      });
    });
    
    // Handle loadMessages event from server
    newSocket.on("loadMessages", (messages: Message[]) => {
      const normalizedMessages: Message[] = messages.map((msg: any) => ({
        id: msg.id,
        roomId: msg.roomId || currentRoom?.id || "",
        username: msg.username,
        content: msg.content || msg.text || "",
        type: msg.type || "text",
        timestamp: msg.timestamp || new Date(msg.time || Date.now()).getTime(),
        audioData: msg.audioData || msg.audio,
      }));
      setMessages(normalizedMessages);
    });

    // Handle system messages
    newSocket.on("systemMessage", (msg: string | { type: string; message: string; username?: string; userId?: string; totalUsers?: number }) => {
      // Support both old string format and new object format
      const messageText = typeof msg === "string" ? msg : msg.message;
      const msgType = typeof msg === "object" ? msg.type : undefined;
      
      // Server now includes user count in the message itself (e.g., "user joined the room. (2 users)")
      // So we use the message as-is from the server
      const systemMessage: Message = {
        id: `system-${Date.now()}-${Math.random()}`,
        roomId: currentRoom?.id || "",
        username: typeof msg === "object" && msg.username ? msg.username : "System",
        content: messageText, // Use message as-is from server (already includes user count)
        type: "system",
        timestamp: Date.now(),
      };
      
      setMessages((prev) => {
        // For user_left messages, use a longer window and check userId to avoid duplicates
        if (msgType === "user_left" && typeof msg === "object" && msg.userId) {
          const exists = prev.some(m => 
            m.type === "system" && 
            m.username === systemMessage.username && // Check username for user_left
            m.content === systemMessage.content &&
            Math.abs(m.timestamp - systemMessage.timestamp) < 5000 // 5 second window for user_left
          );
          if (exists) return prev;
        } else {
          const exists = prev.some(m => 
            m.type === "system" && 
            m.content === systemMessage.content && 
            Math.abs(m.timestamp - systemMessage.timestamp) < 2000
          );
          if (exists) return prev;
        }
        return [...prev, systemMessage];
      });
      
      // Dispatch custom event for room page to show toast
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("system-message", { 
          detail: { type: msgType, message: messageText, username: systemMessage.username } 
        }));
      }
    });

    // Handle room_joined event - CRITICAL for UI activation
    // Must be registered before any join_room emit to ensure it's ready
    newSocket.on("room_joined", (payload: { roomId: string; userId: string; success: boolean; users: string[] }) => {
      const ts = new Date().toISOString();
      log(`[CLIENT] room_joined received socket.id=${newSocket.id} roomId=${payload.roomId} userId=${payload.userId} success=${payload.success} usersCount=${payload.users?.length || 0} ts=${ts}`);
      console.log(`[SOCKET TRACE] room_joined`, [{ success: payload.success, roomId: payload.roomId, usersCount: payload.users?.length || 0 }]);
      console.log("[CLIENT] room_joined received", payload);
      
      if (payload && payload.success) {
        // CRITICAL: Set joined state immediately - this activates the UI (FIXES disabled input box)
        joinedRef.current = true;
        setIsJoined(true);
        console.log(`✅ [CLIENT] Setting isJoined=true from room_joined event`);
        console.log(`[JOIN_ROOM_SUCCESS] Room joined successfully roomId=${payload.roomId} users=${payload.users?.length || 0}`);
        
        // Update current room with authoritative user list
        const roomId = payload.roomId;
        setCurrentRoom((prev) => {
          if (prev && prev.id === roomId) {
            const updated = { ...prev, users: payload.users || [] };
            console.log(`[CLIENT] Updated currentRoom users=${updated.users.length} roomId=${roomId}`);
            return updated;
          }
          // Create minimal room if it doesn't exist yet
          const newRoom = {
            id: roomId,
            name: prev?.name || "",
            ownerId: prev?.ownerId || "",
            ownerUsername: prev?.ownerUsername || "",
            users: payload.users || [],
            maxUsers: 35,
            createdAt: prev?.createdAt || Date.now(),
          } as Room;
          console.log(`[CLIENT] Created new currentRoom users=${newRoom.users.length} roomId=${roomId}`);
          return newRoom;
        });
        
        log(`✅ [Client] Room joined confirmed - UI activated roomId=${payload.roomId} username=${sessionStorage.getItem("username") || 'unknown'} onlineUsers=${payload.users?.length || 0}`);
      } else {
        log(`❌ [Client] Room joined failed roomId=${payload?.roomId || 'unknown'} userId=${payload?.userId || 'unknown'}`);
        setIsJoined(false);
        joinedRef.current = false;
      }
    });

    // Handle user joined/left events for presence tracking
    newSocket.on("user_joined", (data: { userId: string; username: string; roomId: string }) => {
      const ts = new Date().toISOString();
      log(`[PRESENCE] user_joined event userId=${data.userId} username=${data.username} room=${data.roomId} ts=${ts}`);
      
      // Request fresh onlineUsers from server to ensure accuracy
      const currentRoomId = sessionStorage.getItem("roomId");
      if (currentRoomId === data.roomId && newSocket.connected) {
        // Server will broadcast onlineUsers automatically, but we log it
        log(`[PRESENCE] User joined - waiting for server onlineUsers broadcast roomId=${data.roomId}`);
      }
    });
    
    // Handle user_left event - show "User left the chat" message
    newSocket.on("user_left", (data: { userId: string; roomId: string }) => {
      const ts = new Date().toISOString();
      const currentRoomId = sessionStorage.getItem("roomId");
      log(`[PRESENCE] user_left event userId=${data.userId} room=${data.roomId} ts=${ts}`);
      
      // Only process if it's for the current room
      if (currentRoomId === data.roomId) {
        console.log(`[PRESENCE] User left the chat - userId=${data.userId} room=${data.roomId}`);
        // Dispatch custom event for room page to show toast
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("user-left", { 
            detail: { userId: data.userId, roomId: data.roomId } 
          }));
        }
        // The systemMessage event will handle showing the "User left" message in chat
        // The onlineUsers event will refresh the user list
      }
    });
    
    // Handle online_users event (backward compatibility alias for onlineUsers)
    newSocket.on("online_users", (users: string[]) => {
      handleOnlineUsersUpdate(users, "online_users");
    });
    
    // Handle message acknowledgment - WhatsApp-like status updates
    newSocket.on("message_ack", (data: { tempId: string; delivered: boolean; messageId: string; timestamp: number }) => {
      const ackTimestamp = new Date(data.timestamp).toISOString();
      console.log(`[MESSAGE FLOW] ack received tempId=${data.tempId} delivered=${data.delivered} messageId=${data.messageId} ts=${ackTimestamp}`);
      
      if (data.delivered) {
        // WhatsApp-like status update: sending → sent (ack received) → delivered (broadcast received)
        setMessages((prev) => {
          let updated = false;
          const result = prev.map(msg => {
            // Match by tempId (server sends message.id as tempId in ack for audio)
            // For audio: match by tempId (which was updated to ack.id in send callback)
            const matches = msg.id === data.tempId || 
                           msg.tempId === data.tempId || 
                           msg.tempId === data.messageId ||
                           (msg.type === "audio" && msg.tempId === data.messageId);
            
            if (matches) {
              updated = true;
              // Update temp message with server ID and status "sent" (single tick)
              // Status will become "delivered" (double tick) when audio_message broadcast arrives
              if (import.meta.env.DEV && msg.type === "audio") {
                console.log(`[AUDIO FLOW] Status update: sending → sent (single tick) tempId=${data.tempId} messageId=${data.messageId}`);
              }
              return { 
                ...msg, 
                id: data.messageId,
                status: "sent" as const, // Single tick - waiting for broadcast
                tempId: data.messageId // Keep messageId as tempId for matching when broadcast arrives
              };
            }
            return msg;
          });
          
          if (!updated && import.meta.env.DEV) {
            console.warn(`[MESSAGE FLOW] message_ack received but no matching message found tempId=${data.tempId} messageId=${data.messageId}`);
          }
          
          return result;
        });
        log(`[MESSAGE FLOW] Message status updated: sending → sent tempId=${data.tempId} messageId=${data.messageId}`);
      }
    });

    // Handle online users updates - CRITICAL for WhatsApp-like behavior (FIXES "No users online" bug)
    // This reflects authoritative Redis state - always trust server over client state
    // Also handles: user_list_updated, online_users_updated (backward compatibility)
    const handleOnlineUsersUpdate = (users: string[], eventName: string = "onlineUsers") => {
      const ts = new Date().toISOString();
      const roomId = sessionStorage.getItem("roomId") || "";
      log(`[PRESENCE] Client received ${eventName} count=${users.length} roomId=${roomId} ts=${ts}`);
      console.log(`[SOCKET TRACE] ${eventName}`, [{ count: users.length, users }]);
      console.log(`[ONLINE_USERS] Count = ${users.length} roomId=${roomId} users=[${users.join(', ')}]`);
      
      // CRITICAL: Always update from server broadcast IMMEDIATELY - this is authoritative Redis state
      setCurrentRoom((prev) => {
        if (prev && prev.id === roomId) {
          // Update existing room with authoritative user list
          const updated = { ...prev, users: users };
          log(`[PRESENCE] Client updated onlineUsers count=${users.length} roomId=${prev.id} prevCount=${prev.users.length} ts=${ts}`);
          return updated;
        }
        // Create minimal room if it doesn't exist yet
        const minimalRoom = {
          id: roomId,
          name: prev?.name || "",
          ownerId: prev?.ownerId || "",
          ownerUsername: prev?.ownerUsername || "",
          users: users, // Authoritative list from server
          maxUsers: 35,
          createdAt: prev?.createdAt || Date.now(),
        };
        log(`[PRESENCE] Client created minimal room with onlineUsers count=${users.length} roomId=${roomId} ts=${ts}`);
        return minimalRoom;
      });
      
      // Validate: If we're joined but not in the list, something is wrong
      const userId = sessionStorage.getItem("userId");
      const username = sessionStorage.getItem("username");
      if (joinedRef.current && userId && username && !users.includes(username)) {
        console.warn(`⚠ [Client] Server did not include you in online list — possible sync issue joined=${joinedRef.current} userId=${userId} username=${username}`);
        // Don't force rejoin - just log the issue, server may be updating
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("user-not-in-online-list", { 
            detail: { username, users } 
          }));
        }
      }
    };
    
    // Primary handler for onlineUsers event
    newSocket.on("onlineUsers", (users: string[]) => {
      handleOnlineUsersUpdate(users, "onlineUsers");
    });
    
    // Backward compatibility handlers
    newSocket.on("online_users_updated", (data: { users?: string[]; count?: number }) => {
      const users = data.users || [];
      handleOnlineUsersUpdate(users, "online_users_updated");
    });
    
    newSocket.on("user_list_updated", (data: { users?: string[]; count?: number }) => {
      const users = data.users || [];
      handleOnlineUsersUpdate(users, "user_list_updated");
    });
    
    // WhatsApp-like typing indicators
    newSocket.on("user_typing", (data: { username: string; roomId: string; isTyping: boolean }) => {
      const currentRoomId = sessionStorage.getItem("roomId");
      if (data.roomId === currentRoomId) {
        setTypingUsers((prev) => {
          if (data.isTyping) {
            if (!prev.includes(data.username)) {
              return [...prev, data.username];
            }
            return prev;
          } else {
            return prev.filter(u => u !== data.username);
          }
        });
        
        // Auto-remove typing indicator after 3 seconds
        if (data.isTyping) {
          const existingTimeout = typingTimeoutRef.current.get(data.username);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }
          
          const timeout = setTimeout(() => {
            setTypingUsers((prev) => prev.filter(u => u !== data.username));
            typingTimeoutRef.current.delete(data.username);
          }, 3000);
          
          typingTimeoutRef.current.set(data.username, timeout);
        }
      }
    });

    // Handle room deleted (legacy event)
    newSocket.on("roomDeleted", () => {
      setCurrentRoom(null);
      setMessages([]);
      setIsJoined(false);
      joinedRef.current = false;
      
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("roomId");
        localStorage.removeItem("roomId");
        window.location.href = "/dashboard";
      }
    });
    
    // Handle room_closed event (random chat cleanup)
    newSocket.on("room_closed", (data: { reason?: string; roomId?: string }) => {
      console.log(`[ROOM_CLEANUP] Received room_closed event reason=${data.reason || 'unknown'} roomId=${data.roomId || 'unknown'}`);
      
      const currentRoomId = sessionStorage.getItem("roomId");
      // Only process if it's for the current room
      if (currentRoomId && (!data.roomId || currentRoomId === data.roomId)) {
        console.log(`[ROOM_CLEANUP] Processing room_closed for room=${data.roomId || currentRoomId}`);
        
        // Dispatch custom event for room page to show toast before redirect
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("room-closed", { 
            detail: { reason: data.reason || "not_enough_users", roomId: data.roomId || currentRoomId } 
          }));
        }
        
        setCurrentRoom(null);
        setMessages([]);
        setIsJoined(false);
        joinedRef.current = false;
        
        if (typeof window !== "undefined") {
          // Only remove roomId, keep username and userId so user stays logged in
          sessionStorage.removeItem("roomId");
          localStorage.removeItem("roomId");
          // Keep username and userId in sessionStorage for dashboard redirect
          const username = sessionStorage.getItem("username");
          const userId = sessionStorage.getItem("userId");
          console.log(`[ROOM_CLEANUP] Preserving session data - username=${!!username} userId=${!!userId}`);
          // Room page handler will handle the redirect via setLocation (better for React routing)
        }
      } else {
        console.log(`[ROOM_CLEANUP] Ignoring room_closed event - room mismatch currentRoomId=${currentRoomId} eventRoomId=${data.roomId}`);
      }
    });
    
    // Handle forceLogout from server (missing userId scenario)
    newSocket.on("forceLogout", (data: { reason?: string; message?: string }) => {
      console.log(`⚠ [Client] Force logout received reason=${data.reason || 'unknown'}`);
      setIsConnected(false);
      setIsJoined(false);
      joinedRef.current = false;
      
      if (typeof window !== "undefined") {
        // Clear all session data
        sessionStorage.clear();
        localStorage.clear();
        // Redirect to login
        window.location.href = "/";
      }
    });

    // Handle connection errors
    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      setIsConnected(false);
    });

    // CRITICAL: Handle reconnect event - auto-rebind and rejoin room (FIXES "reconnecting forever" bug)
    newSocket.on("reconnect", (attemptNumber: number) => {
      const userId = sessionStorage.getItem("userId");
      const roomId = sessionStorage.getItem("roomId");
      const isOnline = typeof navigator !== "undefined" && navigator.onLine;
      const ts = new Date().toISOString();
      
      log(`[SOCKET SYNC] Reconnect event socket.id=${newSocket.id} userId=${userId || 'null'} roomId=${roomId || 'null'} connected=${newSocket.connected} attempt=${attemptNumber} navigator.onLine=${isOnline} ts=${ts}`);
      console.log(`[SOCKET TRACE] reconnect`, [attemptNumber]);
      
      // Check for false reconnect (browser says online but we're reconnecting)
      if (isOnline && attemptNumber === 1) {
        console.warn(`[WARN:forced_reconnect] navigator.onLine=true but reconnect triggered socket.id=${newSocket.id} userId=${userId}`);
      }
      
      console.log(`✅ [Client] Reconnected ${newSocket.id} (attempt ${attemptNumber})`);
      setIsConnected(true);
      isBoundRef.current = false; // Reset binding flag on reconnect
      setIsJoined(false); // Reset joined state
      joinedRef.current = false;
      
      // CRITICAL: Re-bind userId via heartbeat_bind (same pattern as connect) - FIXES "reconnecting forever"
      if (userId) {
        log(`[SOCKET SYNC] Re-emitting heartbeat_bind after reconnect socket.id=${newSocket.id} userId=${userId} ts=${ts}`);
        console.log(`[RECONNECT] Re-binding userId via heartbeat_bind: ${userId}`);
        
        // Emit heartbeat_bind - server will respond with heartbeat_bound
        newSocket.emit("heartbeat_bind", { userId });
        
        // heartbeat_bound handler will automatically trigger join_room if roomId exists
        // No need for manual rejoin logic here - it's handled by heartbeat_bound handler
      }
    });

    newSocket.on("reconnect_failed", (data: { reason: string }) => {
      console.warn(`[SOCKET] Reconnect failed: ${data.reason}`);
      setIsConnected(false);
      
      if (newSocket) {
        newSocket.io.opts.reconnection = false;
      }
      
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("roomId");
        localStorage.removeItem("roomId");
        window.dispatchEvent(new CustomEvent("socket-reconnect-failed", { 
          detail: { reason: data.reason } 
        }));
      }
    });

    // Logout cleanup
    const handleLogoutCleanup = () => {
      if (newSocket) {
        const userId = sessionStorage.getItem("userId");
        log(`[SOCKET SYNC] Logout cleanup socket.id=${newSocket.id} userId=${userId || 'null'} connected=${newSocket.connected}`);
        // Only disconnect on explicit logout (not during login)
        // This handler is only called for explicit logout, not login
        newSocket.io.opts.reconnection = false;
        if (newSocket.connected) {
          log(`[SOCKET SYNC] Disconnecting socket for logout socket.id=${newSocket.id}`);
          newSocket.disconnect();
        }
      }
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('logout-cleanup', handleLogoutCleanup);
    }
    
    return () => {
      // CRITICAL: Only cleanup on unmount, not on every re-render
      // In dev mode (React Strict Mode), this runs twice - guard against it
      if (socketRef.current) {
        const socketToCleanup = socketRef.current;
        // Only cleanup if this is the last reference
        // Don't disconnect if socket is still in use
        if (!socketToCleanup.connected || socketToCleanup.listeners('connect').length === 0) {
          log(`[SOCKET SYNC] Cleaning up socket on unmount socket.id=${socketToCleanup.id}`);
          socketToCleanup.io.opts.reconnection = false;
          socketToCleanup.removeAllListeners();
          if (socketToCleanup.connected) {
            socketToCleanup.disconnect();
          }
          socketToCleanup.close();
          socketRef.current = null;
          initializedRef.current = false; // Reset guard to allow re-initialization if needed
        }
      }
      
      if (typeof window !== 'undefined') {
        window.removeEventListener('logout-cleanup', handleLogoutCleanup);
      }
    };
  }, []); // Empty deps - only run once per mount

  const joinRoom = useCallback((roomId: string, userId: string, retryCount: number = 0) => {
    const ts = new Date().toISOString();
    const maxRetries = 3;
    const baseDelay = 500; // Base delay in ms
    
    log(`[SOCKET SYNC] Join room start socket.id=${socketRef.current?.id || 'null'} roomId=${roomId} userId=${userId} connected=${socketRef.current?.connected || false} isBound=${isBoundRef.current} retryCount=${retryCount} ts=${ts}`);
    log(`📥 [Client] join start ${roomId}`);
    
    if (!socketRef.current || !socketRef.current.connected) {
      console.warn(`[SOCKET SYNC] Socket not connected - cannot join socket.id=${socketRef.current?.id || 'null'} connected=${socketRef.current?.connected || false} ts=${ts}`);
      console.warn("⚠ [Client] Socket not connected - cannot join");
      
      // Retry with exponential backoff if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`[JOIN_RETRY] Will retry join in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        setTimeout(() => {
          if (socketRef.current && socketRef.current.connected) {
            joinRoom(roomId, userId, retryCount + 1);
          }
        }, delay);
      }
      return;
    }
    
    // CRITICAL: Ensure userId is bound via heartbeat_bind before joining room
    if (!isBoundRef.current && userId) {
      log(`[SOCKET SYNC] Waiting for heartbeat binding before join socket.id=${socketRef.current.id} userId=${userId} - triggering heartbeat_bind`);
      console.log(`[JOIN_ROOM] Not bound yet - emitting heartbeat_bind first socket.id=${socketRef.current.id} roomId=${roomId}`);
      
      // Store pending join for heartbeat_bound handler
      (socketRef.current as any).__pendingJoin = { roomId, userId };
      
      // Emit heartbeat_bind - server will respond with heartbeat_bound event
      socketRef.current.emit("heartbeat_bind", { userId });
      console.log(`[JOIN_ROOM] heartbeat_bind emitted, waiting for heartbeat_bound event...`);
      
      // CRITICAL: Set a timeout to retry if heartbeat_bound doesn't arrive
      // This prevents infinite waiting
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        setTimeout(() => {
          // Check if binding completed in the meantime
          if (!isBoundRef.current && socketRef.current && socketRef.current.connected) {
            console.log(`[JOIN_RETRY] heartbeat_bound not received after ${delay}ms - retrying (attempt ${retryCount + 1}/${maxRetries})`);
            console.log(`[JOIN_RETRY] Current state: isBound=${isBoundRef.current} socket.connected=${socketRef.current.connected}`);
            joinRoom(roomId, userId, retryCount + 1);
          } else if (isBoundRef.current && socketRef.current && socketRef.current.connected) {
            // Binding completed - proceed with join immediately
            console.log(`[JOIN_RETRY] Binding completed during wait - proceeding with join`);
            joinRoom(roomId, userId, 0); // Reset retry count since we're bound now
          }
        }, delay);
      } else {
        console.error(`[JOIN_ROOM] Max retries reached waiting for heartbeat_bind - join may fail`);
      }
      return; // CRITICAL: Do not proceed until isBoundRef is true
    }
    
    // If userId is provided but still not bound, log warning and try heartbeat_bind
    if (userId && !isBoundRef.current) {
      console.warn(`[SOCKET SYNC] WARNING: Attempting join without binding userId=${userId} isBound=${isBoundRef.current} - emitting heartbeat_bind`);
      (socketRef.current as any).__pendingJoin = { roomId, userId };
      socketRef.current.emit("heartbeat_bind", { userId });
      return;
    }
    
    // Clear pending join since we're proceeding
    if ((socketRef.current as any).__pendingJoin) {
      delete (socketRef.current as any).__pendingJoin;
    }
    
    // CRITICAL: Update sessionStorage (roomId should already be set by room.tsx, but ensure it)
    sessionStorage.setItem("roomId", roomId);
    sessionStorage.setItem("userId", userId);
    
    // Immediately set joining state - show spinner in chat area
    setIsJoined(false);
    joinedRef.current = false;
    console.log(`[CLIENT] Setting isJoined=false before emitting join_room`);
    console.log(`[JOIN_ROOM_STATE] Before emit: socket.connected=${socketRef.current.connected} isBound=${isBoundRef.current} roomId=${roomId} userId=${userId}`);
    
    log(`[PRESENCE] join user=${userId} room=${roomId} socket=${socketRef.current.id} ts=${ts}`);
    log(`[SOCKET SYNC] Emitting join_room socket.id=${socketRef.current.id} roomId=${roomId} userId=${userId} ts=${ts}`);
    console.log(`[JOIN_ROOM] Emitting join_room with roomId=${roomId}, userId=${userId}`);
    console.log(`[SOCKET TRACE] join_room`, [{ roomId, userId }]);
    console.log(`[CLIENT] Emitting join_room event`, { roomId, userId, socketId: socketRef.current.id, connected: socketRef.current.connected });
    
    // Use acked emit - NOTE: UI activation happens via room_joined event, not ack
    socketRef.current.emit("join_room", { roomId, userId }, (ack: { ok: boolean; messages?: Message[]; reason?: string }) => {
      console.log(`[JOIN_ROOM_ACK] Received from server ok=${ack?.ok} reason=${ack?.reason || 'none'}`);
      console.log(`[SOCKET TRACE] join_room_ack`, [ack]);
      console.log(`[CLIENT] join_room ack received`, ack);
      if (!ack?.ok) {
        log(`❌ [Client] join fail ${ack?.reason || 'unknown'}`);
        setIsJoined(false);
        joinedRef.current = false;
        console.log(`[CLIENT] Setting isJoined=false due to ack failure`);
        
        // If join failed with user_not_found or room_not_found, show clear UI dialog
        if (ack?.reason === "user_not_found" || ack?.reason === "room_not_found") {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("join-failed", { 
              detail: { reason: ack.reason, roomId } 
            }));
          }
        }
        return;
      }
      
      // Ack received - but DO NOT enable UI here
      // UI will be enabled when room_joined event arrives from server
      log(`[SOCKET SYNC] Join room ack received socket.id=${socketRef.current?.id || 'null'} roomId=${roomId} userId=${userId} - waiting for room_joined event`);
      console.log(`[CLIENT] Join ack ok=true, waiting for room_joined event...`);
      
      // Reset rejoin attempts on successful ack
      sessionStorage.removeItem("rejoinAttempts");
      
      // Set messages from ack if provided - normalize format
      if (ack.messages && ack.messages.length > 0) {
        const normalizedMessages: Message[] = ack.messages.map((msg: any) => ({
          id: msg.id,
          roomId: msg.roomId || roomId,
          username: msg.username,
          content: msg.content || msg.text || "",
          type: msg.type || "text",
          timestamp: msg.timestamp || new Date(msg.time || Date.now()).getTime(),
          audioData: msg.audioData || msg.audio,
        }));
        setMessages(normalizedMessages);
      }
      
      // Flush any pending messages that were buffered before join
      // Note: We can't call sendMessage/sendAudioBase64 here due to circular dependency
      // Instead, the messages will be sent when user triggers send again
      // The pending queue is already shown in UI as queued
      if (pendingMessagesRef.current.length > 0) {
        log(`[SOCKET SYNC] ${pendingMessagesRef.current.length} messages queued before join - will send on next user action socket.id=${socketRef.current?.id} roomId=${roomId}`);
      }
      
      // Note: isJoined will be set to true by room_joined event handler above
    });
  }, []); // Functions reference refs which don't need dependencies

  const leaveRoom = useCallback((roomId: string, userId: string) => {
    if (socketRef.current) {
      setIsJoined(false);
      joinedRef.current = false;
      socketRef.current.emit("leave_room", { roomId, userId }, (ack: { ok: boolean; reason?: string }) => {
        if (ack?.ok) {
          console.log("%c✅ [Client] Left room", "color:green");
        }
      });
    }
  }, []); // socketRef is a ref, doesn't need dependencies

  const sendMessage = useCallback((text: string) => {
    const currentSocket = socketRef.current; // Avoid shadowing 'socket' from outer scope
    const userId = sessionStorage.getItem("userId");
    const roomId = sessionStorage.getItem("roomId");
    const username = sessionStorage.getItem("username") || "You";
    
    log(`[SOCKET SYNC] Send message socket.id=${currentSocket?.id || 'null'} userId=${userId || 'null'} roomId=${roomId || 'null'} joined=${joinedRef.current} connected=${currentSocket?.connected || false}`);
    
    if (!roomId || !userId) {
      console.warn("❌ [Client] Not in room");
      return;
    }
    
    // If not joined, push to pendingQueue and show as queued (grayed)
    if (!joinedRef.current) {
      log(`⚠ [Client] Not joined yet — queuing message`);
      pendingMessagesRef.current.push({ text });
      
      // Show message in UI as queued (grayed)
      const queuedMessage: Message = {
        id: `temp-queued-${Date.now()}-${Math.random()}`,
        roomId,
        username,
        content: text,
        type: "text",
        timestamp: Date.now(),
      };
      
      setMessages((prev) => {
        const exists = prev.some(m => m.id === queuedMessage.id);
        if (exists) return prev;
        return [...prev, queuedMessage];
      });
      return;
    }
    
    if (!currentSocket) return;
    
    // Generate temp ID for optimistic message
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    
    // WhatsApp-style optimistic update: Show message instantly with "sending" status
    const optimisticMessage: Message = {
      id: tempId,
      roomId,
      username,
      content: text,
      type: "text",
      timestamp: Date.now(),
      status: "sending" as const,
      tempId: tempId, // Track for replacement with server message
    };
    
    setMessages((prev) => {
      // Check if already added
      const exists = prev.some(m => m.id === tempId || m.tempId === tempId);
      if (exists) return prev;
      log(`[MESSAGE FLOW] Adding optimistic message tempId=${tempId} status=sending`);
      return [...prev, optimisticMessage];
    });
    
    // Stop typing indicator when message is sent
    setTyping(false);
    
    // Send with ack - WhatsApp-like delivery confirmation
    currentSocket.timeout(3000).emit("send_message", { roomId, userId, text, messageTempId: tempId }, (err: Error | null, ack: { ok: boolean; id?: string; reason?: string }) => {
      if (err || !ack?.ok) {
        log(`⚠ [Client] send failed ${ack?.reason || err?.message} - keeping as sending`);
        // Keep message with "sending" status - will be updated when message_ack arrives
        // Don't mark as failed yet - might just be network delay
        pendingMessagesRef.current.push({ text });
      } else {
        log(`💬 [Client] send ack ok ${ack.id} - waiting for message_ack event`);
        // Server will emit message_ack which will update status to "sent"
        // Then chat_message broadcast will update to "delivered"
      }
    });
  }, []); // Refs don't need to be in dependencies

  const sendAudioBase64 = useCallback((audioBase64: string) => {
    const roomId = sessionStorage.getItem("roomId");
    const userId = sessionStorage.getItem("userId");
    const username = sessionStorage.getItem("username") || "You";
    
    console.log("%c[DEBUG]", "color:purple", "sendAudioBase64", { roomId, userId });
    
    if (!roomId || !userId) {
      console.warn("%c❌ [Client] Not in room", "color:red");
      return;
    }
    
    if (!joinedRef.current) {
      console.warn("%c⚠ [Client] Not joined yet — queuing audio", "color:orange");
      pendingMessagesRef.current.push({ audioBase64 });
      
      // Show optimistic audio message as "sending"
      const tempId = `temp-audio-${Date.now()}-${Math.random()}`;
      const tempMessage: Message = {
        id: tempId,
        roomId: roomId || "",
        username: username,
        content: "[Audio message]",
        type: "audio",
        timestamp: Date.now(),
        audioData: audioBase64,
        status: "sending",
        tempId: tempId,
      };
      setMessages((prev) => [...prev, tempMessage]);
      return;
    }
    
    if (!socketRef.current) return;
    
    // OPTIMISTIC UPDATE for audio - show immediately with "sending" status (single tick)
    const tempId = `temp-audio-${Date.now()}-${Math.random()}`;
    const sendTimestamp = new Date().toISOString();
    
    if (import.meta.env.DEV) {
      console.log(`[AUDIO FLOW] send user=${userId || 'unknown'} room=${roomId || 'unknown'} tempId=${tempId} ts=${sendTimestamp}`);
    }
    
    const optimisticMessage: Message = {
      id: tempId,
      roomId,
      username,
      content: "[Audio message]",
      type: "audio",
      timestamp: Date.now(),
      audioData: audioBase64,
      status: "sending" as const, // Single tick - sending
      tempId: tempId, // Track for replacement
    };
    
    setMessages((prev) => {
      const exists = prev.some(m => m.id === tempId || m.tempId === tempId);
      if (exists) return prev;
      if (import.meta.env.DEV) {
        console.log(`[AUDIO FLOW] Added optimistic audio message tempId=${tempId} status=sending`);
      }
      return [...prev, optimisticMessage];
    });
    
    socketRef.current.timeout(5000).emit("send_audio", { roomId, userId, audioBase64 }, (err: Error | null, ack: { ok: boolean; id?: string; reason?: string }) => {
      if (err || !ack?.ok) {
        if (import.meta.env.DEV) {
          console.warn(`[AUDIO FLOW] send failed user=${userId} room=${roomId} reason=${ack?.reason || err?.message}`);
        }
        console.warn("%c⚠ [Client] Audio send failed", "color:orange", ack?.reason || err?.message);
        setMessages((prev) => prev.filter(m => m.id !== tempId && m.tempId !== tempId));
        pendingMessagesRef.current.push({ audioBase64 });
      } else {
        if (import.meta.env.DEV) {
          console.log(`[AUDIO FLOW] send ack ok user=${userId} room=${roomId} messageId=${ack.id} - waiting for audio_message broadcast`);
        }
        console.log("%c✅ [Client] Audio delivered", "color:green", ack.id);
        // Update tempId to messageId so message_ack can find it
        setMessages((prev) => {
          return prev.map(m => {
            if (m.id === tempId || m.tempId === tempId) {
              return { ...m, tempId: ack.id || tempId };
            }
            return m;
          });
        });
        // Message_ack will update status to "sent", then audio_message broadcast will update to "delivered"
      }
    });
  }, []); // Refs don't need to be in dependencies
  
  const sendAudio = useCallback((roomId: string, username: string, audioData: string) => {
    sendAudioBase64(audioData);
  }, [sendAudioBase64]);

  // Memoize the context value to prevent unnecessary re-renders
  // Include all functions in dependencies since they're now wrapped in useCallback
  // WhatsApp-like typing indicator function
  const setTyping = useCallback((isTyping: boolean) => {
    if (!socketRef.current || !joinedRef.current) return;
    
    const roomId = sessionStorage.getItem("roomId");
    const username = sessionStorage.getItem("username");
    
    if (roomId && username) {
      socketRef.current.emit("typing", { roomId, username, isTyping });
      log(`[TYPING] ${isTyping ? 'Started' : 'Stopped'} typing roomId=${roomId} username=${username}`);
    }
  }, []);

  const value = useMemo(() => ({
    socket,
    isConnected,
    isJoined, // Export joined state
    joinRoom,
    leaveRoom,
    sendMessage,
    sendAudio,
    sendAudioBase64,
    currentRoom,
    messages,
    setMessages, // Expose setMessages for clearing messages on room switch
    typingUsers, // WhatsApp-like typing indicators
    setTyping,
  }), [socket, isConnected, isJoined, joinRoom, leaveRoom, sendMessage, sendAudio, sendAudioBase64, currentRoom, messages, setMessages, typingUsers, setTyping]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

// Note: This hook export causes Vite Fast Refresh issues, but @refresh reload handles it
export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
