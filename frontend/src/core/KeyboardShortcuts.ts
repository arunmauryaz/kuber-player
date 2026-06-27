import { KuberPlayer } from './KuberPlayer';

export class KeyboardShortcuts {
  private player: KuberPlayer;
  private boundHandler: (e: KeyboardEvent) => void;

  constructor(player: KuberPlayer) {
    this.player = player;
    this.boundHandler = this.handleKeyDown.bind(this);
  }

  public enable(): void {
    // Listen on the player container rather than global window,
    // to avoid stealing keys from inputs outside the player.
    const container = this.player.getContainer();
    container.setAttribute('tabindex', '0'); // make focusable
    container.addEventListener('keydown', this.boundHandler);
  }

  public disable(): void {
    const container = this.player.getContainer();
    container.removeEventListener('keydown', this.boundHandler);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore keys when focused on input fields or textareas (e.g. settings panels search etc.)
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')) {
      return;
    }

    const video = this.player.getVideoElement();
    let handled = true;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.player.togglePlay();
        break;
      
      case 'ArrowLeft':
        e.preventDefault();
        this.player.seek(Math.max(0, video.currentTime - 5));
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        this.player.seek(Math.min(video.duration || 0, video.currentTime + 5));
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.player.setVolume(Math.min(1, video.volume + 0.1));
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.player.setVolume(Math.max(0, video.volume - 0.1));
        break;

      case 'KeyM':
        e.preventDefault();
        this.player.toggleMute();
        break;

      case 'KeyF':
        e.preventDefault();
        this.player.toggleFullscreen();
        break;

      case 'KeyP':
        e.preventDefault();
        this.player.togglePictureInPicture();
        break;

      // Numbers 0-9 seek to percentage
      case 'Digit0':
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
        const digit = parseInt(e.code.replace('Digit', ''), 10);
        if (!isNaN(digit) && video.duration) {
          e.preventDefault();
          const targetTime = (digit / 10) * video.duration;
          this.player.seek(targetTime);
        }
        break;

      default:
        handled = false;
        break;
    }

    if (handled) {
      e.stopPropagation();
    }
  }
}
