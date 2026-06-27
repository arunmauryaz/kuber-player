const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const DATA_DIR = path.join(__dirname, 'data');
const STREAM_DIR = path.join(DATA_DIR, 'streaming');
const MEDIA_DIR = path.join(__dirname, '..', 'media');

// ─── Log buffer (last 200 entries) served to frontend ───────────────────────
const logBuffer = [];
function log(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg };
  logBuffer.push(entry);
  if (logBuffer.length > 200) logBuffer.shift();
  console.log(`[${level}] ${msg}`);
}

// Create directories
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STREAM_DIR)) fs.mkdirSync(STREAM_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ─── In-memory video DB ──────────────────────────────────────────────────────
const videos = [];
const events = [];

// ─── Segment config ──────────────────────────────────────────────────────────
const SEGMENT_DURATION = 10;   // seconds per segment
const SEGMENTS_PER_STREAM = 12; // number of segments

// ─── Write mock HLS playlist files for a video id ────────────────────────────
function writeMockHlsFiles(id, numSegments) {
  const count = numSegments || SEGMENTS_PER_STREAM;
  const vDir = path.join(STREAM_DIR, id);
  if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });

  // Master playlist
  const master = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720',
    'stream_720p.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480',
    'stream_480p.m3u8',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(vDir, 'master.m3u8'), master);

  // Variant playlists — segments are served directly by this server
  let playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${SEGMENT_DURATION}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
  ].join('\n') + '\n';

  for (let i = 0; i < count; i++) {
    playlist += `#EXTINF:${SEGMENT_DURATION}.0,\n`;
    playlist += `segment_${i.toString().padStart(3, '0')}.ts\n`;
  }
  playlist += '#EXT-X-ENDLIST\n';
  fs.writeFileSync(path.join(vDir, 'stream_720p.m3u8'), playlist);
  fs.writeFileSync(path.join(vDir, 'stream_480p.m3u8'), playlist);

  // Sprite VTT
  let vtt = 'WEBVTT\n\n';
  for (let i = 0; i < 24; i++) {
    const s = i * 5, e = (i + 1) * 5;
    const fmt = (t) => `00:${String(Math.floor(t / 60)).padStart(2,'0')}:${String(t % 60).padStart(2,'0')}.000`;
    vtt += `${fmt(s)} --> ${fmt(e)}\nsprite_001.jpg#xywh=0,0,160,90\n\n`;
  }
  fs.writeFileSync(path.join(vDir, 'sprite.vtt'), vtt);

  // Minimal 1×1 black JPEG placeholder
  const blackJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=',
    'base64'
  );
  fs.writeFileSync(path.join(vDir, 'poster.jpg'), blackJpeg);
  fs.writeFileSync(path.join(vDir, 'sprite_001.jpg'), blackJpeg);
}

// ─── Scan media/ folder ───────────────────────────────────────────────────────
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.ts', '.m4v', '.wmv']);

function scanMediaFolder() {
  if (!fs.existsSync(MEDIA_DIR)) return;
  const files = fs.readdirSync(MEDIA_DIR);

  // Remove DB entries whose files no longer exist on disk
  for (let i = videos.length - 1; i >= 0; i--) {
    const v = videos[i];
    if (v.id === 'sample') continue; // keep the sample entry
    if (v.filename && !fs.existsSync(path.join(MEDIA_DIR, v.filename))) {
      log('INFO', `Media file removed from disk, unregistering: ${v.filename}`);
      videos.splice(i, 1);
    }
  }

  files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    if (!VIDEO_EXTS.has(ext)) return;

    const title = path.basename(file, ext);
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    if (videos.find(v => v.id === id)) return; // already registered

    const filePath = path.join(MEDIA_DIR, file);
    const stats = fs.statSync(filePath);

    // Estimate duration from file size (rough: ~500KB/s for typical video)
    const estimatedDuration = Math.max(60, Math.round(stats.size / 500000));
    const numSegments = Math.ceil(estimatedDuration / SEGMENT_DURATION);

    videos.push({
      id,
      title,
      filename: file,
      status: 'completed',
      duration: estimatedDuration,
      width: 1280,
      height: 720,
      bitrate: 2500000,
      codec: 'h264/aac',
      size: stats.size,
      numSegments,
      error_message: null
    });

    writeMockHlsFiles(id, numSegments);
    log('INFO', `Registered: "${file}" → id="${id}" size=${(stats.size/1e6).toFixed(1)}MB duration≈${estimatedDuration}s segments=${numSegments}`);
  });
}

// ─── Serve a raw byte-range slice of the source video as a fake .ts segment ──
function serveVideoSegment(req, res, videoId, segmentIndex) {
  const video = videos.find(v => v.id === videoId);
  if (!video || !video.filename) {
    res.writeHead(404); res.end('Video not found'); return;
  }

  const filePath = path.join(MEDIA_DIR, video.filename);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Source file not found'); return;
  }

  const fileSize = fs.statSync(filePath).size;
  const numSegments = video.numSegments || SEGMENTS_PER_STREAM;
  const segSize = Math.floor(fileSize / numSegments);
  const start = segmentIndex * segSize;
  const end = Math.min(start + segSize - 1, fileSize - 1);
  const chunkSize = end - start + 1;

  log('INFO', `Segment: ${videoId} seg=${segmentIndex} bytes=${start}-${end} (${(chunkSize/1e6).toFixed(2)}MB)`);

  res.writeHead(206, {
    'Content-Type': 'video/MP2T',
    'Content-Length': chunkSize,
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });

  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', (err) => {
    log('ERROR', `Stream error for ${videoId} seg ${segmentIndex}: ${err.message}`);
    res.end();
  });
  stream.pipe(res);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
// Add built-in sample pointing to Sintel (no local file needed - handled separately)
videos.push({
  id: 'sample',
  title: 'Sintel (Sample — Public HLS)',
  filename: null,
  status: 'completed',
  duration: 120,
  width: 1280, height: 720,
  bitrate: 2500000,
  codec: 'h264/aac',
  size: 0,
  numSegments: 0,
  error_message: null
});
writeMockHlsFiles('sample', SEGMENTS_PER_STREAM);
scanMediaFolder();
log('INFO', `Server starting. Media dir: ${MEDIA_DIR}`);
log('INFO', `Registered ${videos.length} video(s) on startup.`);

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url;
  log('HTTP', `${req.method} ${url}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // ── GET /api/v1/logs ── stream live logs to frontend
  if (url === '/api/v1/logs' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    // Send existing buffer first
    logBuffer.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`));
    // Subscribe to new entries
    const interval = setInterval(() => {
      // keep-alive ping
      res.write(': ping\n\n');
    }, 15000);
    // Override log to also push to this SSE client
    const origLen = logBuffer.length;
    let lastSent = origLen;
    const push = setInterval(() => {
      while (lastSent < logBuffer.length) {
        res.write(`data: ${JSON.stringify(logBuffer[lastSent])}\n\n`);
        lastSent++;
      }
    }, 300);
    req.on('close', () => { clearInterval(interval); clearInterval(push); });
    return;
  }

  // ── GET /api/v1/videos ──────────────────────────────────────────────────────
  if (url === '/api/v1/videos' && req.method === 'GET') {
    scanMediaFolder();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(videos));
    return;
  }

  // ── GET /api/v1/video/:id ───────────────────────────────────────────────────
  const videoDetailMatch = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)$/);
  if (videoDetailMatch && req.method === 'GET') {
    const id = videoDetailMatch[1];
    const video = videos.find(v => v.id === id);
    if (!video) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      video,
      chapters: [
        { id: 'c1', video_id: id, title: 'Introduction', start_time: 0, end_time: video.duration * 0.15 },
        { id: 'c2', video_id: id, title: 'Act I', start_time: video.duration * 0.15, end_time: video.duration * 0.40 },
        { id: 'c3', video_id: id, title: 'Act II', start_time: video.duration * 0.40, end_time: video.duration * 0.75 },
        { id: 'c4', video_id: id, title: 'Finale', start_time: video.duration * 0.75, end_time: video.duration }
      ]
    }));
    return;
  }

  // ── GET /api/v1/video/:id/raw  ← serves real file bytes with byte-range ────
  const rawMatch = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/raw$/);
  if (rawMatch && req.method === 'GET') {
    const id = rawMatch[1];
    const video = videos.find(v => v.id === id);
    if (!video || !video.filename) {
      res.writeHead(404); res.end('Video file not found'); return;
    }
    const filePath = path.join(MEDIA_DIR, video.filename);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404); res.end('File missing on disk'); return;
    }

    const ext = path.extname(video.filename).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.m4v': 'video/mp4',
      '.flv': 'video/x-flv',
      '.wmv': 'video/x-ms-wmv',
    };
    const mimeType = mimeTypes[ext] || 'video/mp4';
    const fileSize = fs.statSync(filePath).size;
    const rangeHeader = req.headers['range'];

    if (rangeHeader) {
      // Byte-range request (seeking)
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1);
      const chunkSize = end - start + 1;
      log('INFO', `RAW range: ${id} bytes=${start}-${end}/${fileSize} (${(chunkSize/1e6).toFixed(2)}MB)`);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      // Full file
      log('INFO', `RAW full: ${id} size=${(fileSize/1e6).toFixed(1)}MB type=${mimeType}`);
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  // ── DELETE /api/v1/video/:id ────────────────────────────────────────────────
  const videoDeleteMatch = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)$/);
  if (videoDeleteMatch && req.method === 'DELETE') {
    const id = videoDeleteMatch[1];
    const idx = videos.findIndex(v => v.id === id);
    if (idx !== -1) {
      const video = videos[idx];
      if (video.filename) {
        const fp = path.join(MEDIA_DIR, video.filename);
        if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch (e) { log('WARN', `Could not delete file: ${e.message}`); } }
      }
      const sp = path.join(STREAM_DIR, id);
      if (fs.existsSync(sp)) { try { fs.rmSync(sp, { recursive: true }); } catch (e) {} }
      videos.splice(idx, 1);
      log('INFO', `Deleted video: ${id}`);
    }
    res.writeHead(204); res.end();
    return;
  }

  // ── POST /api/v1/events ─────────────────────────────────────────────────────
  if (url === '/api/v1/events' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { const e = JSON.parse(body); events.push(e); log('EVENT', `${e.event_type} vid=${e.video_id}`); } catch (_) {}
      res.writeHead(200); res.end();
    });
    return;
  }

  // ── GET /api/v1/analytics ───────────────────────────────────────────────────
  if (url === '/api/v1/analytics' && req.method === 'GET') {
    const total_views = events.filter(e => e.event_type === 'play').length;
    const total_buffers = events.filter(e => e.event_type === 'buffer').length;
    const sessionTimes = {};
    events.forEach(e => { sessionTimes[e.session_id] = Math.max(sessionTimes[e.session_id] || 0, e.watch_time || 0); });
    const times = Object.values(sessionTimes);
    const avg_watch_time = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total_views, avg_watch_time, avg_completion: total_views ? 45 : 0, total_buffers, avg_buffer_duration: total_buffers ? 1.5 : 0, device_distribution: { desktop: total_views } }));
    return;
  }

  // ── GET /api/v1/video/:id/analytics ────────────────────────────────────────
  const videoAnalyticsMatch = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/analytics$/);
  if (videoAnalyticsMatch && req.method === 'GET') {
    const id = videoAnalyticsMatch[1];
    const ve = events.filter(e => e.video_id === id);
    const total_plays = ve.filter(e => e.event_type === 'play').length;
    const total_buffers = ve.filter(e => e.event_type === 'buffer').length;
    const sessionTimes = {};
    ve.forEach(e => { sessionTimes[e.session_id] = Math.max(sessionTimes[e.session_id] || 0, e.watch_time || 0); });
    const times = Object.values(sessionTimes);
    const avg_watch_time = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ video_id: id, total_plays, unique_sessions: Object.keys(sessionTimes).length, total_watch_time: times.reduce((a, b) => a + b, 0), avg_watch_time, total_buffers, avg_buffer_duration: total_buffers ? 1.2 : 0, completion_rate: total_plays ? 65 : 0, device_breakdown: { desktop: total_plays } }));
    return;
  }

  // ── GET /api/v1/system/health ───────────────────────────────────────────────
  if (url === '/api/v1/system/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', database: 'ok', storage: 'ok', media_count: videos.length }));
    return;
  }

  // ── Alias: /playlist → master.m3u8 ─────────────────────────────────────────
  const playlistAlias = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/playlist$/);
  if (playlistAlias) { req.url = `/api/v1/video/${playlistAlias[1]}/stream/master.m3u8`; }

  // ── Alias: /thumbnail → poster.jpg ─────────────────────────────────────────
  const thumbAlias = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/thumbnail$/);
  if (thumbAlias) { req.url = `/api/v1/video/${thumbAlias[1]}/stream/poster.jpg`; }

  // ── Alias: /sprite → sprite.vtt ────────────────────────────────────────────
  const spriteAlias = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/sprite$/);
  if (spriteAlias) { req.url = `/api/v1/video/${spriteAlias[1]}/stream/sprite.vtt`; }

  // ── Stream file server ──────────────────────────────────────────────────────
  const streamMatch = req.url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/stream\/([a-zA-Z0-9_.%-]+)$/);
  if (streamMatch && req.method === 'GET') {
    const id = streamMatch[1];
    const file = decodeURIComponent(streamMatch[2]);

    // Serve real video bytes for .ts segments
    if (file.endsWith('.ts')) {
      const segIndex = parseInt(file.replace('segment_', '').replace('.ts', ''), 10);
      if (isNaN(segIndex)) { res.writeHead(400); res.end('Bad segment index'); return; }
      serveVideoSegment(req, res, id, segIndex);
      return;
    }

    // Serve static HLS/poster/sprite files from STREAM_DIR
    const filePath = path.join(STREAM_DIR, id, file);
    if (fs.existsSync(filePath)) {
      const mime =
        file.endsWith('.m3u8') ? 'application/x-mpegURL' :
        file.endsWith('.jpg') ? 'image/jpeg' :
        file.endsWith('.vtt') ? 'text/vtt' :
        'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(filePath).pipe(res);
    } else {
      log('WARN', `File not found: ${filePath}`);
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  log('INFO', `Mock REST API listening on 0.0.0.0:${PORT}`);
  log('INFO', `Access at: http://localhost:${PORT}  |  http://192.168.1.6:${PORT}`);
});
