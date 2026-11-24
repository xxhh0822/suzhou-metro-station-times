<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElButton } from 'element-plus';
import 'element-plus/es/components/button/style/css';
import type { Line } from '../types/metro';

const props = defineProps<{
  line?: Line;
  station?: string;
  stations: string[];
  lineCount: number;
  stationCount: number;
  unavailable: boolean;
}>();
const emit = defineEmits<{ select: [station: string]; toggleOrder: [] }>();
const expanded = ref(false);
const stationList = ref<HTMLDivElement | null>(null);
watch(() => [props.line?.id, props.station], () => {
  expanded.value = false;
  stationList.value?.scrollTo({ top: 0 });
});
function selectStation(station: string) { emit('select', station); expanded.value = false; }
function switchEnds() { emit('toggleOrder'); stationList.value?.scrollTo({ top: 0 }); }
</script>

<template>
  <aside class="station-sidebar">
    <div class="sidebar-heading">
      <div><span class="eyebrow">STATIONS</span><h2>{{ line?.name || '选择线路' }}<span>{{ line?.stations.length || '—' }} 站</span></h2></div>
      <ElButton class="mobile-station-toggle" text :aria-expanded="expanded" aria-controls="station-list" @click="expanded = !expanded">
        {{ expanded ? '收起站点' : '选择车站' }}<span :class="['chevron', { open: expanded }]" />
      </ElButton>
    </div>
    <div class="station-order-controls">
      <div><ElButton plain size="small" aria-controls="station-list" :disabled="!line" @click="switchEnds">首尾切换</ElButton></div>
      <p v-if="line">{{ stations[0] }}<span>至</span>{{ stations.at(-1) }}</p>
    </div>
    <div id="station-list" ref="stationList" :class="['station-list', { expanded }]">
      <ol>
        <li v-for="name in stations" :key="name" :class="{ active: station === name }">
          <ElButton class="station-button" text :aria-current="station === name ? 'true' : undefined" @click="selectStation(name)">
            <span class="station-marker" /><span>{{ name }}</span><span v-if="station === name" class="selected-caption">当前</span>
          </ElButton>
        </li>
      </ol>
      <p v-if="!line" class="sidebar-empty">{{ unavailable ? '线路目录暂不可用' : '正在加载站点…' }}</p>
    </div>
    <div class="network-caption">{{ lineCount ? `${lineCount} 条线路 · ${stationCount} 个线路站点` : '线路与站点来自原站目录' }}</div>
  </aside>
</template>
