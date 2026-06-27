import { KuberPlayer } from '../core/KuberPlayer';
import type { PlayerPlugin } from '../core/PluginManager';

export interface AnalyticsPluginOptions {
  endpoint: string;
  videoId: string;
  heartbeatIntervalMs?: number; // defaults to 10000ms
}

export class AnalyticsPlugin implements PlayerPlugin {
  public name = 'analytics';
  private player!: KuberPlayer;
  private options: AnalyticsPluginOptions;
  private sessionId: string;
  
  // Metrics tracked
  private watchTimeStart = 0;
  private totalWatchTime = 0;
  private isPlaying = false;
  
  private bufferStart = 0;
  private bufferCount = 0;
  private totalBufferDuration = 0;
  
  private seekCount = 0;
  private heartbeatTimer: number | null = null;
  private deviceType = 'desktop';

  constructor(options: AnalyticsPluginOptions) {
    this.options = {
      heartbeatIntervalMs: 10000,
      ...options
    };
    this.sessionId = this.generateUuid();
    this.detectDevice();
  }

  public init(player: KuberPlayer): void {
    this.player = player;

    // Bind event listeners
    this.player.on('play', () => this.handlePlay());
    this.player.on('pause', () => this.handlePause());
    this.player.on('waiting', () => this.handleWaiting());
    this.player.on('playing', () => this.handlePlaying());
    this.player.on('seek', () => this.handleSeek());
    this.player.on('ended', () => this.handleComplete());
    this.player.on('error', (err) => this.handleError(err));

    // Periodic heartbeat to report updates
    this.startHeartbeat();
  }

  private handlePlay(): void {
    this.isPlaying = true;
    this.watchTimeStart = performance.now();
    this.sendEvent('play');
  }

  private handlePause(): void {
    this.isPlaying = false;
    this.accumulateWatchTime();
    this.sendEvent('pause');
  }

  private handleWaiting(): void {
    this.bufferCount++;
    this.bufferStart = performance.now();
    this.sendEvent('buffer');
  }

  private handlePlaying(): void {
    if (this.bufferStart > 0) {
      const duration = (performance.now() - this.bufferStart) / 1000;
      this.totalBufferDuration += duration;
      this.bufferStart = 0;
    }
  }

  private handleSeek(): void {
    this.seekCount++;
    this.sendEvent('seek');
  }

  private handleComplete(): void {
    this.isPlaying = false;
    this.accumulateWatchTime();
    this.sendEvent('complete');
  }

  private handleError(err: any): void {
    const errorMsg = err instanceof Error ? err.message : String(err);
    this.sendEvent('error', errorMsg);
  }

  private accumulateWatchTime(): void {
    if (this.isPlaying && this.watchTimeStart > 0) {
      const now = performance.now();
      this.totalWatchTime += (now - this.watchTimeStart) / 1000;
      this.watchTimeStart = now;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isPlaying) {
        this.accumulateWatchTime();
        this.sendEvent('heartbeat');
      }
    }, this.options.heartbeatIntervalMs);
  }

  private sendEvent(eventType: string, errorMessage?: string): void {
    this.accumulateWatchTime();
    
    const duration = this.player.getDuration();
    const currentTime = this.player.getCurrentTime();
    const completionPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    
    // Estimate network speed (mock bandwidth measurement or using client connection)
    let networkSpeed = 10.0; // default 10 Mbps
    if ('connection' in navigator) {
      const conn = (navigator as any).connection;
      if (conn && conn.downlink) {
        networkSpeed = conn.downlink;
      }
    }

    const payload = {
      video_id: this.options.videoId,
      event_type: eventType,
      session_id: this.sessionId,
      watch_time: this.totalWatchTime,
      buffer_count: this.bufferCount,
      buffer_duration: this.totalBufferDuration,
      seek_count: this.seekCount,
      playback_speed: this.player.getVideoElement().playbackRate,
      completion_percentage: completionPercent,
      device_type: this.deviceType,
      network_speed: networkSpeed,
      error_message: errorMessage
    };

    fetch(this.options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => {
      console.warn('Analytics send failed:', err);
    });
  }

  private detectDevice(): void {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      this.deviceType = 'tablet';
    } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Opera Mini/i.test(ua)) {
      this.deviceType = 'mobile';
    } else {
      this.deviceType = 'desktop';
    }
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  public destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.sendEvent('unload');
  }
}
