import { EventEmitter } from './EventEmitter';
import { PlaybackEngine } from './PlaybackEngine';
import type { QualityLevel, SubtitleTrack, AudioTrack } from './PlaybackEngine';
import { PluginManager, PlayerPlugin } from './PluginManager';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { PlayerUI } from '../ui/Controls';

// Import CSS style sheet so Vite automatically packages it
import '../ui/theme.css';

export interface PlayerOptions {
  container: string | HTMLElement;
  src: string;
  poster?: string;
  spriteVtt?: string;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean; // defaults to true
  plugins?: PlayerPlugin[];
}

export class KuberPlayer extends EventEmitter {
  private container: HTMLElement;
  private videoElement: HTMLVideoElement;
  private engine: PlaybackEngine;
  private plugins: PluginManager;
  private shortcuts: KeyboardShortcuts;
  private ui: PlayerUI | null = null;
  private options: PlayerOptions;

  constructor(options: PlayerOptions) {
    super();
    this.options = {
      controls: true,
      autoplay: false,
      muted: false,
      ...options
    };

    // 1. Resolve container element
    if (typeof this.options.container === 'string') {
      const el = document.querySelector(this.options.container);
      if (!el) throw new Error(`Container element "${this.options.container}" not found.`);
      this.container = el as HTMLElement;
    } else {
      this.container = this.options.container;
    }

    // Prepare container styling classes
    this.container.classList.add('kuber-player-container');

    // 2. Create Video Element
    this.videoElement = document.createElement('video');
    this.videoElement.classList.add('kuber-video-element');
    this.videoElement.playsInline = true;
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.autoplay = this.options.autoplay || false;
    this.videoElement.muted = this.options.muted || false;
    if (this.options.poster) {
      this.videoElement.poster = this.options.poster;
    }
    this.container.appendChild(this.videoElement);

    // 3. Instantiate Engine
    this.engine = new PlaybackEngine(this.videoElement, this);

    // 4. Instantiate Plugins
    this.plugins = new PluginManager(this);

    // 5. Setup Keyboard Shortcuts
    this.shortcuts = new KeyboardShortcuts(this);
    this.shortcuts.enable();

    // 6. Instantiate Custom UI if enabled
    if (this.options.controls) {
      this.ui = new PlayerUI(this);
    }

    // 7. Register options-provided plugins
    if (this.options.plugins) {
      this.options.plugins.forEach(p => this.registerPlugin(p));
    }

    // 8. Load Source Stream
    if (this.options.src) {
      this.load(this.options.src);
    }

    this.emit('ready', this);
  }

  // Core API Methods
  public load(src: string): void {
    this.engine.load(src);
    this.emit('loadsource', src);
  }

  public play(): Promise<void> {
    return this.engine.play();
  }

  public pause(): void {
    this.engine.pause();
  }

  public togglePlay(): void {
    if (this.videoElement.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  public seek(time: number): void {
    this.engine.seek(time);
    this.emit('seek', time);
  }

  public setVolume(volume: number): void {
    this.engine.setVolume(volume);
    this.emit('volume', volume);
  }

  public setMute(mute: boolean): void {
    this.engine.setMute(mute);
    this.emit('mute', mute);
  }

  public toggleMute(): void {
    this.setMute(!this.videoElement.muted);
  }

  public setPlaybackRate(rate: number): void {
    this.engine.setPlaybackRate(rate);
    this.emit('playbackrate', rate);
  }

  public setQuality(index: number): void {
    this.engine.setQuality(index);
  }

  public setSubtitle(index: number): void {
    this.engine.setSubtitle(index);
  }

  public setAudioTrack(index: number): void {
    this.engine.setAudioTrack(index);
  }

  public toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  public async togglePictureInPicture(): Promise<void> {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (this.videoElement.requestPictureInPicture) {
      await this.videoElement.requestPictureInPicture();
    }
  }

  public registerPlugin(plugin: PlayerPlugin): void {
    this.plugins.register(plugin);
  }

  // State Getters
  public getContainer(): HTMLElement {
    return this.container;
  }

  public getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  public getPlaybackEngine(): PlaybackEngine {
    return this.engine;
  }

  public getOptions(): PlayerOptions {
    return this.options;
  }

  public getDuration(): number {
    return this.videoElement.duration || 0;
  }

  public getCurrentTime(): number {
    return this.videoElement.currentTime;
  }

  public getBufferedDuration(): number {
    return this.engine.getBufferedDuration();
  }

  // Cleanup
  public destroy(): void {
    this.emit('destroy');
    this.shortcuts.disable();
    this.plugins.destroy();
    this.engine.destroy();
    if (this.ui) {
      this.ui.destroy();
    }
    this.clear();
    this.container.innerHTML = '';
  }
}

// -------------------------------------------------------------
// Web Component Registration (<kuber-player>)
// -------------------------------------------------------------
if (typeof window !== 'undefined' && window.customElements) {
  if (!customElements.get('kuber-player')) {
    class KuberPlayerElement extends HTMLElement {
      private playerInstance: KuberPlayer | null = null;

      static get observedAttributes() {
        return ['src', 'poster', 'sprite-vtt', 'autoplay', 'muted'];
      }

      connectedCallback() {
        // Wait one tick to read inner DOM or child nodes, and ensure styles are ready
        setTimeout(() => {
          this.initPlayer();
        }, 0);
      }

      private initPlayer() {
        if (this.playerInstance) return;

        const src = this.getAttribute('src') || '';
        const poster = this.getAttribute('poster') || '';
        const spriteVtt = this.getAttribute('sprite-vtt') || '';
        const autoplay = this.getAttribute('autoplay') === 'true';
        const muted = this.getAttribute('muted') === 'true';

        // Set layout styling on the web-component container itself
        this.style.display = 'block';
        this.style.position = 'relative';
        this.style.width = this.style.width || '100%';
        this.style.aspectRatio = this.style.aspectRatio || '16/9';
        this.style.backgroundColor = '#000';

        this.playerInstance = new KuberPlayer({
          container: this,
          src,
          poster,
          spriteVtt,
          autoplay,
          muted,
        });
      }

      attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
        if (!this.playerInstance) return;

        if (name === 'src') {
          this.playerInstance.load(newValue);
        } else if (name === 'poster') {
          this.playerInstance.getVideoElement().poster = newValue;
        } else if (name === 'muted') {
          this.playerInstance.setMute(newValue === 'true');
        }
      }

      disconnectedCallback() {
        if (this.playerInstance) {
          this.playerInstance.destroy();
          this.playerInstance = null;
        }
      }
    }
    customElements.define('kuber-player', KuberPlayerElement);
  }
}
