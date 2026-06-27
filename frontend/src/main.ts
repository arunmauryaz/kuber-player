import { KuberPlayer } from './core/KuberPlayer';
import { AnalyticsPlugin } from './plugins/AnalyticsPlugin';

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════
const BACKEND_URL: string = (import.meta.env.VITE_BACKEND_URL as string) || '';
const PROGRESS_KEY = 'kuber_progress_v2';
const POLL_INTERVAL = 4000;

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
interface Movie {
  id: string; title: string; type: 'movie';
  filename: string; size: number; duration: number;
  thumbnail: string;
}
interface Episode {
  id: string; title: string; number: number;
  seasonNumber: number; size: number; duration: number;
  thumbnail: string; seriesId: string;
}
interface Season  { number: number; title: string; episodes: Episode[]; }
interface Series  { id: string; title: string; type: 'series'; seasons: Season[]; }
interface Library { movies: Movie[]; series: Series[]; }
interface WatchProgress { time: number; duration: number; pct: number; }

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let lib: Library = { movies: [], series: [] };
let player: KuberPlayer | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let searchQuery = '';

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
function fmtDuration(s: number): string {
  if (!s || s <= 0) return '--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtSize(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${b} B`;
}

// Title-based consistent gradient — gives each card a unique color from its name
function titleGradient(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (title.charCodeAt(i) + ((h << 5) - h)) | 0;
  const hue  = Math.abs(h % 360);
  const hue2 = (hue + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue},55%,22%) 0%, hsl(${hue2},45%,14%) 100%)`;
}

// Title initials for card placeholder
function initials(title: string): string {
  return title.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function navigate(hash: string): void {
  window.location.hash = encodeURI(hash);
}

function $<T extends Element>(sel: string, root: Element | Document = document): T | null {
  return root.querySelector<T>(sel);
}

// ═══════════════════════════════════════════════════════════
// PROGRESS (localStorage)
// ═══════════════════════════════════════════════════════════
function getAllProgress(): Record<string, WatchProgress> {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; }
}
function saveProgress(id: string, time: number, duration: number): void {
  const all = getAllProgress();
  all[id] = { time, duration, pct: duration > 0 ? (time / duration) * 100 : 0 };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
}
function getProgress(id: string): WatchProgress | null {
  return getAllProgress()[id] ?? null;
}
function clearProgress(id: string): void {
  const all = getAllProgress();
  delete all[id];
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
}

// ═══════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════
async function fetchLibrary(): Promise<Library> {
  const r = await fetch(`${BACKEND_URL}/api/v1/library`);
  if (!r.ok) throw new Error(`Library fetch failed: ${r.status}`);
  return r.json();
}

// ═══════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════
function setupRouter(): void {
  window.addEventListener('hashchange', renderRoute);
}

function renderRoute(): void {
  const raw   = decodeURIComponent(window.location.hash.slice(1) || 'home');
  const parts = raw.split('?');
  const path  = parts[0];
  const params = new URLSearchParams(parts[1] || '');

  // Update nav active state
  document.querySelectorAll<HTMLElement>('.nav-link').forEach(l => l.classList.remove('active'));
  if (path === 'home' || path === '') ($<HTMLElement>('#nav-home'))?.classList.add('active');
  else if (path === 'movies')         ($<HTMLElement>('#nav-movies'))?.classList.add('active');
  else if (path === 'series')         ($<HTMLElement>('#nav-series'))?.classList.add('active');

  destroyPlayer();

  if (path.startsWith('series/')) {
    renderSeriesPage(path.slice(7));
  } else if (path.startsWith('play/')) {
    renderPlayerPage(path.slice(5), params);
  } else if (path === 'movies') {
    renderMoviesPage();
  } else if (path === 'series') {
    renderSeriesListPage();
  } else {
    renderHomePage();
  }
}

// ═══════════════════════════════════════════════════════════
// CARD HTML BUILDERS
// ═══════════════════════════════════════════════════════════
function buildMovieCard(m: Movie, opts: { inRow?: boolean } = {}): string {
  const prog  = getProgress(m.id);
  const pct   = prog ? Math.min(prog.pct, 100) : 0;
  const grad  = titleGradient(m.title);
  const ini   = initials(m.title);
  const link  = `#play/${m.id}`;
  const cls   = opts.inRow ? 'media-card' : 'media-card';
  return `
<article class="${cls}" data-href="${link}" role="button" tabindex="0" aria-label="Play ${m.title}">
  <div class="card-thumb">
    <div class="card-thumb-bg" style="background:${grad}">${ini}</div>
    <div class="card-overlay">
      <div class="play-icon">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </div>
    <span class="card-badge">MOVIE</span>
    ${pct > 2 ? `<div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>` : ''}
  </div>
  <div class="card-info">
    <div class="card-title truncate">${m.title}</div>
    <div class="card-meta"><span>${fmtDuration(m.duration)}</span><span>${fmtSize(m.size)}</span></div>
  </div>
</article>`;
}

function buildSeriesCard(s: Series): string {
  const allEps   = s.seasons.flatMap(sn => sn.episodes);
  const grad     = titleGradient(s.title);
  const ini      = initials(s.title);
  const link     = `#series/${s.id}`;
  const epCount  = allEps.length;
  const snCount  = s.seasons.length;
  // Find any episode with progress to show it
  const progEp   = allEps.find(e => { const p = getProgress(e.id); return p && p.pct > 2; });
  const pct      = progEp ? Math.min(getProgress(progEp.id)!.pct, 100) : 0;
  return `
<article class="media-card" data-href="${link}" role="button" tabindex="0" aria-label="Browse ${s.title}">
  <div class="card-thumb">
    <div class="card-thumb-bg" style="background:${grad}">${ini}</div>
    <div class="card-overlay">
      <div class="play-icon">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </div>
    <span class="card-badge">SERIES</span>
    ${pct > 2 ? `<div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>` : ''}
  </div>
  <div class="card-info">
    <div class="card-title truncate">${s.title}</div>
    <div class="card-meta"><span>${snCount} Season${snCount !== 1 ? 's' : ''}</span><span>${epCount} Ep${epCount !== 1 ? 's' : ''}</span></div>
  </div>
</article>`;
}

// ═══════════════════════════════════════════════════════════
// CONTINUE WATCHING
// ═══════════════════════════════════════════════════════════
interface ContinueItem { id: string; title: string; pct: number; time: number; duration: number; href: string; grad: string; ini: string; tag: string; }

function getContinueWatching(): ContinueItem[] {
  const all  = getAllProgress();
  const out: ContinueItem[] = [];
  // Movies
  lib.movies.forEach(m => {
    const p = all[m.id];
    if (p && p.pct > 2 && p.pct < 96) {
      out.push({ id: m.id, title: m.title, pct: p.pct, time: p.time, duration: p.duration, href: `#play/${m.id}`, grad: titleGradient(m.title), ini: initials(m.title), tag: 'Movie' });
    }
  });
  // Series episodes
  lib.series.forEach(s => {
    s.seasons.forEach(sn => {
      sn.episodes.forEach(ep => {
        const p = all[ep.id];
        if (p && p.pct > 2 && p.pct < 96) {
          out.push({ id: ep.id, title: ep.title, pct: p.pct, time: p.time, duration: p.duration, href: `#play/${ep.id}?series=${s.id}&season=${sn.number}`, grad: titleGradient(s.title), ini: initials(s.title), tag: `${s.title} · S${sn.number}E${ep.number}` });
        }
      });
    });
  });
  return out.sort((a, b) => b.time - a.time).slice(0, 8);
}

function buildContinueRow(items: ContinueItem[]): string {
  if (!items.length) return '';
  const cards = items.map(it => `
<article class="media-card" data-href="${it.href}" role="button" tabindex="0">
  <div class="card-thumb">
    <div class="card-thumb-bg" style="background:${it.grad}">${it.ini}</div>
    <div class="card-overlay"><div class="play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
    <div class="card-progress"><div class="card-progress-fill" style="width:${it.pct}%"></div></div>
  </div>
  <div class="card-info">
    <div class="card-title truncate">${it.title}</div>
    <div class="card-meta"><span style="color:var(--accent-2)">${it.tag}</span></div>
  </div>
</article>`).join('');
  return `
<section class="section">
  <div class="section-header">
    <h2 class="section-title">Continue Watching</h2>
  </div>
  <div class="card-row">${cards}</div>
</section>`;
}

// ═══════════════════════════════════════════════════════════
// HERO BUILDER
// ═══════════════════════════════════════════════════════════
function buildHero(item: Movie | Series): string {
  const grad = titleGradient(item.title);
  const ini  = initials(item.title);
  let badge = '', meta = '', desc = '', actions = '';

  if (item.type === 'movie') {
    const m = item as Movie;
    badge   = 'Movie';
    meta    = `<span>${fmtDuration(m.duration)}</span><span>${fmtSize(m.size)}</span>`;
    desc    = `Stream "${m.title}" — drop it into your media folder and hit play instantly.`;
    actions = `<button class="btn btn-primary" data-href="#play/${m.id}">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        Watch Now
      </button>`;
  } else {
    const s   = item as Series;
    const ep1 = s.seasons[0]?.episodes[0];
    badge     = 'Series';
    meta      = `<span>${s.seasons.length} Season${s.seasons.length !== 1 ? 's' : ''}</span><span>${s.seasons.flatMap(sn => sn.episodes).length} Episodes</span>`;
    desc      = `A ${s.seasons.length}-season series available in your library.`;
    actions   = `
      <button class="btn btn-primary" data-href="${ep1 ? `#play/${ep1.id}?series=${s.id}&season=${s.seasons[0].number}` : '#'}">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        Play S1 E1
      </button>
      <button class="btn btn-secondary" data-href="#series/${s.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        Episodes
      </button>`;
  }

  return `
<section class="hero">
  <div class="hero-backdrop" style="background:${grad}"></div>
  <div class="hero-content">
    <div class="hero-badge">▶ ${badge}</div>
    <h1 class="hero-title">${item.title}</h1>
    <div class="hero-meta">${meta}</div>
    <p class="hero-description">${desc}</p>
    <div class="hero-actions">${actions}</div>
  </div>
</section>`;
}

// ═══════════════════════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════════════════════
function renderHomePage(): void {
  const app = $('#app')!;

  const filtered = searchQuery.trim().toLowerCase();
  let movies  = lib.movies;
  let series  = lib.series;
  if (filtered) {
    movies = movies.filter(m => m.title.toLowerCase().includes(filtered));
    series = series.filter(s => s.title.toLowerCase().includes(filtered));
  }

  const all    = [...movies, ...series];
  const hero   = all.length ? buildHero(all[Math.floor(Math.random() * Math.min(all.length, 5))]) : '';
  const cont   = getContinueWatching();

  if (all.length === 0) {
    app.innerHTML = `
      <div class="empty-state" style="margin-top:80px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z"/></svg>
        <h3>Your Library is Empty</h3>
        <p>Drop movie files or series folders into your media directory to get started.</p>
        <div class="media-path">📂 media/</div>
        <p style="margin-top:16px;font-size:13px">
          <strong style="color:var(--text-2)">Movies:</strong> Drop .mkv / .mp4 files directly<br>
          <strong style="color:var(--text-2)">Series:</strong> media/ShowName/Season 1/Episode.mkv
        </p>
      </div>`;
    bindClicks(app);
    return;
  }

  const movieSection = movies.length ? `
<section class="section">
  <div class="section-header">
    <h2 class="section-title">Movies</h2>
    ${movies.length > 5 ? `<a class="section-link" href="#movies">See all</a>` : ''}
  </div>
  <div class="card-row">${movies.map(m => buildMovieCard(m, { inRow: true })).join('')}</div>
</section>` : '';

  const seriesSection = series.length ? `
<section class="section">
  <div class="section-header">
    <h2 class="section-title">TV Shows & Series</h2>
    ${series.length > 5 ? `<a class="section-link" href="#series">See all</a>` : ''}
  </div>
  <div class="card-row">${series.map(s => buildSeriesCard(s)).join('')}</div>
</section>` : '';

  app.innerHTML = hero + buildContinueRow(cont) + movieSection + seriesSection + `<div style="height:48px"></div>`;
  bindClicks(app);
}

// ═══════════════════════════════════════════════════════════
// MOVIES PAGE
// ═══════════════════════════════════════════════════════════
function renderMoviesPage(): void {
  const app    = $('#app')!;
  const movies = searchQuery
    ? lib.movies.filter(m => m.title.toLowerCase().includes(searchQuery))
    : lib.movies;

  if (!movies.length) {
    app.innerHTML = `<div class="empty-state" style="margin-top:80px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 3l-4 4-4-4"/></svg>
      <h3>No Movies Found</h3>
      <p>Add .mkv, .mp4, or other video files directly to your <code>media/</code> folder.</p>
    </div>`;
    return;
  }

  app.innerHTML = `
<div style="padding:40px 40px 8px">
  <h1 style="font-size:28px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px">Movies</h1>
  <p style="color:var(--text-2);font-size:14px">${movies.length} title${movies.length !== 1 ? 's' : ''}</p>
</div>
<div class="section">
  <div class="card-grid">${movies.map(m => buildMovieCard(m)).join('')}</div>
</div>
<div style="height:48px"></div>`;
  bindClicks(app);
}

// ═══════════════════════════════════════════════════════════
// SERIES LIST PAGE
// ═══════════════════════════════════════════════════════════
function renderSeriesListPage(): void {
  const app    = $('#app')!;
  const series = searchQuery
    ? lib.series.filter(s => s.title.toLowerCase().includes(searchQuery))
    : lib.series;

  if (!series.length) {
    app.innerHTML = `<div class="empty-state" style="margin-top:80px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m0 0h17.25m0 0c.621 0 1.125.504 1.125 1.125M21 5.625v12.75M21 5.625A1.125 1.125 0 0019.875 4.5h-15.75A1.125 1.125 0 003 5.625m18 0v1.5c0 .621-.504 1.125-1.125 1.125M12 10.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></svg>
      <h3>No Series Found</h3>
      <p>Create a folder inside <code>media/</code> with your show name, then add season folders inside it.</p>
      <div class="media-path">📁 media/My Show/Season 1/S01E01.mkv</div>
    </div>`;
    return;
  }

  app.innerHTML = `
<div style="padding:40px 40px 8px">
  <h1 style="font-size:28px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px">TV Shows & Series</h1>
  <p style="color:var(--text-2);font-size:14px">${series.length} show${series.length !== 1 ? 's' : ''}</p>
</div>
<div class="section">
  <div class="card-grid">${series.map(s => buildSeriesCard(s)).join('')}</div>
</div>
<div style="height:48px"></div>`;
  bindClicks(app);
}

// ═══════════════════════════════════════════════════════════
// SERIES DETAIL PAGE
// ═══════════════════════════════════════════════════════════
function renderSeriesPage(seriesId: string): void {
  const app = $('#app')!;
  const s   = lib.series.find(x => x.id === seriesId);
  if (!s) { navigate('home'); return; }

  const grad      = titleGradient(s.title);
  const ini       = initials(s.title);
  const allEps    = s.seasons.flatMap(sn => sn.episodes);
  const ep1       = s.seasons[0]?.episodes[0];
  const firstSeason = s.seasons[0];

  function buildEpisodesHTML(season: Season): string {
    return season.episodes.map(ep => {
      const prog = getProgress(ep.id);
      const pct  = prog ? Math.min(prog.pct, 100) : 0;
      const href = `#play/${ep.id}?series=${s!.id}&season=${season.number}`;
      return `
<div class="episode-row" data-href="${href}" role="button" tabindex="0">
  <div class="ep-num">${ep.number}</div>
  <div class="ep-thumb">
    <div class="ep-thumb-bg" style="background:${grad}">${ini}</div>
    <div class="ep-play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
    ${pct > 2 ? `<div class="ep-progress"><div class="ep-progress-fill" style="width:${pct}%"></div></div>` : ''}
  </div>
  <div class="ep-info">
    <div class="ep-title">${ep.title}</div>
    <div class="ep-desc clamp-2" style="color:var(--text-2);font-size:12px">Episode ${ep.number} · Season ${season.number}</div>
  </div>
  <div class="ep-duration">${fmtDuration(ep.duration)}</div>
</div>`;
    }).join('');
  }

  app.innerHTML = `
<div class="series-hero">
  <div class="series-hero-bg" style="background:${grad}"></div>
  <div class="series-hero-content">
    <a class="series-back" href="#home">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
      Back
    </a>
    <h1 class="series-title">${s.title}</h1>
    <div class="series-stats">
      <span>📺 ${s.seasons.length} Season${s.seasons.length !== 1 ? 's' : ''}</span>
      <span>🎬 ${allEps.length} Episodes</span>
    </div>
    ${ep1 ? `
    <div style="margin-top:20px;display:flex;gap:12px">
      <button class="btn btn-primary" data-href="#play/${ep1.id}?series=${s.id}&season=${firstSeason.number}">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        Play S1 E1
      </button>
    </div>` : ''}
  </div>
</div>

<div class="season-tabs-wrap">
  <div class="season-tabs" id="season-tabs">
    ${s.seasons.map(sn => `
      <button class="season-tab${sn.number === firstSeason.number ? ' active' : ''}" data-season="${sn.number}">
        ${sn.title}
      </button>`).join('')}
  </div>
</div>

<div class="episodes-section" id="episodes-section">
  <div class="episode-count">${firstSeason.episodes.length} Episodes</div>
  <div class="episodes-list" id="episodes-list">
    ${buildEpisodesHTML(firstSeason)}
  </div>
</div>`;

  // Season tab switching
  const tabsEl    = $('#season-tabs', app)!;
  const listEl    = $('#episodes-list', app)!;
  const countEl   = $('#episodes-section .episode-count', app)!;

  tabsEl.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-season]');
    if (!btn) return;
    const num    = parseInt(btn.dataset.season!);
    const season = s.seasons.find(sn => sn.number === num);
    if (!season) return;
    tabsEl.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    countEl.textContent = `${season.episodes.length} Episodes`;
    listEl.innerHTML    = buildEpisodesHTML(season);
    bindClicks(listEl);
  });

  bindClicks(app);
}

// ═══════════════════════════════════════════════════════════
// PLAYER PAGE
// ═══════════════════════════════════════════════════════════
function renderPlayerPage(videoId: string, params: URLSearchParams): void {
  const app = $('#app')!;

  // Resolve what we're playing
  const seriesId   = params.get('series') || '';
  const seasonNum  = parseInt(params.get('season') || '1');
  const series     = seriesId ? lib.series.find(s => s.id === seriesId) || null : null;
  const season     = series?.seasons.find(sn => sn.number === seasonNum) || series?.seasons[0] || null;
  const allEps     = series ? series.seasons.flatMap(sn => sn.episodes) : [];
  const currentEp  = season?.episodes.find(e => e.id === videoId)
                  || series?.seasons.flatMap(sn => sn.episodes).find(e => e.id === videoId)
                  || null;
  const movie      = !series ? lib.movies.find(m => m.id === videoId) || null : null;

  const title     = currentEp ? currentEp.title   : movie?.title || videoId;
  const subtitle  = currentEp ? `${series!.title} · S${currentEp.seasonNumber} E${currentEp.number}` : '';
  const backHref  = series ? `#series/${seriesId}` : '#home';
  const hasSidebar = !!series;

  // Build sidebar
  const buildSidebar = (activeSeason: Season): string => `
<aside class="episode-sidebar">
  <div class="sidebar-header">
    <div class="sidebar-title">${series!.title}</div>
    ${series!.seasons.length > 1 ? `
    <select class="sidebar-season-select" id="sidebar-season-sel">
      ${series!.seasons.map(sn => `<option value="${sn.number}" ${sn.number === activeSeason.number ? 'selected' : ''}>${sn.title}</option>`).join('')}
    </select>` : ''}
  </div>
  <div class="sidebar-episodes" id="sidebar-eps">
    ${buildSidebarEps(activeSeason)}
  </div>
</aside>`;

  const buildSidebarEps = (sn: Season): string => sn.episodes.map(ep => {
    const grad = titleGradient(series!.title);
    const ini  = initials(series!.title);
    const href = `#play/${ep.id}?series=${seriesId}&season=${sn.number}`;
    const prog = getProgress(ep.id);
    return `
<div class="sidebar-ep${ep.id === videoId ? ' active' : ''}" data-href="${href}" role="button" tabindex="0">
  <div class="sidebar-ep-num">${ep.number}</div>
  <div class="sidebar-ep-thumb">
    <div class="sidebar-ep-thumb-bg" style="background:${grad}">${ini}</div>
  </div>
  <div class="sidebar-ep-info">
    <div class="sidebar-ep-title">${ep.title}</div>
    <div class="sidebar-ep-dur">${fmtDuration(ep.duration)}${prog && prog.pct > 2 ? ` · ${Math.round(prog.pct)}%` : ''}</div>
  </div>
</div>`;
  }).join('');

  app.innerHTML = `
<div class="player-page${hasSidebar ? ' has-sidebar' : ''}">
  <div class="player-main">
    <div class="player-back-bar">
      <a class="back-btn" href="${backHref}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
        Back
      </a>
      <span class="player-title">${title}</span>
      ${subtitle ? `<span class="player-subtitle">${subtitle}</span>` : ''}
    </div>
    <div class="player-video-wrap">
      <div id="player-container"></div>
      <div id="up-next-overlay"></div>
    </div>
    <div class="player-meta">
      <div class="player-meta-title">${title}</div>
      <div class="player-meta-sub">
        ${subtitle ? `<span style="color:var(--accent-2)">${subtitle}</span>` : ''}
        ${movie ? `<span>${fmtSize(movie.size)}</span><span>${fmtDuration(movie.duration)}</span>` : ''}
        ${currentEp ? `<span>${fmtSize(currentEp.size)}</span><span>${fmtDuration(currentEp.duration)}</span>` : ''}
      </div>
    </div>
  </div>
  ${hasSidebar && season ? buildSidebar(season) : ''}
</div>`;

  bindClicks(app);

  // Season switching in sidebar
  if (series && season) {
    const sel = $<HTMLSelectElement>('#sidebar-season-sel', app);
    if (sel) {
      sel.addEventListener('change', () => {
        const sn = series.seasons.find(x => x.number === parseInt(sel.value));
        if (sn) { const epsEl = $('#sidebar-eps', app)!; epsEl.innerHTML = buildSidebarEps(sn); bindClicks(epsEl); }
      });
    }
  }

  // Mount the player
  const progress = getProgress(videoId);
  const startTime = progress && progress.pct > 2 && progress.pct < 96 ? progress.time : 0;
  mountPlayer(videoId, title, startTime, allEps, currentEp, series);
}

// ═══════════════════════════════════════════════════════════
// PLAYER MOUNT & LOGIC
// ═══════════════════════════════════════════════════════════
function mountPlayer(
  videoId: string,
  title: string,
  startAt: number,
  allEps: Episode[],
  currentEp: Episode | null,
  series: Series | null
): void {
  const container = $('#player-container');
  if (!container) return;

  const src = `${BACKEND_URL}/api/v1/video/${videoId}/raw`;

  try {
    player = new KuberPlayer({
      container: '#player-container',
      src,
      autoplay: true,
      controls: true,
      plugins: [
        new AnalyticsPlugin({ endpoint: `${BACKEND_URL}/api/v1/events`, videoId, heartbeatIntervalMs: 5000 }),
      ],
    });

    // Seek to resume point after player is ready
    if (startAt > 5) {
      player.on('timeupdate', function seekOnce() {
        if (player && player.getDuration() > 0) {
          player.seek(startAt);
          player.off('timeupdate', seekOnce as any);
        }
      });
    }

    // Save progress
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    player.on('play', () => {
      progressTimer = setInterval(() => {
        if (!player) return;
        const t = player.getCurrentTime();
        const d = player.getDuration();
        if (d > 0) saveProgress(videoId, t, d);
      }, 3000);
    });
    player.on('pause', () => { if (progressTimer) clearInterval(progressTimer); });
    player.on('ended',  () => {
      if (progressTimer) clearInterval(progressTimer);
      clearProgress(videoId);

      // Auto-play next episode
      if (currentEp && allEps.length > 1) {
        const curIdx  = allEps.findIndex(e => e.id === videoId);
        const nextEp  = allEps[curIdx + 1];
        if (nextEp) showUpNext(nextEp, series!);
      }
    });

    // Up next at 30s before end
    if (currentEp && allEps.length > 1) {
      const curIdx = allEps.findIndex(e => e.id === videoId);
      const nextEp = allEps[curIdx + 1];
      if (nextEp) {
        player.on('timeupdate', () => {
          if (!player) return;
          const d = player.getDuration();
          const t = player.getCurrentTime();
          if (d > 0 && d - t <= 30 && d - t > 0) {
            const ovl = $('#up-next-overlay');
            if (ovl && !ovl.classList.contains('show')) showUpNext(nextEp, series!);
          }
        });
      }
    }
  } catch (e) {
    console.error('Player mount failed:', e);
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:16px;padding:32px;text-align:center">
      <div style="font-size:48px">⚠️</div>
      <div style="font-size:16px;font-weight:600">Playback Error</div>
      <div style="font-size:13px;color:var(--text-2)">Could not load player. Check the server log.</div>
    </div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// UP NEXT OVERLAY
// ═══════════════════════════════════════════════════════════
let upNextTimer: ReturnType<typeof setInterval> | null = null;

function showUpNext(nextEp: Episode, series: Series): void {
  const ovl = $('#up-next-overlay');
  if (!ovl || ovl.classList.contains('show')) return;

  const grad  = titleGradient(series.title);
  const ini   = initials(series.title);
  const href  = `#play/${nextEp.id}?series=${series.id}&season=${nextEp.seasonNumber}`;
  let countdown = 10;

  ovl.innerHTML = `
<div class="up-next-header">
  <span>Up Next</span>
  <div class="up-next-countdown" id="up-next-num">${countdown}</div>
</div>
<div class="up-next-content">
  <div class="up-next-thumb">
    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${grad};font-weight:700;font-size:18px;color:rgba(255,255,255,0.8)">${ini}</div>
  </div>
  <div class="up-next-title">S${nextEp.seasonNumber} E${nextEp.number} · ${nextEp.title}</div>
  <div class="up-next-actions">
    <button class="up-next-play" id="up-next-play-btn">Play Now</button>
    <button class="up-next-cancel" id="up-next-cancel-btn">Cancel</button>
  </div>
</div>`;

  ovl.classList.add('show');

  const numEl = ovl.querySelector<HTMLElement>('#up-next-num')!;
  upNextTimer = setInterval(() => {
    countdown--;
    if (numEl) numEl.textContent = String(countdown);
    if (countdown <= 0) { clearUpNext(); navigate(href); }
  }, 1000);

  ovl.querySelector('#up-next-play-btn')?.addEventListener('click',   () => { clearUpNext(); navigate(href); });
  ovl.querySelector('#up-next-cancel-btn')?.addEventListener('click', () => clearUpNext());
}

function clearUpNext(): void {
  if (upNextTimer) { clearInterval(upNextTimer); upNextTimer = null; }
  const ovl = $('#up-next-overlay');
  if (ovl) ovl.classList.remove('show');
}

// ═══════════════════════════════════════════════════════════
// PLAYER CLEANUP
// ═══════════════════════════════════════════════════════════
function destroyPlayer(): void {
  clearUpNext();
  if (player) { try { player.destroy(); } catch (_) {} player = null; }
}

// ═══════════════════════════════════════════════════════════
// CLICK DELEGATION (data-href)
// ═══════════════════════════════════════════════════════════
function bindClicks(root: Element): void {
  root.addEventListener('click', (e) => {
    const target = (e.target as Element).closest<HTMLElement>('[data-href]');
    if (!target) return;
    e.preventDefault();
    const href = target.dataset.href!;
    if (href.startsWith('#')) {
      window.location.hash = href.slice(1);
    } else {
      window.location.hash = href;
    }
  });
  root.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key !== 'Enter' && ke.key !== ' ') return;
    const target = (e.target as Element).closest<HTMLElement>('[data-href]');
    if (!target) return;
    e.preventDefault();
    const href = target.dataset.href!;
    window.location.hash = href.startsWith('#') ? href.slice(1) : href;
  });
}

// ═══════════════════════════════════════════════════════════
// LOG PANEL
// ═══════════════════════════════════════════════════════════
function setupLogPanel(): void {
  const panel   = $('#log-panel')!;
  const output  = $('#log-output')!;
  const toggle  = $('#log-toggle-btn')!;
  const closeBtn = $('#log-close-btn')!;

  toggle.addEventListener('click',   () => panel.classList.toggle('open'));
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  const LEVEL_CLASS: Record<string, string> = { HTTP: 'HTTP', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', EVENT: 'EVENT' };

  function appendLog(entry: { ts: string; level: string; msg: string }): void {
    const t   = new Date(entry.ts).toLocaleTimeString();
    const row = document.createElement('div');
    row.className = 'log-line';
    row.innerHTML = `<span class="log-ts">${t}</span><span class="log-level ${LEVEL_CLASS[entry.level] || ''}">${entry.level}</span><span class="log-msg">${entry.msg}</span>`;
    output.appendChild(row);
    if (output.children.length > 300) output.firstElementChild?.remove();
    if (panel.classList.contains('open')) output.scrollTop = output.scrollHeight;
  }

  function connectSSE(): void {
    const es = new EventSource(`${BACKEND_URL}/api/v1/logs`);
    es.onmessage = (e) => {
      try { appendLog(JSON.parse(e.data)); } catch (_) {}
    };
    es.onerror = () => { es.close(); setTimeout(connectSSE, 3000); };
  }
  connectSSE();
}

// ═══════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════
function setupSearch(): void {
  const input = $<HTMLInputElement>('#search-input')!;
  if (!input) return;
  let debounce: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      searchQuery = input.value.trim().toLowerCase();
      // Only re-render if we're on a browsable page (not player)
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash.startsWith('play/')) renderRoute();
    }, 250);
  });
}

// ═══════════════════════════════════════════════════════════
// LIBRARY POLLING (auto-detect new files)
// ═══════════════════════════════════════════════════════════
function startPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const newLib = await fetchLibrary();
      const hasChanged =
        JSON.stringify(newLib.movies.map(m => m.id).sort()) !== JSON.stringify(lib.movies.map(m => m.id).sort()) ||
        JSON.stringify(newLib.series.map(s => s.id).sort()) !== JSON.stringify(lib.series.map(s => s.id).sort());
      if (hasChanged) {
        lib = newLib;
        const hash = decodeURIComponent(window.location.hash.slice(1));
        if (!hash.startsWith('play/') && !hash.startsWith('series/')) renderRoute();
      }
    } catch (_) {}
  }, POLL_INTERVAL);
}

// ═══════════════════════════════════════════════════════════
// NAV SCROLL EFFECT
// ═══════════════════════════════════════════════════════════
function setupNav(): void {
  const nav = $('#navbar')!;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  $<HTMLElement>('#logo-btn')?.addEventListener('click', () => navigate('home'));
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
async function init(): Promise<void> {
  setupNav();
  setupRouter();
  setupSearch();
  setupLogPanel();

  try {
    lib = await fetchLibrary();
  } catch (e) {
    console.error('Failed to load library:', e);
    const app = $('#app')!;
    app.innerHTML = `<div class="empty-state" style="margin-top:80px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
      <h3>Cannot Connect to Backend</h3>
      <p>Make sure the backend server is running on port 8080.</p>
      <div class="media-path">node backend/mock_server.js</div>
    </div>`;
    return;
  }

  renderRoute();
  startPolling();
}

document.addEventListener('DOMContentLoaded', init);
