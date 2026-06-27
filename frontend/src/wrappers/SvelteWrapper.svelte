<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { KuberPlayer } from '../core/KuberPlayer';
  import type { PlayerPlugin } from '../core/PluginManager';

  export let src: string;
  export let poster: string | undefined = undefined;
  export let spriteVtt: string | undefined = undefined;
  export let autoplay = false;
  export let muted = false;
  export let controls = true;
  export let plugins: PlayerPlugin[] = [];

  let containerEl: HTMLDivElement;
  let player: KuberPlayer | null = null;

  function init() {
    if (player) {
      player.destroy();
    }
    player = new KuberPlayer({
      container: containerEl,
      src,
      poster,
      spriteVtt,
      autoplay,
      muted,
      controls,
      plugins
    });
  }

  // Reactive declaration to re-init if source changes
  $: if (containerEl && src) {
    init();
  }

  onMount(() => {
    init();
  });

  onDestroy(() => {
    if (player) {
      player.destroy();
      player = null;
    }
  });
</script>

<div bind:this={containerEl} style="width: 100%; aspect-ratio: 16/9; position: relative;"></div>
