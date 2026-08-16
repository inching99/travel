// ===== 腾讯位置服务 WebServiceAPI 封装 =====
// 依赖：RB.CONFIG.TENCENT_MAP_KEY
RB.TC = (function () {
  const BASE = 'https://apis.map.qq.com/ws';
  let geocoderJsonpSeq = 0;

  function assertKey() {
    if (!RB.CONFIG.TENCENT_MAP_KEY) throw new Error('尚未配置地图Key，请到 js/config.js 填入 RB.CONFIG.TENCENT_MAP_KEY（lbs.qq.com 免费申请）');
  }

  async function get(path, params) {
    assertKey();
    const q = new URLSearchParams(Object.assign({ key: RB.CONFIG.TENCENT_MAP_KEY, output: 'jsonp' }, params));
    const url = BASE + path + '?' + q.toString();
    // WebServiceAPI 需 JSONP（浏览器直连会有跨域）；用后端代理时改为 fetch
    return new Promise((resolve, reject) => {
      const cb = '_tcjson' + (geocoderJsonpSeq++);
      const script = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('请求超时，请检查网络')); }, 9000);
      function cleanup() { clearTimeout(timer); delete window[cb]; script.remove(); }
      window[cb] = data => { cleanup(); resolve(data); };
      script.src = url + '&callback=' + cb;
      script.onerror = () => { cleanup(); reject(new Error('网络错误')); };
      document.head.appendChild(script);
    });
  }

  // 地点搜索（关键词）
  function searchPlace(keyword, region) {
    const p = { keyword, page_size: 10, orderby: '_distance' };
    if (region) { p.boundary = 'region(' + region + ',0)'; }
    return get('/place/v1/search', p).then(d => {
      if (d.status !== 0) throw new Error(d.message || '搜索失败');
      return (d.data || []).map(x => ({
        name: x.title, lat: x.location.lat, lng: x.location.lng,
        category: x.category || '', address: x.address || '', id: x.id
      }));
    });
  }

  // 周边搜索（停车场）
  function nearbyParking(lat, lng, radius) {
    return get('/place/v1/search', {
      keyword: '停车场', boundary: `nearby(${lat},${lng},${radius || 1000})`,
      page_size: 10, orderby: '_distance', filter: 'category=停车场'
    }).then(d => {
      if (d.status !== 0) throw new Error(d.message || '停车检索失败');
      return (d.data || []).map(x => ({
        name: x.title, lat: x.location.lat, lng: x.location.lng,
        _distance: x._distance, address: x.address || ''
      }));
    });
  }

  // 驾车路线（多段）：腾讯Driving接口单次仅起终点，多途经点用 from;to 逐段
  async function drivingRoute(lat1, lng1, lat2, lng2) {
    const d = await get('/direction/v1/driving/', {
      from: `${lat1},${lng1}`, to: `${lat2},${lng2}`,
      get_speed: 0
    });
    if (d.status !== 0) throw new Error(d.message || '路线规划失败');
    const r = d.result.routes[0];
    return {
      distance: r.distance,          // 米
      duration: Math.round(r.duration) // 驾车API的duration单位即分钟
    };
  }

  return { searchPlace, nearbyParking, drivingRoute, assertKey };
})();
