import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { KuberPlayer } from '../core/KuberPlayer';
import { PlayerPlugin } from '../core/PluginManager';

@Component({
  selector: 'kuber-player-ng',
  template: `<div #playerContainer style="width: 100%; aspect-ratio: 16/9; position: relative;"></div>`,
  styles: []
})
export class KuberPlayerNgComponent implements OnInit, OnDestroy {
  @ViewChild('playerContainer', { static: true }) playerContainer!: ElementRef<HTMLDivElement>;

  @Input() src!: string;
  @Input() poster?: string;
  @Input() spriteVtt?: string;
  @Input() autoplay = false;
  @Input() muted = false;
  @Input() controls = true;
  @Input() plugins: PlayerPlugin[] = [];

  private player: KuberPlayer | null = null;

  ngOnInit(): void {
    this.player = new KuberPlayer({
      container: this.playerContainer.nativeElement,
      src: this.src,
      poster: this.poster,
      spriteVtt: this.spriteVtt,
      autoplay: this.autoplay,
      muted: this.muted,
      controls: this.controls,
      plugins: this.plugins
    });
  }

  ngOnDestroy(): void {
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
  }
}
