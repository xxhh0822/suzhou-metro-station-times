<script setup lang="ts">
import { computed } from 'vue';
import { ElAlert, ElButton, ElCard, ElRadioButton, ElRadioGroup, ElTable, ElTableColumn } from 'element-plus';
import 'element-plus/es/components/alert/style/css';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/card/style/css';
import 'element-plus/es/components/radio-button/style/css';
import 'element-plus/es/components/radio-group/style/css';
import 'element-plus/es/components/table/style/css';
import 'element-plus/es/components/table-column/style/css';
import type { Selection, Timetable } from '../types/metro';

const props = defineProps<{
  selection: Selection | null;
  timetable: Timetable | null;
  direction?: string;
  now: number;
  today: string;
  todayWeekday: number;
  error: string;
  busy: boolean;
}>();
const emit = defineEmits<{ chooseWeekday: [weekday: number]; retry: [] }>();
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const clockFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const currentWeekday = computed(() => props.selection?.weekday || props.todayWeekday || 1);
const isToday = computed(() => currentWeekday.value === props.todayWeekday);
const nextPlanned = computed(() => isToday.value ? props.timetable?.times.find(time => Date.parse(`${props.today}T${time}:00+08:00`) >= props.now) : null);
const rows = computed(() => {
  const hours = new Map<string, string[]>();
  for (const time of props.timetable?.times || []) {
    const hour = time.slice(0, 2);
    hours.set(hour, [...(hours.get(hour) || []), time]);
  }
  return [...hours].map(([hour, times]) => ({ hour, times }));
});
function chooseWeekday(value: unknown) { emit('chooseWeekday', Number(value)); }
function isPast(time: string) { return isToday.value && Date.parse(`${props.today}T${time}:00+08:00`) < props.now; }
</script>

<template>
  <ElCard class="timetable-panel" shadow="never" :body-style="{ padding: '0' }" aria-labelledby="timetable-title">
    <div class="panel-heading"><div><span class="eyebrow">WEEKLY TIMETABLE</span><h2 id="timetable-title">{{ isToday ? '今日计划时刻' : `${weekdays[currentWeekday - 1]}计划时刻` }}</h2></div><span class="plan-tag">{{ direction ? `${direction}方向` : '计划发车时刻' }}</span></div>
    <ElRadioGroup class="weekday-tabs" aria-label="选择计划星期" :model-value="selection?.weekday" :disabled="!selection" @change="chooseWeekday">
      <ElRadioButton v-for="(label, index) in weekdays" :key="label" :value="index + 1">{{ label }}<small v-if="todayWeekday === index + 1">今天</small></ElRadioButton>
    </ElRadioGroup>
    <p v-if="timetable?.sourceLine && timetable.sourceLine !== selection?.line" class="through-service-note">3／11号线贯通方向时刻</p>
    <ElAlert v-if="error" class="query-alert" type="warning" :closable="false" show-icon>
      <template #title>{{ error }}{{ timetable ? ' 当前为上次获取的计划。' : '' }}</template><ElButton text :disabled="busy" @click="emit('retry')">重试</ElButton>
    </ElAlert>
    <div class="schedule-summary"><div><span>首班车</span><strong>{{ timetable?.times[0] || '—' }}</strong></div><div><span>末班车</span><strong>{{ timetable?.times.at(-1) || '—' }}</strong></div><div class="summary-caption"><span>{{ weekdays[currentWeekday - 1] }}计划</span><strong>{{ timetable ? `${timetable.times.length} 班` : '正在获取' }}</strong></div></div>
    <div v-if="!timetable" class="schedule-empty">{{ error ? '计划时刻暂不可用，请重试。' : '正在获取所选星期的计划时刻…' }}</div>
    <div v-else-if="!timetable.times.length" class="schedule-empty">该方向暂无计划时刻</div>
    <ElTable v-else class="hourly-timetable" :data="rows" row-key="hour" :show-header="true">
      <ElTableColumn prop="hour" label="小时" :width="62" align="center"><template #default="{ row }"><strong class="hour-number">{{ row.hour }}</strong></template></ElTableColumn>
      <ElTableColumn label="发车分钟">
        <template #header><span>发车分钟 <small class="table-reference">仅供参考</small></span></template>
        <template #default="{ row }"><div class="minute-list"><span v-for="(time, index) in (row.times as string[])" :key="`${time}-${index}`" :class="{ 'next-time': time === nextPlanned, 'past-time': isPast(time) }" :title="`${time}${time === nextPlanned ? ' · 下一班计划' : ''}`">{{ time.slice(3) }}<small v-if="time === nextPlanned">下一班</small></span></div></template>
      </ElTableColumn>
    </ElTable>
    <div class="plan-footer"><span>计划与实时班次可能不同，实际以现场列车运行为准。</span><span>{{ timetable ? `计划同步 ${clockFormat.format(Date.parse(timetable.fetchedAt))}` : '' }}</span></div>
  </ElCard>
</template>
