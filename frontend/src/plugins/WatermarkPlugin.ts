import { KuberPlayer } from '../core/KuberPlayer';
import { PlayerPlugin } from '../core/PluginManager';

export interface WatermarkPluginOptions {
  text?: string;
  link?: string;
  opacity?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export class WatermarkPlugin implements PlayerPlugin {
  public name = 'watermark';
  private player!: KuberPlayer;
  private options: WatermarkPluginOptions;
  private element: HTMLDivElement | null = null;

  constructor(options?: WatermarkPluginOptions) {
    this.options = {
      text: 'KUBER PLAYER',
      opacity: 0.35,
      position: 'top-right',
      ...options
    };
  }

  public init(player: KuberPlayer): void {
    this.player = player;
    this.render();
  }

  private render(): void {
    const container = this.player.getContainer();
    
    this.element = document.createElement('div');
    this.element.classList.add('kuber-watermark');
    this.element.style.opacity = (this.options.opacity ?? 0.35).toString();
    
    // Position styling
    switch (this.options.position) {
      case 'top-left':
        this.element.style.top = '20px';
        this.element.style.left = '20px';
        this.element.style.right = 'auto';
        break;
      case 'bottom-left':
        this.element.style.bottom = '80px';
        this.element.style.left = '20px';
        this.element.style.top = 'auto';
        this.element.style.right = 'auto';
        break;
      case 'bottom-right':
        this.element.style.bottom = '80px';
        this.element.style.right = '20px';
        this.element.style.top = 'auto';
        this.element.style.left = 'auto';
        break;
      case 'top-right':
      default:
        this.element.style.top = '20px';
        this.element.style.right = '20px';
        this.element.style.left = 'auto';
        break;
    }

    if (this.options.link) {
      const anchor = document.createElement('a');
      anchor.href = this.options.link;
      anchor.target = '_blank';
      anchor.innerText = this.options.text || '';
      anchor.style.color = 'inherit';
      anchor.style.textDecoration = 'none';
      this.element.appendChild(anchor);
    } else {
      this.element.innerText = this.options.text || '';
    }

    container.appendChild(this.element);
  }

  public destroy(): void {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}
