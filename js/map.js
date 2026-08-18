// ===== 地图模块：腾讯 JS API GL 动态加载 =====
RB.Map = (function () {
  let map = null, ready = null, mapReady = null, markerLayer = null, poly = null, bubbles = [];

  function loadSDK() {
    if (window.TMap) return Promise.resolve();
    if (ready) return ready;
    ready = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://map.qq.com/api/gljs?v=1.exp&key=' + RB.CONFIG.TENCENT_MAP_KEY;
      s.onload = () => res(); s.onerror = () => rej(new Error('地图SDK加载失败，请检查网络/Key'));
      document.head.appendChild(s);
    });
    return ready;
  }

  async function init(elId, opts) {
    if (!RB.CONFIG.TENCENT_MAP_KEY) throw new Error('尚未配置地图Key');
    await loadSDK();
    if (!map || document.getElementById(elId) !== map.getContainer()) {
      if (map) { try { map.destroy(); } catch (e) {} }
      map = new TMap.Map(elId, Object.assign({ zoom: 11, showControl: false }, opts));
      // GL 地图初始化期间 fitBounds/setCenter 会被静默忽略，必须等 maploaded
      mapReady = new Promise(res => {
        let done = false;
        const fin = () => { if (!done) { done = true; res(); } };
        map.on('maploaded', fin);
        setTimeout(fin, 2500);
      });
    }
    if (mapReady) await mapReady;
    return map;
  }

  function clearAll() {
    if (markerLayer) { try { markerLayer.setMap(null); markerLayer = null; } catch (e) {} }
    if (poly) { try { poly.setMap(null); poly = null; } catch (e) {} }
    bubbles.forEach(b => { try { b.el.remove(); } catch (e) {} });
    bubbles = [];
    if (bubbleLayer && map) {
      try { bubbleLayer.remove(); } catch (e) {}
      bubbleLayer = null;
      try { map.off('pan', syncBubbles); map.off('zoom', syncBubbles); map.off('rotate', syncBubbles); } catch (e) {}
    }
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- 序号名称气泡：手动投影 DOM 覆盖层 ----
  // （TMap.MultiMarker 不支持 HTML 气泡；DOMOverlay 在部分 GL 版本不激活，故手动监听 pan/zoom 同步位置）
  let bubbleLayer = null;
  function syncBubbles() {
    if (!map || !bubbleLayer) return;
    bubbles.forEach(b => {
      if (!b.el) return;
      const px = map.projectToContainer(b.pos);
      const x = Math.round(px.getX() - b.el.clientWidth / 2);
      const y = Math.round(px.getY() - b.el.clientHeight - 10);
      b.el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    });
  }

  // 绘制行程路线与序号标点
  function drawRoute(points) {
    if (!map || !window.TMap || !points.length) return;
    clearAll();
    const path = points.map(p => new TMap.LatLng(p.lat, p.lng));

    // 视野适配（fitBounds 在 GL v1.exp 实测无效；getZoomByBounds 可用，配合 setCenter/setZoom）
    const bounds = new TMap.LatLngBounds();
    path.forEach(ll => bounds.extend(ll));
    try {
      const c = bounds.getCenter();
      let z = 12;
      try { z = map.getZoomByBounds(bounds) - 0.6; } catch (e2) {}
      map.setCenter(c);
      map.setZoom(Math.max(3, Math.min(20, z)));
    } catch (e) { /* 保底：保持默认视野 */ }

    // 路线（GL 引擎存在视口裁剪丢失 bug：创建于视口外/相机动画期时可能不绘制，
    // 需在稍后用 updateGeometries 强制重建数据触发重绘）
    const polyGeo = () => [{ id: 'r1', styleId: 's', paths: path }];
    poly = new TMap.MultiPolyline({
      map,
      geometries: polyGeo(),
      styles: { s: new TMap.PolylineStyle({ color: '#2563EB', width: 6, opacity: 0.9, borderWidth: 2, borderColor: '#FFFFFF', lineCap: 'round' }) }
    });
    setTimeout(() => { try { poly.updateGeometries(polyGeo()); } catch (e) {} }, 600);
    setTimeout(() => { try { poly.updateGeometries(polyGeo()); } catch (e) {} }, 1600);

    // 锚点小圆钉
    markerLayer = new TMap.MultiMarker({
      map,
      geometries: points.map((p, i) => ({ id: 'm' + i, styleId: 'd', position: path[i] })),
      styles: { d: new TMap.MarkerStyle({ width: 12, height: 12, anchor: 'center', color: '#c4563a' }) }
    });

    // 序号名称气泡（起点绿 / 终点红 / 中间陶土橙）
    if (!bubbleLayer) {
      bubbleLayer = document.createElement('div');
      bubbleLayer.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:9;';
      map.getContainer().appendChild(bubbleLayer);
      try {
        map.on('pan', syncBubbles);
        map.on('zoom', syncBubbles);
        map.on('rotate', syncBubbles);
      } catch (e) {}
    }
    points.forEach((p, i) => {
      const color = i === 0 ? '#059669' : i === points.length - 1 ? '#DC2626' : '#c4563a';
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;transform:translate(-999px,-999px);';
      el.innerHTML = '<div style="background:#fffdf9;color:#3a2e26;font-size:12px;font-weight:600;padding:2px 9px 2px 3px;border-radius:99px;border:1px solid rgba(120,90,60,.18);box-shadow:0 2px 6px rgba(60,40,20,.22);white-space:nowrap;display:inline-flex;align-items:center;gap:4px">' +
        '<span style="display:inline-flex;width:17px;height:17px;border-radius:50%;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;background:' + color + '">' + (i + 1) + '</span>' +
        '<span style="max-width:96px;overflow:hidden;text-overflow:ellipsis">' + esc(p.name || '') + '</span></div>';
      bubbleLayer.appendChild(el);
      bubbles.push({ el, pos: path[i] });
    });
    // 相机 setCenter/setZoom 后仍有缓动动画，连续多次同步确保最终位置正确
    for (let k = 0; k < 8; k++) setTimeout(syncBubbles, 150 + k * 250);
    requestAnimationFrame(() => syncBubbles());
  }

  return { init, drawRoute, clearAll, get map() { return map; } };
})();
