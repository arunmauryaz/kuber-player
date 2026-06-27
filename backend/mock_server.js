'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = 8080;
const DATA_DIR   = path.join(__dirname, 'data');
const STREAM_DIR = path.join(DATA_DIR, 'streaming');
const MEDIA_DIR  = path.join(__dirname, '..', 'media');

// ── Logging ────────────────────────────────────────────────────────────────
const logBuffer = [];
function log(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg };
  logBuffer.push(entry);
  if (logBuffer.length > 300) logBuffer.shift();
  console.log(`[${level}] ${msg}`);
}

// ── Directories ────────────────────────────────────────────────────────────
[DATA_DIR, STREAM_DIR, MEDIA_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── In-memory DB ───────────────────────────────────────────────────────────
// Each record: { id, title, filename, filepath, status, duration, width,
//               height, bitrate, codec, size, numSegments, error_message }
const videos = [];
const events = [];

// ── Constants ──────────────────────────────────────────────────────────────
const VIDEO_EXTS       = new Set(['.mp4','.mkv','.mov','.avi','.webm','.flv','.ts','.m4v','.wmv']);
const SEGMENT_DURATION = 10;
const MIME_TYPES       = {
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
  '.m4v': 'video/mp4', '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv',
};

// ── Helpers ────────────────────────────────────────────────────────────────
function sanitizeId(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function extractNumber(str) {
  const m = str.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}
function estimateDuration(size) {
  return Math.max(60, Math.round(size / 500000));
}

// ── HLS Playlist Generator ─────────────────────────────────────────────────
function writeMockHlsFiles(id, numSegs) {
  const count = numSegs || 12;
  const vDir  = path.join(STREAM_DIR, id);
  if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });

  const master = [
    '#EXTM3U','#EXT-X-VERSION:3',
    '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720','stream_720p.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480','stream_480p.m3u8','',
  ].join('\n');
  fs.writeFileSync(path.join(vDir, 'master.m3u8'), master);

  let playlist = [
    '#EXTM3U','#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${SEGMENT_DURATION}`,
    '#EXT-X-MEDIA-SEQUENCE:0','#EXT-X-PLAYLIST-TYPE:VOD',
  ].join('\n') + '\n';
  for (let i = 0; i < count; i++) {
    playlist += `#EXTINF:${SEGMENT_DURATION}.0,\nsegment_${String(i).padStart(3,'0')}.ts\n`;
  }
  playlist += '#EXT-X-ENDLIST\n';
  fs.writeFileSync(path.join(vDir, 'stream_720p.m3u8'), playlist);
  fs.writeFileSync(path.join(vDir, 'stream_480p.m3u8'), playlist);

  // Sprite VTT
  let vtt = 'WEBVTT\n\n';
  for (let i = 0; i < 24; i++) {
    const fmt = t => `00:${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}.000`;
    vtt += `${fmt(i*5)} --> ${fmt((i+1)*5)}\nsprite_001.jpg#xywh=0,0,160,90\n\n`;
  }
  fs.writeFileSync(path.join(vDir, 'sprite.vtt'), vtt);

  const blackJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=',
    'base64'
  );
  fs.writeFileSync(path.join(vDir, 'poster.jpg'), blackJpeg);
  fs.writeFileSync(path.join(vDir, 'sprite_001.jpg'), blackJpeg);
}

// ── Video Registration ─────────────────────────────────────────────────────
function ensureRegistered({ id, title, filename, filepath, size }) {
  if (videos.find(v => v.id === id)) return;
  const duration    = estimateDuration(size);
  const numSegments = Math.ceil(duration / SEGMENT_DURATION);
  videos.push({
    id, title, filename, filepath,
    status: 'completed', duration, numSegments,
    width: 1280, height: 720, bitrate: 2500000, codec: 'h264/aac',
    size, error_message: null,
  });
  writeMockHlsFiles(id, numSegments);
  log('INFO', `Registered: "${title}" (${(size/1e6).toFixed(1)}MB)`);
}

// ── Flat media/ Scan (Movies at root) ──────────────────────────────────────
function scanMediaFolder() {
  if (!fs.existsSync(MEDIA_DIR)) return;
  try {
    fs.readdirSync(MEDIA_DIR).forEach(file => {
      if (path.extname(file).toLowerCase() === '') return; // skip dirs
      const ext = path.extname(file).toLowerCase();
      if (!VIDEO_EXTS.has(ext)) return;
      const filepath = path.join(MEDIA_DIR, file);
      if (!fs.statSync(filepath).isFile()) return;
      const title = path.basename(file, ext);
      const id    = sanitizeId(title);
      const size  = fs.statSync(filepath).size;
      ensureRegistered({ id, title, filename: file, filepath, size });
    });
  } catch (e) { log('WARN', `scanMediaFolder error: ${e.message}`); }

  // Purge deleted files
  for (let i = videos.length - 1; i >= 0; i--) {
    const v = videos[i];
    if (v.id === 'sample') continue;
    if (v.filepath && !fs.existsSync(v.filepath)) {
      log('INFO', `Purged missing: ${v.title}`);
      videos.splice(i, 1);
    }
  }
}

// ── Library: Recursive Scan ────────────────────────────────────────────────
// Folder structure:
//   media/Movie.mkv              → movie
//   media/ShowName/S01E01.mkv   → series (Season 1 inferred)
//   media/ShowName/Season 1/E01.mkv → series with season folders

function getEpisodesFromDir(dirPath, seriesId, seasonNum) {
  let files;
  try { files = fs.readdirSync(dirPath); } catch { return []; }
  return files
    .filter(f => VIDEO_EXTS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((filename, idx) => {
      const ext      = path.extname(filename);
      const title    = path.basename(filename, ext);
      const epNum    = extractNumber(filename) || idx + 1;
      const epId     = `${seriesId}_s${seasonNum}_e${epNum}`;
      const filepath = path.join(dirPath, filename);
      const size     = fs.statSync(filepath).size;
      ensureRegistered({ id: epId, title, filename, filepath, size });
      return {
        id: epId, title, number: epNum, seasonNumber: seasonNum,
        size, duration: estimateDuration(size),
        thumbnail: `/api/v1/video/${epId}/thumbnail`,
        seriesId,
      };
    });
}

function buildSeries(seriesName, seriesPath) {
  const seriesId = sanitizeId(seriesName);
  let subEntries;
  try { subEntries = fs.readdirSync(seriesPath, { withFileTypes: true }); }
  catch { return null; }

  const seasonDirs  = subEntries.filter(e => e.isDirectory());
  const rootVideos  = subEntries.filter(e => e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase()));
  const seasons     = [];

  if (seasonDirs.length > 0) {
    seasonDirs
      .sort((a, b) => (extractNumber(a.name)||999) - (extractNumber(b.name)||999))
      .forEach(sd => {
        const seasonNum = extractNumber(sd.name) || (seasons.length + 1);
        const episodes  = getEpisodesFromDir(path.join(seriesPath, sd.name), seriesId, seasonNum);
        if (episodes.length > 0) seasons.push({ number: seasonNum, title: sd.name, episodes });
      });
  }

  if (rootVideos.length > 0 && seasons.length === 0) {
    // Flat series — treat all as Season 1
    const episodes = rootVideos
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((f, idx) => {
        const ext      = path.extname(f.name);
        const title    = path.basename(f.name, ext);
        const epNum    = extractNumber(f.name) || idx + 1;
        const epId     = `${seriesId}_s1_e${epNum}`;
        const filepath = path.join(seriesPath, f.name);
        const size     = fs.statSync(filepath).size;
        ensureRegistered({ id: epId, title, filename: f.name, filepath, size });
        return {
          id: epId, title, number: epNum, seasonNumber: 1,
          size, duration: estimateDuration(size),
          thumbnail: `/api/v1/video/${epId}/thumbnail`,
          seriesId,
        };
      });
    if (episodes.length > 0) seasons.push({ number: 1, title: 'Season 1', episodes });
  }

  if (seasons.length === 0) return null;
  return { id: seriesId, title: seriesName, type: 'series', seasons };
}

function scanLibrary() {
  const library = { movies: [], series: [] };
  if (!fs.existsSync(MEDIA_DIR)) return library;

  let topLevel;
  try { topLevel = fs.readdirSync(MEDIA_DIR, { withFileTypes: true }); }
  catch { return library; }

  topLevel.forEach(entry => {
    if (entry.name.startsWith('.') || entry.name === 'README.md') return;
    const fullPath = path.join(MEDIA_DIR, entry.name);

    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTS.has(ext)) return;
      const title = path.basename(entry.name, ext);
      const id    = sanitizeId(title);
      const size  = fs.statSync(fullPath).size;
      ensureRegistered({ id, title, filename: entry.name, filepath: fullPath, size });
      library.movies.push({
        id, title, type: 'movie', filename: entry.name, size,
        duration: estimateDuration(size), thumbnail: `/api/v1/video/${id}/thumbnail`,
      });
    } else if (entry.isDirectory()) {
      const s = buildSeries(entry.name, fullPath);
      if (s) library.series.push(s);
    }
  });

  return library;
}

// ── Byte-Range Video Streaming ─────────────────────────────────────────────
function serveRaw(req, res, videoId) {
  const video = videos.find(v => v.id === videoId);
  if (!video || !video.filepath) { res.writeHead(404); res.end('Video not found'); return; }
  const fp = video.filepath;
  if (!fs.existsSync(fp))        { res.writeHead(404); res.end('File missing');     return; }

  const ext      = path.extname(fp).toLowerCase();
  const mime     = MIME_TYPES[ext] || 'video/mp4';
  const fileSize = fs.statSync(fp).size;
  const range    = req.headers['range'];

  if (range) {
    const [s, e]    = range.replace(/bytes=/, '').split('-');
    const start     = parseInt(s, 10);
    const end       = e ? parseInt(e, 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1);
    const chunkSize = end - start + 1;
    log('INFO', `RAW ${videoId} bytes=${start}-${end}/${fileSize}`);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes', 'Content-Length': chunkSize, 'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(fp, { start, end }).pipe(res);
  } else {
    log('INFO', `RAW ${videoId} full ${(fileSize/1e6).toFixed(1)}MB`);
    res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(fp).pipe(res);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
videos.push({
  id: 'sample', title: 'Sample Stream (Built-in)',
  filename: null, filepath: null,
  status: 'completed', duration: 120, numSegments: 12,
  width: 1280, height: 720, bitrate: 2500000, codec: 'h264/aac',
  size: 0, error_message: null,
});
writeMockHlsFiles('sample', 12);
scanMediaFolder();
log('INFO', `Kuber Backend starting. Media: ${MEDIA_DIR}`);
log('INFO', `Registered ${videos.length} item(s) at startup.`);

// ── HTTP Server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url || '/';
  log('HTTP', `${req.method} ${url}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // ── SSE: Live Logs ───────────────────────────────────────────────────────
  if (url === '/api/v1/logs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    logBuffer.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`));
    let last = logBuffer.length;
    const push = setInterval(() => {
      while (last < logBuffer.length) { res.write(`data: ${JSON.stringify(logBuffer[last++])}\n\n`); }
    }, 300);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(push); clearInterval(ping); });
    return;
  }

  // ── GET /api/v1/library ──────────────────────────────────────────────────
  if (url === '/api/v1/library' && req.method === 'GET') {
    const lib = scanLibrary();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(lib));
    return;
  }

  // ── GET /api/v1/videos ───────────────────────────────────────────────────
  if (url === '/api/v1/videos' && req.method === 'GET') {
    scanMediaFolder();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(videos));
    return;
  }

  // ── GET /api/v1/video/:id/raw ────────────────────────────────────────────
  const rawMatch = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/raw$/);
  if (rawMatch && req.method === 'GET') {
    serveRaw(req, res, rawMatch[1]); return;
  }

  // ── GET /api/v1/video/:id ────────────────────────────────────────────────
  const videoMatch = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)$/);
  if (videoMatch && req.method === 'GET') {
    const video = videos.find(v => v.id === videoMatch[1]);
    if (!video) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ video, chapters: [] }));
    return;
  }

  // ── DELETE /api/v1/video/:id ─────────────────────────────────────────────
  if (videoMatch && req.method === 'DELETE') {
    const idx = videos.findIndex(v => v.id === videoMatch[1]);
    if (idx !== -1) {
      const v = videos[idx];
      if (v.filepath && fs.existsSync(v.filepath)) { try { fs.unlinkSync(v.filepath); } catch (_) {} }
      const sp = path.join(STREAM_DIR, v.id);
      if (fs.existsSync(sp)) { try { fs.rmSync(sp, { recursive: true }); } catch (_) {} }
      videos.splice(idx, 1);
      log('INFO', `Deleted: ${v.title}`);
    }
    res.writeHead(204); res.end(); return;
  }

  // ── POST /api/v1/events ──────────────────────────────────────────────────
  if (url === '/api/v1/events' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { const e = JSON.parse(body); events.push(e); log('EVENT', `${e.event_type} vid=${e.video_id}`); } catch (_) {}
      res.writeHead(200); res.end();
    });
    return;
  }

  // ── GET /api/v1/analytics ────────────────────────────────────────────────
  if (url === '/api/v1/analytics' && req.method === 'GET') {
    const total_views   = events.filter(e => e.event_type === 'play').length;
    const total_buffers = events.filter(e => e.event_type === 'buffer').length;
    const sessions = {};
    events.forEach(e => { sessions[e.session_id] = Math.max(sessions[e.session_id]||0, e.watch_time||0); });
    const times = Object.values(sessions);
    const avg   = times.length ? times.reduce((a,b)=>a+b,0)/times.length : 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total_views, avg_watch_time: avg, avg_completion: total_views?45:0, total_buffers, avg_buffer_duration: total_buffers?1.5:0 }));
    return;
  }

  // ── GET /api/v1/video/:id/analytics ─────────────────────────────────────
  const vaMatch = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/analytics$/);
  if (vaMatch && req.method === 'GET') {
    const ve = events.filter(e => e.video_id === vaMatch[1]);
    const tp = ve.filter(e => e.event_type === 'play').length;
    const tb = ve.filter(e => e.event_type === 'buffer').length;
    const sessions = {};
    ve.forEach(e => { sessions[e.session_id] = Math.max(sessions[e.session_id]||0, e.watch_time||0); });
    const times = Object.values(sessions);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ video_id: vaMatch[1], total_plays: tp, unique_sessions: Object.keys(sessions).length, total_watch_time: times.reduce((a,b)=>a+b,0), avg_watch_time: times.length?times.reduce((a,b)=>a+b,0)/times.length:0, total_buffers: tb, avg_buffer_duration: tb?1.2:0, completion_rate: tp?65:0 }));
    return;
  }

  // ── GET /api/v1/system/health ────────────────────────────────────────────
  if (url === '/api/v1/system/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', database: 'ok', storage: 'ok', media_count: videos.length }));
    return;
  }

  // ── Alias: /playlist → master.m3u8 ──────────────────────────────────────
  const plAlias = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/playlist$/);
  if (plAlias) req.url = `/api/v1/video/${plAlias[1]}/stream/master.m3u8`;

  // ── Alias: /thumbnail → poster.jpg ──────────────────────────────────────
  const thAlias = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/thumbnail$/);
  if (thAlias) req.url = `/api/v1/video/${thAlias[1]}/stream/poster.jpg`;

  // ── Alias: /sprite → sprite.vtt ─────────────────────────────────────────
  const spAlias = url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/sprite$/);
  if (spAlias) req.url = `/api/v1/video/${spAlias[1]}/stream/sprite.vtt`;

  // ── Static HLS Stream Files ──────────────────────────────────────────────
  const streamMatch = req.url.match(/^\/api\/v1\/video\/([a-zA-Z0-9_-]+)\/stream\/([a-zA-Z0-9_.%-]+)$/);
  if (streamMatch && req.method === 'GET') {
    const id   = streamMatch[1];
    const file = decodeURIComponent(streamMatch[2]);
    const fp   = path.join(STREAM_DIR, id, file);
    if (fs.existsSync(fp)) {
      const mime = file.endsWith('.m3u8') ? 'application/x-mpegURL' :
                   file.endsWith('.jpg')  ? 'image/jpeg' :
                   file.endsWith('.vtt')  ? 'text/vtt' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(fp).pipe(res);
    } else {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  log('INFO', `Backend listening on 0.0.0.0:${PORT}`);
  log('INFO', `Proxy via Vite: frontend proxies /api/* → localhost:${PORT}`);
});
