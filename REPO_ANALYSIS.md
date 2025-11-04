# Repository Analysis Report

## Files with About/Help/Login Copy

### Login Page
- **File**: `client/src/pages/login.tsx`
- **Lines**: 114-116 (subtitle), 156-160 (bullets)
- **Current copy**:
  - Subtitle: "Secure, private, and temporary messaging"
  - Bullet 1: "All data auto-deletes after 1 hour"
  - Bullet 2: "No chat history or user tracking"
  - Helper text: "No password required • 2-20 characters"

### About Page
- **File**: `client/src/pages/about.tsx`
- **Lines**: 31-33 (intro), 42-46 (mission), various sections
- **Current copy**: Needs privacy-forward updates

### Help Page
- **File**: `client/src/pages/help.tsx`
- **Lines**: 26-28 (intro), various FAQ sections
- **Current copy**: Needs concise FAQ entries

## UI Components Showing Room Name/Code Availability Messages

### Dashboard - Room Name Availability
- **File**: `client/src/pages/dashboard.tsx`
- **Line**: 649-651
- **Current**: `<p className="text-xs text-green-600 dark:text-green-400 mt-1">Room name is available.</p>`
- **Style**: `text-xs`, green color

### Dashboard - Room Code Availability
- **File**: `client/src/pages/dashboard.tsx`
- **Line**: 730-732
- **Current**: `<p className="text-xs text-green-600 dark:text-green-400 mt-1">Room code available</p>`
- **Style**: `text-xs`, green color (missing period, should match room name style exactly)

## Client Places with Hard-Coded Copy

### Dashboard
- Room name availability messages (lines 643-651)
- Room code availability messages (lines 729-737)
- Toast messages (various)
- Error messages

### Login
- All copy is hard-coded (lines 114-160)

### About
- All paragraphs hard-coded throughout

### Help
- All FAQ entries hard-coded

## Translations/i18n

- **Status**: None found
- **Location**: No existing i18n system
- **Action**: Create `src/lib/copy.ts` for centralized constants

## Tests

- **Status**: No test files found
- **Test framework**: Not configured in package.json
- **Action**: Need to add testing setup (Vitest recommended for Vite projects)

## Potential Breaking Change Hotspots

1. **Dashboard component** - Used by main app, ensure room creation flow unchanged
2. **Shared UI components** - No shared components used, safe to modify
3. **Toast messages** - May reference old copy, check all toast calls

## Summary

- **Files to modify**: 4 (login.tsx, about.tsx, help.tsx, dashboard.tsx)
- **New files to create**: 2 (copy.ts, AvailabilityHint.tsx)
- **Tests to add**: 3+ (Login, AvailabilityHint, integration)
- **Risk level**: Low (UI/copy changes only, no business logic)

