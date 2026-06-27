import { KuberPlayer } from '../core/KuberPlayer';
import { PlayerPlugin } from '../core/PluginManager';

export interface SponsorSegment {
  startTime: number;
  endTime: number;
}

export class SponsorSkipPlugin implements PlayerPlugin {
  public name = 'sponsorskip';
  private player!: KuberPlayer;
  private segments: SponsorSegment[];
  private lastSkippedTime = -1;
  private tempDisabledUntil = -1;
  private notificationElement: HTMLDivElement | null = null;
  private fadeTimer: number | null = null;

  constructor(segments: SponsorSegment[]) {
    this.segments = segments;
  }

  public init(player: KuberPlayer): void {
    this.player = player;

    this.player.on('timeupdate', () => this.checkSponsor());
  }

  private checkSponsor(): void {
    const time = this.player.getCurrentTime();

    // Check if skipping is temporarily disabled (e.g. user clicked Undo)
    if (Date.now() < this.tempDisabledUntil) {
      return;
    }

    const matchingSegment = this.segments.find(
      (seg) => time >= seg.startTime && time < seg.endTime
    );

    if (matchingSegment) {
      // Seek past the sponsor segment
      this.lastSkippedTime = matchingSegment.startTime;
      this.player.seek(matchingSegment.endTime);
      this.showNotification(matchingSegment);
    }
  }

  private showNotification(segment: SponsorSegment): void {
    this.removeNotification();

    const container = this.player.getContainer();
    
    this.notificationElement = document.createElement('div');
    // Styled as a premium glassmorphic bottom popup
    this.notificationElement.style.position = 'absolute';
    this.notificationElement.style.bottom = '80px';
    this.notificationElement.style.left = '20px';
    this.notificationElement.style.padding = '10px 16px';
    this.notificationElement.style.background = 'rgba(30, 41, 59, 0.8)';
    this.notificationElement.style.backdropFilter = 'blur(8px)';
    (this.notificationElement.style as any).webkitBackdropFilter = 'blur(8px)';
    this.notificationElement.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    this.notificationElement.style.borderRadius = '8px';
    this.notificationElement.style.color = '#fff';
    this.notificationElement.style.fontSize = '0.85rem';
    this.notificationElement.style.display = 'flex';
    this.notificationElement.style.alignItems = 'center';
    this.notificationElement.style.gap = '12px';
    this.notificationElement.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
    this.notificationElement.style.zIndex = '99';
    this.notificationElement.style.transition = 'opacity 0.2s ease';

    const text = document.createElement('span');
    text.innerText = `Sponsor Segment Skipped (${this.formatTime(segment.startTime)} - ${this.formatTime(segment.endTime)})`;
    this.notificationElement.appendChild(text);

    const undoBtn = document.createElement('button');
    undoBtn.innerText = 'Undo';
    undoBtn.style.background = '#6366f1';
    undoBtn.style.border = 'none';
    undoBtn.style.color = '#fff';
    undoBtn.style.padding = '4px 8px';
    undoBtn.style.borderRadius = '4px';
    undoBtn.style.cursor = 'pointer';
    undoBtn.style.fontWeight = '600';
    undoBtn.style.fontSize = '0.75rem';
    
    undoBtn.addEventListener('click', () => {
      // Seek back to start of segment
      this.player.seek(this.lastSkippedTime);
      // Disable auto skip for the next 15 seconds to allow watching
      this.tempDisabledUntil = Date.now() + 15000;
      this.removeNotification();
    });

    this.notificationElement.appendChild(undoBtn);
    container.appendChild(this.notificationElement);

    // Auto-remove notice after 5 seconds
    this.fadeTimer = window.setTimeout(() => {
      this.removeNotification();
    }, 5000);
  }

  private removeNotification(): void {
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    if (this.notificationElement) {
      this.notificationElement.remove();
      this.notificationElement = null;
    }
  }

  private formatTime(timeSecs: number): string {
    const mins = Math.floor(timeSecs / 60);
    const secs = Math.floor(timeSecs % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  public destroy(): void {
    this.removeNotification();
  }
}
