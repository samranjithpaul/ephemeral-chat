# Ephemeral Chat

A secure, privacy-first messaging platform with temporary rooms, real-time messaging, and auto-deletion. No accounts, no history, no tracking.

## Features

- **Privacy-First**: All data auto-deletes after 1 hour
- **No Tracking**: No chat history or user analytics
- **Real-Time Messaging**: Socket.IO-powered instant messaging
- **Temporary Rooms**: Create or join rooms with unique codes
- **Random Chat**: Get matched with other online users for private conversations
- **File Sharing**: Share images, videos, and documents (up to 90 MB)
- **Mobile Responsive**: Works seamlessly on desktop and mobile devices

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

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Redis server (local or remote)
- AWS S3 bucket (for file sharing)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/samranjithpaul/ephemeral-chat.git
cd ephemeral-chat
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```env
REDIS_URL=redis://localhost:6379
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
AWS_S3_BUCKET=your_bucket_name
```

4. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173` (client) and `http://localhost:8080` (server).

## Usage

1. **Login**: Enter a username (no password required)
2. **Create Room**: Enter a room name and optionally a custom room code
3. **Join Room**: Enter a room code to join an existing room
4. **Random Chat**: Click "Random Chat" to be matched with another user
5. **Chat**: Send messages, share files, and communicate in real-time
6. **Auto-Deletion**: All data automatically expires after 1 hour

## Security

- HTTPS enforcement
- No-cache headers
- Helmet.js security policies
- Auto-deletion on window close/refresh
- 1-hour TTL on all data
- No persistent storage

## Development

### Scripts

- `npm run dev` - Start development server (client + server)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run test` - Run tests
- `npm run check` - TypeScript type checking

### Testing

```bash
npm run test
```

## License

MIT

## Author

**Sam Ranjith Paul**

- GitHub: [@samranjithpaul](https://github.com/samranjithpaul)
- LinkedIn: [Sam Ranjith Paul](https://www.linkedin.com/in/Samranjithpaul/)
- Email: samranjithpaul71@gmail.com

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

© 2025 Ephemeral Chat · Built by Sam Ranjith Paul

