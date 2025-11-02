import { createContext, useContext, useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { Message, Room } from "@shared/schema";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinRoom: (roomId: string, userId: string) => void;
  leaveRoom: (roomId: string, userId: string) => void;
  sendMessage: (roomId: string, username: string, content: string) => void;
  currentRoom: Room | null;
  messages: Message[];
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize Socket.IO client
    const newSocket = io({
      transports: ["websocket", "polling"],
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("✓ Connected to server");
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("✗ Disconnected from server");
      setIsConnected(false);
    });

    newSocket.on("room_history", (data: { room: Room; messages: Message[] }) => {
      setCurrentRoom(data.room);
      setMessages(data.messages);
    });

    newSocket.on("user_joined", (data: { username: string; room: Room; message: Message }) => {
      setCurrentRoom(data.room);
      setMessages((prev) => [...prev, data.message]);
    });

    newSocket.on("user_left", (data: { username: string; room: Room; message: Message }) => {
      setCurrentRoom(data.room);
      setMessages((prev) => [...prev, data.message]);
    });

    newSocket.on("new_message", (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    newSocket.on("error", (data: { message: string }) => {
      console.error("Socket error:", data.message);
    });

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  const joinRoom = (roomId: string, userId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("join_room", { roomId, userId });
    }
  };

  const leaveRoom = (roomId: string, userId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("leave_room", { roomId, userId });
    }
  };

  const sendMessage = (roomId: string, username: string, content: string) => {
    if (socketRef.current) {
      socketRef.current.emit("send_message", {
        roomId,
        username,
        content,
        type: "text",
      });
    }
  };

  const value = {
    socket,
    isConnected,
    joinRoom,
    leaveRoom,
    sendMessage,
    currentRoom,
    messages,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};
