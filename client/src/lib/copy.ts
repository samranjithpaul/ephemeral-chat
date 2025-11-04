/**
 * Centralized copy constants for user-facing text
 * All strings used in Login, About, Help pages and UI components
 */

export const COPY = {
  // Login Page
  LOGIN: {
    TITLE: "Ephemeral Chat",
    SUBTITLE: "Secure, private, and temporary messaging",
    USERNAME_LABEL: "Username",
    USERNAME_PLACEHOLDER: "Enter your username",
    USERNAME_HELPER: "No password required • 2-20 characters",
    BUTTON_TEXT: "Enter Chat",
    BUTTON_LOADING: "Connecting...",
    BULLET_1: "All data auto-deletes after 1 hour",
    BULLET_2: "No chat history or user tracking",
    FOOTER: "Privacy-first ephemeral messaging",
  },

  // About Page
  ABOUT: {
    TITLE: "About Ephemeral Chat",
    SUBTITLE: "A privacy-first messaging platform designed for secure, temporary communication with zero data retention",
    MISSION_TITLE: "Our Mission",
    MISSION_PARAGRAPH: "Ephemeral Chat is a secure, privacy-first messaging platform built for temporary, anonymous conversations. No data is stored — everything disappears automatically after 1 hour.",
    FOOTER: "Built with privacy in mind • All data auto-deletes after 1 hour",
    DEVELOPER_SECTION: {
      TITLE: "About the Developer",
      NAME: "Sam Ranjith Paul",
      GITHUB: "https://github.com/samranjithpaul",
      LINKEDIN: "https://www.linkedin.com/in/Samranjithpaul/",
      EMAIL: "samranjithpaul71@gmail.com",
    },
  },

  // Help Page
  HELP: {
    TITLE: "Help & Documentation",
    SUBTITLE: "Learn how to use Ephemeral Chat for secure, private messaging",
    FAQ: {
      HOW_LONG_STORED: {
        QUESTION: "How long are chats stored?",
        ANSWER: "Chats automatically delete after 1 hour.",
      },
      CAN_OTHERS_SEE_HISTORY: {
        QUESTION: "Is my data tracked?",
        ANSWER: "No. Ephemeral Chat does not collect chat history or user analytics.",
      },
      WHO_DEVELOPED: {
        QUESTION: "Who developed this app?",
        ANSWER: "This app was developed by Sam Ranjith Paul.",
      },
      HOW_CREATE_ROOM: {
        QUESTION: "How to create a room?",
        ANSWER: "From the dashboard, enter a room name and click 'Create Room'. You'll receive a unique room code to share with others. You can also create a custom room code if you prefer.",
      },
    },
  },

  // Room Availability Messages
  ROOM: {
    NAME_AVAILABLE: "Room name is available.",
    NAME_UNAVAILABLE: "Room name already taken. Please choose another.",
    CODE_AVAILABLE: "Room code available.",
    CODE_UNAVAILABLE: "Room code is already taken",
    CODE_CHECKING: "Checking availability...",
  },

  // Developer Attribution
  DEVELOPER: {
    NAME: "Sam Ranjith Paul",
    GITHUB: "https://github.com/samranjithpaul",
    LINKEDIN: "https://www.linkedin.com/in/Samranjithpaul/",
    EMAIL: "samranjithpaul71@gmail.com",
    FOOTER_TEXT: "© 2025 Ephemeral Chat · Built by Sam Ranjith Paul",
  },
} as const;

