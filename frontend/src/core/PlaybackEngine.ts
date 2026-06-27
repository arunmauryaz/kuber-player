import Hls from 'hls.js';
import { EventEmitter } from './EventEmitter';

export interface QualityLevel {
  index: number;
  height: number;
  width: number;
  bitrate: number;
  label: string;
}

export interface SubtitleTrack {
  index: number;
  label: string;
  lang?: string;
}

export interface AudioTrack {
  index: number;
  label: string;
  lang?: string;
}

export class PlaybackEngine {
  public videoElement: HTMLVideoElement;
  private hls: Hls | null = null;
  private emitter: EventEmitter;
  private qualities: QualityLevel[] = [];
  private activeQualityIndex: number = -1; // -1 = Auto
  private subtitles: SubtitleTrack[] = [];
  private activeSubtitleIndex: number = -1;
  private audioTracks: AudioTrack[] = [];
  private activeAudioIndex: number = 0;

  constructor(videoElement: HTMLVideoElement, emitter: EventEmitter) {
    this.videoElement = videoElement;
    this.emitter = emitter;
    this.setupNativeListeners();
  }

  public load(src: string): void {
    this.destroyHls();

    // ── Raw video file (MP4, MKV, WebM, etc.) — bypass HLS, use native element ──
    const isRawVideo = !src.endsWith('.m3u8') && !src.includes('master') && !src.includes('playlist');
    if (isRawVideo) {
      this.videoElement.src = src;
      this.videoElement.load();
      // Surface a minimal quality entry so UI controls can render
      this.videoElement.addEventListener('loadedmetadata', () => {
        this.qualities = [{
          index: 0,
          width: this.videoElement.videoWidth || 1280,
          height: this.videoElement.videoHeight || 720,
          bitrate: 0,
          label: 'Auto'
        }];
        this.emitter.emit('qualities', this.qualities);
        this.emitter.emit('manifestLoaded');
      }, { once: true });
      return;
    }

    // ── HLS stream (.m3u8) — use hls.js ──────────────────────────────────────
    if (Hls.isSupported()) {
      this.hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true,
        lowLatencyMode: false,
      });

      this.hls.attachMedia(this.videoElement);

      this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        this.hls?.loadSource(src);
      });

      this.hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        // Parse quality levels
        this.qualities = data.levels.map((level, idx) => ({
          index: idx,
          width: level.width,
          height: level.height,
          bitrate: level.bitrate,
          label: level.height ? `${level.height}p` : `Variant ${idx + 1}`,
        }));
        
        this.emitter.emit('qualities', this.qualities);
        this.emitter.emit('manifestLoaded');
      });

      this.hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        this.activeQualityIndex = this.hls?.autoLevelEnabled ? -1 : data.level;
        this.emitter.emit('qualityChanged', {
          index: this.activeQualityIndex,
          level: data.level,
          auto: this.hls?.autoLevelEnabled || false
        });
      });

      this.hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        this.subtitles = data.subtitleTracks.map((t) => ({
          index: t.id,
          label: t.name || t.lang || `Track ${t.id}`,
          lang: t.lang
        }));
        this.emitter.emit('subtitles', this.subtitles);
      });

      this.hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_, data) => {
        this.activeSubtitleIndex = data.id;
        this.emitter.emit('subtitleChanged', this.activeSubtitleIndex);
      });

      this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
        this.audioTracks = data.audioTracks.map((t) => ({
          index: t.id,
          label: t.name || t.lang || `Track ${t.id}`,
          lang: t.lang
        }));
        this.emitter.emit('audioTracks', this.audioTracks);
      });

      this.hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
        this.activeAudioIndex = data.id;
        this.emitter.emit('audioTrackChanged', this.activeAudioIndex);
      });

      // Error handling and auto recovery
      this.hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Fatal network error encountered, trying to recover...', data);
              this.hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Fatal media error encountered, trying to recover...', data);
              this.hls?.recoverMediaError();
              break;
            default:
              console.error('Fatal unrecoverable error', data);
              this.emitter.emit('error', data);
              this.destroyHls();
              break;
          }
        } else {
          this.emitter.emit('warn', data);
        }
      });

    } else if (this.videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari/iOS Safari)
      this.videoElement.src = src;
      this.videoElement.addEventListener('loadedmetadata', () => {
        // Expose a native pseudo quality
        this.qualities = [{
          index: 0,
          width: this.videoElement.videoWidth,
          height: this.videoElement.videoHeight,
          bitrate: 0,
          label: 'Native (Auto)'
        }];
        this.emitter.emit('qualities', this.qualities);
        this.emitter.emit('manifestLoaded');
      });
    } else {
      console.error('HLS playback not supported by this browser.');
      this.emitter.emit('error', new Error('MSE / HLS is not supported'));
    }
  }

  private setupNativeListeners(): void {
    const events = [
      'play', 'pause', 'playing', 'waiting', 'seeking', 'seeked',
      'timeupdate', 'volumechange', 'ratechange', 'durationchange',
      'ended', 'progress', 'error'
    ];

    events.forEach(evt => {
      this.videoElement.addEventListener(evt, (e) => {
        if (evt === 'error') {
          this.emitter.emit('error', this.videoElement.error);
        } else {
          this.emitter.emit(evt, e);
        }
      });
    });
  }

  public play(): Promise<void> {
    return this.videoElement.play();
  }

  public pause(): void {
    this.videoElement.pause();
  }

  public seek(time: number): void {
    this.videoElement.currentTime = time;
  }

  public setVolume(volume: number): void {
    this.videoElement.volume = Math.max(0, Math.min(1, volume));
  }

  public setMute(mute: boolean): void {
    this.videoElement.muted = mute;
  }

  public setPlaybackRate(rate: number): void {
    this.videoElement.playbackRate = rate;
  }

  public setQuality(index: number): void {
    if (!this.hls) return;
    this.activeQualityIndex = index;
    if (index === -1) {
      this.hls.currentLevel = -1; // Auto
    } else {
      this.hls.currentLevel = index;
    }
  }

  public setSubtitle(index: number): void {
    if (!this.hls) {
      // Toggle native text tracks if available
      for (let i = 0; i < this.videoElement.textTracks.length; i++) {
        this.videoElement.textTracks[i].mode = (i === index) ? 'showing' : 'disabled';
      }
      this.activeSubtitleIndex = index;
      this.emitter.emit('subtitleChanged', index);
      return;
    }

    this.activeSubtitleIndex = index;
    this.hls.subtitleTrack = index;
  }

  public setAudioTrack(index: number): void {
    if (!this.hls) return;
    this.activeAudioIndex = index;
    this.hls.audioTrack = index;
  }

  // Getters
  public getQualities(): QualityLevel[] {
    return this.qualities;
  }

  public getActiveQualityIndex(): number {
    return this.activeQualityIndex;
  }

  public getSubtitles(): SubtitleTrack[] {
    return this.subtitles;
  }

  public getActiveSubtitleIndex(): number {
    return this.activeSubtitleIndex;
  }

  public getAudioTracks(): AudioTrack[] {
    return this.audioTracks;
  }

  public getActiveAudioIndex(): number {
    return this.activeAudioIndex;
  }

  public getBufferedDuration(): number {
    const buffered = this.videoElement.buffered;
    const time = this.videoElement.currentTime;
    for (let i = 0; i < buffered.length; i++) {
      if (time >= buffered.start(i) && time <= buffered.end(i)) {
        return buffered.end(i) - time;
      }
    }
    return 0;
  }

  private destroyHls(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.qualities = [];
    this.subtitles = [];
    this.audioTracks = [];
    this.activeQualityIndex = -1;
    this.activeSubtitleIndex = -1;
    this.activeAudioIndex = 0;
  }

  public destroy(): void {
    this.destroyHls();
    this.videoElement.src = '';
    this.videoElement.load();
  }
}
