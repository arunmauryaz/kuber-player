import { KuberPlayer } from './KuberPlayer';

export interface PlayerPlugin {
  name: string;
  init(player: KuberPlayer): void;
  destroy?(): void;
}

export class PluginManager {
  private player: KuberPlayer;
  private plugins: Map<string, PlayerPlugin> = new Map();

  constructor(player: KuberPlayer) {
    this.player = player;
  }

  register(plugin: PlayerPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" is already registered.`);
      return;
    }
    this.plugins.set(plugin.name, plugin);
    plugin.init(this.player);
  }

  get(name: string): PlayerPlugin | undefined {
    return this.plugins.get(name);
  }

  destroy(): void {
    this.plugins.forEach((plugin) => {
      if (plugin.destroy) {
        plugin.destroy();
      }
    });
    this.plugins.clear();
  }
}
