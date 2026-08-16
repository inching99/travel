// ===== 地图模块：腾讯 JS API GL 动态加载 =====
RB.Map = (function () {
  let map = null, ready = null, markerLayer = null, poly = null;

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
    }
    return map;
  }

  function clearAll() {
    if (markerLayer) { try { markerLayer.setMap(null); markerLayer = null; } catch (e) {} }
    if (poly) { try { poly.setMap(null); poly = null; } catch (e) {} }
  }

  // 绘制行程路线与序号标点
  function drawRoute(points) {
    if (!map || !window.TMap || !points.length) return;
    clearAll();
    const path = points.map(p => new TMap.LatLng(p.lat, p.lng));

    // 视野适配
    const bounds = new TMap.LatLngBounds();
    path.forEach(ll => bounds.extend(ll));
    map.fitBounds(bounds, { padding: 40 });

    // 路线
    poly = new TMap.MultiPolyline({
      map,
      geometries: [{ id: 'r1', styleId: 's', paths: path }],
      styles: { s: new TMap.PolylineStyle({ color: '#2563EBDD', width: 6, borderWidth: 2, borderColor: '#FFFFFF', lineCap: 'round' }) }
    });

    // 序号标点（DOM 气泡）
    const geos = points.map((p, i) => ({
      id: 'm' + i, styleId: 'default',
      position: new TMap.LatLng(p.lat, p.lng),
      content: `<div style="background:${i === 0 ? '#059669' : i === points.length - 1 ? '#DC2626' : '#2563EB'};color:#fff;font-size:12px;font-weight:700;padding:2px 7px;border-radius:99px;border:1.5px solid #fff;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)">${i + 1}. ${p.name || ''}</div>`
    }));
    markerLayer = new TMap.MultiMarker({ map, geometries: geos });
  }

  return { init, drawRoute, clearAll, get map() { return map; } };
})();
