# FRONTEND.md — ReachInbox Email Scheduler

## Table of Contents
1. [Design Philosophy](#1-design-philosophy)
2. [Color System & Typography](#2-color-system--typography)
3. [Folder Structure](#3-folder-structure)
4. [Routes & Pages](#4-routes--pages)
5. [Page-by-Page Design Spec](#5-page-by-page-design-spec)
6. [Component Library](#6-component-library)
7. [API Layer](#7-api-layer)
8. [State Management](#8-state-management)
9. [Types & Interfaces](#9-types--interfaces)
10. [Hooks](#10-hooks)
11. [UX Behavior Rules](#11-ux-behavior-rules)
12. [Environment & Setup](#12-environment--setup)
13. [Dependencies](#13-dependencies)

---

## 1. Design Philosophy

- **Minimal & dark-first**: Dark background (`#0F1117`), subtle card surfaces, no clutter
- **One primary action per screen** — the "Compose" button is always the hero CTA
- **Data-dense but readable** — tables with clear status badges, no infinite scrolling initially
- **Consistent spacing** — 8px base unit (Tailwind's `gap-2`, `p-4`, `m-2` etc.)
- **No custom CSS unless Tailwind cannot do it** — everything via utility classes
- **Mobile-aware but desktop-first** — dashboard is designed for 1280px+, responsive down to 768px

---

## 2. Color System & Typography

### 2.1 Color Palette (Tailwind config extension)

```ts
// tailwind.config.ts
extend: {
  colors: {
    background:  '#0F1117',   // page bg
    surface:     '#1A1D27',   // card / panel bg
    border:      '#2A2D3E',   // borders, dividers
    primary:     '#6C63FF',   // purple — brand color, buttons
    'primary-hover': '#5A52E0',
    accent:      '#00D084',   // green — sent / success
    warning:     '#F59E0B',   // amber — rate_limited
    danger:      '#EF4444',   // red — failed
    muted:       '#6B7280',   // placeholder text
    'text-main': '#E5E7EB',   // primary text
    'text-sub':  '#9CA3AF',   // secondary text
  }
}
```

### 2.2 Typography

```ts
// tailwind.config.ts
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}
```

Add to `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet" />
```

### 2.3 Type Scale

| Use | Class |
|---|---|
| Page title | `text-2xl font-bold text-text-main` |
| Section heading | `text-lg font-semibold text-text-main` |
| Body / table text | `text-sm text-text-main` |
| Muted / sub | `text-xs text-text-sub` |
| Badge text | `text-xs font-medium` |
| Button text | `text-sm font-semibold` |

### 2.4 Spacing Rules

| Purpose | Value |
|---|---|
| Page padding | `px-6 py-6` (desktop), `px-4 py-4` (mobile) |
| Card padding | `p-6` |
| Input padding | `px-3 py-2` |
| Row gap between sections | `gap-6` |
| Table row height | `h-12` |

---

## 3. Folder Structure

```
frontend/
├── public/
│   └── logo.svg
├── src/
│   ├── api/
│   │   ├── client.ts            # Axios instance with baseURL + withCredentials
│   │   ├── auth.api.ts          # getMe, logout
│   │   ├── emails.api.ts        # schedule, getScheduled, getSent, search
│   │   └── slack.api.ts         # getSlackStatus, disconnect
│   ├── assets/
│   │   └── google-icon.svg
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Textarea.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Spinner.tsx
│   │   │   ├── Toast.tsx        # via react-hot-toast
│   │   │   ├── EmptyState.tsx
│   │   │   └── Avatar.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx      # (if needed in future)
│   │   │   └── PageShell.tsx
│   │   └── features/
│   │       ├── compose/
│   │       │   ├── ComposeModal.tsx
│   │       │   ├── CSVUploader.tsx
│   │       │   └── LeadCountBadge.tsx
│   │       ├── scheduled/
│   │       │   └── ScheduledEmailsTable.tsx
│   │       └── sent/
│   │           └── SentEmailsTable.tsx
│   ├── context/
│   │   └── AuthContext.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useEmails.ts
│   │   └── useSlack.ts
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   └── DashboardPage.tsx
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   └── csvParser.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. Routes & Pages

```tsx
// App.tsx
<BrowserRouter>
  <AuthProvider>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </AuthProvider>
</BrowserRouter>
```

`ProtectedRoute` — checks `AuthContext`. If no user, redirects to `/login`. If loading, shows full-screen `Spinner`.

---

## 5. Page-by-Page Design Spec

### 5.1 Login Page (`/login`)

**Layout:** Full viewport, centered vertically and horizontally. Dark background.

```
┌─────────────────────────────────────────┐
│                                         │
│          [Logo / ReachInbox]            │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │         Welcome back            │   │
│   │   Sign in to your dashboard     │   │
│   │                                 │   │
│   │  ┌───────────────────────────┐  │   │
│   │  │  [G]  Sign in with Google │  │   │
│   │  └───────────────────────────┘  │   │
│   │                                 │   │
│   │  By signing in, you agree to   │   │
│   │  our Terms of Service           │   │
│   └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

**Tailwind Classes:**
```tsx
// Page wrapper
<div className="min-h-screen bg-background flex items-center justify-center px-4">

// Card
<div className="w-full max-w-md bg-surface rounded-2xl border border-border p-10 shadow-xl">

// Title
<h1 className="text-2xl font-bold text-text-main text-center mb-2">
  Welcome back
</h1>
<p className="text-sm text-text-sub text-center mb-8">
  Sign in to your ReachInbox dashboard
</p>

// Google Button
<a href={`${import.meta.env.VITE_API_URL}/api/auth/google`}
   className="flex items-center justify-center gap-3 w-full
              bg-white text-gray-800 font-semibold text-sm
              rounded-xl px-4 py-3 hover:bg-gray-100
              transition-colors duration-150 shadow-sm">
  <img src="/google-icon.svg" className="w-5 h-5" />
  Sign in with Google
</a>
```

**Behavior:**
- Clicking the button does a full redirect to `/api/auth/google` (not a fetch — Google OAuth requires a real redirect)
- After OAuth, backend redirects to `/` (dashboard)
- If user is already logged in and visits `/login`, redirect to `/`

---

### 5.2 Dashboard Page (`/`)

**Overall Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  HEADER                                                       │
│  [ReachInbox Logo]         [User Avatar + Name + Logout]     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Scheduled Emails]  [Sent Emails]          [+ Compose]      │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  TABLE CONTENT (based on active tab)                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Header Tailwind:**
```tsx
<header className="h-16 bg-surface border-b border-border
                   flex items-center justify-between px-6 sticky top-0 z-10">
  <div className="flex items-center gap-3">
    <img src="/logo.svg" className="h-7 w-auto" />
    <span className="text-text-main font-bold text-lg tracking-tight">ReachInbox</span>
  </div>
  <div className="flex items-center gap-4">
    {/* Slack Connect Button */}
    <SlackConnectButton />
    <Avatar src={user.avatarUrl} name={user.name} />
    <div className="flex flex-col text-right">
      <span className="text-sm font-medium text-text-main">{user.name}</span>
      <span className="text-xs text-text-sub">{user.email}</span>
    </div>
    <button onClick={logout}
            className="text-xs text-text-sub hover:text-danger transition-colors">
      Logout
    </button>
  </div>
</header>
```

**Tab Bar + Compose Button:**
```tsx
<div className="flex items-center justify-between px-6 pt-6 pb-4">
  <div className="flex gap-1 bg-surface border border-border rounded-xl p-1">
    <TabButton active={tab === 'scheduled'} onClick={() => setTab('scheduled')}>
      Scheduled
    </TabButton>
    <TabButton active={tab === 'sent'} onClick={() => setTab('sent')}>
      Sent
    </TabButton>
  </div>
  <Button variant="primary" onClick={() => setComposeOpen(true)}>
    + Compose
  </Button>
</div>
```

**TabButton:**
```tsx
// Active: bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold
// Inactive: text-text-sub hover:text-text-main px-4 py-2 text-sm font-medium
```

---

### 5.3 Scheduled Emails Table

**Columns:** `Recipient` | `Subject` | `Scheduled At` | `Status` | `Campaign`

```
┌──────────────────┬─────────────────────┬──────────────────────┬──────────────┬──────────────┐
│  Recipient       │  Subject            │  Scheduled At        │  Status      │  Campaign    │
├──────────────────┼─────────────────────┼──────────────────────┼──────────────┼──────────────┤
│  user@gmail.com  │  Q4 Outreach        │  Oct 10, 2:30 PM     │  scheduled   │  Q4 Push     │
│  lead@co.io      │  Q4 Outreach        │  Oct 10, 2:30 PM     │  rate_limited│  Q4 Push     │
└──────────────────┴─────────────────────┴──────────────────────┴──────────────┴──────────────┘
```

**Status Badges:**
```tsx
const badgeMap = {
  scheduled:    'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  rate_limited: 'bg-warning/10 text-warning border border-warning/20',
  failed:       'bg-danger/10 text-danger border border-danger/20',
  sent:         'bg-accent/10 text-accent border border-accent/20',
}
// Usage: <span className={`${badgeMap[status]} text-xs font-medium px-2.5 py-1 rounded-full`}>
```

**Empty State:**
```tsx
<div className="flex flex-col items-center justify-center py-24 gap-3">
  <MailIcon className="w-12 h-12 text-border" />
  <p className="text-text-sub text-sm">No scheduled emails yet</p>
  <Button variant="outline" size="sm" onClick={() => setComposeOpen(true)}>
    Schedule your first email
  </Button>
</div>
```

**Loading State:** 5 skeleton rows — `<div className="h-12 bg-surface animate-pulse rounded-lg" />`

---

### 5.4 Sent Emails Table

**Columns:** `Recipient` | `Subject` | `Sent At` | `Status` | `Preview`

- `Preview` column shows a link icon → opens `ethereal_preview_url` in new tab
- Status is always `sent` or `failed` here

---

### 5.5 Compose Modal

**Trigger:** "+ Compose" button
**Style:** Centered overlay modal, max-width `640px`, dark surface background

```
┌──────────────────────────────────────────────────────────┐
│  Schedule New Campaign                              [✕]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Subject *                                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Q4 Outreach — Special Offer                       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Email Body *                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Hi {{name}},                                      │  │
│  │  ...                                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Upload Lead List (CSV or .txt)                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  [↑ Click to upload or drag & drop]               │  │
│  │  ✓ 143 email addresses detected                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────────┐   │
│  │  Start Time *        │  │  Delay Between (secs) * │   │
│  │  [datetime-local  ] │  │  [  2               ]   │   │
│  └─────────────────────┘  └─────────────────────────┘   │
│                                                          │
│  Hourly Limit per Sender *                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │  100                                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│                    [Cancel]  [Schedule Campaign →]       │
└──────────────────────────────────────────────────────────┘
```

**Modal Tailwind:**
```tsx
// Overlay
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">

// Panel
<div className="w-full max-w-xl bg-surface border border-border rounded-2xl
                shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">

// Header row
<div className="flex items-center justify-between mb-6">
  <h2 className="text-lg font-semibold text-text-main">Schedule New Campaign</h2>
  <button onClick={onClose} className="text-text-sub hover:text-text-main">
    <XMarkIcon className="w-5 h-5" />
  </button>
</div>
```

**CSV Uploader:**
```tsx
// Drop zone
<div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
                 transition-colors duration-150
                 ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
     onDragOver={...} onDrop={...} onClick={() => inputRef.current?.click()}>
  <CloudArrowUpIcon className="w-8 h-8 text-muted mx-auto mb-2" />
  <p className="text-sm text-text-sub">
    Click to upload or drag & drop
  </p>
  <p className="text-xs text-muted mt-1">.csv or .txt — one email per line or comma-separated</p>
  {leadCount > 0 && (
    <p className="text-sm text-accent font-medium mt-3">
      ✓ {leadCount} email addresses detected
    </p>
  )}
</div>
```

**Grid for inputs:**
```tsx
<div className="grid grid-cols-2 gap-4">
  <div><label>Start Time</label><Input type="datetime-local" /></div>
  <div><label>Delay (seconds)</label><Input type="number" min={2} defaultValue={2} /></div>
</div>
```

**Submit Button:**
```tsx
<div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
  <Button variant="ghost" onClick={onClose}>Cancel</Button>
  <Button variant="primary" loading={isSubmitting} disabled={!isValid || isSubmitting}>
    {isSubmitting ? 'Scheduling...' : 'Schedule Campaign →'}
  </Button>
</div>
```

**Validation rules:**
- Subject: required, min 3 chars
- Body: required, min 10 chars
- Leads: at least 1 valid email
- Start time: must be in the future
- Delay: min 1 second
- Hourly limit: min 1, max 10000

On success: close modal + show toast "Campaign scheduled for {n} leads!" + refresh table.

---

## 6. Component Library

### 6.1 Button
```tsx
// Props
interface ButtonProps {
  variant: 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}

// Variant classes
const variants = {
  primary: 'bg-primary hover:bg-primary-hover text-white',
  outline: 'border border-border text-text-main hover:bg-surface',
  ghost:   'text-text-sub hover:text-text-main hover:bg-surface/50',
  danger:  'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20',
}
const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
}
// Base: font-semibold transition-all duration-150 flex items-center gap-2 disabled:opacity-50
```

### 6.2 Input
```tsx
// Base classes
"w-full bg-background border border-border rounded-xl px-3 py-2
 text-sm text-text-main placeholder:text-muted
 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
 transition-all duration-150"
```

### 6.3 Textarea
Same as Input but `resize-none h-28`.

### 6.4 Badge
```tsx
interface BadgeProps {
  status: 'scheduled' | 'sent' | 'failed' | 'rate_limited' | 'in_progress'
}
const label = { scheduled: 'Scheduled', sent: 'Sent', failed: 'Failed',
                rate_limited: 'Rate Limited', in_progress: 'In Progress' }
```

### 6.5 Table
```tsx
// Wrapper
<div className="w-full overflow-x-auto rounded-xl border border-border">
  <table className="w-full border-collapse text-sm">
    <thead>
      <tr className="border-b border-border bg-surface/50">
        <th className="text-left px-4 py-3 text-xs font-semibold text-text-sub uppercase tracking-wide">
          {column}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-border last:border-0 hover:bg-surface/30 transition-colors">
        <td className="px-4 py-3 text-text-main">{cell}</td>
      </tr>
    </tbody>
  </table>
</div>
```

### 6.6 Modal
```tsx
// Uses React Portal to render outside root
// Closes on: ESC key, clicking backdrop
// Focus trap: first focusable element on open
useEffect(() => {
  const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
  document.addEventListener('keydown', handleEsc)
  return () => document.removeEventListener('keydown', handleEsc)
}, [])
```

### 6.7 Spinner
```tsx
<svg className="animate-spin w-5 h-5 text-primary" ...>
  // standard SVG spinner
</svg>
```

### 6.8 Toast (react-hot-toast)
```tsx
// Setup in App.tsx
<Toaster position="top-right"
  toastOptions={{
    style: { background: '#1A1D27', color: '#E5E7EB', border: '1px solid #2A2D3E' },
    success: { iconTheme: { primary: '#00D084', secondary: '#1A1D27' } },
    error:   { iconTheme: { primary: '#EF4444', secondary: '#1A1D27' } },
  }}
/>

// Usage
toast.success('Campaign scheduled!')
toast.error('Failed to schedule campaign')
```

### 6.9 Avatar
```tsx
// If avatarUrl: show <img className="w-8 h-8 rounded-full object-cover" />
// Fallback: initials in colored circle
<div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center
                text-white text-xs font-bold">
  {name.charAt(0).toUpperCase()}
</div>
```

### 6.10 EmptyState
```tsx
interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}
```

---

## 7. API Layer

### 7.1 Axios Client
```ts
// src/api/client.ts
import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,   // important — sends session cookie
  headers: { 'Content-Type': 'application/json' },
})

// Global error interceptor
client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
```

### 7.2 Auth API
```ts
// src/api/auth.api.ts
export const getMe = () => client.get<User>('/api/auth/me')
export const logout = () => client.post('/api/auth/logout')
```

### 7.3 Emails API
```ts
// src/api/emails.api.ts
export const scheduleEmails = (data: SchedulePayload) =>
  client.post<ScheduleResponse>('/api/emails/schedule', data)

export const getScheduledEmails = (page = 1, limit = 20) =>
  client.get<PaginatedResponse<EmailJob>>(`/api/emails/scheduled?page=${page}&limit=${limit}`)

export const getSentEmails = (page = 1, limit = 20) =>
  client.get<PaginatedResponse<EmailJob>>(`/api/emails/sent?page=${page}&limit=${limit}`)

export const searchEmails = (q: string) =>
  client.get<EmailJob[]>(`/api/emails/search?q=${encodeURIComponent(q)}`)
```

### 7.4 Slack API
```ts
// src/api/slack.api.ts
export const getSlackStatus = () => client.get<{ connected: boolean }>('/api/slack/status')
export const disconnectSlack = () => client.delete('/api/slack/disconnect')
// Connect = redirect, not fetch:
export const slackConnectUrl = `${import.meta.env.VITE_API_URL}/api/slack/authorize`
```

---

## 8. State Management

No Redux or Zustand needed. Use:
- **`AuthContext`** — current user, loading, logout fn
- **`useState`** in `DashboardPage` — active tab, compose modal open/close
- **Custom hooks** (`useEmails`) — fetch + cache email lists
- **`react-query` (TanStack Query)** — server state: caching, refetching, loading/error states

```ts
// Install: npm i @tanstack/react-query
// Wrap in App.tsx:
const queryClient = new QueryClient()
<QueryClientProvider client={queryClient}>
```

---

## 9. Types & Interfaces

```ts
// src/types/index.ts

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  slackConnected: boolean
}

export interface EmailJob {
  id: string
  campaignId: string
  recipientEmail: string
  subject: string
  status: 'scheduled' | 'sent' | 'failed' | 'rate_limited'
  scheduledAt: string       // ISO string
  sentAt: string | null
  etherealPreviewUrl: string | null
  senderEmail: string
}

export interface Campaign {
  id: string
  subject: string
  body: string
  senderEmail: string
  startTime: string
  delaySeconds: number
  hourlyLimit: number
  totalLeads: number
  status: 'pending' | 'in_progress' | 'done'
  createdAt: string
}

export interface SchedulePayload {
  subject: string
  body: string
  leads: string[]           // array of email strings
  startTime: string         // ISO string
  delaySeconds: number
  hourlyLimit: number
}

export interface ScheduleResponse {
  campaignId: string
  totalScheduled: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
```

---

## 10. Hooks

### 10.1 useAuth
```ts
// src/hooks/useAuth.ts
export function useAuth() {
  return useContext(AuthContext)  // { user, loading, logout }
}
```

### 10.2 useEmails
```ts
// src/hooks/useEmails.ts
export function useScheduledEmails(page: number) {
  return useQuery({
    queryKey: ['emails', 'scheduled', page],
    queryFn: () => getScheduledEmails(page).then(r => r.data),
    refetchInterval: 10_000,   // poll every 10s for live updates
  })
}

export function useSentEmails(page: number) {
  return useQuery({
    queryKey: ['emails', 'sent', page],
    queryFn: () => getSentEmails(page).then(r => r.data),
    refetchInterval: 15_000,
  })
}
```

### 10.3 useComposeForm
```ts
// src/hooks/useComposeForm.ts
// Returns: { form state, handlers, isValid, isSubmitting, handleSubmit }
// Uses react-hook-form + zod for validation
```

### 10.4 useSlack
```ts
export function useSlack() {
  const { data } = useQuery({ queryKey: ['slack-status'], queryFn: ... })
  const disconnect = useMutation({ mutationFn: disconnectSlack })
  return { connected: data?.connected, disconnect }
}
```

---

## 11. UX Behavior Rules

| Scenario | Behavior |
|---|---|
| Page loads, user not authed | Redirect to `/login` |
| `getMe` returns 401 | Axios interceptor → redirect to `/login` |
| Schedule API returns error | Toast: "Failed to schedule. Please try again." |
| CSV has 0 valid emails | Disable Submit, show "No valid emails found in file" |
| CSV has >500 emails | Show warning: "Large list — scheduling may take time" |
| Modal open | Body scroll locked (`overflow-hidden` on `<body>`) |
| Table loading | Show 5 skeleton rows |
| Refetch in background | Spinner in tab label, no layout shift |
| Slack not connected | Show "Connect Slack" button in header |
| Slack connected | Show green dot + "Slack Connected" + "Disconnect" |

---

## 12. Environment & Setup

```env
# frontend/.env
VITE_API_URL=http://localhost:4000
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

```bash
cd frontend
npm install
npm run dev         # starts Vite dev server on :5173
npm run build       # production build
npm run preview     # preview production build
```

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',  // proxy API calls in dev
    }
  }
})
```

---

## 13. Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "axios": "^1.6.0",
    "@tanstack/react-query": "^5.18.0",
    "react-hook-form": "^7.51.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.0",
    "react-hot-toast": "^2.4.1",
    "date-fns": "^3.3.1",
    "@heroicons/react": "^2.1.1",
    "papaparse": "^5.4.1",
    "@types/papaparse": "^5.3.14"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.1.0",
    "@vitejs/plugin-react": "^4.2.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```