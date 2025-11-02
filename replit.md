# Ephemeral Chat - Privacy-Focused Messaging Platform

## Project Overview
A secure, privacy-first ephemeral chat web application that provides temporary rooms, real-time messaging, and file sharing with complete auto-deletion. No chat history, no user tracking, and zero data retention.

## Current Status
**Phase**: Frontend Complete, Backend In Progress

**Last Updated**: November 2, 2025

## Tech Stack

### Frontend
- React 18 with TypeScript
- TailwindCSS for styling
- Socket.IO client for real-time messaging
- Wouter for client-side routing
- Shadcn UI component library
- Web Audio API for sound effects

### Backend
- Node.js with Express
- Socket.IO for WebSocket communication
- Redis (ioredis) for temporary data storage with TTL
- AWS S3 for temporary file storage with pre-signed URLs
- Helmet.js for security headers
- CORS middleware

### Security
- HTTPS enforcement
- No-cache headers
- Helmet.js security policies
- Auto-deletion on window close/refresh
- 1-hour TTL on all data

## Project Structure

```
/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/ (Shadcn components)
│   │   │   └── theme-toggle.tsx
│   │   ├── lib/
│   │   │   ├── queryClient.ts
│   │   │   ├── theme.tsx (Theme provider)
│   │   │   └── sounds.ts (Sound effects system)
│   │   ├── pages/
│   │   │   ├── login.tsx (Username-only authentication)
│   │   │   ├── dashboard.tsx (Create/join rooms, random chat)
│   │   │   ├── room.tsx (Chat room with messages and users)
│   │   │   ├── help.tsx (Documentation)
│   │   │   └── about.tsx (About and privacy policy)
│   │   ├── App.tsx (Main app with routing)
│   │   └── index.css (TailwindCSS + custom utilities)
│   └── index.html
├── server/
│   ├── routes.ts (API endpoints and Socket.IO setup)
│   ├── storage.ts (Redis storage interface)
│   └── index.ts
├── shared/
│   └── schema.ts (TypeScript types and Zod schemas)
├── design_guidelines.md (Design system documentation)
└── replit.md (This file)
```

## Data Models

### User
```typescript
{
  id: string;
  username: string (2-20 chars);
  socketId?: string;
}
```

### Room
```typescript
{
  id: string;
  name: string (1-50 chars);
  ownerId: string;
  ownerUsername: string;
  users: string[]; // Array of usernames
  maxUsers: number (default: 35);
  createdAt: number; // Unix timestamp
}
```

### Message
```typescript
{
  id: string;
  roomId: string;
  username: string;
  content: string (1-5000 chars);
  timestamp: number;
  type: "text" | "system" | "file";
}
```

### FileMetadata
```typescript
{
  id: string;
  roomId: string;
  uploadedBy: string;
  filename: string;
  fileSize: number (max: 90MB);
  fileType: string;
  s3Key: string;
  uploadedAt: number;
  expiresAt: number;
}
```

## Core Features

### Authentication
- Username-only login (no passwords)
- Duplicate username prevention
- Auto-redirect to room if joining via link (?room=abc123)

### Rooms
- Create private rooms with unique IDs
- Join rooms via code or shareable link
- Max 35 users per room
- Owner designation with badge
- Real-time join/leave notifications

### Messaging
- Real-time text messaging via Socket.IO
- Message bubbles with sender info
- Timestamps on all messages
- System messages for join/leave events
- Smooth scroll to latest message

### File Sharing (Planned)
- Upload files up to 90MB
- Chunked upload to AWS S3 (5MB chunks)
- Pre-signed URLs for security
- Permission-based sharing (recipient must accept)
- View-only (no downloads)
- Auto-delete after 1 hour

### Random Chat (Planned)
- Match random online users
- Create temporary 1:1 room
- Queue-based matching system

### UI/UX Features
- Dark/light theme toggle
- Sound effects for interactions:
  - Click sounds for buttons
  - Send/receive message tones
  - Join/leave notification sounds
- Toast notifications for errors and updates
- Countdown timer showing time until deletion
- Responsive design (mobile & desktop)

### Privacy & Security
- All data in Redis with 1-hour TTL
- No persistent storage or databases
- Auto-deletion on logout/window close
- No-cache headers on all responses
- HTTPS enforcement
- Screenshot overlay protection (frontend)

## API Endpoints (To Be Implemented)

### Authentication
- `POST /api/auth/login` - Username-only login

### Rooms
- `POST /api/rooms/create` - Create new room
- `GET /api/rooms/:id` - Get room details
- `POST /api/rooms/:id/join` - Join existing room

### Random Chat
- `POST /api/random-chat/request` - Request random match

### File Upload
- `POST /api/files/request-upload` - Get pre-signed URLs
- `POST /api/files/notify-complete` - Notify upload completion

## Socket.IO Events (To Be Implemented)

### Client → Server
- `join_room` - Join a chat room
- `leave_room` - Leave a chat room
- `send_message` - Send a message
- `file_request` - Request to share a file
- `random_chat_request` - Request random chat match

### Server → Client
- `user_joined` - Someone joined the room
- `user_left` - Someone left the room
- `new_message` - New message received
- `file_request_received` - File share permission request
- `random_chat_matched` - Matched with random user

## Environment Variables Required

```bash
# Redis (Required for temporary storage)
REDIS_URL=redis://...

# AWS S3 (Required for file sharing)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_BUCKET_NAME=...
AWS_REGION=us-east-1

# Session (Auto-generated)
SESSION_SECRET=...
```

## Redis Key Structure

```
user:{userId} -> User object (TTL: 1 hour)
username:{username} -> userId (TTL: 1 hour)
room:{roomId} -> Room object (TTL: 1 hour)
messages:{roomId} -> List of messages (TTL: 1 hour)
random_chat_queue -> Set of userIds waiting for match (TTL: 5 min)
```

## User Preferences
- Theme preference stored only in session (not persisted)
- Sound effects enabled by default

## Recent Changes
- November 2, 2025: Initial frontend implementation complete
  - All pages built with Shadcn UI
  - Theme system implemented
  - Sound effects system created
  - Responsive layouts for all pages
  - Design guidelines established

## Next Steps
1. Install backend packages (socket.io, ioredis, aws-sdk, helmet, uuid)
2. Implement Socket.IO server for real-time messaging
3. Create Redis client with TTL management
4. Build API endpoints for auth and room management
5. Implement file upload with S3 pre-signed URLs
6. Add random chat matching logic
7. Connect frontend to backend
8. Test all user journeys
9. Deploy to production

## Known Limitations
- Screenshot protection is frontend-only (not bulletproof)
- Browser close detection has limitations across browsers
- File viewing may vary by browser support
- S3 lifecycle policy must be configured manually
