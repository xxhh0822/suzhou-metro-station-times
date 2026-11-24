"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Line = { id: string; name: string; stations: string[] };
type Selection = { line: string; station: string; direction: string; weekday: number };
type Service = { label: string; minutes: number | null; text: string };
type LiveData = { fetchedAt: string; serviceDate: string; line: string; station: string; directions: { name: string; services: Service[] }[] };
type Direction = { id: string; name: string };
type Timetable = { fetchedAt: string; line: string; sourceLine?: string; station: string; direction: string; weekday: number; directions: Direction[]; times: string[] };
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const lineThemes: Record<string, { color: string; on: string }> = {
  "1": { color: "#82BE31", on: "#172B38" },
  "2": { color: "#E1251B", on: "#FFFFFF" },
  "3": { color: "#C69214", on: "#172B38" },
  "4": { color: "#00A7D8", on: "#172B38" },
  "5": { color: "#C81D7F", on: "#FFFFFF" },
  "6": { color: "#79C7E8", on: "#172B38" },
  "7": { color: "#B6A1D5", on: "#172B38" },
  "8": { color: "#8B9B3A", on: "#172B38" },
  "11": { color: "#D9C7A2", on: "#172B38" },
};
const clockFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const shortTime = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" });
function chinaDate(timestamp: number) { return new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10); }
function chinaWeekday(timestamp: number) { return new Date(timestamp + 8 * 3600000).getUTCDay() || 7; }
function readSelection(lines: Line[]) {
  const params = new URLSearchParams(window.location.search);
  const fallbackLine = lines.find(line => line.id === "6") || lines[0];
  const line = lines.find(line => line.id === params.get("line")) || fallbackLine;
  const fallbackStation = line.id === "6" && line.stations.includes("金尚路") ? "金尚路" : line.stations[0];
  const station = line.stations.includes(params.get("station") || "") ? params.get("station")! : fallbackStation;
  const direction = /^[01]$/.test(params.get("direction") || "") ? params.get("direction")! : line.id === "6" && station === "金尚路" ? "1" : "0";
  const weekdayValue = Number(params.get("weekday"));
  const validWeekday = Number.isInteger(weekdayValue) && weekdayValue >= 1 && weekdayValue <= 7;
  const selection = { line: line.id, station, direction, weekday: validWeekday ? weekdayValue : chinaWeekday(Date.now()) };
  const corrected = ["line", "station", "direction", "weekday"].some(key => params.has(key) && params.get(key) !== String(selection[key as keyof Selection]));
  return { selection, corrected, fixedWeekday: validWeekday };
}
function writeSelection(selection: Selection, replace = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(selection)) url.searchParams.set(key, String(value));
  if (url.href !== window.location.href) window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}
function TrainIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M9 25 6 29m17-4 3 4M7 9c0-4 2-6 9-6s9 2 9 6v13c0 3-3 4-9 4s-9-1-9-4V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M8 10h16M8 17h16M16 4v13" stroke="currentColor" strokeWidth="2"/><circle cx="11" cy="22" r="1.5" fill="currentColor"/><circle cx="21" cy="22" r="1.5" fill="currentColor"/></svg>;
}
function RefreshIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 8a6.2 6.2 0 1 0 .1 3.5M16 3.5V8h-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export default function Home() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [stationOpen, setStationOpen] = useState(false);
  const [stationReversed, setStationReversed] = useState(false);
  const [liveResult, setLiveResult] = useState<{ key: string; data: LiveData } | null>(null);
  const [scheduleResult, setScheduleResult] = useState<{ key: string; data: Timetable } | null>(null);
  const [directionResult, setDirectionResult] = useState<{ key: string; options: Direction[] } | null>(null);
  const [liveError, setLiveError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [liveBusy, setLiveBusy] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const stationListRef = useRef<HTMLDivElement>(null);
  const fixedWeekdayRef = useRef(false);
  const liveRefreshRef = useRef<() => void>(() => {});
  const scheduleRefreshRef = useRef<() => void>(() => {});
  const catalogControllerRef = useRef<AbortController | null>(null);
  const today = now ? chinaDate(now) : "";
  const todayWeekday = now ? chinaWeekday(now) : 0;
  const stationKey = selection ? `${selection.line}|${selection.station}` : "";
  const liveKey = `${stationKey}|${today}`;
  const scheduleKey = selection ? `${stationKey}|${selection.direction}|${selection.weekday}` : "";
  const selectedLine = lines?.find(line => line.id === selection?.line);
  const visibleStations = selectedLine ? stationReversed ? [...selectedLine.stations].reverse() : selectedLine.stations : [];
  const live = liveResult?.key === liveKey ? liveResult.data : null;
  const timetable = scheduleResult?.key === scheduleKey ? scheduleResult.data : null;
  const directions = directionResult?.key === stationKey ? directionResult.options : [];
  const selectedDirection = directions.find(direction => direction.id === selection?.direction);
  const liveDirection = live?.directions.find(direction => direction.name === selectedDirection?.name);
  const liveTimestamp = live ? Date.parse(live.fetchedAt) : 0;
  const stale = !!live && now !== null && (now - liveTimestamp > 35000 || live.serviceDate !== today);
  const stationCount = lines?.reduce((total, line) => total + line.stations.length, 0) || 0;

  useEffect(() => {
    const theme = lineThemes[selectedLine?.id || "6"] || lineThemes["6"];
    document.documentElement.style.setProperty("--line-color", theme.color);
    document.documentElement.style.setProperty("--line-on", theme.on);
  }, [selectedLine?.id]);

  const loadCatalog = useCallback(async () => {
    catalogControllerRef.current?.abort();
    const controller = new AbortController(); catalogControllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    setCatalogBusy(true); setCatalogError("");
    try {
      const response = await fetch("/api/catalog", { cache: "no-store", signal: controller.signal });
      const result = await response.json() as { lines: Line[] };
      if (!response.ok || !Array.isArray(result.lines) || !result.lines.length) throw new Error("catalog");
      if (controller.signal.aborted) return;
      setLines(result.lines);
      const initial = readSelection(result.lines);
      setSelection(initial.selection); fixedWeekdayRef.current = initial.fixedWeekday;
      setNotice(initial.corrected ? "链接中的部分选项已失效，已为你选择可用的线路和站点。" : "");
      writeSelection(initial.selection, true);
    } catch {
      if (!controller.signal.aborted) setCatalogError("暂时无法获取线路与站点，请重试。");
      else if (catalogControllerRef.current === controller) setCatalogError("线路目录响应超时，请重试。");
    } finally { clearTimeout(timeout); if (catalogControllerRef.current === controller) setCatalogBusy(false); }
  }, []);

  useEffect(() => {
    setNow(Date.now()); void loadCatalog();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const closeSearch = (event: PointerEvent) => { if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false); };
    document.addEventListener("pointerdown", closeSearch);
    return () => { clearInterval(timer); catalogControllerRef.current?.abort(); document.removeEventListener("pointerdown", closeSearch); };
  }, [loadCatalog]);

  useEffect(() => {
    if (!lines) return;
    const onHistory = () => {
      const value = readSelection(lines); fixedWeekdayRef.current = value.fixedWeekday;
      setSelection(value.selection); setStationOpen(false);
      setNotice(value.corrected ? "链接中的部分选项已失效，已选择可用站点。" : "");
      writeSelection(value.selection, true);
    };
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, [lines]);

  useEffect(() => {
    if (!todayWeekday || fixedWeekdayRef.current) return;
    setSelection(previous => {
      if (!previous || previous.weekday === todayWeekday) return previous;
      const next = { ...previous, weekday: todayWeekday }; writeSelection(next, true); return next;
    });
  }, [todayWeekday]);

  useEffect(() => {
    setStationReversed(false);
    stationListRef.current?.scrollTo({ top: 0 });
  }, [selectedLine?.id]);

  useEffect(() => {
    if (!selection || !today) return;
    const { line, station } = selection;
    const key = liveKey;
    let disposed = false; let inFlight = false; let controller: AbortController | null = null;
    setLiveResult(null); setLiveError("");
    async function refresh() {
      if (disposed || document.hidden || inFlight) return;
      inFlight = true; setLiveBusy(true); controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const query = new URLSearchParams({ line, station });
        const response = await fetch(`/api/live?${query}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json() as LiveData;
        if (!response.ok || result.line !== line || result.station !== station || result.serviceDate !== chinaDate(Date.now()) || !Number.isFinite(Date.parse(result.fetchedAt)) || !Array.isArray(result.directions)) throw new Error("live");
        if (!disposed) { setLiveResult({ key, data: result }); setLiveError(""); }
      } catch { if (!disposed) setLiveError("实时班次获取失败，正在等待重试。"); }
      finally { clearTimeout(timeout); inFlight = false; if (!disposed) setLiveBusy(false); }
    }
    liveRefreshRef.current = () => void refresh();
    void refresh();
    const polling = setInterval(() => void refresh(), 10000);
    const visible = () => { if (!document.hidden) { setNow(Date.now()); void refresh(); } };
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; clearInterval(polling); controller?.abort(); document.removeEventListener("visibilitychange", visible); };
    // A station's live response contains both named directions; weekday only changes the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationKey, today]);

  useEffect(() => {
    if (!selection) return;
    const { line, station, direction, weekday } = selection;
    const key = scheduleKey; const metadataKey = stationKey;
    let disposed = false; let inFlight = false; let controller: AbortController | null = null;
    setScheduleResult(null); setScheduleError("");
    async function refresh() {
      if (disposed || document.hidden || inFlight) return;
      inFlight = true; setScheduleBusy(true); controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const query = new URLSearchParams({ line, station, direction, weekday: String(weekday) });
        const response = await fetch(`/api/timetable?${query}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json() as Timetable;
        if (!response.ok || result.line !== line || result.station !== station || result.direction !== direction || result.weekday !== weekday || !Array.isArray(result.directions) || !Array.isArray(result.times) || !Number.isFinite(Date.parse(result.fetchedAt))) throw new Error("schedule");
        if (!disposed) { setScheduleResult({ key, data: result }); setDirectionResult({ key: metadataKey, options: result.directions }); setScheduleError(""); }
      } catch { if (!disposed) setScheduleError("计划时刻获取失败，请稍后重试。"); }
      finally { clearTimeout(timeout); inFlight = false; if (!disposed) setScheduleBusy(false); }
    }
    scheduleRefreshRef.current = () => void refresh();
    void refresh();
    const polling = setInterval(() => void refresh(), 300000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; clearInterval(polling); controller?.abort(); document.removeEventListener("visibilitychange", visible); };
    // The full query is the request identity, preventing late responses from another selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleKey]);

  function choose(next: Selection) { setSelection(next); writeSelection(next); setNotice(""); setSearch(""); setSearchOpen(false); setStationOpen(false); }
  function chooseStation(line: string, station: string) { if (selection) choose({ ...selection, line, station, direction: "0" }); }
  const results = search.trim() ? lines?.flatMap(line => line.stations.filter(station => station.includes(search.trim())).map(station => ({ line, station }))) || [] : [];
  const nextPlanned = selection?.weekday === todayWeekday && now && timetable ? timetable.times.find(time => Date.parse(`${today}T${time}:00+08:00`) >= now) : null;
  const hours = new Map<string, string[]>();
  timetable?.times.forEach(time => { const hour = time.split(":")[0]; hours.set(hour, [...(hours.get(hour) || []), time]); });
  const status = !live ? liveError ? "实时暂不可用" : "正在同步班次" : stale ? "数据已过期" : liveError ? "刷新失败 · 保留上次数据" : "实时已同步";

  function serviceCard(service: Service, index: number, directionName: string) {
    const arrival = service.minutes !== null && Number.isFinite(service.minutes) && liveTimestamp ? liveTimestamp + service.minutes * 60000 : null;
    const ready = !!live && !stale && now !== null && arrival !== null;
    const seconds = ready ? Math.max(0, Math.ceil((arrival - now!) / 1000)) : null;
    return <article className={`service-card ${index === 0 ? "primary-card" : "secondary-card"}`} key={`${directionName}-${service.label}`}>
      <div className="card-top"><span>{service.label}</span><span className="platform-label">{directionName}方向</span></div>
      <div className="countdown-wrap">{ready ? seconds! > 0 ? <div className="countdown"><span className="about">约</span><strong>{Math.floor(seconds! / 60)}</strong><span className="unit">分</span><strong className="seconds">{String(seconds! % 60).padStart(2, "0")}</strong><span className="unit">秒</span></div> : <div className="countdown-state">即将到达</div> : <div className="countdown-state">{stale ? "数据已过期" : live ? service.text || "暂无班次信息" : liveError ? "暂不可用" : "正在获取"}</div>}<p className="countdown-note">{ready ? "据原站分钟级数据推算" : stale ? "重新同步后恢复倒计时" : "以原站返回信息为准"}</p></div>
      <div className="card-arrival"><span>预计到达{selection?.station || "本站"}</span><strong>{ready ? shortTime.format(arrival!) : "—"}</strong></div>
    </article>;
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-icon"><TrainIcon /></span><span><span className="eyebrow">SUZHOU METRO</span><strong>苏州地铁 · 全站时刻</strong></span></a><div className="current-time"><time>{now ? clockFormat.format(now) : "--:--:--"}</time><span>{now ? dateFormat.format(now) : "日期同步中"}<span className="timezone">北京时间</span></span></div></header>
    <div className="navigation-bar"><nav className="line-tabs" aria-label="选择线路">{lines ? lines.map(line => <button key={line.id} aria-pressed={selection?.line === line.id} onClick={() => chooseStation(line.id, line.stations[0])}><span style={{ background: lineThemes[line.id]?.color, color: lineThemes[line.id]?.on }}>{line.id}</span>号线</button>) : <span className="loading-lines">正在获取线路…</span>}</nav><div className="station-search" ref={searchRef}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><input aria-label="搜索全部站点" placeholder="搜索全部站点" value={search} onFocus={() => setSearchOpen(true)} onChange={event => { setSearch(event.target.value); setSearchOpen(true); }} onKeyDown={event => { if (event.key === "Escape") setSearchOpen(false); }} disabled={!lines}/>{search && <button className="clear-search" aria-label="清空搜索" onClick={() => { setSearch(""); setSearchOpen(false); }}>×</button>}{searchOpen && search.trim() && <div className="search-results"><p>{results.length ? `${results.length} 个线路站点结果` : "没有找到对应站点"}</p><ul aria-label="站点搜索结果">{results.map(({ line, station }) => <li key={`${line.id}-${station}`}><button onClick={() => chooseStation(line.id, station)}><span className="search-line">{line.name}</span><span>{station}</span></button></li>)}</ul></div>}</div></div>
    {notice && <div className="notice-banner" role="status">{notice}</div>}
    {catalogError && <div className="error-banner" role="alert"><span>{catalogError}</span><button onClick={() => void loadCatalog()} disabled={catalogBusy}>{catalogBusy ? "正在获取" : "重试线路目录"}</button></div>}
    <div className="workspace">
      <aside className="station-sidebar"><div className="sidebar-heading"><div><span className="eyebrow">STATIONS</span><h2>{selectedLine?.name || "选择线路"}<span>{selectedLine?.stations.length || "—"} 站</span></h2></div><button className="mobile-station-toggle" aria-expanded={stationOpen} aria-controls="station-list" onClick={() => setStationOpen(!stationOpen)}>{stationOpen ? "收起站点" : "选择车站"}<span className={stationOpen ? "chevron open" : "chevron"}/></button></div><div className="station-order-controls"><div><button aria-controls="station-list" disabled={!selectedLine} onClick={() => { setStationReversed(value => !value); stationListRef.current?.scrollTo({ top: 0 }); }}>首尾切换</button></div>{selectedLine && <p>{visibleStations[0]}<span>至</span>{visibleStations.at(-1)}</p>}</div><div id="station-list" ref={stationListRef} className={`station-list ${stationOpen ? "expanded" : ""}`}><ol>{visibleStations.map(station => <li key={station} className={selection?.station === station ? "active" : ""}><button aria-current={selection?.station === station ? "true" : undefined} onClick={() => selectedLine && chooseStation(selectedLine.id, station)}><span className="station-marker"/><span>{station}</span>{selection?.station === station && <span className="selected-caption">当前</span>}</button></li>)}</ol>{!selectedLine && <p className="sidebar-empty">{catalogError ? "线路目录暂不可用" : "正在加载站点…"}</p>}</div><div className="network-caption">{lines ? `${lines.length} 条线路 · ${stationCount} 个线路站点` : "线路与站点来自原站目录"}</div></aside>
      <div className="station-content">
        <section className="station-heading"><div className="station-title-row"><div><div className="station-kicker"><span className="line-badge">{selection?.line || "—"}<small>号线</small></span><span>全站实时查询</span></div><h1>{selection?.station || "正在获取站点"}</h1></div><div className={`sync-status ${liveError || stale ? "warning" : ""}`} role="status"><span className="status-dot"/>{status}</div></div><div className="direction-row"><span>乘车方向</span><div className="direction-tabs" aria-label="选择乘车方向">{directions.length ? directions.map(direction => <button key={direction.id} aria-pressed={selection?.direction === direction.id} onClick={() => selection && choose({ ...selection, direction: direction.id })}>{direction.name}方向</button>) : <span className="direction-placeholder">{scheduleError ? "方向信息暂不可用" : "正在获取方向…"}</span>}</div></div></section>
        <section className="live-section" aria-labelledby="live-title"><div className="section-heading"><h2 id="live-title">实时班次 <span>今天</span></h2><span className="section-note">到达本站的最近两班</span></div>{liveError && <div className="inline-error" role="alert">{liveError}{live ? " 当前保留上次成功获取的数据。" : ""}<button onClick={() => liveRefreshRef.current()} disabled={liveBusy}>重试</button></div>}
          {live && !selectedDirection ? <div className="fallback-directions">{live.directions.map(direction => <div key={direction.name}><h3>{direction.name}方向</h3><div className="service-grid">{direction.services.map((service, index) => serviceCard(service, index, direction.name))}</div></div>)}</div> : <div className="service-grid">{(liveDirection?.services || [{ label: "最近班次", minutes: null, text: "" }, { label: "下一班", minutes: null, text: "" }]).map((service, index) => serviceCard(service, index, selectedDirection?.name || "所选"))}</div>}
          {live && selectedDirection && !liveDirection && <p className="inline-error">原站暂未返回所选方向的实时班次。</p>}
          <div className="update-row"><span>上次同步 {live ? clockFormat.format(liveTimestamp) : "—"}<i>·</i>每10秒更新</span><button className="refresh-button" onClick={() => liveRefreshRef.current()} disabled={liveBusy || !selection}><span className={liveBusy ? "spinning" : ""}><RefreshIcon /></span>{liveBusy ? "同步中" : "刷新班次"}</button></div>
        </section>
        <section className="timetable-panel" aria-labelledby="timetable-title"><div className="panel-heading"><div><span className="eyebrow">WEEKLY TIMETABLE</span><h2 id="timetable-title">{selection?.weekday === todayWeekday ? "今日计划时刻" : `${weekdays[(selection?.weekday || 1) - 1]}计划时刻`}</h2></div><span className="plan-tag">{selectedDirection ? `${selectedDirection.name}方向` : "计划发车时刻"}</span></div><div className="weekday-tabs" aria-label="选择计划星期">{weekdays.map((label, index) => <button key={label} aria-pressed={selection?.weekday === index + 1} disabled={!selection} onClick={() => { if (selection) { fixedWeekdayRef.current = true; choose({ ...selection, weekday: index + 1 }); } }}>{label}{todayWeekday === index + 1 && <small>今天</small>}</button>)}</div>
          {timetable?.sourceLine && timetable.sourceLine !== selection?.line && <p className="through-service-note">3／11号线贯通方向时刻</p>}
          {scheduleError && <div className="inline-error" role="alert">{scheduleError}{timetable ? " 当前为上次获取的计划。" : ""}<button onClick={() => scheduleRefreshRef.current()} disabled={scheduleBusy}>重试</button></div>}
          <div className="schedule-summary"><div><span>首班车</span><strong>{timetable?.times[0] || "—"}</strong></div><div><span>末班车</span><strong>{timetable?.times.at(-1) || "—"}</strong></div><div className="summary-caption"><span>{weekdays[(selection?.weekday || 1) - 1]}计划</span><strong>{timetable ? `${timetable.times.length} 班` : "正在获取"}</strong></div></div>
          {!timetable ? <div className="schedule-empty">{scheduleError ? "计划时刻暂不可用，请重试。" : "正在获取所选星期的计划时刻…"}</div> : !timetable.times.length ? <div className="schedule-empty">该方向暂无计划时刻</div> : <div className="hourly-timetable"><div className="time-table-header"><span>小时</span><span>发车分钟 <small>仅供参考</small></span></div>{Array.from(hours.entries()).map(([hour, times]) => <div className="hour-row" key={hour}><strong>{hour}</strong><div>{times.map((time, index) => <span key={`${time}-${index}`} className={`${time === nextPlanned ? "next-time" : ""} ${selection?.weekday === todayWeekday && now && Date.parse(`${today}T${time}:00+08:00`) < now ? "past-time" : ""}`} title={`${time}${time === nextPlanned ? " · 下一班计划" : ""}`}>{time.slice(3)}{time === nextPlanned && <small>下一班</small>}</span>)}</div></div>)}</div>}
          <div className="plan-footer"><span>计划与实时班次可能不同，实际以现场列车运行为准。</span><span>{timetable ? `计划同步 ${clockFormat.format(Date.parse(timetable.fetchedAt))}` : ""}</span></div>
        </section>
      </div>
    </div>
    <footer className="site-footer"><span>非官方独立展示 · 数据来自你提供的苏州地铁列车动态页面</span><a href="http://106.14.198.252:8512/station" target="_blank" rel="noreferrer">查看原站</a></footer>
  </main>;
}
