import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Login from "../login";
import { COPY } from "@/lib/copy";

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => {
    const setLocation = vi.fn();
    return ["/", setLocation];
  },
}));

// Mock the socket and sound manager
vi.mock("@/lib/socket", () => ({
  useSocket: () => ({
    socket: null,
    isConnected: false,
    isJoined: false,
  }),
}));

vi.mock("@/lib/sounds", () => ({
  soundManager: {
    playClick: vi.fn(),
    playError: vi.fn(),
    playJoin: vi.fn(),
  },
}));

vi.mock("@/components/logo", () => ({
  Logo: () => <div data-testid="logo">Logo</div>,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">Theme</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("Login Page", () => {
  beforeEach(() => {
    // Mock sessionStorage
    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      writable: true,
    });
  });

  it("renders login page with correct title and subtitle", () => {
    render(<Login />);

    expect(screen.getByText(COPY.LOGIN.TITLE)).toBeInTheDocument();
    expect(screen.getByText(COPY.LOGIN.SUBTITLE)).toBeInTheDocument();
  });

  it("renders both privacy bullets correctly", () => {
    render(<Login />);

    expect(screen.getByText(COPY.LOGIN.BULLET_1)).toBeInTheDocument();
    expect(screen.getByText(COPY.LOGIN.BULLET_2)).toBeInTheDocument();
  });

  it("renders username input with correct label and placeholder", () => {
    render(<Login />);

    expect(screen.getByLabelText(COPY.LOGIN.USERNAME_LABEL)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(COPY.LOGIN.USERNAME_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByText(COPY.LOGIN.USERNAME_HELPER)).toBeInTheDocument();
  });

  it("renders submit button with correct text", () => {
    render(<Login />);

    expect(screen.getByRole("button", { name: COPY.LOGIN.BUTTON_TEXT })).toBeInTheDocument();
  });

  it("renders footer text", () => {
    render(<Login />);

    expect(screen.getByText(COPY.LOGIN.FOOTER)).toBeInTheDocument();
  });
});

