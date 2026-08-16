// ===== 路线示意图（SVG 手绘路书风，无需地图Key）=====
RB.Schematic = (function () {
  const W = 340;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shortDur = min => {
    if (min == null) return '';
    min = Math.round(min);
    if (min < 60) return min + 'm';
    const h = Math.floor(min / 60), m = min % 60;
    return h + 'h' + (m ? m + 'm' : '');
  };

  /**
   * 渲染路线示意图
   * @param el    容器 DOM
   * @param plan  timeline（Planner 输出）
   * @param start {name,lat,lng} 可选起点
   */
  function render(el, plan, start) {
    if (!el) return;
    if (!plan || !plan.length) { el.innerHTML = ''; el.classList.remove('show'); return; }

    // ---- 节点（起点+行程点）----
    const nodes = [];
    if (start && start.lat != null) nodes.push({ name: start.name || '出发点', lat: start.lat, lng: start.lng, kind: 'start', idx: -1 });
    plan.forEach((row, i) => nodes.push({
      name: row.point.name, lat: row.point.lat, lng: row.point.lng,
      kind: (i === plan.length - 1 && plan.length > 1) ? 'end' : 'mid', idx: i
    }));
    if (nodes.length < 2) { el.innerHTML = ''; return; }

    // ---- 线性投影（城市级足够，中纬度经度修正）----
    const xs = nodes.map(n => n.lng), ys = nodes.map(n => n.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
    const cosL = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
    const ratio = (spanX * cosL) / spanY;
    const H = Math.max(280, Math.min(640, Math.round(W / Math.max(ratio, 0.55))));
    const PAD = 46;
    nodes.forEach(n => {
      n.x = PAD + (n.lng - minX) / spanX * (W - 2 * PAD);
      n.y = PAD + (maxY - n.lat) / spanY * (H - 2 * PAD);
    });

    // ---- 防重叠松弛（保持大致方位的前提下推开节点）----
    const minD = nodes.length > 9 ? 62 : 84;
    for (let it = 0; it < 80; it++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        if (d < minD) {
          const push = (minD - d) / 2 * 0.8;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
          moved = true;
        }
      }
      nodes.forEach(n => { n.x = Math.max(26, Math.min(W - 26, n.x)); n.y = Math.max(36, Math.min(H - 32, n.y)); });
      if (!moved) break;
    }

    // ---- SVG ----
    const strokeTxt = 'paint-order:stroke;stroke:#ffffff;stroke-width:3px;stroke-linejoin:round';
    let svg = `<svg viewBox="0 0 ${W} ${H + 26}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block" role="img" aria-label="路线示意图">`;

    // 路径（双层：浅色底带 + 主线）
    const d = nodes.map((n, i) => (i ? 'L' : 'M') + n.x.toFixed(1) + ' ' + n.y.toFixed(1)).join(' ');
    svg += `<path d="${d}" fill="none" stroke="#dbeafe" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += `<path d="${d}" fill="none" stroke="#2563eb" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;

    // ---- 标注碰撞避让 ----
    const taken = []; // 已占用标签锚点
    const farEnough = (x, y, min) => taken.every(p => Math.hypot(p.x - x, p.y - y) >= min);

    // 先放节点名称：上下两侧择优，选离已占用标签和相邻节点更远的一侧
    const nodeLabels = [];
    nodes.forEach((n, i) => {
      const cands = [{ x: n.x, y: n.y - 21 }, { x: n.x, y: n.y + 31 }];
      let best = null, bestD = -1;
      for (const c of cands) {
        const cx = Math.max(34, Math.min(W - 34, c.x));
        const cy = Math.max(18, Math.min(H - 10, c.y));
        let d = taken.length ? Math.min(...taken.map(p => Math.hypot(p.x - cx, p.y - cy))) : 999;
        nodes.forEach((m, k) => { if (k !== i) d = Math.min(d, Math.hypot(m.x - cx, m.y - cy) - 20); });
        if (d > bestD) { bestD = d; best = { x: cx, y: cy }; }
      }
      taken.push(best);
      nodeLabels.push(best);
    });

    // 段标注：法线两侧 × 段上5个位置，取离所有已占标签最远的点
    const legLabels = [];
    for (let j = 0; j < nodes.length - 1; j++) {
      const leg = (plan[j] || {}).leg;
      if (!leg || leg.duration == null) continue;
      const a = nodes[j], b = nodes[j + 1];
      let nx = -(b.y - a.y), ny = (b.x - a.x);
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      let best = null, bestD = -1;
      for (const t of [0.5, 0.38, 0.62, 0.3, 0.7]) {
        for (const off of [15, -15]) {
          const cx = a.x + (b.x - a.x) * t + nx * off;
          const cy = a.y + (b.y - a.y) * t + ny * off + 3;
          if (cx < 28 || cx > W - 28 || cy < 16 || cy > H - 8) continue;
          let d = taken.length ? Math.min(...taken.map(p => Math.hypot(p.x - cx, p.y - cy))) : 999;
          if (d > bestD) { bestD = d; best = { x: cx, y: cy }; }
        }
      }
      if (best) { taken.push(best); legLabels.push({ pos: best, leg }); }
    }

    // 渲染段标注
    legLabels.forEach(({ pos, leg }) => {
      const km = (leg.distance / 1000).toFixed(1);
      svg += `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#0284c7" style="${strokeTxt}">${shortDur(leg.duration)} · ${km}km</text>`;
    });

    // 渲染节点 + 名称
    nodes.forEach((n, i) => {
      const fill = n.kind === 'start' ? '#059669' : n.kind === 'end' ? '#dc2626' : '#2563eb';
      svg += `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="13" fill="${fill}" stroke="#fff" stroke-width="3"/>`;
      const label = n.kind === 'start' ? '起' : String(n.idx + 1);
      svg += `<text x="${n.x.toFixed(1)}" y="${(n.y + 4.5).toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff">${label}</text>`;
      const p = nodeLabels[i];
      svg += `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#0f172a" style="${strokeTxt}">${esc(n.name.slice(0, 9))}</text>`;
    });

    svg += `<text x="${W / 2}" y="${H + 16}" text-anchor="middle" font-size="9.5" fill="#94a3b8">路线示意图 · 按大致方位绘制</text></svg>`;

    el.innerHTML = '<div class="sch-title">🧭 路线示意</div>' + svg;
    el.classList.add('show');
  }

  return { render };
})();
