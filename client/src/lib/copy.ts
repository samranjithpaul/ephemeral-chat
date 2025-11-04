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
    MISSION_PARAGRAPH: "In an era where digital privacy is increasingly rare, Ephemeral Chat provides a solution for truly private conversations. We believe that not all communication needs to be permanent, and that privacy should be the default, not an afterthought. All data auto-deletes after 1 hour, and we maintain no chat history or user tracking.",
    FOOTER: "Built with privacy in mind • All data auto-deletes after 1 hour",
  },

  // Help Page
  HELP: {
    TITLE: "Help & Documentation",
    SUBTITLE: "Learn how to use Ephemeral Chat for secure, private messaging",
    FAQ: {
      HOW_LONG_STORED: {
        QUESTION: "How long is chat stored?",
        ANSWER: "All data (messages, rooms, files) automatically expires after 1 hour. When you close your browser or log out, all your data is immediately deleted from our servers.",
      },
      CAN_OTHERS_SEE_HISTORY: {
        QUESTION: "Can others see my history?",
        ANSWER: "No. We maintain no chat history or user tracking. All data auto-deletes after 1 hour, and there is no way to retrieve past conversations.",
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
} as const;

