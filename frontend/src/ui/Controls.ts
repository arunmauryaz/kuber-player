import { KuberPlayer } from '../core/KuberPlayer';

interface SpriteFrame {
  startTime: number;
  endTime: number;
  image: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class PlayerUI {
  private player: KuberPlayer;
  private container: HTMLElement;
  private video: HTMLVideoElement;
  
  // DOM Elements
  private overlay!: HTMLDivElement;
  private playBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private volumeSlider!: HTMLInputElement;
  private timeDisplay!: HTMLSpanElement;
  private progressContainer!: HTMLDivElement;
  private playedBar!: HTMLDivElement;
  private bufferedBar!: HTMLDivElement;
  private fullscreenBtn!: HTMLButtonElement;
  private pipBtn!: HTMLButtonElement;
  private settingsBtn!: HTMLButtonElement;
  private settingsPanel!: HTMLDivElement;
  private statsBtn!: HTMLButtonElement;
  private statsOverlay!: HTMLDivElement;
  private previewThumbnail!: HTMLDivElement;
  private previewImage!: HTMLDivElement;
  private previewTime!: HTMLDivElement;

  // State
  private isSeeking = false;
  private spriteFrames: SpriteFrame[] = [];
  private spriteBaseUrl = '';
  private activeMenu: 'main' | 'quality' | 'speed' | 'subtitles' | 'audio' = 'main';

  // SVGs Packaged
  private svgPlay = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
  private svgPause = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
  private svgMute = `<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
  private svgVolumeLow = `<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
  private svgVolumeHigh = `<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
  private svgFullscreen = `<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
  private svgExitFullscreen = `<svg viewBox="0 0 24 24"><path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"></path></svg>`;
  private svgSettings = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
  private svgPip = `<svg viewBox="0 0 24 24"><path d="M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-10 14H3V5h8v12zm10 0h-8V5h8v12z"></path></svg>`;
  private svgStats = `<svg viewBox="0 0 24 24"><rect x="18" y="3" width="4" height="18"></rect><rect x="10" y="8" width="4" height="13"></rect><rect x="2" y="14" width="4" height="7"></rect></svg>`;

  constructor(player: KuberPlayer) {
    this.player = player;
    this.container = player.getContainer();
    this.video = player.getVideoElement();

    this.buildUI();
    this.bindEvents();
    this.loadSpriteVtt();
  }

  private buildUI(): void {
    // 1. Core overlay container
    this.overlay = document.createElement('div');
    this.overlay.classList.add('kuber-ui-overlay');
    this.container.appendChild(this.overlay);

    // 2. Top bar
    const topBar = document.createElement('div');
    topBar.classList.add('kuber-top-bar');
    
    const title = document.createElement('h2');
    title.classList.add('kuber-video-title');
    title.innerText = this.player.getOptions().poster ? 'Kuber Media stream' : 'Streaming Engine';
    topBar.appendChild(title);

    this.overlay.appendChild(topBar);

    // 3. Center overlay spinner
    const centerOverlay = document.createElement('div');
    centerOverlay.classList.add('kuber-center-overlay');
    const spinner = document.createElement('div');
    spinner.classList.add('kuber-spinner');
    centerOverlay.appendChild(spinner);
    this.container.appendChild(centerOverlay);

    // 4. Controls panel (bottom)
    const controlsBar = document.createElement('div');
    controlsBar.classList.add('kuber-controls-bar');
    this.overlay.appendChild(controlsBar);

    // 5. Timeline / Progress bar
    this.progressContainer = document.createElement('div');
    this.progressContainer.classList.add('kuber-progress-container');
    
    this.bufferedBar = document.createElement('div');
    this.bufferedBar.classList.add('kuber-progress-bar-buffered');
    
    this.playedBar = document.createElement('div');
    this.playedBar.classList.add('kuber-progress-bar-played');
    
    this.progressContainer.appendChild(this.bufferedBar);
    this.progressContainer.appendChild(this.playedBar);
    controlsBar.appendChild(this.progressContainer);

    // 6. Preview seek hover thumbnail
    this.previewThumbnail = document.createElement('div');
    this.previewThumbnail.classList.add('kuber-preview-thumbnail');
    
    this.previewImage = document.createElement('div');
    this.previewImage.classList.add('kuber-preview-image');
    
    this.previewTime = document.createElement('div');
    this.previewTime.classList.add('kuber-preview-time');
    
    this.previewThumbnail.appendChild(this.previewImage);
    this.previewThumbnail.appendChild(this.previewTime);
    this.progressContainer.appendChild(this.previewThumbnail);

    // 7. Controls row
    const controlsRow = document.createElement('div');
    controlsRow.classList.add('kuber-controls-row');
    controlsBar.appendChild(controlsRow);

    // 7.1 Left group
    const leftGroup = document.createElement('div');
    leftGroup.classList.add('kuber-controls-group');
    
    this.playBtn = document.createElement('button');
    this.playBtn.classList.add('kuber-btn');
    this.playBtn.innerHTML = this.svgPlay;
    leftGroup.appendChild(this.playBtn);

    // Volume Slider
    const volumeContainer = document.createElement('div');
    volumeContainer.classList.add('kuber-volume-container');
    
    this.muteBtn = document.createElement('button');
    this.muteBtn.classList.add('kuber-btn');
    this.muteBtn.innerHTML = this.svgVolumeHigh;
    volumeContainer.appendChild(this.muteBtn);

    this.volumeSlider = document.createElement('input');
    this.volumeSlider.type = 'range';
    this.volumeSlider.classList.add('kuber-volume-slider');
    this.volumeSlider.min = '0';
    this.volumeSlider.max = '1';
    this.volumeSlider.step = '0.05';
    this.volumeSlider.value = this.video.volume.toString();
    volumeContainer.appendChild(this.volumeSlider);
    leftGroup.appendChild(volumeContainer);

    // Time Display
    this.timeDisplay = document.createElement('span');
    this.timeDisplay.classList.add('kuber-time-display');
    this.timeDisplay.innerText = '00:00 / 00:00';
    leftGroup.appendChild(this.timeDisplay);
    
    controlsRow.appendChild(leftGroup);

    // 7.2 Right group
    const rightGroup = document.createElement('div');
    rightGroup.classList.add('kuber-controls-group');

    this.statsBtn = document.createElement('button');
    this.statsBtn.classList.add('kuber-btn');
    this.statsBtn.innerHTML = this.svgStats;
    this.statsBtn.title = 'Developer Statistics';
    rightGroup.appendChild(this.statsBtn);

    this.settingsBtn = document.createElement('button');
    this.settingsBtn.classList.add('kuber-btn');
    this.settingsBtn.innerHTML = this.svgSettings;
    this.settingsBtn.title = 'Settings';
    rightGroup.appendChild(this.settingsBtn);

    this.pipBtn = document.createElement('button');
    this.pipBtn.classList.add('kuber-btn');
    this.pipBtn.innerHTML = this.svgPip;
    this.pipBtn.title = 'Picture-in-Picture';
    rightGroup.appendChild(this.pipBtn);

    this.fullscreenBtn = document.createElement('button');
    this.fullscreenBtn.classList.add('kuber-btn');
    this.fullscreenBtn.innerHTML = this.svgFullscreen;
    this.fullscreenBtn.title = 'Fullscreen';
    rightGroup.appendChild(this.fullscreenBtn);

    controlsRow.appendChild(rightGroup);

    // 8. Settings Popup Panel
    this.settingsPanel = document.createElement('div');
    this.settingsPanel.classList.add('kuber-settings-panel');
    this.container.appendChild(this.settingsPanel);
    this.renderSettingsMenu();

    // 9. Developer stats panel overlay
    this.statsOverlay = document.createElement('div');
    this.statsOverlay.classList.add('kuber-stats-overlay');
    this.container.appendChild(this.statsOverlay);
  }

  private bindEvents(): void {
    // Play / Pause toggle
    this.playBtn.addEventListener('click', () => this.player.togglePlay());
    this.video.addEventListener('click', () => this.player.togglePlay());

    // Mute / Unmute
    this.muteBtn.addEventListener('click', () => this.player.toggleMute());

    // Volume Change
    this.volumeSlider.addEventListener('input', () => {
      this.player.setVolume(parseFloat(this.volumeSlider.value));
    });

    // Seek interaction
    this.progressContainer.addEventListener('mousedown', (e) => this.startSeek(e));
    window.addEventListener('mousemove', (e) => this.updateSeek(e));
    window.addEventListener('mouseup', () => this.endSeek());

    // Hover Seek timeline thumbnails
    this.progressContainer.addEventListener('mousemove', (e) => this.showHoverThumbnail(e));
    this.progressContainer.addEventListener('mouseleave', () => {
      this.previewThumbnail.style.opacity = '0';
    });

    // Settings panel toggles
    this.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.settingsPanel.classList.toggle('kuber-panel-open');
      this.activeMenu = 'main';
      this.renderSettingsMenu();
    });

    document.addEventListener('click', () => {
      this.settingsPanel.classList.remove('kuber-panel-open');
    });
    this.settingsPanel.addEventListener('click', (e) => e.stopPropagation());

    // PiP
    this.pipBtn.addEventListener('click', () => this.player.togglePictureInPicture());

    // Fullscreen toggle
    this.fullscreenBtn.addEventListener('click', () => this.player.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => {
      this.fullscreenBtn.innerHTML = document.fullscreenElement ? this.svgExitFullscreen : this.svgFullscreen;
    });

    // Dev stats overlay
    this.statsBtn.addEventListener('click', () => {
      this.statsOverlay.classList.toggle('kuber-stats-open');
      this.updateStats();
    });

    // Core Player state bindings
    this.player.on('play', () => {
      this.playBtn.innerHTML = this.svgPause;
      this.container.classList.remove('kuber-player-paused');
    });

    this.player.on('pause', () => {
      this.playBtn.innerHTML = this.svgPlay;
      this.container.classList.add('kuber-player-paused');
    });

    this.player.on('timeupdate', () => {
      this.updateTimeline();
      if (this.statsOverlay.classList.contains('kuber-stats-open')) {
        this.updateStats();
      }
    });

    this.player.on('progress', () => this.updateTimeline());
    this.player.on('volume', (v) => {
      this.volumeSlider.value = v.toString();
      this.updateVolumeBtn(v, this.video.muted);
    });
    this.player.on('mute', (m) => {
      this.updateVolumeBtn(this.video.volume, m);
    });

    this.player.on('waiting', () => {
      this.container.classList.add('kuber-player-buffering');
    });

    this.player.on('playing', () => {
      this.container.classList.remove('kuber-player-buffering');
    });

    this.player.on('manifestLoaded', () => {
      this.renderChapters();
      this.renderSettingsMenu();
    });

    // Reset default layout
    this.container.classList.add('kuber-player-paused');
  }

  private startSeek(e: MouseEvent): void {
    this.isSeeking = true;
    this.updateSeek(e);
  }

  private updateSeek(e: MouseEvent): void {
    if (!this.isSeeking) return;
    const rect = this.progressContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const percent = Math.max(0, Math.min(1, pos));
    this.playedBar.style.width = `${percent * 100}%`;
    const targetTime = percent * this.player.getDuration();
    this.video.currentTime = targetTime;
  }

  private endSeek(): void {
    this.isSeeking = false;
  }

  private updateTimeline(): void {
    if (this.isSeeking) return;
    const duration = this.player.getDuration();
    const time = this.player.getCurrentTime();
    
    // Played progress percentage
    const playPercent = duration ? (time / duration) * 100 : 0;
    this.playedBar.style.width = `${playPercent}%`;

    // Buffered percentage
    const buffered = this.video.buffered;
    if (buffered.length > 0 && duration > 0) {
      let activeBufferEnd = 0;
      for (let i = 0; i < buffered.length; i++) {
        if (time >= buffered.start(i) && time <= buffered.end(i)) {
          activeBufferEnd = buffered.end(i);
          break;
        }
      }
      const bufferPercent = (activeBufferEnd / duration) * 100;
      this.bufferedBar.style.width = `${bufferPercent}%`;
    } else {
      this.bufferedBar.style.width = '0%';
    }

    // Time text
    this.timeDisplay.innerText = `${this.formatTime(time)} / ${this.formatTime(duration)}`;
  }

  private updateVolumeBtn(volume: number, muted: boolean): void {
    if (muted || volume === 0) {
      this.muteBtn.innerHTML = this.svgMute;
    } else if (volume < 0.5) {
      this.muteBtn.innerHTML = this.svgVolumeLow;
    } else {
      this.muteBtn.innerHTML = this.svgVolumeHigh;
    }
  }

  private renderChapters(): void {
    // Clear old chapter elements
    const oldMarkers = this.progressContainer.querySelectorAll('.kuber-chapter-marker');
    oldMarkers.forEach(el => el.remove());

    const duration = this.player.getDuration();
    if (duration <= 0) return;

    // Fetch chapters from video if any (simulated/custom in our service)
    const options = this.player.getOptions();
    const videoId = options.src.split('/v1/video/')[1]?.split('/')[0];
    if (!videoId) return;

    fetch(`${options.src.split('/v1/video/')[0]}/v1/video/${videoId}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.chapters) {
          data.chapters.forEach((chap: any) => {
            const marker = document.createElement('div');
            marker.classList.add('kuber-chapter-marker');
            const percent = (chap.start_time / duration) * 100;
            marker.style.left = `${percent}%`;
            marker.title = `${chap.title} (${this.formatTime(chap.start_time)})`;
            this.progressContainer.appendChild(marker);
          });
        }
      })
      .catch(() => {});
  }

  // Preview Seek VTT sprites
  private async loadSpriteVtt(): Promise<void> {
    const spriteVttUrl = this.player.getOptions().spriteVtt;
    if (!spriteVttUrl) return;

    this.spriteBaseUrl = spriteVttUrl.substring(0, spriteVttUrl.lastIndexOf('/') + 1);

    try {
      const response = await fetch(spriteVttUrl);
      if (!response.ok) return;
      const text = await response.text();
      this.parseVtt(text);
    } catch (e) {
      console.warn('Failed to fetch preview VTT file:', e);
    }
  }

  private parseVtt(vttText: string): void {
    const lines = vttText.split('\n');
    let currentFrame: Partial<SpriteFrame> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('-->')) {
        const times = line.split('-->');
        currentFrame.startTime = this.parseVttTime(times[0].trim());
        currentFrame.endTime = this.parseVttTime(times[1].trim());
      } else if (line.includes('.jpg#xywh=')) {
        const parts = line.split('#xywh=');
        currentFrame.image = parts[0];
        const coords = parts[1].split(',').map(Number);
        currentFrame.x = coords[0];
        currentFrame.y = coords[1];
        currentFrame.w = coords[2];
        currentFrame.h = coords[3];

        this.spriteFrames.push(currentFrame as SpriteFrame);
        currentFrame = {};
      }
    }
  }

  private parseVttTime(timeStr: string): number {
    const parts = timeStr.split(':');
    let secs = 0;
    if (parts.length === 3) {
      secs += parseFloat(parts[0]) * 3600; // hrs
      secs += parseFloat(parts[1]) * 60;   // mins
      secs += parseFloat(parts[2]);        // secs
    } else {
      secs += parseFloat(parts[0]) * 60;   // mins
      secs += parseFloat(parts[1]);        // secs
    }
    return secs;
  }

  private showHoverThumbnail(e: MouseEvent): void {
    const duration = this.player.getDuration();
    if (duration <= 0) return;

    const rect = this.progressContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const percent = Math.max(0, Math.min(1, pos));
    const hoverTime = percent * duration;

    // Position thumbnail
    this.previewThumbnail.style.left = `${percent * 100}%`;
    this.previewThumbnail.style.opacity = '1';
    this.previewTime.innerText = this.formatTime(hoverTime);

    // Look for sprite frame
    const frame = this.spriteFrames.find(f => hoverTime >= f.startTime && hoverTime < f.endTime);
    if (frame) {
      this.previewImage.style.backgroundImage = `url(${this.spriteBaseUrl}${frame.image})`;
      this.previewImage.style.backgroundPosition = `-${frame.x}px -${frame.y}px`;
      this.previewThumbnail.style.width = `${frame.w}px`;
      this.previewThumbnail.style.height = `${frame.h}px`;
    }
  }

  // Settings Panel rendering
  private renderSettingsMenu(): void {
    const engine = this.player.getPlaybackEngine();

    if (this.activeMenu === 'main') {
      const activeQual = engine.getActiveQualityIndex();
      const qualities = engine.getQualities();
      const currentQualLabel = activeQual === -1 ? 'Auto' : (qualities.find(q => q.index === activeQual)?.label || 'Auto');

      const subs = engine.getSubtitles();
      const activeSub = engine.getActiveSubtitleIndex();
      const currentSubLabel = activeSub === -1 ? 'Off' : (subs.find(s => s.index === activeSub)?.label || 'Off');

      this.settingsPanel.innerHTML = `
        <div class="kuber-settings-menu">
          <div class="kuber-settings-header">Settings</div>
          <div class="kuber-settings-item" id="kuber-settings-qual-btn">
            <span>Quality</span>
            <span class="kuber-settings-value">${currentQualLabel}</span>
          </div>
          <div class="kuber-settings-item" id="kuber-settings-speed-btn">
            <span>Speed</span>
            <span class="kuber-settings-value">${this.video.playbackRate}x</span>
          </div>
          <div class="kuber-settings-item" id="kuber-settings-sub-btn">
            <span>Subtitles</span>
            <span class="kuber-settings-value">${currentSubLabel}</span>
          </div>
        </div>
      `;

      // Bind Submenu buttons
      this.settingsPanel.querySelector('#kuber-settings-qual-btn')?.addEventListener('click', () => {
        this.activeMenu = 'quality';
        this.renderSettingsMenu();
      });

      this.settingsPanel.querySelector('#kuber-settings-speed-btn')?.addEventListener('click', () => {
        this.activeMenu = 'speed';
        this.renderSettingsMenu();
      });

      this.settingsPanel.querySelector('#kuber-settings-sub-btn')?.addEventListener('click', () => {
        this.activeMenu = 'subtitles';
        this.renderSettingsMenu();
      });

    } else if (this.activeMenu === 'quality') {
      const qualities = engine.getQualities();
      const activeIdx = engine.getActiveQualityIndex();
      
      let optionsHtml = `<div class="kuber-settings-option ${activeIdx === -1 ? 'kuber-option-selected' : ''}" data-idx="-1">Auto</div>`;
      qualities.forEach(q => {
        optionsHtml += `<div class="kuber-settings-option ${activeIdx === q.index ? 'kuber-option-selected' : ''}" data-idx="${q.index}">${q.label}</div>`;
      });

      this.settingsPanel.innerHTML = `
        <div class="kuber-settings-menu">
          <div class="kuber-settings-header" id="kuber-submenu-back">‹ Quality</div>
          ${optionsHtml}
        </div>
      `;

      this.settingsPanel.querySelector('#kuber-submenu-back')?.addEventListener('click', () => {
        this.activeMenu = 'main';
        this.renderSettingsMenu();
      });

      this.settingsPanel.querySelectorAll('.kuber-settings-option').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.getAttribute('data-idx') || '-1', 10);
          this.player.setQuality(idx);
          this.activeMenu = 'main';
          this.renderSettingsMenu();
        });
      });

    } else if (this.activeMenu === 'speed') {
      const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
      const activeRate = this.video.playbackRate;

      let optionsHtml = '';
      speeds.forEach(s => {
        optionsHtml += `<div class="kuber-settings-option ${activeRate === s ? 'kuber-option-selected' : ''}" data-speed="${s}">${s}x</div>`;
      });

      this.settingsPanel.innerHTML = `
        <div class="kuber-settings-menu">
          <div class="kuber-settings-header" id="kuber-submenu-back">‹ Playback Speed</div>
          ${optionsHtml}
        </div>
      `;

      this.settingsPanel.querySelector('#kuber-submenu-back')?.addEventListener('click', () => {
        this.activeMenu = 'main';
        this.renderSettingsMenu();
      });

      this.settingsPanel.querySelectorAll('.kuber-settings-option').forEach(el => {
        el.addEventListener('click', () => {
          const speed = parseFloat(el.getAttribute('data-speed') || '1.0');
          this.player.setPlaybackRate(speed);
          this.activeMenu = 'main';
          this.renderSettingsMenu();
        });
      });

    } else if (this.activeMenu === 'subtitles') {
      const subs = engine.getSubtitles();
      const activeIdx = engine.getActiveSubtitleIndex();

      let optionsHtml = `<div class="kuber-settings-option ${activeIdx === -1 ? 'kuber-option-selected' : ''}" data-idx="-1">Off</div>`;
      subs.forEach(s => {
        optionsHtml += `<div class="kuber-settings-option ${activeIdx === s.index ? 'kuber-option-selected' : ''}" data-idx="${s.index}">${s.label}</div>`;
      });

      this.settingsPanel.innerHTML = `
        <div class="kuber-settings-menu">
          <div class="kuber-settings-header" id="kuber-submenu-back">‹ Subtitles</div>
          ${optionsHtml}
        </div>
      `;

      this.settingsPanel.querySelector('#kuber-submenu-back')?.addEventListener('click', () => {
        this.activeMenu = 'main';
        this.renderSettingsMenu();
      });

      this.settingsPanel.querySelectorAll('.kuber-settings-option').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.getAttribute('data-idx') || '-1', 10);
          this.player.setSubtitle(idx);
          this.activeMenu = 'main';
          this.renderSettingsMenu();
        });
      });
    }
  }

  // Developer Statistics Overlay
  private updateStats(): void {
    const buffered = this.player.getBufferedDuration();
    const duration = this.player.getDuration();
    const time = this.player.getCurrentTime();

    let width = this.video.videoWidth;
    let height = this.video.videoHeight;
    
    // Attempt to gather extra parameters from Hls.js level
    const engine = this.player.getPlaybackEngine();
    const qualities = engine.getQualities();
    const activeIdx = engine.getActiveQualityIndex();
    const activeLevel = qualities.find(q => q.index === activeIdx);
    
    let resolution = `${width}x${height}`;
    let bitrate = activeLevel ? `${(activeLevel.bitrate / 1000000).toFixed(2)} Mbps` : 'Adaptive';
    let codec = this.player.getVideoElement().src.includes('.m3u8') ? 'H.264 / AAC (HLS)' : 'HTML5 Native';

    this.statsOverlay.innerHTML = `
      <div class="kuber-settings-header" style="padding:0 0 8px 0; border:none; margin-bottom:10px;">Dev Playback Information</div>
      <div class="kuber-stats-row"><span>Source Resolution:</span><span>${resolution}</span></div>
      <div class="kuber-stats-row"><span>Target Codec:</span><span>${codec}</span></div>
      <div class="kuber-stats-row"><span>Bitrate Level:</span><span>${bitrate}</span></div>
      <div class="kuber-stats-row"><span>Buffer Health:</span><span>${buffered.toFixed(2)}s</span></div>
      <div class="kuber-stats-row"><span>Playback Progress:</span><span>${time.toFixed(1)}s / ${duration.toFixed(1)}s</span></div>
      <div class="kuber-stats-row"><span>Host Status:</span><span>Axum Engine</span></div>
    `;
  }

  // Helpers
  private formatTime(timeSecs: number): string {
    if (isNaN(timeSecs) || timeSecs === Infinity) return '00:00';
    const hrs = Math.floor(timeSecs / 3600);
    const mins = Math.floor((timeSecs % 3600) / 60);
    const secs = Math.floor(timeSecs % 60);

    const mStr = mins < 10 ? `0${mins}` : `${mins}`;
    const sStr = secs < 10 ? `0${secs}` : `${secs}`;

    if (hrs > 0) {
      const hStr = hrs < 10 ? `0${hrs}` : `${hrs}`;
      return `${hStr}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
  }

  public destroy(): void {
    this.overlay.remove();
    this.settingsPanel.remove();
    this.statsOverlay.remove();
  }
}
