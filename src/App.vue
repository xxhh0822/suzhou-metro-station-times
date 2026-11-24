<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElAlert, ElAutocomplete, ElButton, ElConfigProvider } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/es/components/alert/style/css';
import 'element-plus/es/components/autocomplete/style/css';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/input/style/css';
import { useMetro } from './composables/useMetro';
import type { SearchResult, Service } from './types/metro';
import StationSidebar from './components/StationSidebar.vue';
import LiveServiceCard from './components/LiveServiceCard.vue';
import TimetablePanel from './components/TimetablePanel.vue';

const {
  lines, selection, now, selectedLine, catalogBusy, catalogError, notice, visibleStations,
  live, timetable, directions, selectedDirection, liveDirection, stale, liveError, scheduleError,
  liveBusy, scheduleBusy, today, todayWeekday, chooseLine, chooseStation, chooseDirection,
  chooseWeekday, toggleStationOrder, search, refreshLive, refreshTimetable, loadCatalog,
} = useMetro();
const query = ref('');
const lineThemes: Record<string, { color: string; on: string }> = {
  '1': { color: '#82BE31', on: '#172B38' }, '2': { color: '#E1251B', on: '#FFFFFF' },
  '3': { color: '#C69214', on: '#172B38' }, '4': { color: '#00A7D8', on: '#172B38' },
  '5': { color: '#C81D7F', on: '#FFFFFF' }, '6': { color: '#79C7E8', on: '#172B38' },
  '7': { color: '#B6A1D5', on: '#172B38' }, '8': { color: '#8B9B3A', on: '#172B38' },
  '11': { color: '#D9C7A2', on: '#172B38' },
};
const clockFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const dateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' });
const stationCount = computed(() => lines.value?.reduce((total, line) => total + line.stations.length, 0) || 0);
const status = computed(() => !live.value ? liveError.value ? '实时暂不可用' : '正在同步班次' : stale.value ? '数据已过期' : liveError.value ? '刷新失败 · 保留上次数据' : '实时已同步');
const emptyServices: Service[] = [{ label: '最近班次', minutes: null, text: '' }, { label: '下一班', minutes: null, text: '' }];
watch(() => selectedLine.value?.id, id => {
  const theme = lineThemes[id || '6'] || lineThemes['6'];
  document.documentElement.style.setProperty('--line-color', theme.color);
  document.documentElement.style.setProperty('--line-on', theme.on);
}, { immediate: true });
function fetchSuggestions(value: string, callback: (items: SearchResult[]) => void) { callback(search(value)); }
function selectSearchResult(value: unknown) {
  const result = value as SearchResult;
  chooseStation(result.line.id, result.station);
  query.value = '';
}
function selectLine(id: string) { chooseLine(id); query.value = ''; }
function selectStation(station: string) { if (selectedLine.value) chooseStation(selectedLine.value.id, station); query.value = ''; }
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <main class="app-shell">
      <header class="topbar">
        <a class="brand" href="/">
          <span class="brand-icon"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M9 25 6 29m17-4 3 4M7 9c0-4 2-6 9-6s9 2 9 6v13c0 3-3 4-9 4s-9-1-9-4V9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 10h16M8 17h16M16 4v13" stroke="currentColor" stroke-width="2"/><circle cx="11" cy="22" r="1.5" fill="currentColor"/><circle cx="21" cy="22" r="1.5" fill="currentColor"/></svg></span>
          <span><span class="eyebrow">SUZHOU METRO</span><strong>苏州地铁 · 全站时刻</strong></span>
        </a>
        <div class="current-time"><time>{{ now ? clockFormat.format(now) : '--:--:--' }}</time><span>{{ now ? dateFormat.format(now) : '日期同步中' }}<span class="timezone">北京时间</span></span></div>
      </header>
      <div class="navigation-bar">
        <nav class="line-tabs" aria-label="选择线路">
          <template v-if="lines"><ElButton v-for="line in lines" :key="line.id" :aria-pressed="selection?.line === line.id" @click="selectLine(line.id)"><span class="line-number" :style="{ background: lineThemes[line.id]?.color, color: lineThemes[line.id]?.on }">{{ line.id }}</span>号线</ElButton></template>
          <span v-else class="loading-lines">正在获取线路…</span>
        </nav>
        <ElAutocomplete v-model="query" class="station-search" aria-label="搜索全部站点" placeholder="搜索全部站点" :fetch-suggestions="fetchSuggestions" :trigger-on-focus="false" :debounce="0" :disabled="!lines" clearable popper-class="station-search-popper" @select="selectSearchResult">
          <template #prefix><svg class="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></template>
          <template #default="{ item }"><span class="search-line">{{ item.line.name }}</span><span>{{ item.station }}</span></template>
        </ElAutocomplete>
      </div>
      <ElAlert v-if="notice" class="notice-alert" :title="notice" type="info" :closable="false" show-icon />
      <ElAlert v-if="catalogError" class="query-alert" type="warning" :closable="false" show-icon><template #title>{{ catalogError }}</template><ElButton text :disabled="catalogBusy" @click="loadCatalog">{{ catalogBusy ? '正在获取' : '重试线路目录' }}</ElButton></ElAlert>
      <div class="workspace">
        <StationSidebar :line="selectedLine" :station="selection?.station" :stations="visibleStations" :line-count="lines?.length || 0" :station-count="stationCount" :unavailable="!!catalogError" @select="selectStation" @toggle-order="toggleStationOrder" />
        <div class="station-content">
          <section class="station-heading">
            <div class="station-title-row"><div><div class="station-kicker"><span class="line-badge">{{ selection?.line || '—' }}<small>号线</small></span><span>全站实时查询</span></div><h1>{{ selection?.station || '正在获取站点' }}</h1></div><div :class="['sync-status', { warning: liveError || stale }]" role="status"><span class="status-dot" />{{ status }}</div></div>
            <div class="direction-row"><span>乘车方向</span><div class="direction-tabs" aria-label="选择乘车方向"><template v-if="directions.length"><ElButton v-for="direction in directions" :key="direction.id" :aria-pressed="selection?.direction === direction.id" @click="chooseDirection(direction.id)">{{ direction.name }}方向</ElButton></template><span v-else class="direction-placeholder">{{ scheduleError ? '方向信息暂不可用' : '正在获取方向…' }}</span></div></div>
          </section>
          <section class="live-section" aria-labelledby="live-title">
            <div class="section-heading"><h2 id="live-title">实时班次 <span>今天</span></h2><span class="section-note">到达本站的最近两班</span></div>
            <ElAlert v-if="liveError" class="query-alert" type="warning" :closable="false" show-icon><template #title>{{ liveError }}{{ live ? ' 当前保留上次成功获取的数据。' : '' }}</template><ElButton text :disabled="liveBusy" @click="refreshLive">重试</ElButton></ElAlert>
            <div v-if="live && !selectedDirection" class="fallback-directions"><div v-for="direction in live.directions" :key="direction.name"><h3>{{ direction.name }}方向</h3><div class="service-grid"><LiveServiceCard v-for="(service, index) in direction.services" :key="service.label" :service="service" :primary="index === 0" :direction="direction.name" :station="selection?.station || '本站'" :now="now" :fetched-at="live.fetchedAt" :stale="stale" :error="!!liveError" /></div></div></div>
            <div v-else class="service-grid"><LiveServiceCard v-for="(service, index) in (liveDirection?.services || emptyServices)" :key="service.label" :service="service" :primary="index === 0" :direction="selectedDirection?.name || '所选'" :station="selection?.station || '本站'" :now="now" :fetched-at="live?.fetchedAt" :stale="stale" :error="!!liveError" /></div>
            <p v-if="live && selectedDirection && !liveDirection" class="inline-error">原站暂未返回所选方向的实时班次。</p>
            <div class="update-row"><span>上次同步 {{ live ? clockFormat.format(Date.parse(live.fetchedAt)) : '—' }}<i>·</i>每10秒更新</span><ElButton class="refresh-button" text :disabled="liveBusy || !selection" @click="refreshLive"><span :class="['refresh-icon', { spinning: liveBusy }]"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 8a6.2 6.2 0 1 0 .1 3.5M16 3.5V8h-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>{{ liveBusy ? '同步中' : '刷新班次' }}</ElButton></div>
          </section>
          <TimetablePanel :selection="selection" :timetable="timetable" :direction="selectedDirection?.name" :now="now" :today="today" :today-weekday="todayWeekday" :error="scheduleError" :busy="scheduleBusy" @choose-weekday="chooseWeekday" @retry="refreshTimetable" />
        </div>
      </div>
      <footer class="site-footer"><span>非官方独立展示 · 数据来自你提供的苏州地铁列车动态页面</span><a href="http://106.14.198.252:8512/station" target="_blank" rel="noreferrer">查看原站</a></footer>
    </main>
  </ElConfigProvider>
</template>
