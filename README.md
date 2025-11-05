<div align="center">

# 💬 Ephemeral Chat

### 🔒 Secure • 🚀 Private • ⏱️ Temporary

**A privacy-first messaging platform with real-time chat, temporary rooms, and automatic data deletion.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socket.io&logoColor=white)](https://socket.io/)

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

---

</div>

## 📋 Table of Contents

- [✨ Features](#-features)
- [🎯 Why Ephemeral Chat?](#-why-ephemeral-chat)
- [🖼️ Preview](#️-preview)
- [🚀 Quick Start](#-quick-start)
- [📦 Installation](#-installation)
- [⚙️ Configuration](#️-configuration)
- [💻 Usage Guide](#-usage-guide)
- [🏗️ Architecture](#️-architecture)
- [🛠️ Tech Stack](#️-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🔐 Security & Privacy](#-security--privacy)
- [🧪 Testing](#-testing)
- [🤝 Contributing](#-contributing)
- [📝 License](#-license)
- [👨‍💻 Author](#-author)

---

## ✨ Features

### 🔐 Privacy & Security
- ✅ **Zero Data Retention** - All data auto-deletes after 1 hour
- ✅ **No Tracking** - No chat history or user analytics
- ✅ **No Accounts** - Username-only authentication (no passwords)
- ✅ **HTTPS Enforcement** - Secure connections only
- ✅ **Auto-Deletion** - Messages disappear automatically

### 💬 Chat Features
- ✅ **Real-Time Messaging** - Instant message delivery via Socket.IO
- ✅ **Temporary Rooms** - Create or join rooms with unique codes
- ✅ **Random Chat** - Get matched with other online users automatically
- ✅ **Audio Messages** - Record and send voice messages
- ✅ **User Presence** - See who's online in real-time
- ✅ **System Notifications** - Join/leave announcements

### 🎨 User Experience
- ✅ **Dark/Light Theme** - Toggle between themes
- ✅ **Mobile Responsive** - Works seamlessly on all devices
- ✅ **Sound Effects** - Audio feedback for interactions
- ✅ **Toast Notifications** - Real-time status updates
- ✅ **Smooth Animations** - Polished UI interactions

### 🔧 Technical Features
- ✅ **TypeScript** - Full type safety
- ✅ **Redis Storage** - Temporary data with TTL
- ✅ **WebSocket** - Real-time bidirectional communication
- ✅ **Modern UI** - Built with Shadcn UI components
- ✅ **Responsive Design** - Mobile-first approach

---

## 🎯 Why Ephemeral Chat?

### 🛡️ Privacy-First Design

Ephemeral Chat is built with **privacy as the core principle**. Unlike traditional messaging apps that store your conversations indefinitely, Ephemeral Chat ensures:

- **No Permanent Storage** - Everything is temporary
- **No User Tracking** - Your activity is never logged
- **No Data Collection** - Zero analytics or monitoring
- **Automatic Cleanup** - Data expires after 1 hour

### 💡 Use Cases

- **Quick Discussions** - Temporary conversations that need to disappear
- **Anonymous Chats** - Privacy-focused communication
- **Sensitive Topics** - Conversations that shouldn't be stored
- **One-Time Exchanges** - Temporary sharing of information
- **Testing & Development** - Quick communication without persistent storage

---

## 🖼️ Preview

### 🎨 Login Page
```
┌─────────────────────────────────┐
│     💬 Ephemeral Chat           │
│                                 │
│  Secure, private, and temporary │
│         messaging              │
│                                 │
│  ✓ All data auto-deletes        │
│    after 1 hour                 │
│  ✓ No chat history or           │
│    user tracking                │
│                                 │
│  [Enter Username]               │
│  [Enter Chat]                   │
└─────────────────────────────────┘
```

### 🏠 Dashboard
- **Create Room** - Start a new conversation
- **Join Room** - Enter a room code to join
- **Random Chat** - Get matched automatically

### 💬 Chat Room
- Real-time message bubbles
- User presence indicators
- Auto-deletion countdown
- Audio message support

---

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ installed
- **npm** or **yarn** package manager
- **Redis** server (local or remote)
- **Git** for version control

### ⚡ One-Line Install

```bash
git clone https://github.com/samranjithpaul/ephemeral-chat.git && cd ephemeral-chat && npm install
```

---

## 📦 Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/samranjithpaul/ephemeral-chat.git
cd ephemeral-chat
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required dependencies for both client and server.

### Step 3: Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Redis Configuration (Required)
REDIS_URL=redis://localhost:6379

# AWS S3 Configuration (Optional - for future file sharing)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_bucket_name

# Server Configuration
PORT=8080
NODE_ENV=development
```

### Step 4: Start Redis Server

**Local Redis:**
```bash
# macOS (using Homebrew)
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:alpine
```

**Cloud Redis:**
- Use Redis Cloud, AWS ElastiCache, or any Redis provider
- Update `REDIS_URL` in `.env` with your connection string

### Step 5: Run the Application

**Development Mode:**
```bash
npm run dev
```

This starts both:
- **Client**: `http://localhost:5173` (Vite dev server)
- **Server**: `http://localhost:8080` (Express + Socket.IO)

**Production Mode:**
```bash
npm run build
npm start
```

---

## ⚙️ Configuration

### Environment Variables Explained

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `REDIS_URL` | Redis connection string | ✅ Yes | `redis://localhost:6379` |
| `PORT` | Server port | ❌ No | `8080` |
| `NODE_ENV` | Environment mode | ❌ No | `development` |
| `AWS_ACCESS_KEY_ID` | AWS access key | ❌ No | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | ❌ No | - |
| `AWS_REGION` | AWS region | ❌ No | `us-east-1` |
| `AWS_S3_BUCKET` | S3 bucket name | ❌ No | - |

### Redis Setup

Redis is used for temporary data storage with automatic expiration:

```bash
# Test Redis connection
redis-cli ping
# Should return: PONG
```

### AWS S3 Setup (Optional)

AWS S3 is only needed if you plan to implement file sharing:

1. Create an S3 bucket
2. Configure CORS policy
3. Set up IAM user with S3 permissions
4. Add credentials to `.env`

---

## 💻 Usage Guide

### 🚪 Getting Started

1. **Open the Application**
   - Navigate to `http://localhost:5173` in your browser

2. **Enter Your Username**
   - Choose a username (2-20 characters)
   - No password required
   - Click "Enter Chat"

### 🏠 Dashboard Features

#### Create a Room
1. Enter a room name (1-50 characters)
2. Optionally set a custom room code
3. Click "Create Room"
4. Share the room code with others

#### Join a Room
1. Enter a room code
2. Click "Join Room"
3. Start chatting immediately

#### Random Chat
1. Click "Random Chat"
2. Wait for a match with another user
3. Automatically enter a private room

### 💬 Chat Room Features

#### Sending Messages
- Type your message in the input box
- Press `Enter` or click the send button
- Messages appear instantly for all users

#### Audio Messages
1. Click and hold the microphone button
2. Record your audio message
3. Release to send

#### User Management
- See all online users in the sidebar
- Room owner is marked with a badge
- Maximum 35 users per room

### ⏱️ Auto-Deletion

- All data automatically expires after **1 hour**
- Messages persist until the room expires
- No manual cleanup needed

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Client (React)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  Login   │  │Dashboard │  │  Room    │            │
│  └──────────┘  └──────────┘  └──────────┘            │
│        │             │             │                   │
│        └─────────────┴─────────────┘                   │
│                    │                                   │
│              Socket.IO Client                          │
└────────────────────┼───────────────────────────────────┘
                     │
                     │ WebSocket
                     │
┌────────────────────┼───────────────────────────────────┐
│                    │        Server (Node.js)          │
│              Socket.IO Server                         │
│                    │                                   │
│        ┌────────────┴────────────┐                     │
│        │                         │                     │
│   ┌────▼────┐              ┌────▼────┐               │
│   │  Redis  │              │  Express│               │
│   │ Storage │              │   API   │               │
│   └─────────┘              └─────────┘               │
│        │                         │                     │
│        └────────────┬────────────┘                     │
│                     │                                   │
│              Data Management                           │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Authentication**
   ```
   Client → Server → Redis (Store user session)
   ```

2. **Room Creation**
   ```
   Client → Server → Redis (Create room with TTL)
   ```

3. **Message Sending**
   ```
   Client → Socket.IO → Server → Redis → Broadcast to all clients
   ```

4. **Auto-Deletion**
   ```
   Redis TTL → Automatic expiration after 1 hour
   ```

---

## 🛠️ Tech Stack

### Frontend

| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | UI framework | 18.3.1 |
| **TypeScript** | Type safety | 5.6.3 |
| **Vite** | Build tool | 5.4.20 |
| **TailwindCSS** | Styling | 3.4.17 |
| **Socket.IO Client** | Real-time communication | 4.8.1 |
| **Wouter** | Routing | 3.3.5 |
| **Shadcn UI** | Component library | Latest |
| **Lucide React** | Icons | 0.453.0 |
| **React Query** | Data fetching | 5.60.5 |

### Backend

| Technology | Purpose | Version |
|------------|---------|---------|
| **Node.js** | Runtime | 18+ |
| **Express** | Web framework | 4.21.2 |
| **Socket.IO** | WebSocket server | 4.8.1 |
| **Redis (ioredis)** | Temporary storage | 5.8.2 |
| **Helmet** | Security headers | 8.1.0 |
| **TypeScript** | Type safety | 5.6.3 |

### Development Tools

| Tool | Purpose |
|------|---------|
| **Vitest** | Testing framework |
| **React Testing Library** | Component testing |
| **ESBuild** | Production bundling |
| **Concurrently** | Run multiple scripts |

---

## 📁 Project Structure

```
ephemeral-chat/
├── client/                    # Frontend React application
│   ├── public/               # Static assets
│   │   ├── favicon.png       # App favicon
│   │   └── favicon.svg       # App favicon (SVG)
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── ui/          # Shadcn UI components
│   │   │   ├── logo.tsx     # Logo component
│   │   │   ├── theme-toggle.tsx
│   │   │   └── AvailabilityHint.tsx
│   │   ├── pages/           # Page components
│   │   │   ├── login.tsx    # Login page
│   │   │   ├── dashboard.tsx # Dashboard page
│   │   │   ├── room.tsx     # Chat room page
│   │   │   ├── about.tsx    # About page
│   │   │   └── help.tsx     # Help page
│   │   ├── lib/             # Utilities and helpers
│   │   │   ├── copy.ts      # Centralized text constants
│   │   │   ├── socket.tsx   # Socket.IO client
│   │   │   ├── theme.tsx    # Theme provider
│   │   │   └── sounds.ts    # Sound effects
│   │   ├── hooks/           # Custom React hooks
│   │   ├── App.tsx          # Main app component
│   │   ├── main.tsx         # Entry point
│   │   └── index.css        # Global styles
│   └── index.html           # HTML template
│
├── server/                   # Backend Node.js application
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # API routes & Socket.IO setup
│   ├── storage.ts            # Redis storage interface
│   └── utils/               # Utility functions
│       ├── redis.ts         # Redis client
│       ├── logger.ts        # Logging utility
│       └── s3.ts            # AWS S3 utilities
│
├── shared/                   # Shared code
│   └── schema.ts            # TypeScript types & Zod schemas
│
├── .env                      # Environment variables (create this)
├── package.json              # Dependencies & scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite configuration
├── tailwind.config.ts        # TailwindCSS configuration
└── README.md                 # This file
```

---

## 🔐 Security & Privacy

### Privacy Features

- ✅ **No Data Persistence** - All data stored in Redis with 1-hour TTL
- ✅ **No User Tracking** - No analytics or monitoring
- ✅ **No Chat History** - Messages disappear after expiration
- ✅ **No Accounts** - Username-only authentication
- ✅ **Auto-Deletion** - Automatic cleanup on window close

### Security Measures

- 🔒 **HTTPS Enforcement** - Secure connections only
- 🔒 **Helmet.js** - Security headers protection
- 🔒 **CORS** - Cross-origin resource sharing control
- 🔒 **No-Cache Headers** - Prevent browser caching
- 🔒 **Input Validation** - Zod schema validation
- 🔒 **XSS Protection** - DOMPurify for message sanitization

### Security Best Practices

1. **Environment Variables** - Never commit `.env` file
2. **Redis Security** - Use authentication for production Redis
3. **HTTPS Only** - Enforce HTTPS in production
4. **Rate Limiting** - Implement rate limiting for API endpoints
5. **Input Sanitization** - Always sanitize user input

---

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:ui

# Run tests once
npm run test:run
```

### Test Coverage

- ✅ Unit tests for components
- ✅ Integration tests for Socket.IO
- ✅ UI component tests
- ✅ Accessibility tests

### Writing Tests

Tests are located in `client/src/pages/__tests__/` and `client/src/components/__tests__/`.

Example test:
```typescript
import { render, screen } from '@testing-library/react';
import Login from '../login';

test('renders login form', () => {
  render(<Login />);
  expect(screen.getByText('Ephemeral Chat')).toBeInTheDocument();
});
```

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### 🎯 How to Contribute

1. **Fork the Repository**
   ```bash
   git fork https://github.com/samranjithpaul/ephemeral-chat.git
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Changes**
   - Write clean, readable code
   - Follow TypeScript best practices
   - Add tests for new features

4. **Commit Changes**
   ```bash
   git commit -m "feat: add your feature description"
   ```

5. **Push to Branch**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Describe your changes
   - Link any related issues
   - Request review

### 📋 Contribution Guidelines

- ✅ Follow existing code style
- ✅ Write meaningful commit messages
- ✅ Add tests for new features
- ✅ Update documentation
- ✅ Keep PRs focused and small

### 🐛 Reporting Issues

Found a bug? Open an issue with:
- Description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details

---

## 📝 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2025 Sam Ranjith Paul

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 👨‍💻 Author

<div align="center">

### **Sam Ranjith Paul**

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/samranjithpaul)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/Samranjithpaul/)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:samranjithpaul71@gmail.com)

---

### 🌟 Star this repo if you find it helpful!

[![GitHub stars](https://img.shields.io/github/stars/samranjithpaul/ephemeral-chat?style=social)](https://github.com/samranjithpaul/ephemeral-chat)

---

**Made with ❤️ by [Sam Ranjith Paul](https://github.com/samranjithpaul)**

© 2025 Ephemeral Chat · Built with privacy in mind

</div>

---

<div align="center">

### 📊 Project Status

![GitHub last commit](https://img.shields.io/github/last-commit/samranjithpaul/ephemeral-chat)
![GitHub issues](https://img.shields.io/github/issues/samranjithpaul/ephemeral-chat)
![GitHub pull requests](https://img.shields.io/github/issues-pr/samranjithpaul/ephemeral-chat)

</div>
