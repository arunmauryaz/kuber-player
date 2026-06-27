<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { KuberPlayer } from '../core/KuberPlayer';
import type { PlayerPlugin } from '../core/PluginManager';

const props = withDefaults(defineProps<{
  src: string;
  poster?: string;
  spriteVtt?: string;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  plugins?: PlayerPlugin[];
}>(), {
  autoplay: false,
  muted: false,
  controls: true,
  plugins: () => []
});

const containerRef = ref<HTMLDivElement | null>(null);
let playerInstance: KuberPlayer | null = null;

const initPlayer = () => {
  if (playerInstance) {
    playerInstance.destroy();
  }
  if (containerRef.value) {
    playerInstance = new KuberPlayer({
      container: containerRef.value,
      src: props.src,
      poster: props.poster,
      spriteVtt: props.spriteVtt,
      autoplay: props.autoplay,
      muted: props.muted,
      controls: props.controls,
      plugins: props.plugins
    });
  }
};

onMounted(() => {
  initPlayer();
});

onUnmounted(() => {
  if (playerInstance) {
    playerInstance.destroy();
    playerInstance = null;
  }
});

watch(() => props.src, () => {
  initPlayer();
});
</script>

<template>
  <div ref="containerRef" class="kuber-player-vue-wrapper" style="width: 100%; aspect-ratio: 16/9; position: relative;"></div>
</template>
