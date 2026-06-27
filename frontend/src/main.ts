import { KuberPlayer } from './core/KuberPlayer';
import { AnalyticsPlugin } from './plugins/AnalyticsPlugin';
import { WatermarkPlugin } from './plugins/WatermarkPlugin';
import { SponsorSkipPlugin } from './plugins/SponsorSkipPlugin';
import { HeatmapPlugin } from './plugins/HeatmapPlugin';

// ── Backend API URL ─────────────────────────────────────────────────────────
// By default this is EMPTY — all /api/* calls are relative to the current
// origin and transparently proxied by the Vite dev server to localhost:8080.
//
// This means:
//   • You only need ONE public URL (Cloudflare tunnel, ngrok, etc.) for port 3000.
//   • The backend never needs to be publicly accessible.
//   • Works on localhost, LAN, VPS, or any tunnel without changing any code.
//
// Override via .env file ONLY if you are hosting the frontend and backend
// on completely separate servers with no Vite proxy in between:
//   VITE_BACKEND_URL=https://api.yourdomain.com
//
const BACKEND_URL: string = (import.meta.env.VITE_BACKEND_URL as string) || '';


// Global player reference
let playerInstance: KuberPlayer | null = null;
let lastVideosJson = '';

// Initial bootstrap
document.addEventListener('DOMContentLoaded', () => {
  loadVideoList();
  setupAnalyticsDashboard();
  setupLiveLogPanel();

  // Instant poll media folder changes every 2 seconds
  setInterval(() => {
    loadVideoList();
  }, 2000);
});

// ── Live Log Panel ────────────────────────────────────────────────────────────
function setupLiveLogPanel() {
  const output = document.getElementById('log-output') as HTMLDivElement;
  const dot = document.getElementById('log-status-dot') as HTMLSpanElement;
  const statusText = document.getElementById('log-status-text') as HTMLSpanElement;
  const clearBtn = document.getElementById('log-clear-btn') as HTMLButtonElement;
  const pauseBtn = document.getElementById('log-pause-btn') as HTMLButtonElement;
  if (!output) return;

  let paused = false;
  let es: EventSource | null = null;

  const LEVEL_COLORS: Record<string, string> = {
    HTTP:  '#60a5fa', // blue
    INFO:  '#4ade80', // green
    WARN:  '#fbbf24', // amber
    ERROR: '#f87171', // red
    EVENT: '#c084fc', // purple
  };

  function appendLog(entry: { ts: string; level: string; msg: string }) {
    if (paused) return;
    const time = entry.ts.substring(11, 19); // HH:MM:SS
    const color = LEVEL_COLORS[entry.level] || '#d1d5db';
    const line = document.createElement('div');
    line.innerHTML =
      `<span style="color:#6b7280">${time}</span> ` +
      `<span style="color:${color};font-weight:600">[${entry.level.padEnd(5)}]</span> ` +
      `<span>${escapeHtml(entry.msg)}</span>`;
    output.appendChild(line);
    // Keep max 500 lines
    while (output.children.length > 500) output.removeChild(output.firstChild!);
    output.scrollTop = output.scrollHeight;
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function connect() {
    if (es) es.close();
    dot.style.background = '#fbbf24';
    dot.style.boxShadow = '0 0 6px #fbbf24';
    statusText.textContent = 'Connecting…';

    es = new EventSource(`${BACKEND_URL}/api/v1/logs`);

    es.onopen = () => {
      dot.style.background = '#4ade80';
      dot.style.boxShadow = '0 0 6px #4ade80';
      statusText.textContent = 'Live';
    };

    es.onmessage = (e) => {
      try { appendLog(JSON.parse(e.data)); } catch (_) {}
    };

    es.onerror = () => {
      dot.style.background = '#f87171';
      dot.style.boxShadow = '0 0 6px #f87171';
      statusText.textContent = 'Reconnecting…';
      es?.close();
      setTimeout(connect, 3000);
    };
  }

  clearBtn.addEventListener('click', () => { output.innerHTML = ''; });
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    pauseBtn.style.color = paused ? '#fbbf24' : '#fff';
  });

  connect();
}


async function loadVideoList() {
  const select = document.getElementById('video-select') as HTMLSelectElement;
  const listContainer = document.getElementById('video-list') as HTMLDivElement;
  if (!select || !listContainer) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/videos`);
    if (!res.ok) throw new Error('Failed to fetch videos');
    const videos = await res.json();

    // Check if the list content actually changed to avoid layout flicker
    const videosJson = JSON.stringify(videos);
    if (videosJson === lastVideosJson) {
      return;
    }
    lastVideosJson = videosJson;

    // Save current selection to restore after rebuilding list
    const selectedValue = select.value;

    select.innerHTML = '<option value="">-- Choose a Video to Play --</option>';
    listContainer.innerHTML = '';

    if (videos.length === 0) {
      listContainer.innerHTML = '<p class="no-videos">No videos found. Drop media files directly into the "media/" folder in your project root!</p>';
      return;
    }

    videos.forEach((vid: any) => {
      // Dropdown option
      const opt = document.createElement('option');
      opt.value = vid.id;
      opt.innerText = `${vid.title} [Status: ${vid.status}]`;
      select.appendChild(opt);

      // List item
      const item = document.createElement('div');
      item.classList.add('video-item');
      item.innerHTML = `
        <div class="video-item-info">
          <h3>${vid.title}</h3>
          <p>ID: <code>${vid.id}</code> | Codec: ${vid.codec || 'Pending'} | Size: ${(vid.size / (1024 * 1024)).toFixed(2)} MB</p>
          <div class="status-badge status-${vid.status}">${vid.status}</div>
          ${vid.error_message ? `<p class="error-msg">Error: ${vid.error_message}</p>` : ''}
        </div>
        <div class="video-item-actions">
          <button class="btn btn-play" data-id="${vid.id}" ${vid.status !== 'completed' ? 'disabled' : ''}>Play</button>
          <button class="btn btn-delete btn-danger" data-id="${vid.id}">Delete</button>
        </div>
      `;

      // Bind Play button
      item.querySelector('.btn-play')?.addEventListener('click', () => {
        playVideo(vid.id);
        select.value = vid.id;
      });

      // Bind Delete button
      item.querySelector('.btn-delete')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this video and its processed streams?')) {
          await deleteVideo(vid.id);
        }
      });

      listContainer.appendChild(item);
    });

    // Restore selected value if still in list
    if (selectedValue && videos.some((v: any) => v.id === selectedValue)) {
      select.value = selectedValue;
    }

  } catch (e: any) {
    console.error('Error loading video list:', e);
    listContainer.innerHTML = `
      <p class="no-videos" style="color: #f87171; text-align: center; font-size: 0.8rem; line-height: 1.4;">
        Connection failed to backend:<br>
        <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px; display: inline-block; margin: 4px 0; word-break: break-all;">${BACKEND_URL}</code><br>
        <span style="font-size: 0.7rem; color: #9ca3af;">Error: ${e.message || e}</span>
      </p>
    `;
  }
}

async function playVideo(id: string) {
  if (playerInstance) {
    playerInstance.destroy();
    playerInstance = null;
  }

  const container = document.getElementById('player-wrapper');
  if (!container) return;
  container.innerHTML = '<div class="player-placeholder" style="color:#9ca3af;font-size:0.85rem;">Loading video…</div>';

  // Fetch metadata to know if this is a local file or a sample HLS stream
  let videoMeta: any = null;
  try {
    const r = await fetch(`${BACKEND_URL}/api/v1/video/${id}`);
    if (r.ok) videoMeta = (await r.json()).video;
  } catch (_) {}

  container.innerHTML = '';

  // Local file (MKV, MP4, etc.) → serve via raw byte-range endpoint directly
  // Sample stream → use actual HLS (it will loop on the mock playlist but shows player working)
  const hasLocalFile = videoMeta && videoMeta.filename;
  const src = hasLocalFile
    ? `${BACKEND_URL}/api/v1/video/${id}/raw`
    : `${BACKEND_URL}/api/v1/video/${id}/playlist`;

  const posterUrl = `${BACKEND_URL}/api/v1/video/${id}/thumbnail`;
  const spriteUrl = `${BACKEND_URL}/api/v1/video/${id}/sprite`;

  playerInstance = new KuberPlayer({
    container,
    src,
    poster: posterUrl,
    spriteVtt: spriteUrl,
    autoplay: true,
    muted: false,
    plugins: [
      new AnalyticsPlugin({
        endpoint: `${BACKEND_URL}/api/v1/events`,
        videoId: id,
        heartbeatIntervalMs: 5000,
      }),
      new WatermarkPlugin({
        text: 'KUBER PLAYER',
        opacity: 0.25,
        position: 'top-right',
      }),
      new SponsorSkipPlugin([]),
      new HeatmapPlugin([
        90, 80, 50, 40, 30, 32, 45, 68, 95, 78, 52, 45, 30, 28, 35, 65, 88, 70, 48, 35, 20
      ])
    ]
  });

  playerInstance.on('ready', () => {
    console.log(`Player booted. src=${src}`);
    loadSingleVideoAnalytics(id);
  });
}



async function deleteVideo(id: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/video/${id}`, { method: 'DELETE' });
    if (res.ok) {
      if (playerInstance && playerInstance.getOptions().src.includes(id)) {
        playerInstance.destroy();
        playerInstance = null;
        const wrapper = document.getElementById('player-wrapper');
        if (wrapper) wrapper.innerHTML = '<div class="player-placeholder">Video removed. Choose another stream to play.</div>';
      }
      loadVideoList();
    } else {
      alert('Delete failed');
    }
  } catch (e) {
    console.error('Error deleting video:', e);
  }
}

async function setupAnalyticsDashboard() {
  const refreshBtn = document.getElementById('refresh-analytics') as HTMLButtonElement;
  if (!refreshBtn) return;

  refreshBtn.addEventListener('click', () => {
    loadGlobalAnalytics();
    if (playerInstance) {
      const activeSrc = playerInstance.getOptions().src;
      const videoId = activeSrc.split('/v1/video/')[1]?.split('/')[0];
      if (videoId) loadSingleVideoAnalytics(videoId);
    }
  });

  loadGlobalAnalytics();
}

async function loadGlobalAnalytics() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/analytics`);
    if (!res.ok) throw new Error('Analytics failed');
    const data = await res.json();

    const container = document.getElementById('global-analytics-stats');
    if (!container) return;

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-num">${data.total_views}</div>
        <div class="stat-label">Total Plays</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${data.avg_watch_time.toFixed(1)}s</div>
        <div class="stat-label">Avg Watch Time</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${data.avg_completion.toFixed(1)}%</div>
        <div class="stat-label">Avg Completion %</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${data.total_buffers}</div>
        <div class="stat-label">Stalls (Buffers)</div>
      </div>
    `;

  } catch (e) {
    console.error('Error fetching global analytics:', e);
  }
}

async function loadSingleVideoAnalytics(videoId: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/video/${videoId}/analytics`);
    if (!res.ok) return;
    const data = await res.json();

    const container = document.getElementById('single-video-analytics');
    if (!container) return;

    container.innerHTML = `
      <h3 style="margin-top:0; font-size:1rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">Active Video Retention</h3>
      <div style="display:flex; flex-direction:column; gap:10px; font-size:0.85rem;">
        <div style="display:flex; justify-content:space-between;"><span>Video Plays:</span><strong>${data.total_plays} sessions</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>Avg Watch Duration:</span><strong>${data.avg_watch_time.toFixed(1)}s</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>Audience Completion Rate:</span><strong>${data.completion_rate.toFixed(1)}%</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>Buffering Rate:</span><strong>${data.total_buffers} stalls</strong></div>
      </div>
    `;
  } catch (e) {
    console.error('Error fetching video analytics:', e);
  }
}
