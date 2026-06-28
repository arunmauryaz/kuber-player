# 🎬 Kuber Player

> A self-hosted, open-source personal streaming platform — watch your local movies and series from any device on your network, with a Netflix-style interface.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite)](https://vitejs.dev/)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Media Folder Layout](#media-folder-layout)
- [Quick Start](#quick-start)
  - [Windows](#windows)
  - [Linux / VPS](#linux--vps)
  - [macOS](#macos)
- [Backend Reference](#backend-reference)
  - [REST API](#rest-api-reference)
- [Frontend Features](#frontend-features)
  - [Player Controls](#player-controls)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
  - [Mobile Gestures](#mobile-gestures)
- [Cloudflare Tunnel (Public Access)](#cloudflare-tunnel-public-access)
- [Local Network Access](#local-network-access)
- [Player SDK](#player-sdk)
- [Plugin System](#plugin-system)
- [Development Commands](#development-commands)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

**Kuber Player** is a self-hosted video streaming server you run on your own PC or VPS. Drop your media files into the `media/` folder and instantly stream them from any browser — phone, tablet, PC — with a professional Netflix-style interface.

### Key Features

| Feature | Description |
|---------|-------------|
| 🎬 **Native streaming** | Streams MKV, MP4, WebM, AVI, MOV via byte-range HTTP — no transcoding needed |
| 📺 **Netflix-style UI** | Hero banner, card rows, series/season/episode browser |
| 📁 **Series support** | Automatically organises nested folders into Series → Season → Episode |
| ▶ **Smart player** | Skip ±10s, PiP, speed control, resume where you stopped, auto-play next episode |
| 📱 **Mobile optimised** | Responsive design, touch gestures, mobile-friendly controls |
| 🔄 **Continue watching** | Saves progress per video in the browser — resume from exactly where you stopped |
| ⏭ **Auto-play next** | Shows "Up Next" countdown at 30s before end, auto-advances to next episode |
| 📡 **Live server log** | Terminal-style SSE log viewer built into the UI |
| 🌐 **Proxy architecture** | Backend and frontend talk locally — only expose one port for Cloudflare/tunneling |
| 🔍 **Live search** | Filter your library instantly by title |
| 🔄 **Auto-detect new files** | Library polls every 4 seconds — drop a file and it appears automatically |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser / Phone                    │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │           Kuber Frontend (Vite / TS)           │  │
│  │                                               │  │
│  │  SPA Router (home / movies / series / player) │  │
│  │  PlayerControls (skip, PiP, speed, resume)    │  │
│  │  KuberPlayer SDK → PlaybackEngine             │  │
│  │  AnalyticsPlugin → POST /api/v1/events        │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │ /api/* (relative URL)          │
│                     │ proxied by Vite                │
└─────────────────────┼───────────────────────────────┘
                      │ localhost:8080
┌─────────────────────▼───────────────────────────────┐
│               Kuber Backend (Node.js)                │
│                                                      │
│  GET  /api/v1/library           → media tree JSON   │
│  GET  /api/v1/videos            → flat video list   │
│  GET  /api/v1/video/:id/raw     → byte-range stream │
│  GET  /api/v1/video/:id/stream/ → HLS / poster      │
│  POST /api/v1/events            → analytics ingest  │
│  GET  /api/v1/analytics         → stats             │
│  GET  /api/v1/logs              → SSE log stream    │
│  GET  /api/v1/system/health     → health check      │
│                                                      │
│  media/ folder ← auto-scanned on every request      │
└─────────────────────────────────────────────────────┘
```

### Proxy Architecture (Key Design)

The Vite dev server acts as a **transparent API proxy**:

```
Browser → http://localhost:3000/api/* → Vite proxy → http://localhost:8080/api/*
```

This means:
- **Only port 3000** needs to be exposed publicly (Cloudflare, port-forward, etc.)
- Port 8080 (backend) stays **local only** — never exposed
- Works identically on localhost, LAN, and through Cloudflare Tunnel

---

## Project Structure

```
kuber-player/
│
├── backend/
│   ├── mock_server.js          # Zero-dependency Node.js server (main backend)
│   └── data/
│       └── streaming/          # Generated HLS playlists & poster images
│
├── frontend/
│   ├── index.html              # SPA shell
│   ├── vite.config.ts          # Proxy config: /api/* → localhost:8080
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── main.ts             # Full SPA: router, pages, player mount, search
│       ├── core/
│       │   ├── KuberPlayer.ts      # Player class (public API)
│       │   ├── PlaybackEngine.ts   # hls.js + native byte-range video
│       │   ├── EventEmitter.ts     # Typed event bus
│       │   ├── PluginManager.ts    # Plugin lifecycle
│       │   └── KeyboardShortcuts.ts
│       ├── plugins/
│       │   ├── AnalyticsPlugin.ts  # Auto-reports play/pause/seek/heartbeat
│       │   ├── WatermarkPlugin.ts
│       │   ├── SponsorSkipPlugin.ts
│       │   └── HeatmapPlugin.ts
│       └── ui/
│           ├── PlayerControls.ts   # Custom overlay: skip, PiP, speed, resume
│           ├── Controls.ts         # Legacy full UI (unused in SPA mode)
│           └── theme.css           # Complete design system (dark, mobile-first)
│
├── media/                      # ← Drop your videos here
├── start.bat                   # Windows one-click start
├── start.sh                    # Linux/Mac one-click start
└── README.md
```

---

## Media Folder Layout

Kuber Player automatically organises your media based on your folder structure.

### Movies (flat files)

Drop video files directly into `media/`:

```
media/
├── Inception.2010.1080p.mkv          → appears as a Movie card
├── The.Dark.Knight.2008.mkv          → appears as a Movie card
└── Interstellar.2014.mp4             → appears as a Movie card
```

### Series (nested folders)

Create a folder per show. Inside, create Season folders, then put episodes inside:

```
media/
└── Breaking Bad/
    ├── Season 1/
    │   ├── S01E01 - Pilot.mkv
    │   ├── S01E02 - Cat's in the Bag.mkv
    │   └── S01E03 - And the Bag's in the River.mkv
    ├── Season 2/
    │   ├── S02E01 - Seven Thirty-Seven.mkv
    │   └── S02E02 - Down.mkv
    └── Season 3/
        └── S03E01 - No Más.mkv
```

This automatically appears as a **Series card** with season tabs and episode list — just like Netflix.

> **Flat series** (no Season folders) also work — all episodes go under "Season 1" automatically.

### Supported Formats

| Format | Extension |
|--------|-----------|
| MP4 / M4V | `.mp4`, `.m4v` |
| Matroska | `.mkv` |
| WebM | `.webm` |
| AVI | `.avi` |
| QuickTime | `.mov` |
| Windows Media | `.wmv` |
| Flash Video | `.flv` |
| MPEG-TS | `.ts` |

---

## Quick Start

### Windows

**Option 1 — Double-click start (recommended):**

Double-click `start.bat` in the project root. It starts both the backend and frontend automatically.

**Option 2 — Manual (two CMD windows):**

```cmd
:: Window 1 — Backend
cd /d "D:\kuber player\backend"
node mock_server.js

:: Window 2 — Frontend
cd /d "D:\kuber player\frontend"
npx vite --host 0.0.0.0 --port 3000 --force
```

Open **http://localhost:3000** in your browser.

---

### Linux / VPS

```bash
# Clone and enter project
git clone https://github.com/yourusername/kuber-player.git
cd kuber-player

# Install frontend dependencies
cd frontend && npm install && cd ..

# Make start script executable
chmod +x start.sh

# Start everything
./start.sh
```

Or manually in two terminals:

```bash
# Terminal 1 — Backend
cd backend
node mock_server.js

# Terminal 2 — Frontend
cd frontend
npx vite --host 0.0.0.0 --port 3000 --force
```

Open **http://localhost:3000** in your browser.

---

### macOS

Same as Linux. Use `./start.sh` or the two-terminal manual approach above.

---

### Prerequisites

| Tool | Version | Required For |
|------|---------|-------------|
| [Node.js](https://nodejs.org/) | ≥ 18 | Backend + frontend |
| [npm](https://npmjs.com/) | ≥ 9 | Frontend dependencies |

---

## Backend Reference

The backend is `backend/mock_server.js` — a single zero-dependency Node.js file.

**Starts on:** `http://0.0.0.0:8080`

**What it does on startup:**
1. Scans `media/` for all video files and subfolders
2. Registers each video (or series/episode) with a generated ID
3. Creates HLS playlist stubs for the streaming endpoints
4. Generates poster images

**What it does on each request:**
- `GET /api/v1/library` — re-scans `media/` and returns the full hierarchical structure
- `GET /api/v1/videos` — re-scans and returns a flat list
- All other endpoints — serve from in-memory state

---

### REST API Reference

**Base URL:** `http://localhost:8080`  
All responses are JSON unless noted. All endpoints include `Access-Control-Allow-Origin: *`.

---

#### `GET /api/v1/library`

Returns the complete media library as a structured tree — movies at root level, series with their seasons and episodes. **This is the primary endpoint used by the frontend.**

```json
{
  "movies": [
    {
      "id": "inception_2010_1080p",
      "title": "Inception.2010.1080p",
      "type": "movie",
      "filename": "Inception.2010.1080p.mkv",
      "size": 8589934592,
      "duration": 8880,
      "thumbnail": "/api/v1/video/inception_2010_1080p/thumbnail"
    }
  ],
  "series": [
    {
      "id": "breaking_bad",
      "title": "Breaking Bad",
      "type": "series",
      "seasons": [
        {
          "number": 1,
          "title": "Season 1",
          "episodes": [
            {
              "id": "breaking_bad_s1_e1",
              "title": "S01E01 - Pilot",
              "number": 1,
              "seasonNumber": 1,
              "size": 1073741824,
              "duration": 3180,
              "thumbnail": "/api/v1/video/breaking_bad_s1_e1/thumbnail",
              "seriesId": "breaking_bad"
            }
          ]
        }
      ]
    }
  ]
}
```

---

#### `GET /api/v1/videos`

Returns a flat array of all registered video records (movies + episodes). Also triggers a fresh media folder scan.

---

#### `GET /api/v1/video/:id`

Returns full details for a single video.

```json
{
  "video": {
    "id": "inception_2010_1080p",
    "title": "Inception.2010.1080p",
    "filepath": "D:\\kuber player\\media\\Inception.2010.1080p.mkv",
    "status": "completed",
    "duration": 8880,
    "width": 1920,
    "height": 1080,
    "bitrate": 8000000,
    "codec": "h264/aac",
    "size": 8589934592
  },
  "chapters": []
}
```

---

#### `GET /api/v1/video/:id/raw`

**The primary playback endpoint.** Streams the actual video file with full HTTP byte-range support. The browser's `<video>` element uses this directly — seeking into large multi-GB files works instantly.

**Request headers (optional):**
```
Range: bytes=0-1048575
```

**Response 206 (partial content):**
```
Content-Type: video/x-matroska
Content-Range: bytes 0-1048575/1402428710
Accept-Ranges: bytes
Content-Length: 1048576
[binary video data]
```

**Response 200 (full file):**
```
Content-Type: video/x-matroska
Content-Length: 1402428710
Accept-Ranges: bytes
```

---

#### `GET /api/v1/video/:id/stream/:filename`

Serve HLS playlist and asset files. Valid filenames:

| Filename | Description |
|----------|-------------|
| `master.m3u8` | HLS master playlist |
| `stream_720p.m3u8` | 720p variant |
| `stream_480p.m3u8` | 480p variant |
| `poster.jpg` | Poster/thumbnail image |
| `sprite.vtt` | Seek bar sprite map (WebVTT) |
| `sprite_001.jpg` | Sprite sheet image |

---

#### `GET /api/v1/video/:id/thumbnail`

Alias → `stream/poster.jpg`. Returns `image/jpeg`.

---

#### `DELETE /api/v1/video/:id`

Deletes the video file from disk and removes HLS assets and the in-memory record.

**Response:** `204 No Content`

---

#### `POST /api/v1/events`

Ingest an analytics event from the player.

```json
{
  "session_id": "abc123",
  "video_id": "inception_2010_1080p",
  "event_type": "play",
  "watch_time": 120.5,
  "timestamp": "2026-06-28T05:30:00Z"
}
```

**Event types:** `play`, `pause`, `seek`, `buffer`, `ended`, `heartbeat`, `unload`

---

#### `GET /api/v1/analytics`

Global aggregated stats across all sessions.

```json
{
  "total_views": 42,
  "avg_watch_time": 3240.5,
  "avg_completion": 67.3,
  "total_buffers": 5,
  "avg_buffer_duration": 1.2
}
```

---

#### `GET /api/v1/video/:id/analytics`

Per-video analytics.

---

#### `GET /api/v1/system/health`

```json
{ "status": "healthy", "database": "ok", "storage": "ok", "media_count": 7 }
```

---

#### `GET /api/v1/logs`

Opens a persistent **SSE (Server-Sent Events)** connection. The frontend Live Log panel subscribes to this automatically.

```
Content-Type: text/event-stream

data: {"ts":"2026-06-28T05:30:01Z","level":"HTTP","msg":"GET /api/v1/library"}
data: {"ts":"2026-06-28T05:30:01Z","level":"INFO","msg":"RAW bytes=0-1048575/1402428710"}
: ping
```

**Log levels:**

| Level | Colour | Description |
|-------|--------|-------------|
| `HTTP` | Blue | Incoming HTTP requests |
| `INFO` | Green | Server info, file discovery, byte-range serves |
| `WARN` | Amber | Non-fatal warnings |
| `ERROR` | Red | Errors |
| `EVENT` | Purple | Analytics events from the player |

---

## Frontend Features

### Pages

| Page | URL Hash | Description |
|------|----------|-------------|
| **Home** | `#home` | Hero banner + Movies row + Series row + Continue Watching |
| **Movies** | `#movies` | Full grid of all movie files |
| **Series** | `#series` | Full grid of all series |
| **Series Detail** | `#series/:id` | Season tabs, episode list with progress |
| **Player** | `#play/:id` | Video player + episode sidebar (for series) |

---

### Player Controls

The player uses a **custom overlay** (`PlayerControls.ts`) with the following controls:

| Control | Description |
|---------|-------------|
| **▶ / ⏸ Play/Pause** | Large center button |
| **⏪ Skip -10s** | Jump back 10 seconds |
| **⏩ Skip +10s** | Jump forward 10 seconds |
| **Progress bar** | Click or drag to seek · Shows buffered (white) and played (indigo) |
| **Time tooltip** | Hover over seek bar to preview timestamp |
| **🔊 Volume** | Slider + mute button |
| **⚡ Speed** | Popup menu: 0.25× / 0.5× / 0.75× / 1× / 1.25× / 1.5× / 1.75× / 2× |
| **📺 PiP** | Picture in Picture — watch while browsing other tabs |
| **⛶ Fullscreen** | Fills the entire screen |
| **Auto-hide** | Controls fade out after 3 seconds of inactivity |
| **Resume banner** | Auto-seeks to last saved position, shows "Start Over" option |

### Continue Watching

Progress is saved to `localStorage` every 3 seconds while playing. When you re-open a video:
- It automatically resumes from where you stopped
- A banner shows "Resumed from X:XX" with a **Start Over** button
- Banner auto-dismisses after 5 seconds
- Progress is cleared when the video finishes

### Auto-play Next Episode

For series:
- An **"Up Next"** overlay appears 30 seconds before the current episode ends
- A 10-second countdown auto-advances to the next episode
- Buttons to **Play Now** or **Cancel**

---

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` or `K` | Play / Pause |
| `←` Arrow Left | Skip back 10 seconds |
| `→` Arrow Right | Skip forward 10 seconds |
| `↑` Arrow Up | Volume up 10% |
| `↓` Arrow Down | Volume down 10% |
| `M` | Toggle mute |
| `F` | Toggle fullscreen |
| `P` | Toggle Picture in Picture |

---

### Mobile Gestures

| Gesture | Action |
|---------|--------|
| **Single tap** | Show / hide controls |
| **Double-tap left side** | Skip back 10 seconds (with ripple animation) |
| **Double-tap right side** | Skip forward 10 seconds (with ripple animation) |
| **Drag on seek bar** | Seek to position |

---

### Search

The search bar in the navigation bar filters your library live as you type. Works across movie titles and series names on the Home, Movies, and Series pages.

---

## Cloudflare Tunnel (Public Access)

Kuber Player is designed to work seamlessly with Cloudflare Tunnel. Because the frontend proxies all `/api/*` calls internally to the backend on `localhost:8080`, **you only need to expose one port**.

### Setup

1. Start both servers as described in [Quick Start](#quick-start)
2. Install `cloudflared`:
   ```bash
   # Windows
   winget install Cloudflare.cloudflared

   # Linux
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
   chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/
   ```
3. Create a tunnel for the **frontend only**:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
4. Cloudflare gives you a public URL like `https://xxxx.trycloudflare.com`. Open that URL on any device.

> **No need to tunnel port 8080.** The backend stays local and private.

---

## Local Network Access

To watch on your phone or tablet on the same Wi-Fi:

1. Find your PC's local IP:
   - **Windows:** `ipconfig` → look for `IPv4 Address` (e.g. `192.168.1.10`)
   - **Linux:** `hostname -I`
2. On your phone, open: `http://192.168.1.10:3000`

Both servers listen on `0.0.0.0` so they accept connections from any device on the network.

---

## Player SDK

If you want to embed the player in your own app or website:

```typescript
import { KuberPlayer } from './core/KuberPlayer';
import { AnalyticsPlugin } from './plugins/AnalyticsPlugin';

const player = new KuberPlayer({
  container: '#my-player-div',
  src: 'http://localhost:8080/api/v1/video/my_movie/raw',
  autoplay: false,
  controls: false,           // false = handle UI yourself
  plugins: [
    new AnalyticsPlugin({
      endpoint: 'http://localhost:8080/api/v1/events',
      videoId:  'my_movie',
      heartbeatIntervalMs: 5000,
    }),
  ],
});

// Events
player.on('play',       () => console.log('Playing'));
player.on('pause',      () => console.log('Paused'));
player.on('timeupdate', () => console.log(player.getCurrentTime()));
player.on('ended',      () => console.log('Done'));

// Methods
player.play();
player.pause();
player.seek(120);              // Jump to 2 minutes
player.setVolume(0.8);         // 80% volume
player.setPlaybackRate(1.5);   // 1.5× speed
player.getDuration();          // Total seconds
player.getCurrentTime();       // Current position

// Cleanup
player.destroy();
```

> **Source detection:** If `src` ends with `.m3u8` → uses `hls.js` for HLS adaptive streaming. Otherwise → uses the native `<video>` element with byte-range HTTP for local files. Seeking into a 10GB MKV works instantly with no transcoding.

---

## Plugin System

All plugins implement this interface:

```typescript
interface PlayerPlugin {
  name: string;
  onInit(player: KuberPlayer): void;
  onDestroy(): void;
}
```

### AnalyticsPlugin

Reports playback events to the backend automatically.

```typescript
new AnalyticsPlugin({
  endpoint: 'http://localhost:8080/api/v1/events',
  videoId: 'my_movie',
  heartbeatIntervalMs: 5000,
})
```

**Auto-reported events:** `play`, `pause`, `seek`, `buffer`, `ended`, `heartbeat` (every 5s), `unload` (on page close)

### WatermarkPlugin

```typescript
import { WatermarkPlugin } from './plugins/WatermarkPlugin';
new WatermarkPlugin({ text: 'MY STREAM', opacity: 0.2, position: 'top-right' })
```

### SponsorSkipPlugin

```typescript
import { SponsorSkipPlugin } from './plugins/SponsorSkipPlugin';
new SponsorSkipPlugin([
  { startTime: 0,   endTime: 90  },   // Skip intro
  { startTime: 310, endTime: 345 },   // Skip sponsor
])
```

### HeatmapPlugin

```typescript
import { HeatmapPlugin } from './plugins/HeatmapPlugin';
new HeatmapPlugin([90, 85, 80, 75, 60, 55, 68, 80, 95, 88]) // retention per bucket
```

---

## Development Commands

```bash
# Install frontend dependencies
cd frontend && npm install

# Start backend (port 8080)
cd backend && node mock_server.js

# Start frontend dev server (port 3000, with API proxy)
cd frontend && npx vite --host 0.0.0.0 --port 3000 --force

# TypeScript type check (no build)
cd frontend && npx tsc --noEmit

# Production build
cd frontend && npx vite build
```

---

## Responsive Design

Kuber Player is built mobile-first and adapts to all screen sizes:

| Breakpoint | Behaviour |
|-----------|-----------|
| **Desktop** (>900px) | Full layout with episode sidebar |
| **Tablet** (≤900px) | Sidebar stacks below player, episode thumbs shrink |
| **Mobile** (≤600px) | Search hidden, compact nav, episode list without thumbs |
| **Small** (≤380px) | 2-column card grid, nav links hidden |

---

## Roadmap

- [ ] User accounts & watch history sync
- [ ] Subtitle file support (SRT/VTT)
- [ ] Multiple audio track switching UI
- [ ] Admin panel for library management
- [ ] Progressive Web App (PWA) — install to home screen
- [ ] Chromecast support
- [ ] Hardware-accelerated transcoding (FFmpeg)
- [ ] Auto-generated episode thumbnails

---

## License

MIT License — free to use, modify, and self-host. See [LICENSE](LICENSE) for details.
