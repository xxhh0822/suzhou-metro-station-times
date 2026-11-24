function plainText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
}

function attribute(attributes, name) {
  return new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(attributes)?.[2];
}

function parseDivs(source, catalog = false) {
  const html = source.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const nodes = [];
  const stack = [];
  for (const match of html.matchAll(/<div\b[^>]*>|<\/div\s*>/gi)) {
    if (/^<\/div/i.test(match[0])) {
      const node = stack.pop();
      if (!node) throw new Error('原站页面结构不完整');
      node.end = match.index;
    } else {
      const node = {
        classes: attribute(match[0], 'class')?.split(/\s+/) ?? [],
        attributes: match[0], start: match.index, inner: match.index + match[0].length,
        end: -1, parent: stack.at(-1),
      };
      nodes.push(node);
      stack.push(node);
    }
  }
  // The source catalog omits only its outer .main closing tag.
  if (catalog && stack.length === 1 && stack[0].classes.includes('main')) stack.pop().end = html.length;
  if (stack.length) throw new Error('原站页面结构不完整');
  const has = (node, name) => node.classes.includes(name);
  const inside = (node, parent) => node.start > parent.start && node.end < parent.end;
  const text = (node) => plainText(html.slice(node.inner, node.end));
  return { html, nodes, has, inside, text };
}

function exactlyOne(nodes, message) {
  if (nodes.length !== 1) throw new Error(message);
  return nodes[0];
}

export function parseCatalog(source) {
  const { html, nodes, has } = parseDivs(source, true);
  const menu = exactlyOne(nodes.filter(node => has(node, 'left-menu')), '原站线路目录结构已变化');
  const lines = [...html.slice(menu.inner, menu.end).matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li\s*>/gi)].map(match => ({
    id: attribute(match[1], 'v-line'), name: plainText(match[2]),
  }));
  const groups = nodes.filter(node => has(node, 'right-con'));
  if (!lines.length || groups.length !== lines.length || new Set(lines.map(line => line.id)).size !== lines.length) throw new Error('原站线路目录不完整');
  return lines.map((line, index) => {
    if (!/^\d+$/.test(line.id ?? '') || line.name.replace(/\s/g, '') !== `${line.id}号线`) throw new Error('原站线路信息无法识别');
    const group = groups[index];
    const stations = [...html.slice(group.inner, group.end).matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4\s*>/gi)].map(match => plainText(match[1]));
    if (!stations.length || stations.some(station => !station) || new Set(stations).size !== stations.length) throw new Error('原站站点目录不完整');
    return { ...line, stations };
  });
}

export function parseLive(source, expected) {
  const { html, nodes, has, inside, text } = parseDivs(source);
  const titles = [...html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi)].filter(match => attribute(match[1], 'class')?.split(/\s+/).includes('staTre-info-title'));
  if (titles.length !== 1 || plainText(titles[0][2]) !== expected.station) throw new Error('原站返回的站点不符');
  const item = exactlyOne(nodes.filter(node => has(node, 'staTre-timeline-item') && nodes.some(child => child.parent === node && text(child).replace(/\s/g, '') === `${expected.line}号线`)), '原站返回的线路不符');
  const wraps = nodes.filter(node => inside(node, item) && has(node, 'staTre-timeline-tableWrap'));
  if (wraps.length !== 2) throw new Error('原站最近班次结构已变化');
  const labels = ['最近班次', '下一班'];
  let directions;
  wraps.forEach((wrap, index) => {
    const precedingLabels = [...html.slice(item.inner, wrap.start).matchAll(/<span\b[^>]*>\s*(最近班次|下一班)\s*<\/span>/g)];
    const label = precedingLabels.at(-1)?.[1];
    if (label !== labels[index]) throw new Error('原站班次标签已变化');
    const head = exactlyOne(nodes.filter(node => inside(node, wrap) && has(node, 'staTre-timeline-tableHead')), '原站缺少班次方向');
    const body = exactlyOne(nodes.filter(node => inside(node, wrap) && has(node, 'staTre-timeline-tableBody')), '原站缺少班次时间');
    const columns = nodes.filter(node => node.parent === head && (has(node, 'tableLeft') || has(node, 'tableRight')));
    if (columns.length !== 2) throw new Error('原站班次方向结构已变化');
    const services = columns.map(column => {
      const heading = text(column);
      if (!heading.endsWith('方向') || heading === '方向') throw new Error('原站班次方向无法识别');
      const name = heading.slice(0, -2);
      const side = column.classes.find(className => className === 'tableLeft' || className === 'tableRight');
      const value = exactlyOne(nodes.filter(node => node.parent === body && has(node, side)), '原站班次时间结构已变化');
      const time = exactlyOne(nodes.filter(node => inside(node, value) && has(node, 'inStation-time')), '原站缺少预计到站时间');
      const display = text(time);
      const match = /^(\d+)\s*分钟$/.exec(display);
      const minutes = match ? Number(match[1]) : display === '即将到达' ? 0 : display === '暂无' ? null : undefined;
      if (minutes === undefined) throw new Error('原站预计到站时间无法识别');
      return { name, service: { label, minutes, text: display } };
    });
    if (new Set(services.map(value => value.name)).size !== services.length) throw new Error('原站方向重复');
    if (!directions) directions = services.map(value => ({ name: value.name, services: [value.service] }));
    else for (const direction of directions) {
      const match = services.find(value => value.name === direction.name);
      if (!match) throw new Error('原站两班列车方向不一致');
      direction.services.push(match.service);
    }
  });
  return directions;
}

export function parseTimetable(source, expected) {
  const { html, nodes, has, inside, text } = parseDivs(source);
  const titles = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3\s*>/gi)].map(match => plainText(match[1]).replace(/^(\d+)\s*号线\s*/, '$1 号线 '));
  const identity = exactlyOne(titles.filter(title => /^\d+ 号线 /.test(title)), '原站返回的线路或站点不符');
  const [, sourceLine, sourceStation] = /^(\d+) 号线 (.+)$/.exec(identity);
  if (sourceStation !== expected.station) throw new Error('原站返回的线路或站点不符');
  const directionNodes = nodes.filter(node => attribute(node.attributes, 'v-direction') !== undefined);
  const directions = directionNodes.map(node => ({ id: attribute(node.attributes, 'v-direction'), name: text(node) }));
  if (!directions.length || directions.some(direction => !direction.id || !direction.name) || new Set(directions.map(direction => direction.id)).size !== directions.length || new Set(directions.map(direction => direction.name)).size !== directions.length) throw new Error('原站方向选项无法识别');
  const selectedDirection = exactlyOne(directionNodes.filter(node => has(node, 'box-item-active')), '原站缺少选中方向');
  if (attribute(selectedDirection.attributes, 'v-direction') !== expected.direction) throw new Error('原站返回的方向不符');
  // At the shared Weiting boundary the source titles through-service plans by direction.
  const throughService = expected.station === '唯亭' && ['3', '11'].includes(expected.line)
    && directions.length === 2 && directions.find(direction => direction.id === '0')?.name === '花桥'
    && directions.find(direction => direction.id === '1')?.name === '苏州新区火车站'
    && sourceLine === (expected.direction === '0' ? '11' : '3');
  if (sourceLine !== expected.line && !throughService) throw new Error('原站返回的线路或站点不符');
  const selectedWeekday = exactlyOne(nodes.filter(node => attribute(node.attributes, 'v-weekday') !== undefined && has(node, 'box-item-active')), '原站缺少选中星期');
  if (attribute(selectedWeekday.attributes, 'v-weekday') !== String(expected.weekday)) throw new Error('原站返回的星期不符');
  const table = exactlyOne(nodes.filter(node => has(node, 'tab-content')), '原站缺少时刻表');
  const rows = nodes.filter(node => inside(node, table) && has(node, 'tab-item'));
  if (!rows.length) throw new Error('原站缺少时刻表表头');
  const times = [];
  for (const [index, row] of rows.entries()) {
    const hour = text(exactlyOne(nodes.filter(node => node.parent === row && has(node, 'tab-item-left')), '原站时刻表小时结构已变化'));
    const minutes = text(exactlyOne(nodes.filter(node => node.parent === row && has(node, 'tab-item-right')), '原站时刻表分钟结构已变化'));
    if (index === 0) {
      if (hour !== '小时' || minutes !== '时刻') throw new Error('原站时刻表表头已变化');
      continue;
    }
    if (!/^\d{1,2}$/.test(hour) || Number(hour) > 23 || !/^\d{1,2}(?:\s+\d{1,2})*$/.test(minutes)) throw new Error('原站时刻表时间无法识别');
    for (const minute of minutes.split(/\s+/)) {
      if (Number(minute) > 59) throw new Error('原站时刻表分钟超出范围');
      times.push(`${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`);
    }
  }
  return { sourceLine, directions, times };
}
