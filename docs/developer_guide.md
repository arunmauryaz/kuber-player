# Kuber Player — SDK & Streaming Engine Developer Guide

Welcome to the **Kuber Player** master developer guide. This document provides technical specifications and implementation details for integrating and extending the Kuber streaming engine (Rust backend) and player SDK (Vite/TypeScript frontend).

---

## 1. Directory Structure

The repository is divided into two completely independent projects:

```
kuber-player/
├── backend/            # Rust async HTTP server & transcode worker
│   ├── src/
│   │   ├── domain/     # Core models & repository interfaces (Video, Analytics)
│   │   ├── use_case/   # Job queue & service layer business logic
│   │   ├── infrastructure/ # SQLite repository, disk storage, FFmpeg transcoder
│   │   └── presentation/ # REST controllers, Axum routing & CORS
│   └── Cargo.toml
├── frontend/           # TypeScript Video Player SDK
│   ├── src/
│   │   ├── core/       # Player core (Playback engine, Event bus, hotkeys)
│   │   ├── ui/         # Premium glassmorphic timeline & controls UI
│   │   ├── plugins/    # Built-in plugins (Analytics, Watermark, Heatmap)
│   │   └── wrappers/   # Framework wrappers (React, Vue, Svelte, Angular)
│   ├── vite.config.ts  # Vite build library configuration
│   └── package.json
├── docs/               # Architecture documents and guides
└── examples/           # Integration scripts (Vanilla HTML, React)
```

---

## 2. Backend Architecture & REST API

The backend is built in Rust using the `axum` async framework and `tokio` runtime. Data persistence is managed via `sqlx` connecting to a local SQLite database.

### 2.1 Database Schema
All database actions are structured around three tables:
- **`videos`**: Tracks uploaded media files, active metadata (duration, width, height, bitrate, codec), and background transcoding status (`pending`, `processing`, `completed`, `failed`).
- **`chapters`**: Stores timestamped chapter markings overlaying the timeline.
- **`analytics_events`**: Chronological log of player actions (play, pause, seek, buffer, completion) containing browser agent and network speeds.

### 2.2 REST API Specification
All endpoints are versioned under `/api/v1`.

#### Upload Media Asset
- **Endpoint**: `POST /api/v1/upload`
- **Payload**: Multipart form data with fields:
  - `title` (string, optional): Display name.
  - `file` (binary, required): Media file (MP4, MKV, WebM, etc.).
- **Response**: `201 Created`
  ```json
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "demo.mp4",
    "status": "pending"
  }
  ```

#### Serves HLS Stream Playlists & Segments
- **Endpoints**:
  - `GET /api/v1/video/{id}/playlist`: Master `.m3u8` playlist.
  - `GET /api/v1/video/{id}/thumbnail`: Poster frame (`poster.jpg`).
  - `GET /api/v1/video/{id}/sprite`: Preview sprite sheet coordinates VTT (`sprite.vtt`).
  - `GET /api/v1/video/{id}/stream/{file}`: Internal variant playlists (`stream_720p.m3u8`) and segment packets (`segment_000.ts`).
- **Mock Fallback Routing**:
  If FFmpeg/FFprobe are not installed in the host system, the transcoder initializes in **Mock Mode**. It writes local playlist files, and when the player requests `.ts` files, the server automatically redirects (HTTP 307) requests to a public sample HLS segment pool, allowing full player UI tests to run without local transcoding.

#### Analytics Events Ingestion
- **Endpoint**: `POST /api/v1/events`
- **Payload**: JSON
  ```json
  {
    "video_id": "550e8400-e29b-41d4-a716-446655440000",
    "event_type": "buffer",
    "session_id": "session-xyz",
    "watch_time": 45.2,
    "buffer_count": 2,
    "buffer_duration": 1.45,
    "playback_speed": 1.0,
    "completion_percentage": 35.0,
    "device_type": "desktop",
    "network_speed": 12.5
  }
  ```

---

## 3. Frontend SDK Integration

The frontend SDK outputs a framework-independent vanilla JavaScript engine.

### 3.1 Custom Web Component Tag (Direct HTML5)
For immediate integration, load the script bundle and place the custom element directly in your HTML:

```html
<!-- Load styles and script -->
<link rel="stylesheet" href="dist/kuber-player.css">
<script type="module" src="dist/kuber-player.es.js"></script>

<!-- Render player -->
<kuber-player 
  src="http://localhost:8080/api/v1/video/123/playlist"
  poster="http://localhost:8080/api/v1/video/123/thumbnail"
  sprite-vtt="http://localhost:8080/api/v1/video/123/sprite"
  autoplay="false">
</kuber-player>
```

### 3.2 Programmatic JavaScript Mounting
For dynamic applications:

```javascript
import { KuberPlayer } from './src/core/KuberPlayer';
import { HeatmapPlugin, WatermarkPlugin } from './src/plugins';

const player = new KuberPlayer({
  container: '#player-selector',
  src: 'http://localhost:8080/api/v1/video/123/playlist',
  poster: 'http://localhost:8080/api/v1/video/123/thumbnail',
  spriteVtt: 'http://localhost:8080/api/v1/video/123/sprite',
  autoplay: true,
  muted: false,
  plugins: [
    new WatermarkPlugin({ text: 'KUBER SDK' }),
    new HeatmapPlugin()
  ]
});

// Control API
player.play();
player.seek(30); // seek to 30s
player.setPlaybackRate(1.5); // speed up

// Bind events
player.on('play', () => console.log('Video is playing!'));
player.on('ended', () => console.log('Finished watching.'));
```

### 3.3 Keyboard Accessibility Hotkeys
When the player container is focused, the following keyboard hotkeys are active:
- **`Spacebar`**: Toggle Play / Pause.
- **`Arrow Left / Right`**: Seek backward / forward 5 seconds.
- **`Arrow Up / Down`**: Increase / decrease volume by 10%.
- **`M Key`**: Toggle mute.
- **`F Key`**: Toggle fullscreen mode.
- **`P Key`**: Toggle Picture-in-Picture mode.
- **`Digits 0-9`**: Seek directly to 0% (start) - 90% of duration.

---

## 4. Custom Plugin Development

Everything in the Kuber Player SDK operates on a decoupled plugin architecture. A plugin is simply an object implementing the `PlayerPlugin` interface:

```typescript
import { KuberPlayer } from '../core/KuberPlayer';

export interface PlayerPlugin {
  name: string;
  init(player: KuberPlayer): void;
  destroy?(): void;
}
```

### Writing a Custom Ad Plugin Example
The following is a boilerplate for an advertisement or quiz pop-up plugin:

```typescript
import { KuberPlayer } from '../core/KuberPlayer';
import { PlayerPlugin } from '../core/PluginManager';

export class QuizPlugin implements PlayerPlugin {
  public name = 'course-quiz';
  private player!: KuberPlayer;
  private quizTime = 45.0; // Prompt quiz at 45 seconds
  private hasShown = false;

  init(player: KuberPlayer): void {
    this.player = player;
    
    // Bind to the player's timeupdate event
    this.player.on('timeupdate', this.handleTimeUpdate);
  }

  private handleTimeUpdate = (): void => {
    const time = this.player.getCurrentTime();
    
    if (time >= this.quizTime && !this.hasShown) {
      this.hasShown = true;
      this.player.pause(); // Pause playback
      this.showQuizModal();
    }
  };

  private showQuizModal(): void {
    const modal = document.createElement('div');
    modal.style.position = 'absolute';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.padding = '20px';
    modal.style.background = 'rgba(0,0,0,0.9)';
    modal.style.border = '1px solid #6366f1';
    modal.style.borderRadius = '8px';
    modal.style.zIndex = '999';
    modal.innerHTML = `
      <p style="margin-bottom:12px;">Quick Quiz: What is Axum?</p>
      <button id="quiz-ans" style="padding:6px 12px; background:#6366f1; border:none; color:#fff; cursor:pointer;">Rust Web Framework</button>
    `;

    modal.querySelector('#quiz-ans')?.addEventListener('click', () => {
      modal.remove();
      this.player.play(); // Resume playback
    });

    this.player.getContainer().appendChild(modal);
  }

  destroy(): void {
    this.player.off('timeupdate', this.handleTimeUpdate);
  }
}
```
Register it during startup:
```javascript
new KuberPlayer({
  container: '#player',
  src: 'playlist.m3u8',
  plugins: [new QuizPlugin()]
});
```
