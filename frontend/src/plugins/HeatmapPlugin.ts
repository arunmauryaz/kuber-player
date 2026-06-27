import { KuberPlayer } from '../core/KuberPlayer';
import { PlayerPlugin } from '../core/PluginManager';

export class HeatmapPlugin implements PlayerPlugin {
  public name = 'heatmap';
  private player!: KuberPlayer;
  private data: number[];
  private svgElement: SVGElement | null = null;

  constructor(data?: number[]) {
    // Default mock heatmap curve representing typical video retention:
    // high at start, dropoff, peaks at interesting points, dropoff near end.
    this.data = data || [
      80, 75, 60, 45, 40, 38, 35, 36, 45, 52, 60, 48, 32, 28, 25, 26, 35, 55, 78, 65, 45, 30, 22, 18, 15, 20
    ];
  }

  public init(player: KuberPlayer): void {
    this.player = player;

    // Wait for player to build its UI structure, then inject
    setTimeout(() => this.render(), 100);
  }

  private render(): void {
    const container = this.player.getContainer();
    const progressContainer = container.querySelector('.kuber-progress-container');
    if (!progressContainer) return;

    // Create SVG element
    const svgNamespace = 'http://www.w3.org/2000/svg';
    this.svgElement = document.createElementNS(svgNamespace, 'svg') as SVGElement;
    
    // Style the heatmap container so it floats above progress bar on hover
    this.svgElement.setAttribute('viewBox', '0 0 100 20');
    this.svgElement.setAttribute('preserveAspectRatio', 'none');
    
    // Styling attributes
    Object.assign(this.svgElement.style, {
      position: 'absolute',
      bottom: '100%',
      left: '0',
      width: '100%',
      height: '18px',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.2s ease',
      zIndex: '1',
    });

    const maxVal = Math.max(...this.data, 1);
    const step = 100 / (this.data.length - 1);
    
    // Build path points
    let pathD = 'M 0 20 '; // Start bottom-left
    this.data.forEach((val, idx) => {
      const x = idx * step;
      const y = 20 - (val / maxVal) * 16; // Scale down so it doesn't touch the top ceiling
      pathD += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
    });
    pathD += 'L 100 20 Z'; // End bottom-right & close path

    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'url(#kuber-heatmap-gradient)');
    path.setAttribute('opacity', '0.45');

    // Create defs for linear gradient fill
    const defs = document.createElementNS(svgNamespace, 'defs');
    const linearGradient = document.createElementNS(svgNamespace, 'linearGradient');
    linearGradient.setAttribute('id', 'kuber-heatmap-gradient');
    linearGradient.setAttribute('x1', '0%');
    linearGradient.setAttribute('y1', '0%');
    linearGradient.setAttribute('x2', '0%');
    linearGradient.setAttribute('y2', '100%');

    const stopStart = document.createElementNS(svgNamespace, 'stop');
    stopStart.setAttribute('offset', '0%');
    stopStart.setAttribute('stop-color', '#a855f7'); // Purple
    stopStart.setAttribute('stop-opacity', '0.8');

    const stopEnd = document.createElementNS(svgNamespace, 'stop');
    stopEnd.setAttribute('offset', '100%');
    stopEnd.setAttribute('stop-color', '#6366f1'); // Indigo
    stopEnd.setAttribute('stop-opacity', '0.1');

    linearGradient.appendChild(stopStart);
    linearGradient.appendChild(stopEnd);
    defs.appendChild(linearGradient);
    
    this.svgElement.appendChild(defs);
    this.svgElement.appendChild(path);
    progressContainer.appendChild(this.svgElement);

    // Fade in heatmap when progress bar is hovered, fade out when leaving
    progressContainer.addEventListener('mouseenter', () => {
      if (this.svgElement) this.svgElement.style.opacity = '1';
    });
    progressContainer.addEventListener('mouseleave', () => {
      if (this.svgElement) this.svgElement.style.opacity = '0';
    });
  }

  public destroy(): void {
    if (this.svgElement) {
      this.svgElement.remove();
      this.svgElement = null;
    }
  }
}
