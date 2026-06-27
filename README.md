# 🎬 Kuber Player

> A professional, open-source video streaming platform — decoupled backend engine and frontend player SDK.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.78+-CE422B?logo=rust)](https://www.rust-lang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite)](https://vitejs.dev/)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Backend](#backend)
  - [Mock Server Node.js](#mock-server-nodejs--development)
  - [Production Server Rust](#production-server-rust)
  - [REST API Reference](#rest-api-reference)
- [Frontend Player SDK](#frontend-player-sdk)
  - [Installation](#installation)
  - [Basic Usage](#basic-usage)
  - [Player Options](#player-options)
  - [Events](#events)
  - [API Methods](#api-methods)
  - [Built-in Plugins](#built-in-plugins)
  - [Framework Wrappers](#framework-wrappers)
- [Media Folder](#media-folder)
- [Running on Local Network](#running-on-local-network)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Development Commands](#development-commands)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

**Kuber Player** is a full-stack video streaming system split into two completely independent projects:

| Project | Technology | Role |
|---------|-----------|------|
| **Kuber Backend** | Rust (Axum) + SQLite + FFmpeg | REST API, transcoding engine, HLS packaging, analytics |
| **Kuber Frontend** | TypeScript + Vite + hls.js | Player SDK, UI controls, plugin system, framework wrappers |

The two projects communicate **only through the REST API**. Any frontend — React, Vue, Angular, Svelte, a mobile app, or a plain HTML page — can consume the backend without modification.

### Key Features

- **Native video playback** — streams local media files (MKV, MP4, WebM, AVI, MOV) directly via byte-range HTTP with full seeking support
- **HLS streaming** — full Apple HLS support via hls.js for remote/transcoded streams
- **Plugin architecture** — composable plugins for analytics, watermarking, sponsor-skip, and heatmaps
- **Live analytics dashboard** — real-time watch time, buffer stalls, completion rates
- **Live server log viewer** — built-in terminal-style SSE log stream in the UI
- **Network streaming** — accessible from any device on your local network
- **Framework wrappers** — drop-in components for React, Vue, Angular, and Svelte
- **Full keyboard control** — seek, volume, speed, fullscreen, chapter navigation
- **Glassmorphic UI** — premium dark-mode design with micro-animations

---

## Architecture

```
+-----------------------------------------------------------+
|                      Browser / App                        |
|                                                           |
|   +-------------------------------------------------------+
|   |           Kuber Player SDK (TypeScript)               |
|   |                                                       |
|   |  KuberPlayer -> PlaybackEngine (hls.js / native)      |
|   |             -> PlayerUI (Controls, Seek, Settings)    |
|   |             -> PluginManager                          |
|   |                  +-- AnalyticsPlugin                  |
|   |                  +-- WatermarkPlugin                  |
|   |                  +-- SponsorSkipPlugin                |
|   |                  +-- HeatmapPlugin                    |
|   +----------------------------+--------------------------+
+--------------------------------|--------------------------+
                                 |  REST API (HTTP/JSON)
+--------------------------------v--------------------------+
|                    Kuber Backend                          |
|                                                          |
|   Node.js Mock Server (dev) OR Rust/Axum Server (prod)  |
|                                                          |
|   GET  /api/v1/videos               -- list media        |
|   GET  /api/v1/video/:id/raw        -- byte-range stream |
|   GET  /api/v1/video/:id/stream/:f  -- HLS files         |
|   POST /api/v1/events               -- analytics ingest  |
|   GET  /api/v1/analytics            -- aggregated stats  |
|   GET  /api/v1/logs                 -- SSE log stream    |
|                                                          |
|   Storage: media/ folder (raw files) + SQLite (metadata) |
+----------------------------------------------------------+
```

---

## Project Structure

```
kuber-player/
|
+-- backend/                    # Rust production backend + Node.js dev mock
|   +-- src/
|   |   +-- main.rs             # Axum HTTP server entry point
|   |   +-- domain/             # Domain models (Video, Event, etc.)
|   |   +-- use_case/           # Business logic (transcode, analytics)
|   |   +-- infrastructure/     # SQLite, FFmpeg, storage adapters
|   |   +-- presentation/       # REST controllers, DTOs
|   +-- mock_server.js          # Zero-dependency Node.js dev server
|   +-- Cargo.toml
|
+-- frontend/                   # TypeScript Player SDK + Dev Sandbox UI
|   +-- src/
|   |   +-- main.ts             # Sandbox entry point (demo UI)
|   |   +-- core/
|   |   |   +-- KuberPlayer.ts      # Main player class (public API)
|   |   |   +-- PlaybackEngine.ts   # hls.js wrapper + native video fallback
|   |   |   +-- EventEmitter.ts     # Typed event bus
|   |   |   +-- PluginManager.ts    # Plugin lifecycle manager
|   |   |   +-- KeyboardShortcuts.ts
|   |   +-- plugins/
|   |   |   +-- AnalyticsPlugin.ts
|   |   |   +-- WatermarkPlugin.ts
|   |   |   +-- SponsorSkipPlugin.ts
|   |   |   +-- HeatmapPlugin.ts
|   |   +-- ui/
|   |   |   +-- Controls.ts         # Full player UI
|   |   |   +-- theme.css           # Glassmorphic design tokens
|   |   +-- wrappers/
|   |       +-- ReactWrapper.tsx
|   |       +-- VueWrapper.vue
|   |       +-- SvelteWrapper.svelte
|   |       +-- AngularWrapper.ts
|   +-- index.html              # Dev sandbox page
|   +-- vite.config.ts
|   +-- tsconfig.json
|   +-- package.json
|
+-- media/                      # Drop video files here -- auto-detected
+-- docs/
+-- examples/
+-- README.md
```

---

## Quick Start

### Prerequisites

| Tool | Version | Required For |
|------|---------|-------------|
| [Node.js](https://nodejs.org/) | >= 18 | Mock server + frontend dev |
| [npm](https://npmjs.com/) | >= 9 | Frontend dependencies |
| [Rust + Cargo](https://rustup.rs/) | >= 1.78 | Production backend only |
| [FFmpeg](https://ffmpeg.org/) | >= 6 | Production transcoding only |

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/kuber-player.git
cd kuber-player
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Start the development servers

Open **two separate terminal/CMD windows**:

**CMD Window 1 — Backend API server:**
```cmd
cd /d "D:\kuber player\backend"
node mock_server.js
```

**CMD Window 2 — Frontend dev server:**
```cmd
cd /d "D:\kuber player\frontend"
npx vite --host 0.0.0.0 --port 3000 --force
```

### 4. Open in browser

```
http://localhost:3000
```

That's it. Drop any video file into the `media/` folder and it will appear in the UI within 2 seconds automatically.

---

## Backend

### Mock Server (Node.js) — Development

The file `backend/mock_server.js` is a **zero-dependency** Node.js server requiring nothing beyond Node.js itself. It is the recommended way to run Kuber Player during development.

**Start:**
```cmd
cd backend
node mock_server.js
```

**What it does:**
- Scans the `media/` folder on startup and on every API list request
- Serves video files as byte-range HTTP streams so browsers can seek natively into large files
- Generates HLS playlist files for streaming
- Accepts and aggregates analytics events in memory
- Streams live server logs to the frontend UI via SSE
- Runs on port **8080** bound to all network interfaces (`0.0.0.0`)

**Supported media formats:**

| Format | Extension | MIME Type |
|--------|-----------|-----------|
| MP4 | `.mp4`, `.m4v` | `video/mp4` |
| Matroska | `.mkv` | `video/x-matroska` |
| WebM | `.webm` | `video/webm` |
| AVI | `.avi` | `video/x-msvideo` |
| QuickTime | `.mov` | `video/quicktime` |
| Windows Media | `.wmv` | `video/x-ms-wmv` |
| Flash Video | `.flv` | `video/x-flv` |

---

### Production Server (Rust)

The production backend uses the **Axum** web framework with clean architecture.

**Build and run:**
```bash
cd backend

# Debug build (faster compile)
cargo run

# Optimised release build
cargo build --release
./target/release/kuber-backend
```

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listening port |
| `DATABASE_URL` | `./kuber.db` | SQLite database path |
| `MEDIA_DIR` | `../media` | Media file storage directory |
| `STREAM_DIR` | `./data/streaming` | HLS output directory |
| `FFMPEG_PATH` | `ffmpeg` | Path to the FFmpeg binary |
| `MAX_UPLOAD_SIZE_MB` | `4096` | Maximum upload size in MB |

---

### REST API Reference

**Base URL:** `http://localhost:8080`

All responses use `Content-Type: application/json` unless otherwise noted.
All endpoints include CORS headers (`Access-Control-Allow-Origin: *`).

---

#### GET /api/v1/videos

List all registered videos. Also triggers a fresh scan of the `media/` folder.

**Response 200:**
```json
[
  {
    "id": "the_dark_knight",
    "title": "The Dark Knight",
    "filename": "the_dark_knight.mkv",
    "status": "completed",
    "duration": 9180.0,
    "width": 1920,
    "height": 1080,
    "bitrate": 8000000,
    "codec": "h264/aac",
    "size": 8589934592,
    "error_message": null
  }
]
```

---

#### GET /api/v1/video/:id

Get full details for a single video including chapter markers.

**Response 200:**
```json
{
  "video": {
    "id": "the_dark_knight",
    "title": "The Dark Knight",
    "filename": "the_dark_knight.mkv",
    "status": "completed",
    "duration": 9180.0,
    "width": 1920,
    "height": 1080,
    "bitrate": 8000000,
    "codec": "h264/aac",
    "size": 8589934592,
    "error_message": null
  },
  "chapters": [
    { "id": "c1", "video_id": "the_dark_knight", "title": "Introduction", "start_time": 0.0, "end_time": 1377.0 },
    { "id": "c2", "video_id": "the_dark_knight", "title": "Act I",        "start_time": 1377.0, "end_time": 3672.0 },
    { "id": "c3", "video_id": "the_dark_knight", "title": "Act II",       "start_time": 3672.0, "end_time": 6885.0 },
    { "id": "c4", "video_id": "the_dark_knight", "title": "Finale",       "start_time": 6885.0, "end_time": 9180.0 }
  ]
}
```

---

#### GET /api/v1/video/:id/raw

Stream the actual video file with full **byte-range** support. This is the primary playback endpoint for local media files. The browser's native `<video>` element can use this URL directly with seeking working out of the box.

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

**Response 200 (full file, no Range header):**
```
Content-Type: video/x-matroska
Content-Length: 1402428710
Accept-Ranges: bytes
[binary video data]
```

---

#### GET /api/v1/video/:id/playlist

Returns the HLS master playlist (`master.m3u8`) listing all available quality variants. Use this as `src` when loading an HLS stream through hls.js.

**Response 200:**
```
Content-Type: application/x-mpegURL

#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
stream_720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
stream_480p.m3u8
```

---

#### GET /api/v1/video/:id/stream/:filename

Serve individual HLS stream files. Valid filenames:
- `master.m3u8` — master playlist
- `stream_720p.m3u8` — 720p variant playlist
- `stream_480p.m3u8` — 480p variant playlist
- `poster.jpg` — poster thumbnail
- `sprite.vtt` — seek thumbnail WebVTT map
- `sprite_001.jpg` — sprite sheet image

---

#### GET /api/v1/video/:id/thumbnail

Alias for `/api/v1/video/:id/stream/poster.jpg`. Returns the poster image (`image/jpeg`).

---

#### GET /api/v1/video/:id/sprite

Alias for `/api/v1/video/:id/stream/sprite.vtt`. Returns the WebVTT sprite file for seek bar thumbnail previews.

---

#### DELETE /api/v1/video/:id

Delete a video. Removes:
- The source file from the `media/` folder on disk
- All generated HLS/stream files
- The video record from the in-memory database

**Response:** `204 No Content`

---

#### POST /api/v1/events

Ingest a player analytics event.

**Request body:**
```json
{
  "session_id": "abc123def456",
  "video_id": "the_dark_knight",
  "event_type": "play",
  "watch_time": 42.5,
  "timestamp": "2026-06-27T14:00:00Z"
}
```

**Event types:**

| Type | Triggered When |
|------|---------------|
| `play` | Playback starts |
| `pause` | Playback paused |
| `seek` | User seeks in timeline |
| `buffer` | Buffering / stall detected |
| `ended` | Video reaches the end |
| `heartbeat` | Periodic keep-alive during playback |
| `unload` | Player destroyed / page closed |

**Response:** `200 OK`

---

#### GET /api/v1/analytics

Get aggregated global analytics across all videos and sessions.

**Response 200:**
```json
{
  "total_views": 128,
  "avg_watch_time": 3240.5,
  "avg_completion": 67.3,
  "total_buffers": 12,
  "avg_buffer_duration": 1.2,
  "device_distribution": {
    "desktop": 95,
    "mobile": 33
  }
}
```

---

#### GET /api/v1/video/:id/analytics

Get per-video analytics for a specific video.

**Response 200:**
```json
{
  "video_id": "the_dark_knight",
  "total_plays": 45,
  "unique_sessions": 38,
  "total_watch_time": 145800.0,
  "avg_watch_time": 3240.0,
  "total_buffers": 5,
  "avg_buffer_duration": 0.9,
  "completion_rate": 71.2,
  "device_breakdown": {
    "desktop": 30,
    "mobile": 15
  }
}
```

---

#### GET /api/v1/system/health

System health check endpoint. Use this for monitoring or uptime checks.

**Response 200:**
```json
{
  "status": "healthy",
  "database": "ok",
  "storage": "ok",
  "media_count": 7
}
```

---

#### GET /api/v1/logs

Opens a persistent **Server-Sent Events (SSE)** connection. The server pushes all log entries in real time as they happen. The frontend Live Log panel subscribes to this endpoint automatically.

**Response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event format:**
```
data: {"ts":"2026-06-27T14:09:20Z","level":"HTTP","msg":"GET /api/v1/videos"}

data: {"ts":"2026-06-27T14:09:21Z","level":"INFO","msg":"RAW range: bytes=0-1048575/1402428710 (1.00MB)"}

: ping
```

**Log levels:**

| Level | UI Colour | Description |
|-------|-----------|-------------|
| `HTTP` | Blue | All incoming HTTP requests |
| `INFO` | Green | Server info, file discovery, byte-range serves |
| `WARN` | Amber | Non-fatal warnings |
| `ERROR` | Red | Errors and failures |
| `EVENT` | Purple | Analytics events received from the player |

---

## Frontend Player SDK

### Installation

```bash
cd frontend
npm install
```

The SDK is framework-agnostic TypeScript. Import `KuberPlayer` directly from `src/core/KuberPlayer.ts`.

---

### Basic Usage

```typescript
import { KuberPlayer } from './core/KuberPlayer';

const player = new KuberPlayer({
  container: document.getElementById('my-player')!,
  src: 'http://localhost:8080/api/v1/video/my_movie/raw',
  poster: 'http://localhost:8080/api/v1/video/my_movie/thumbnail',
  autoplay: true,
  muted: false,
});

player.on('ready', () => {
  console.log('Player is ready. Duration:', player.getDuration());
});

player.on('timeupdate', () => {
  console.log('Current time:', player.getCurrentTime());
});

// Clean up when done
player.destroy();
```

---

### Player Options

```typescript
interface PlayerOptions {
  // Required
  container: string | HTMLElement;  // CSS selector string or DOM element

  // Required
  src: string;
  // Pass a raw file URL  (/api/v1/video/:id/raw)   for local MKV/MP4/WebM
  // Pass an HLS URL     (/api/v1/video/:id/playlist) for HLS streams
  // The player auto-detects which mode to use.

  // Optional
  poster?: string;          // Poster/thumbnail image URL
  spriteVtt?: string;       // WebVTT URL for seek bar thumbnail previews
  autoplay?: boolean;       // Auto-start playback. Default: false
  muted?: boolean;          // Start muted. Default: false
  controls?: boolean;       // Render built-in UI controls. Default: true
  plugins?: PlayerPlugin[]; // Array of plugin instances
}
```

> **Note on src detection:** If the `src` URL does not end in `.m3u8` and does not contain `playlist`, the player uses the native HTML5 `<video>` element with byte-range support — enabling instant seeking into multi-gigabyte files without any transcoding. If the `src` is an `.m3u8` URL, hls.js is used for full HLS adaptive bitrate streaming.

---

### Events

Listen to player events with `player.on(eventName, callback)`:

```typescript
// Lifecycle
player.on('ready',          () => {})          // Player fully initialised and ready
player.on('play',           () => {})          // Playback started
player.on('pause',          () => {})          // Playback paused
player.on('ended',          () => {})          // Video finished

// Time & Progress
player.on('timeupdate',     (e: Event) => {})  // Current time changed (fires frequently)
player.on('seeking',        (e: Event) => {})  // User initiated a seek
player.on('seeked',         (e: Event) => {})  // Seek completed
player.on('progress',       (e: Event) => {})  // Buffer progress updated
player.on('durationchange', (e: Event) => {})  // Video duration became known

// Buffering
player.on('waiting',        (e: Event) => {})  // Buffering started (player stalled)
player.on('playing',        (e: Event) => {})  // Buffering ended, playback resumed

// Volume & Speed
player.on('volumechange',   (e: Event) => {})  // Volume or mute state changed
player.on('ratechange',     (e: Event) => {})  // Playback speed changed

// HLS-specific
player.on('qualities',      (q: QualityLevel[]) => {})   // Quality levels parsed from manifest
player.on('qualityChanged', (info: object) => {})        // Active quality level switched
player.on('manifestLoaded', () => {})                    // HLS manifest fully parsed

// Errors
player.on('error',          (err: any) => {})  // Fatal playback error
player.on('warn',           (data: any) => {}) // Non-fatal hls.js warning
```

---

### API Methods

```typescript
// --- Playback ---
player.play(): Promise<void>          // Start / resume playback
player.pause(): void                  // Pause playback
player.seek(seconds: number): void    // Jump to a specific time in seconds
player.destroy(): void                // Tear down the player and remove it from DOM

// --- State ---
player.getDuration(): number          // Total video duration in seconds
player.getCurrentTime(): number       // Current playback position in seconds
player.getBufferedDuration(): number  // Seconds buffered ahead of current position
player.getOptions(): PlayerOptions    // Returns the options object passed to constructor

// --- Volume ---
player.setVolume(value: number): void // 0.0 (silent) to 1.0 (full)
player.setMute(muted: boolean): void  // Toggle mute

// --- Speed ---
player.setPlaybackRate(rate: number): void
// Recommended values: 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0

// --- Quality (HLS only) ---
player.setQuality(index: number): void
// Pass -1 for Auto (ABR). Pass 0, 1, 2... for specific quality levels
// Quality indices correspond to the levels from the 'qualities' event

// --- Subtitles (HLS only) ---
player.setSubtitle(index: number): void
// Pass -1 to disable. Pass 0, 1... for tracks from the 'subtitles' event

// --- Audio Track (HLS only) ---
player.setAudioTrack(index: number): void

// --- Internals ---
player.getPlaybackEngine(): PlaybackEngine  // Access underlying PlaybackEngine
```

---

### Built-in Plugins

Plugins are passed as instances in the `plugins` array of `PlayerOptions`. They are initialised after the player is ready and destroyed when `player.destroy()` is called.

All plugins implement the `PlayerPlugin` interface:
```typescript
interface PlayerPlugin {
  name: string;
  onInit(player: KuberPlayer): void;
  onDestroy(): void;
}
```

---

#### AnalyticsPlugin

Reports playback lifecycle events to a configurable HTTP endpoint. Sends heartbeat events periodically while the video is playing. Automatically reports `unload` when the page is closed.

```typescript
import { AnalyticsPlugin } from './plugins/AnalyticsPlugin';

new AnalyticsPlugin({
  endpoint: 'http://localhost:8080/api/v1/events',
  videoId: 'my_movie',
  heartbeatIntervalMs: 5000,   // Default: 5000ms (5 seconds)
})
```

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| `endpoint` | `string` | URL to POST events to |
| `videoId` | `string` | Video ID to include in all events |
| `heartbeatIntervalMs` | `number` | How often to send heartbeats while playing |

**Events automatically posted:** `play`, `pause`, `seek`, `buffer`, `ended`, `heartbeat`, `unload`

---

#### WatermarkPlugin

Renders a translucent text label overlaid on the player. Useful for branding or DRM-style attribution.

```typescript
import { WatermarkPlugin } from './plugins/WatermarkPlugin';

new WatermarkPlugin({
  text: 'KUBER PLAYER',
  opacity: 0.25,
  position: 'top-right',
})
```

**Options:**
| Option | Type | Values | Description |
|--------|------|--------|-------------|
| `text` | `string` | Any | Text to display |
| `opacity` | `number` | `0.0` – `1.0` | Transparency level |
| `position` | `string` | `top-left`, `top-right`, `bottom-left`, `bottom-right` | Corner placement |

---

#### SponsorSkipPlugin

Automatically skips over defined time ranges during playback. A notification banner slides in during the skip zone. Use for auto-skipping intros, credits, or sponsor segments.

```typescript
import { SponsorSkipPlugin } from './plugins/SponsorSkipPlugin';

new SponsorSkipPlugin([
  { startTime: 0.0,   endTime: 90.0  },   // Skip opening intro (first 90s)
  { startTime: 310.0, endTime: 345.0 },   // Skip sponsor segment
])
```

**Skip range options:**
| Option | Type | Description |
|--------|------|-------------|
| `startTime` | `number` | Start of skip range in seconds |
| `endTime` | `number` | End of skip range in seconds |

---

#### HeatmapPlugin

Renders a waveform-style audience retention heatmap on the seek bar. The heatmap fades in when the user hovers over the seek bar and fades out when they move away.

```typescript
import { HeatmapPlugin } from './plugins/HeatmapPlugin';

// Provide an array of percentage values (0-100), one per timeline bucket.
// More values = higher resolution heatmap.
new HeatmapPlugin([
  90, 85, 80, 75, 60, 55, 68, 80, 95, 88,
  72, 65, 50, 48, 55, 70, 85, 78, 60, 45, 30
])
```

---

### Framework Wrappers

Pre-built components in `src/wrappers/` let you drop the player into any major framework.

#### React

```tsx
import { KuberPlayerReact } from './wrappers/ReactWrapper';

function App() {
  return (
    <KuberPlayerReact
      src="http://localhost:8080/api/v1/video/my_movie/raw"
      poster="http://localhost:8080/api/v1/video/my_movie/thumbnail"
      autoplay={false}
      muted={false}
      className="my-player-wrapper"
      style={{ width: '100%', aspectRatio: '16/9' }}
    />
  );
}
```

#### Vue 3

```vue
<template>
  <KuberPlayerVue
    :src="videoUrl"
    :poster="posterUrl"
    :autoplay="false"
    style="width: 100%"
  />
</template>

<script setup lang="ts">
import KuberPlayerVue from './wrappers/VueWrapper.vue';
const videoUrl = 'http://localhost:8080/api/v1/video/my_movie/raw';
const posterUrl = 'http://localhost:8080/api/v1/video/my_movie/thumbnail';
</script>
```

#### Svelte

```svelte
<script>
  import KuberPlayerSvelte from './wrappers/SvelteWrapper.svelte';
</script>

<KuberPlayerSvelte
  src="http://localhost:8080/api/v1/video/my_movie/raw"
  autoplay={false}
/>
```

#### Angular

```typescript
// In app.module.ts
import { KuberPlayerAngular } from './wrappers/AngularWrapper';
// Declare it in your NgModule declarations

// In template:
// <kuber-player [src]="videoUrl" [autoplay]="false"></kuber-player>
```

---

## Media Folder

The `media/` directory in the project root is the **watched media library**.

```
kuber-player/
+-- media/
    +-- my_movie.mkv          <- drop files here
    +-- documentary.mp4
    +-- short_clip.webm
    +-- README.md
```

**How it works:**

1. Copy or move any supported video file into the `media/` folder
2. Within **2 seconds**, it automatically appears in the web UI (the frontend polls `/api/v1/videos` every 2 seconds)
3. Click **Play** next to the video title to start streaming
4. The **Delete** button removes the file from disk and unregisters it from the UI instantly

No restart is needed. No configuration required. The server detects new files on every list request.

**Supported extensions:** `.mp4` `.mkv` `.webm` `.avi` `.mov` `.m4v` `.wmv` `.flv`

---

## Running on Local Network

Access Kuber Player from **any device on your Wi-Fi** — phones, tablets, smart TVs, other laptops.

### Step 1 — Start both servers

**CMD Window 1 (backend):**
```cmd
cd /d "D:\kuber player\backend"
node mock_server.js
```

**CMD Window 2 (frontend):**
```cmd
cd /d "D:\kuber player\frontend"
npx vite --host 0.0.0.0 --port 3000 --force
```

### Step 2 — Open Windows Firewall ports

Open **CMD as Administrator** (right-click Start -> "Command Prompt (Admin)") and run:

```cmd
netsh advfirewall firewall add rule name="Kuber Player Frontend 3000" dir=in action=allow protocol=TCP localport=3000

netsh advfirewall firewall add rule name="Kuber Player Backend 8080" dir=in action=allow protocol=TCP localport=8080
```

> You only need to do this once. The rules persist across reboots.

### Step 3 — Find your local IP address

```cmd
ipconfig
```

Look for **IPv4 Address** under your Wi-Fi adapter, e.g. `192.168.1.6`.

### Step 4 — Open on any device

Connect the device to the **same Wi-Fi network**, then open:

```
http://192.168.1.6:3000
```

Replace `192.168.1.6` with your actual IP address from Step 3.

| Device | URL |
|--------|-----|
| This PC | `http://localhost:3000` |
| Phone / Tablet | `http://192.168.1.6:3000` |
| Backend API | `http://192.168.1.6:8080` |

---

## Keyboard Shortcuts

These shortcuts are active whenever the player has focus.

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Arrow Left` | Seek back 5 seconds |
| `Arrow Right` | Seek forward 5 seconds |
| `Arrow Up` | Volume +10% |
| `Arrow Down` | Volume -10% |
| `M` | Toggle mute |
| `F` | Toggle fullscreen |
| `0` through `9` | Jump to 0% through 90% of the video |
| `<` | Decrease playback speed |
| `>` | Increase playback speed |
| `C` | Toggle subtitles on/off |

---

## Development Commands

| Command | Run From | Description |
|---------|----------|-------------|
| `node mock_server.js` | `backend/` | Start the development API server |
| `npx vite --host 0.0.0.0 --port 3000 --force` | `frontend/` | Start frontend dev server (all interfaces) |
| `npx tsc --noEmit` | `frontend/` | Type-check all TypeScript without emitting files |
| `npm run build` | `frontend/` | Build production bundle to `frontend/dist/` |
| `cargo run` | `backend/` | Run the Rust server in debug mode |
| `cargo build --release` | `backend/` | Build optimised Rust binary |
| `cargo test` | `backend/` | Run Rust unit tests |

---

## Roadmap

- [ ] **FFmpeg transcoding pipeline** — auto-convert MKV/AVI to HLS segments on detection
- [ ] **Multi-quality HLS** — real 1080p / 720p / 480p / 360p renditions from a single source file
- [ ] **Subtitle track support** — SRT/VTT injection and in-player renderer
- [ ] **Resume playback** — persist watch position per video in localStorage/IndexedDB
- [ ] **MPEG-DASH** — DASH manifest support alongside HLS
- [ ] **Authentication** — API key and JWT-based access control for the backend
- [ ] **Chromecast / AirPlay** — Cast protocol integration
- [ ] **Mobile app wrapper** — React Native / Capacitor shell
- [ ] **CDN-ready storage** — S3 / R2 / GCS remote storage adapters for the Rust backend
- [ ] **Docker Compose** — one-command containerised deployment
- [ ] **Thumbnail generation** — real FFmpeg-generated poster and sprite sheets
- [ ] **Watch party** — synchronised multi-user viewing via WebSockets

---

## License

This project is licensed under the **MIT License**.

```
MIT License

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
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

## Acknowledgements

- [hls.js](https://github.com/video-dev/hls.js) — HLS playback in the browser
- [Axum](https://github.com/tokio-rs/axum) — Rust async web framework
- [Vite](https://vitejs.dev/) — Next-generation frontend tooling
- [FFmpeg](https://ffmpeg.org/) — Video transcoding and processing engine
- [SQLite](https://www.sqlite.org/) — Embedded relational database

---

Built with love — Kuber Player. Open source. Self-hosted. No subscriptions.
