# Design Guidelines: Ephemeral Chat Web App

## Design Approach

**Selected Approach**: Design System + Reference-Based Hybrid

Drawing from **Material Design 3** for component structure and interaction patterns, combined with privacy-focused messaging apps like **Signal** and **Telegram** for chat-specific UX patterns. This approach prioritizes clarity, trust-building, and efficient communication over decorative elements.

**Core Principles**:
- Privacy-first visual language with clear ephemeral indicators
- Minimal cognitive load for rapid message composition
- Trust-building through professional, clean interfaces
- Efficient navigation with clear visual hierarchy
- Responsive layouts optimized for both desktop and mobile chat experiences

---

## Typography System

**Primary Font**: Inter (Google Fonts) - clean, highly legible for interface text
**Secondary Font**: JetBrains Mono (Google Fonts) - for room codes and technical identifiers

**Hierarchy**:
- **Headings (H1)**: text-4xl font-bold (page titles like "Dashboard", "Room")
- **Headings (H2)**: text-2xl font-semibold (section headers, room names)
- **Headings (H3)**: text-lg font-semibold (username displays, modal titles)
- **Body Text**: text-base font-normal (chat messages, descriptions)
- **Small Text**: text-sm (timestamps, system messages, helper text)
- **Tiny Text**: text-xs (status indicators, metadata)
- **Room Codes**: text-xl font-mono tracking-wider (for easy reading and sharing)

**Message-Specific Typography**:
- **User Messages**: text-base with font-medium for usernames
- **System Messages**: text-sm italic with reduced opacity
- **Timestamps**: text-xs with monospace for precision

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 6, 8, 12, 16** for consistency
- Micro spacing: p-2, gap-2 (component internals)
- Standard spacing: p-4, m-4, gap-4 (default padding, gaps)
- Section spacing: p-6, py-8 (card containers, modals)
- Large spacing: p-12, py-16 (page containers, major sections)

**Container Widths**:
- Login/Auth pages: max-w-md mx-auto (centered, focused)
- Dashboard: max-w-6xl mx-auto (spacious for room cards)
- Chat Room: Full width with max-w-7xl for desktop, full viewport on mobile
- Modals: max-w-lg for file permission dialogs, max-w-md for alerts

**Grid Systems**:
- Dashboard room cards: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Settings/options: grid grid-cols-2 gap-4 for paired controls
- User list sidebar: Single column with divide-y pattern

**Chat Layout Structure**:
- **Desktop**: Three-column layout
  - Left sidebar (280px): Room list with search
  - Main chat (flex-1): Messages + input
  - Right sidebar (320px, collapsible): User list + shared files
- **Mobile**: Stack layout with bottom navigation for room switching

---

## Component Library

### Authentication Components

**Login Card**:
- Centered card with shadow-lg, rounded-xl
- Padding: p-8
- Username input with clear focus states
- Primary CTA button (full width on mobile, auto width on desktop)
- Helper text below input for username rules
- Error states with inline validation messages

**Username Input**:
- Large text input: h-12, px-4
- Border width: border-2 for emphasis
- Rounded: rounded-lg
- Include icon prefix (user icon from Heroicons)

### Dashboard Components

**Room Card**:
- Card container: rounded-xl, p-6, shadow-md
- Hover state: subtle elevation increase (shadow-lg)
- Header: Room name (text-xl font-semibold)
- Metadata row: User count, owner badge, timestamp
- Action buttons: Join button prominent, share icon secondary
- Badge for "Owner" status if applicable

**Create Room Button**:
- Large, prominent: py-4 px-8
- Rounded: rounded-lg
- Icon + text layout with gap-3
- Desktop: Fixed position in header, Mobile: Floating action button (bottom-right)

**Random Chat Widget**:
- Distinct card with dashed border pattern
- Icon: shuffle/random icon (Heroicons)
- Two states: "Start Random Chat" vs "Searching..." with animated loading

### Chat Interface Components

**Message Bubble**:
- Own messages: Aligned right, max-w-md lg:max-w-lg
- Others' messages: Aligned left, max-w-md lg:max-w-lg
- Padding: px-4 py-3
- Rounded corners: rounded-2xl (more friendly for chat)
- Username label: text-sm font-medium, mb-1
- Timestamp: text-xs, positioned bottom-right within bubble

**System Message**:
- Centered layout with mx-auto
- Italic text with reduced opacity
- Small size: text-sm
- Minimal padding: px-3 py-1.5
- Rounded pill shape: rounded-full
- Examples: "{username} joined" or "File shared"

**Message Input Area**:
- Sticky bottom positioning
- Container padding: p-4
- Input field: rounded-full with px-6 py-3
- Icon buttons positioned inside input (attach, emoji)
- Send button: Circular, positioned right edge of input
- File attachment shows preview thumbnail before sending

**User List Sidebar**:
- List items with px-4 py-3
- Online indicator: Small dot (w-2 h-2 rounded-full) next to username
- User count header: sticky top with backdrop blur
- Divide pattern: divide-y for separation

**File Sharing Components**:

**Permission Dialog**:
- Modal: max-w-md, centered
- File preview: Image thumbnail or file icon
- File metadata: Name, size, type displayed clearly
- Two-button layout: Accept (primary) + Decline (secondary) with gap-3
- Progress bar for chunked upload (h-2, rounded-full)

**Shared File Card** (in chat):
- Inline card with preview
- View button with eye icon
- Metadata: File size, type, "Expires in X min" countdown
- No download button (view-only enforcement)

### Navigation Components

**Top Navigation Bar**:
- Height: h-16
- Padding: px-6
- Items: Logo/app name (left), room info (center), user menu + theme toggle (right)
- Divider line at bottom for separation
- Responsive: Hamburger menu on mobile

**Mobile Bottom Navigation**:
- Fixed bottom with safe-area-inset-bottom
- Three icons: Rooms, Active Chat, Settings
- Height: h-16
- Active state indicator: subtle background or underline

### Utility Components

**Theme Toggle**:
- Icon-only button with sun/moon icons (Heroicons)
- Positioned top-right corner
- Smooth transition between states
- Circular button: w-10 h-10

**Toast Notifications**:
- Slide in from top-right
- Width: max-w-sm
- Padding: p-4
- Rounded: rounded-lg
- Shadow: shadow-xl
- Auto-dismiss after 4 seconds
- Types: Success, Error, Warning (network), Info
- Icon + message layout with gap-3

**Modal Overlays**:
- Backdrop: Full screen with backdrop-blur-sm
- Modal card: Centered, rounded-xl, p-6
- Close button: Positioned top-right as icon button
- Max width based on content type

**Room Code Display**:
- Large monospace text: text-2xl font-mono
- Letter-spaced for readability: tracking-widest
- Copy button adjacent with clipboard icon
- Container: Inline with px-4 py-2, rounded-md, border-2 dashed

**Ephemeral Indicators**:
- Timer display showing auto-delete countdown
- Small badge in header: "Auto-deletes in 45 min"
- Pulsing dot indicator for active ephemeral status
- Text: text-xs with clock icon

---

## Static Pages Layout

**Help Page**:
- Article-style layout with max-w-3xl mx-auto
- Section headings: text-2xl font-bold, mb-4
- Subsections with text-lg font-semibold
- FAQ accordion with expand/collapse icons
- Padding: py-12 px-6

**About Page**:
- Hero section: py-16 with centered content
- Mission statement: Large text-xl lg:text-2xl
- Feature grid: grid-cols-1 md:grid-cols-2 gap-8
- Privacy policy section with clear typography hierarchy
- Contact information in footer-style section

---

## Responsive Breakpoints

- **Mobile**: < 768px - Stack layouts, full-width cards, bottom navigation
- **Tablet**: 768px - 1024px - Two-column grids, collapsible sidebars
- **Desktop**: > 1024px - Three-column chat layout, expanded sidebars, hover states

---

## Icon Library

**Selected Library**: Heroicons (via CDN)

**Key Icons**:
- user-circle: Login, profile
- chat-bubble-left-right: Messaging
- paper-airplane: Send message
- paper-clip: Attach file
- shield-check: Privacy/security indicators
- clock: Ephemeral timers
- users: User list, room capacity
- link: Share room link
- arrow-path: Random chat
- sun/moon: Theme toggle
- x-mark: Close modals
- check: Accept file
- x-circle: Decline file
- eye: View file

---

## Animation Principles

**Minimal Approach**: Animations used sparingly for feedback only

**Allowed Animations**:
- Message send: Brief scale animation on bubble appearance (duration-200)
- Button clicks: Subtle scale feedback (scale-95 on active)
- Modal entry/exit: Fade + slight scale (duration-300)
- Toast notifications: Slide from edge (duration-300)
- Loading states: Subtle pulse for "searching" or "uploading"

**No Animations**:
- Background effects
- Continuous decorative motion
- Scroll-triggered effects
- Particle effects

---

## Images

**No Hero Images**: This is a functional app, not a marketing site. Skip traditional hero sections.

**Icon/Avatar Placeholders**:
- User avatars: Use Heroicons user-circle as default
- File type icons: document, photo, video icons from Heroicons
- Room thumbnails: Generated gradient patterns as placeholders

**Inline Content**:
- Shared images in chat: Display with max-h-96, rounded-lg, with loading state
- File previews in permission dialog: Small thumbnail (max-w-32)

---

## Accessibility Standards

- All interactive elements: Minimum touch target 44x44px (h-11 or larger)
- Focus indicators: Visible ring-2 offset-2 on all focusable elements
- Form labels: Always visible, never placeholder-only
- Error messages: Announced and visually distinct
- Keyboard navigation: Full support with logical tab order
- Screen reader: Proper ARIA labels for icon-only buttons
- Contrast ratios: Meet WCAG AA standards (handled by color system separately)