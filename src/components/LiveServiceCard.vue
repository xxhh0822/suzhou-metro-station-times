<script setup lang="ts">
import { computed } from 'vue';
import { ElCard } from 'element-plus';
import 'element-plus/es/components/card/style/css';
import type { Service } from '../types/metro';

const props = defineProps<{
  service: Service;
  direction: string;
  station: string;
  now: number;
  fetchedAt?: string;
  stale: boolean;
  error: boolean;
  primary: boolean;
}>();
const shortTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const arrival = computed(() => {
  const timestamp = props.fetchedAt ? Date.parse(props.fetchedAt) : NaN;
  return Number.isFinite(timestamp) && props.service.minutes !== null && Number.isFinite(props.service.minutes)
    ? timestamp + props.service.minutes * 60000 : null;
});
const ready = computed(() => arrival.value !== null && !props.stale);
const seconds = computed(() => arrival.value === null ? 0 : Math.max(0, Math.ceil((arrival.value - props.now) / 1000)));
const stateText = computed(() => props.stale ? '数据已过期' : !props.fetchedAt ? props.error ? '暂不可用' : '正在获取' : props.service.text || '暂无班次信息');
</script>

<template>
  <ElCard :class="['service-card', primary ? 'primary-card' : 'secondary-card']" shadow="never" :body-style="{ padding: '0' }">
    <div class="card-top"><span>{{ service.label }}</span><span class="platform-label">{{ direction }}方向</span></div>
    <div class="countdown-wrap">
      <template v-if="ready">
        <div v-if="seconds > 0" class="countdown"><span class="about">约</span><strong>{{ Math.floor(seconds / 60) }}</strong><span class="unit">分</span><strong class="seconds">{{ String(seconds % 60).padStart(2, '0') }}</strong><span class="unit">秒</span></div>
        <div v-else class="countdown-state">即将到达</div>
      </template>
      <div v-else class="countdown-state">{{ stateText }}</div>
      <p class="countdown-note">{{ ready ? '据原站分钟级数据推算' : stale ? '重新同步后恢复倒计时' : '以原站返回信息为准' }}</p>
    </div>
    <div class="card-arrival"><span>预计到达{{ station }}</span><strong>{{ ready && arrival !== null ? shortTime.format(arrival) : '—' }}</strong></div>
  </ElCard>
</template>
