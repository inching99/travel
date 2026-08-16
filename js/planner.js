// ===== 行程规划引擎 =====
// 输入：points[]（含stayMin），起点位置
// 输出：排序 + 逐段时间表 + 自驾建议
RB.Planner = (function () {
  const C = () => RB.CONFIG.PLAN;
  const RAD = Math.PI / 180;

  // 两点直线距离 km
  function distKm(a, b) {
    const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  // 2-opt 优化最近邻序列（TSP open path）
  function optimizeOrder(start, points) {
    if (!points.length) return points;
    // 最近邻（起点缺省时用几何中心作锚点）
    let remaining = points.slice();
    const order = [];
    let cur = start || {
      lat: remaining.reduce((s2, p) => s2 + p.lat, 0) / remaining.length,
      lng: remaining.reduce((s2, p) => s2 + p.lng, 0) / remaining.length
    };
    if (!start) cur.__virtual = true;
    while (remaining.length) {
      remaining.sort((a, b) => distKm(cur, a) - distKm(cur, b));
      const next = remaining.shift();
      order.push(next); cur = next;
    }
    // 2-opt（点数≤12时执行，避免卡顿）
    if (order.length >= 4 && order.length <= 12) {
      let improved = true, guard = 0;
      while (improved && guard++ < 30) {
        improved = false;
        for (let i = 0; i < order.length - 1; i++) {
          for (let j = i + 1; j < order.length; j++) {
            const a = i === 0 ? start : order[i - 1];
            const endAnchor = order[j + 1] || start || cur;
            const d1 = distKm(a, order[i]) + distKm(order[j], endAnchor);
            const d2 = distKm(a, order[j]) + distKm(order[i], endAnchor);
            if (d2 < d1 - 0.01) {
              // 反转 i..j
              const seg = order.slice(i, j + 1).reverse();
              order.splice(i, seg.length, ...seg);
              improved = true;
            }
          }
        }
      }
    }
    return order;
  }

  // 停留时长估算
  function estimateStay(point) {
    if (point.stayMin != null && point.stayMin > 0) return point.stayMin;
    let base = RB.CONFIG.STAY_DEFAULT;
    const cat = point.category || '';
    for (const k in RB.CONFIG.STAY) {
      if (cat.indexOf(k.split(';')[0]) === 0) { base = RB.CONFIG.STAY[k]; break; }
    }
    // 更精确：整串匹配优先
    for (const k in RB.CONFIG.STAY) {
      if (cat === k || cat.indexOf(k) === 0) { base = RB.CONFIG.STAY[k]; break; }
    }
    const imp = Math.min(1, Math.max(0, point.importance || 0.5));
    return Math.round(base + (imp - 0.5) * 2 * RB.CONFIG.STAY_IMPORTANCE_FACTOR / 2);
  }

  const fmtHM = m => { m = Math.round(m); return `${Math.floor(m / 60)}小时${String(m % 60).padStart(2, '0')}分`; };
  const fmtClock = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

  // 主流程：start {lat,lng} 或 null；points 待排序
  async function build(trip) {
    const Cfg = C();
    const start = trip.startPos || null;
    let pts = (trip.points || []).slice();
    if (pts.length > Cfg.MAX_WAYPOINTS) throw new Error(`单行程最多 ${Cfg.MAX_WAYPOINTS} 个点`);
    if (!pts.length) throw new Error('请先添加想去的地点');

    // 1. 智能排序
    if (!trip.keepOrder) pts = optimizeOrder(start, pts);

    // 2. 逐段真实驾车路线（N-1段）
    const legs = [];
    let prev = start;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let leg = { distance: null, duration: null };
      if (prev) {
        try {
          const r = await RB.TC.drivingRoute(prev.lat, prev.lng, p.lat, p.lng);
          leg = r;
        } catch (e) {
          // 失败降级：直线距离×1.3，速度60km/h
          const km = prev ? distKm(prev, p) : 0;
          leg = { distance: Math.round(km * 1300), duration: Math.round(km * 1.3 * 60 / 60), degraded: true };
        }
      }
      legs.push(leg);
      prev = p;
    }

    // 3. 时间表
    const startMin = (trip.startHour || Cfg.START_HOUR_DEFAULT) * 60;
    let cursor = startMin;
    const timeline = pts.map((p, i) => {
      const arrive = cursor + (legs[i].duration || 0);
      const stay = estimateStay(p);
      const leave = arrive + stay;
      cursor = leave;
      return { point: p, arrive, stay, leave, leg: legs[i] };
    });
    const endMin = cursor;
    const driveMin = legs.reduce((s, l) => s + (l.duration || 0), 0);
    const driveKm = legs.reduce((s, l) => s + (l.distance || 0), 0) / 1000;
    const totalMin = endMin - startMin;

    // 4. 自驾建议
    const advice = [];
    if (totalMin > Cfg.DAY_LIMIT_HARD) advice.push({ level: 'danger', text: `今日总时长 ${fmtHM(totalMin)}，远超 12 小时，强烈建议精简行程或拆分两天。` });
    else if (totalMin > Cfg.DAY_LIMIT_MIN) advice.push({ level: 'warn', text: `今日总时长 ${fmtHM(totalMin)}，超过 10 小时，建议精简一两个点，留足弹性。` });
    legs.forEach((l, i) => {
      if (l.duration >= Cfg.LONG_DRIVE_MIN) advice.push({ level: 'info', text: `第${i + 1}段车程约 ${fmtHM(l.duration)}，中途建议进服务区休息 15 分钟。` });
    });
    if (driveKm > Cfg.DRIVE_REST_KM * 2) advice.push({ level: 'info', text: `全程 ${Math.round(driveKm)} km，油量/电量请保持充足，留意沿途服务区。` });
    if (timeline.some(t => t.arrive > 19 * 60 && (t.point.category || '').indexOf('风景名胜') === 0)) advice.push({ level: 'warn', text: '有景点到达时间较晚（19点后），请确认开放时间，避免白跑。' });
    if (legs.some(l => l.degraded)) advice.push({ level: 'warn', text: '部分路段路线获取失败，时间按直线距离估算，仅供参考。' });

    return { order: pts, timeline, summary: { driveMin, driveKm: Math.round(driveKm), totalMin, startClock: fmtClock(startMin), endClock: fmtClock(endMin) }, advice };
  }

  return { build, estimateStay, distKm, fmtHM, fmtClock };
})();
