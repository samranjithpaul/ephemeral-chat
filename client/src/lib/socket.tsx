import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useLocation } from "wouter";
import type { Message, Room } from "@shared/schema";

type PublicRoom = Omit<Room, "ownerId">;
type JoinResult = { ok: true; room: PublicRoom; messages: Message[] } | { ok: false; reason: string };

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isBound: boolean;
  sessionExpired: boolean;
  joinedRoomId: string | null;
  joinRoom: (roomId: string, userId: string) => Promise<JoinResult>;
  leaveRoom: (roomId: string, userId: string) => void;
  sendMessage: (text: string) => void;
  sendAudioBase64: (audioBase64: string) => void;
  currentRoom: PublicRoom | null;
  messages: Message[];
  typingUsers: string[];
  setTyping: (isTyping: boolean) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

function addMessage(messages: Message[], message: Message): Message[] {
  if (messages.some(existing => existing.id === message.id)) return messages;
  const optimistic = messages.findIndex(existing => existing.id === message.tempId);
  if (optimistic < 0) return [...messages, message];

  return messages.map((existing, index) => index === optimistic
    ? { ...message, status: "sent" }
    : existing);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isBound, setIsBound] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<PublicRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const requestedRoom = useRef<string | null>(null);
  const joinedRoom = useRef<string | null>(null);
  const onlineUsers = useRef<string[] | null>(null);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTyping = useCallback(() => {
    for (const timer of Array.from(typingTimers.current.values())) clearTimeout(timer);
    typingTimers.current.clear();
    setTypingUsers([]);
  }, []);

  useEffect(() => {
    const connection = io({ autoConnect: false });
    socketRef.current = connection;
    setSocket(connection);

    connection.on("connect", () => {
      setIsConnected(true);
      const userId = sessionStorage.getItem("userId");
      const connectionId = connection.id;
      if (!userId) return;
      connection.timeout(5000).emit("heartbeat_bind", { userId }, (error: Error | null, ack?: { ok: boolean; reason?: string }) => {
        if (!connection.connected || connection.id !== connectionId) return;
        setIsBound(!error && !!ack?.ok);
        setSessionExpired(ack?.reason === "user_not_found");
      });
    });
    connection.on("disconnect", () => {
      setIsConnected(false);
      setIsBound(false);
      joinedRoom.current = null;
      setJoinedRoomId(null);
      clearTyping();
    });
    connection.on("onlineUsers", (users: string[], roomId: string) => {
      if (roomId !== requestedRoom.current) return;
      onlineUsers.current = users;
      setCurrentRoom(room => room?.id === roomId ? { ...room, users } : room);
    });
    connection.on("chat_message", (message: Message) => {
      if (message.roomId === requestedRoom.current) {
        setMessages(previous => addMessage(previous, message));
      }
    });
    connection.on("systemMessage", (event: { roomId: string; username: string; message: string }) => {
      if (event.roomId !== requestedRoom.current) return;
      setMessages(previous => [...previous, {
        id: crypto.randomUUID(), roomId: event.roomId, username: event.username,
        type: "system", content: event.message, timestamp: Date.now(),
      }]);
    });
    connection.on("user_typing", ({ roomId, username, isTyping }: {
      roomId: string; username: string; isTyping: boolean;
    }) => {
      if (roomId !== requestedRoom.current) return;
      clearTimeout(typingTimers.current.get(username));
      const remove = () => {
        setTypingUsers(previous => previous.filter(user => user !== username));
        typingTimers.current.delete(username);
      };
      if (isTyping) {
        setTypingUsers(previous => previous.includes(username) ? previous : [...previous, username]);
        typingTimers.current.set(username, setTimeout(remove, 3000));
      } else {
        remove();
      }
    });
    connection.on("room_closed", (event: { roomId: string; reason: string }) => {
      if (event.roomId !== requestedRoom.current) return;
      requestedRoom.current = null;
      joinedRoom.current = null;
      setJoinedRoomId(null);
      setCurrentRoom(null);
      setMessages([]);
      clearTyping();
      window.dispatchEvent(new CustomEvent("room-closed", { detail: event }));
    });

    return () => {
      connection.removeAllListeners();
      connection.disconnect();
      socketRef.current = null;
      clearTyping();
    };
  }, [clearTyping]);

  const sessionUserId = sessionStorage.getItem("userId");
  useEffect(() => {
    if (!socket) return;
    if (sessionUserId) socket.connect();
    else {
      socket.disconnect();
      setSessionExpired(false);
    }
  }, [sessionUserId, socket, location]);

  const joinRoom = useCallback(async (roomId: string, userId: string): Promise<JoinResult> => {
    const connection = socketRef.current;
    if (!connection?.connected) return { ok: false, reason: "disconnected" };
    requestedRoom.current = roomId;
    onlineUsers.current = null;
    const connectionId = connection.id;
    try {
      const result: JoinResult = await connection.timeout(10000).emitWithAck("join_room", { roomId, userId });
      if (requestedRoom.current !== roomId || connection.id !== connectionId) {
        return { ok: false, reason: "disconnected" };
      }
      if (result.ok) {
        joinedRoom.current = roomId;
        setIsBound(true);
        setJoinedRoomId(roomId);
        setCurrentRoom({ ...result.room, users: onlineUsers.current ?? result.room.users });
        setMessages(previous => previous.reduce(addMessage, result.messages));
      }
      return result;
    } catch {
      return { ok: false, reason: "timeout" };
    }
  }, []);

  const leaveRoom = useCallback((roomId: string, userId: string) => {
    if (requestedRoom.current !== roomId) return;
    requestedRoom.current = null;
    joinedRoom.current = null;
    setJoinedRoomId(null);
    onlineUsers.current = null;
    const connection = socketRef.current;
    if (connection?.connected) connection.emit("leave_room", { roomId, userId });
    setCurrentRoom(null);
    setMessages([]);
    clearTyping();
  }, [clearTyping]);

  const setTyping = useCallback((isTyping: boolean) => {
    const roomId = joinedRoom.current;
    const username = sessionStorage.getItem("username");
    if (roomId && username) socketRef.current?.volatile.emit("typing", { roomId, username, isTyping });
  }, []);

  function send(type: "text" | "audio", content: string) {
    const connection = socketRef.current;
    const roomId = joinedRoom.current;
    const userId = sessionStorage.getItem("userId");
    const username = sessionStorage.getItem("username");
    if (!connection?.connected || !roomId || !userId || !username) {
      throw new Error("Connect to the room before sending.");
    }

    const id = crypto.randomUUID();
    const message: Message = {
      id, roomId, username, type, timestamp: Date.now(), status: "sending",
      content: type === "text" ? content : "[Audio message]",
      ...(type === "audio" && { audioData: content }),
    };
    setMessages(previous => [...previous, message]);
    setTyping(false);
    const payload = type === "text" ? { text: content } : { audioBase64: content };
    connection.timeout(10000).emit(
      type === "text" ? "send_message" : "send_audio",
      { ...payload, roomId, userId, messageTempId: id },
      (error: Error | null, ack?: { ok: boolean }) => {
        if (error || !ack?.ok) {
          setMessages(previous => previous.map(entry => entry.id === id ? { ...entry, status: "failed" } : entry));
        }
      },
    );
  }

  return (
    <SocketContext.Provider value={{
      socket, isConnected, isBound, sessionExpired, joinedRoomId, joinRoom, leaveRoom, currentRoom, messages, typingUsers, setTyping,
      sendMessage: text => send("text", text),
      sendAudioBase64: audio => send("audio", audio),
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error("useSocket must be used within a SocketProvider");
  return context;
}
