import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvailabilityHint } from "../AvailabilityHint";

describe("AvailabilityHint", () => {
  it("renders available message with correct styling", () => {
    const { container } = render(
      <AvailabilityHint status="available" message="Room name is available." />
    );
    
    const hint = screen.getByText("Room name is available.");
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveClass("text-xs", "text-green-600", "dark:text-green-400", "mt-1");
    expect(hint).toHaveAttribute("aria-live", "polite");
    expect(hint).toHaveAttribute("role", "status");
  });

  it("renders unavailable message with correct styling", () => {
    const { container } = render(
      <AvailabilityHint status="unavailable" message="Room name already taken. Please choose another." />
    );
    
    const hint = screen.getByText("Room name already taken. Please choose another.");
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveClass("text-xs", "text-destructive", "mt-1");
  });

  it("renders checking message with correct styling", () => {
    render(
      <AvailabilityHint status="checking" message="Checking availability..." />
    );
    
    const hint = screen.getByText("Checking availability...");
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveClass("text-xs", "text-muted-foreground", "mt-1");
  });

  it("returns null for idle status", () => {
    const { container } = render(
      <AvailabilityHint status="idle" />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it("returns null when no message provided", () => {
    const { container } = render(
      <AvailabilityHint status="available" />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it("applies custom className", () => {
    render(
      <AvailabilityHint status="available" message="Test" className="custom-class" />
    );
    
    const hint = screen.getByText("Test");
    expect(hint).toHaveClass("custom-class");
  });
});

