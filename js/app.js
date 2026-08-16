// ===== 主应用逻辑 =====
RB.App = (function () {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  let currentTrip = null;   // 正在编辑/查看的行程
  let view = 'home';        // home | trip | diary | settings
  let searchCache = [];

  // ---------- 工具 ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock = m => RB.Planner.fmtClock(m);
  const toast = (msg, ms = 2200) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), ms); };
  function confirmDlg(msg) { return Promise.resolve(window.confirm(msg)); }

  // ---------- 视图切换 ----------
  function go(v, ...args) {
    view = v;
    $$('.view').forEach(el => el.classList.remove('active'));
    $('#' + v + 'View').classList.add('active');
    $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (v === 'home') renderHome();
    if (v === 'trip') renderTrip();
    if (v === 'diary') renderDiary(...args);
    if (v === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  // ---------- 首页：行程列表 ----------
  async function renderHome() {
    const trips = await RB.DB.listTrips();
    const box = $('#tripList');
    if (!trips.length) { box.innerHTML = '<div class="empty">还没有行程<br>点下面「+ 新建行程」开始规划吧</div>'; return; }
    box.innerHTML = trips.map(t => {
      const s = t.planSummary || {};
      return `<div class="card trip-card" data-id="${t.id}">
        <div class="row"><b>${esc(t.title || '未命名行程')}</b>
        <button class="btn-danger btn-s del" data-id="${t.id}">删除</button></div>
        <div class="sub">${t.points.length} 个地点${s.driveKm ? ' · 约 ' + s.driveKm + ' km · ' + clock2(s) : ''}</div>
        ${t.plan && t.plan.length ? `<div class="mini-timeline">${t.plan.map((p, i) => `<span class="chip">${i + 1}.${esc(p.point.name)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    box.querySelectorAll('.trip-card').forEach(c => c.onclick = e => {
      if (e.target.classList.contains('del')) return;
      openTrip(c.dataset.id);
    });
    box.querySelectorAll('.del').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      if (await confirmDlg('删除该行程（含其日记引用不删除）？')) { await RB.DB.delTrip(b.dataset.id); renderHome(); }
    });
  }
  const clock2 = s => `${s.startClock || ''}~${s.endClock || ''}`;

  async function newTripFlow() {
    const title = prompt('行程名称（如：环岛东线一日游）', '新行程 ' + new Date().toLocaleDateString('zh-CN'));
    if (title == null) return;
    const t = await RB.DB.newTrip({ title: title.trim() || '未命名行程' });
    await openTrip(t.id);
  }

  // ---------- 行程编辑 ----------
  async function openTrip(id) {
    currentTrip = await RB.DB.getTrip(id);
    go('trip');
  }

  async function saveCurrent() { if (currentTrip) currentTrip = await RB.DB.saveTrip(currentTrip); }

  async function renderTrip() {
    if (!currentTrip) return go('home');
    const t = currentTrip;
    $('#tripTitle').textContent = t.title || '未命名行程';
    $('#tripTitle').onclick = async () => {
      const n = prompt('修改行程名称', t.title); if (n == null) return;
      t.title = n.trim() || t.title; await saveCurrent(); renderTrip();
    };
    // 起点/出发时间
    $('#startPosLabel').textContent = t.startName ? '🚩 起点：' + t.startName : '🚩 起点：未设置（默认不排首段驾车）';
    $('#startHour').value = t.startHour || 8;
    $('#keepOrder').checked = !!t.keepOrder;

    // 点列表
    const box = $('#pointList');
    if (!t.points.length) box.innerHTML = '<div class="empty" style="padding:20px">用上面搜索框添加想去的地点</div>';
    else box.innerHTML = t.points.map((p, i) => `
      <div class="point-item" data-i="${i}">
        <div class="num">${i + 1}</div>
        <div class="pbody">
          <div class="pname">${esc(p.name)} <span class="cat">${esc((p.category || '').split(';')[0])}</span></div>
          <div class="pmeta">
            停留 <input type="number" class="stay-in" data-i="${i}" value="${p.stayMin != null ? p.stayMin : ''}" placeholder="${RB.Planner.estimateStay(p)}" min="0" step="10"> 分钟
          </div>
        </div>
        <div class="pbtns">
          ${i > 0 ? `<button class="btn-s up" data-i="${i}">↑</button>` : ''}
          <button class="btn-s park" data-i="${i}">🅿️</button>
          <button class="btn-s danger del" data-i="${i}">✕</button>
        </div>
      </div>`).join('');

    box.querySelectorAll('.up').forEach(b => b.onclick = async () => {
      const i = +b.dataset.i; const arr = t.points;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      t.keepOrder = true; $('#keepOrder').checked = true;
      await saveCurrent(); renderTrip();
    });
    box.querySelectorAll('.del').forEach(b => b.onclick = async () => {
      t.points.splice(+b.dataset.i, 1); await saveCurrent(); renderTrip();
    });
    box.querySelectorAll('.park').forEach(b => b.onclick = () => showParking(+b.dataset.i));
    box.querySelectorAll('.stay-in').forEach(inp => inp.onchange = async () => {
      const i = +inp.dataset.i; const v = parseInt(inp.value, 10);
      t.points[i].stayMin = isNaN(v) ? null : v;
      await saveCurrent();
    });

    // 已有规划结果
    renderPlanResult();
    renderTripMap();
  }

  function renderPlanResult() {
    const t = currentTrip;
    const box = $('#planResult');
    const sch = $('#schematicBox');
    if (!t.plan || !t.plan.length) { box.innerHTML = ''; $('#mapBox').classList.add('hide'); if (sch) RB.Schematic.render(sch, null); return; }
    $('#mapBox').classList.remove('hide');
    if (sch) RB.Schematic.render(sch, t.plan, t.startPos ? { name: t.startName || '出发点', lat: t.startPos.lat, lng: t.startPos.lng } : null);
    const s = t.planSummary || {};
    let html = `<div class="summary">
      <div>${s.startClock} 出发 → ${s.endClock} 结束 · 总时长 ${RB.Planner.fmtHM(s.totalMin)}</div>
      <div>驾车 ${RB.Planner.fmtHM(s.driveMin)} / ${s.driveKm} km</div></div>`;
    html += t.plan.map((row, i) => {
      const prev = i === 0 ? null : t.plan[i - 1];
      const legTxt = row.leg && row.leg.duration != null
        ? (i === 0 ? '' : `<div class="leg">🚗 从上一点驾车 ${RB.Planner.fmtHM(row.leg.duration)} · ${(row.leg.distance / 1000).toFixed(1)}km</div>`)
        : '';
      return `<div class="tl-row">
        <div class="tl-time">${clock(row.arrive)}<br><span>${clock(row.leave)} 离开</span></div>
        <div class="tl-dot"></div>
        <div class="tl-body"><b>${i + 1}. ${esc(row.point.name)}</b> · 停留${RB.Planner.fmtHM(row.stay)}
          ${row.point.parking && row.point.parking.length ? `<div class="pk-mini">🅿️ ${esc(row.point.parking[0].name)}（${row.point.parking[0]._distance}m）</div>` : ''}</div>
      </div>${legTxt}`;
    }).join('');
    if (t.advice && t.advice.length) {
      html += '<div class="advice-title">💡 自驾建议</div>' + t.advice.map(a => `<div class="advice ${a.level}">${esc(a.text)}</div>`).join('');
    }
    box.innerHTML = html;
  }

  async function renderTripMap() {
    if (!currentTrip || !currentTrip.plan || !currentTrip.plan.length) return;
    try {
      await RB.Map.init('tripMap');
      RB.Map.drawRoute(currentTrip.plan.map(r => r.point));
    } catch (e) { $('#mapErr').textContent = e.message; }
  }

  // ---------- 地点搜索 ----------
  async function doSearch() {
    const kw = $('#searchInput').value.trim();
    if (!kw) return;
    if (!RB.CONFIG.TENCENT_MAP_KEY) { toast('请先在「设置」里填入腾讯地图Key'); go('settings'); return; }
    const box = $('#searchResult');
    box.innerHTML = '<div class="empty">搜索中…</div>';
    try {
      const city = ($('#searchCity').value || '').trim();
      const list = await RB.TC.searchPlace(kw, city || undefined);
      searchCache = list;
      box.innerHTML = list.length ? list.map((p, i) => `
        <div class="s-item" data-i="${i}">
          <div><b>${esc(p.name)}</b><div class="sub">${esc(p.address || '')}</div></div>
          <button class="btn-s add">+ 加入</button>
        </div>`).join('') : '<div class="empty">无结果，换个关键词试试</div>';
      box.querySelectorAll('.s-item').forEach(el => el.onclick = async () => {
        try {
          const p = searchCache[+el.dataset.i];
          // 没打开行程时：自动打开最近的，或新建一个
          if (!currentTrip) {
            const trips = await RB.DB.listTrips();
            currentTrip = trips.length ? trips[0] : await RB.DB.newTrip({ title: '新行程 ' + new Date().toLocaleDateString('zh-CN') });
            $('#tripTitle').textContent = currentTrip.title;
          }
          if (currentTrip.points.length >= RB.CONFIG.PLAN.MAX_WAYPOINTS) return toast('已达单行程点数上限（' + RB.CONFIG.PLAN.MAX_WAYPOINTS + '个）');
          currentTrip.points.push({ uid: Date.now(), name: p.name, lat: p.lat, lng: p.lng, category: p.category, address: p.address, stayMin: null, importance: 0.5 });
          await saveCurrent();
          renderTrip();
          toast('已加入：' + p.name);
        } catch (e) { toast('加入失败：' + e.message, 4000); }
      });
    } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  // ---------- 起点 ----------
  async function setStart() {
    if (!RB.CONFIG.TENCENT_MAP_KEY) { toast('请先在「设置」里填入腾讯地图Key'); return go('settings'); }
    const kw = prompt('起点名称（如：酒店名/小区名，留空取消）');
    if (kw == null) return;
    if (!kw.trim()) { currentTrip.startPos = null; currentTrip.startName = ''; await saveCurrent(); return renderTrip(); }
    try {
      const list = await RB.TC.searchPlace(kw.trim());
      if (!list.length) return toast('未找到该地点');
      currentTrip.startPos = { lat: list[0].lat, lng: list[0].lng };
      currentTrip.startName = list[0].name;
      await saveCurrent(); renderTrip();
    } catch (e) { toast(e.message); }
  }

  // ---------- 规划 ----------
  async function planNow() {
    if (!currentTrip) return;
    if (!RB.CONFIG.TENCENT_MAP_KEY) { toast('请先在「设置」里填入腾讯地图Key'); return go('settings'); }
    if (!currentTrip.points.length) return toast('请先添加地点');
    toast('正在规划路线…', 8000);
    $('#btnPlan').disabled = true;
    try {
      const r = await RB.Planner.build(currentTrip);
      currentTrip.plan = r.timeline;
      currentTrip.planSummary = r.summary;
      currentTrip.advice = r.advice;
      await saveCurrent();
      renderTrip();
      toast('规划完成 ✓');
      $('#planResult').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { toast('规划失败：' + e.message, 4000); }
    $('#btnPlan').disabled = false;
  }

  // ---------- 停车场 ----------
  async function showParking(i) {
    const p = currentTrip.points[i];
    const modal = $('#parkModal');
    $('#parkList').innerHTML = '<div class="empty">检索中…</div>';
    modal.classList.add('show');
    try {
      const fresh = !p.parkingFetchedAt || Date.now() - p.parkingFetchedAt > 3600e3;
      if (fresh) {
        p.parking = await RB.TC.nearbyParking(p.lat, p.lng, RB.CONFIG.PLAN.NEAREST_RADIUS_KM * 1000);
        p.parkingFetchedAt = Date.now();
        await saveCurrent();
      }
      const list = p.parking || [];
      $('#parkList').innerHTML = (list.length ? list.map(x => `
        <div class="s-item">
          <div><b>🅿️ ${esc(x.name)}</b><div class="sub">${x._distance}m · ${esc(x.address || '')}</div></div>
          <button class="btn-s nav" data-lat="${x.lat}" data-lng="${x.lng}" data-name="${esc(x.name)}">导航</button>
        </div>`).join('') : '<div class="empty">2km内未找到停车场</div>');
      $('#parkList').querySelectorAll('.nav').forEach(b => b.onclick = () => navTo(+b.dataset.lat, +b.dataset.lng, b.dataset.name));
    } catch (e) { $('#parkList').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  function navTo(lat, lng, name) {
    // 依次尝试高德/腾讯/百度（Web协议）
    const u1 = `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}&mode=car&src=roadbook`;
    const u2 = `https://apis.map.qq.com/uri/v1/route?to=${lat},${lng},${encodeURIComponent(name)}&policy=1&src=roadbook`;
    if (confirm('用高德地图打开导航？（取消则用腾讯地图）')) location.href = u1; else location.href = u2;
  }

  // ---------- 日记 ----------
  let diaryDraft = null;

  async function renderDiary() {
    const sel = $('#diaryTripSel');
    const trips = await RB.DB.listTrips();
    const cur = sel.value;
    sel.innerHTML = '<option value="">全部</option>' + trips.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('');
    if (cur) sel.value = cur;
    await renderDiaryList(sel.value);
  }

  async function renderDiaryList(tripId) {
    const list = await RB.DB.listDiaries(tripId || undefined);
    const box = $('#diaryList');
    if (!list.length) { box.innerHTML = '<div class="empty">还没有日记<br>走完一天，记点什么吧</div>'; return; }
    box.innerHTML = list.map(d => {
      const dt = new Date(d.ts);
      const tstr = `${dt.getMonth() + 1}月${dt.getDate()}日 ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      return `<div class="card diary-card" data-id="${d.id}">
        <div class="row"><span class="dtime">${tstr}</span>
          <span><button class="btn-s share">📤 分享</button><button class="btn-s danger del">✕</button></span></div>
        ${d.place ? `<div class="dplace">📍 ${esc(d.place)}</div>` : ''}
        <div class="dtext">${esc(d.text).replace(/\n/g, '<br>')}</div>
        ${d.photos && d.photos.length ? `<div class="dphotos">${d.photos.map(ph => `<img src="${ph}" alt="">`).join('')}</div>` : ''}
        ${d.tags && d.tags.length ? `<div class="mini-timeline">${d.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    box.querySelectorAll('.del').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      if (await confirmDlg('删除这条日记？')) { await RB.DB.delDiary(e.target.closest('.diary-card').dataset.id); renderDiaryList(sel.value); }
    });
    box.querySelectorAll('.share').forEach(b => b.onclick = e => {
      const id = e.target.closest('.diary-card').dataset.id;
      shareDiary(id);
    });
    box.querySelectorAll('.dphotos img').forEach(img => img.onclick = () => {
      const full = $('#photoFull'); full.src = img.src; full.classList.add('show');
    });
  }

  async function openDiaryEditor() {
    diaryDraft = { text: '', photos: [], place: '', tags: [], tripId: $('#diaryTripSel').value || (currentTrip ? currentTrip.id : '') };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { diaryDraft.lat = pos.coords.latitude; diaryDraft.lng = pos.coords.longitude; },
        () => {}, { timeout: 3000 });
    }
    $('#diText').value = ''; $('#diPlace').value = ''; $('#diPhotos').innerHTML = ''; $('#diTags').value = '';
    $('#diaryModal').classList.add('show');
  }

  function addDiaryPhoto() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => {
      [...inp.files].slice(0, 3 - diaryDraft.photos.length).forEach(f => {
        const reader = new FileReader();
        reader.onload = () => {
          compressToDataURL(reader.result, 900, 0.72).then(url => {
            diaryDraft.photos.push(url);
            $('#diPhotos').insertAdjacentHTML('beforeend', `<img src="${url}" onclick="this.remove();RB.App._syncPhotos()">`);
          });
        };
        reader.readAsDataURL(f);
      });
    };
    inp.click();
  }
  // 同步编辑器里剩余图片（删除后）
  function _syncPhotos() {
    diaryDraft.photos = [...$('#diPhotos').querySelectorAll('img')].map(i => i.src);
  }

  function compressToDataURL(src, maxW, q) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', q));
      };
      img.onerror = () => res(src);
      img.src = src;
    });
  }

  async function saveDiary() {
    const text = $('#diText').value.trim();
    if (!text && !diaryDraft.photos.length) return toast('写点什么或加张照片吧');
    diaryDraft.text = text;
    diaryDraft.place = $('#diPlace').value.trim();
    diaryDraft.tags = $('#diTags').value.split(/[,，\s]+/).filter(Boolean).slice(0, 6);
    await RB.DB.newDiary(diaryDraft);
    $('#diaryModal').classList.remove('show');
    toast('已记录 ✓');
    renderDiaryList($('#diaryTripSel').value);
  }

  async function shareDiary(id) {
    const d = await RB.DB.listDiaries().then(ls => ls.find(x => x.id === id));
    if (!d) return;
    const trip = d.tripId ? await RB.DB.getTrip(d.tripId) : null;
    toast('生成长图中…', 6000);
    try {
      const url = await RB.Poster.makeDiaryPoster(d, trip);
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'diary.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '旅行日记' });
      } else {
        RB.Poster.download(url, `roadbook-diary-${Date.now()}.jpg`);
        toast('已保存长图，去相册分享吧');
      }
    } catch (e) { toast('分享失败：' + e.message); }
  }

  // ---------- 设置 ----------
  async function renderSettings() {
    $('#keyInput').value = RB.CONFIG.TENCENT_MAP_KEY || localStorage.getItem('rb_key') || '';
  }

  async function saveKey() {
    const v = $('#keyInput').value.trim();
    RB.CONFIG.TENCENT_MAP_KEY = v;
    localStorage.setItem('rb_key', v);
    toast('Key 已保存');
  }

  async function exportData() {
    const json = await RB.DB.exportAll();
    const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `roadbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast('备份已下载');
  }

  function importData() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        try {
          const { nTrip, nDiar } = await RB.DB.importAll(JSON.parse(r.result));
          toast(`导入成功：${nTrip} 行程 / ${nDiar} 日记`);
        } catch (e) { toast('导入失败：' + e.message); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  // ---------- 事件绑定 ----------
  function on(sel, handler) { const el = $(sel); if (el) el.onclick = handler; else console.warn('未找到元素:', sel); }
  function bind() {
    $$('.tabbar button').forEach(b => b.onclick = () => go(b.dataset.v));
    on('#btnNewTrip', newTripFlow);
    on('#btnSearch', doSearch);
    on('#btnSetStart', setStart);
    const sh = $('#startHour'); if (sh) sh.onchange = async e => { currentTrip.startHour = +e.target.value || 8; await saveCurrent(); };
    const ko = $('#keepOrder'); if (ko) ko.onchange = async e => { currentTrip.keepOrder = e.target.checked; await saveCurrent(); };
    on('#btnPlan', planNow);
    on('#btnTripPoster', async () => {
      if (!currentTrip || !currentTrip.plan) return toast('请先完成规划');
      const url = await RB.Poster.makeTripPoster(currentTrip);
      RB.Poster.download(url, 'roadbook-trip.jpg');
    });
    on('#btnGoDiary', () => { go('diary'); openDiaryEditor(); });
    on('#btnNewDiary', openDiaryEditor);
    const ds = $('#diaryTripSel'); if (ds) ds.onchange = e => renderDiaryList(e.target.value);
    on('#btnAddPhoto', addDiaryPhoto);
    on('#btnSaveDiary', saveDiary);
    on('#btnCloseDiary', () => $('#diaryModal').classList.remove('show'));
    on('#parkClose', () => $('#parkModal').classList.remove('show'));
    on('#photoFull', () => $('#photoFull').classList.remove('show'));
    on('#btnSaveKey', saveKey);
    on('#btnExport', exportData);
    on('#btnImport', importData);
  }

  async function start() {
    // 恢复Key
    const k = localStorage.getItem('rb_key');
    if (k) RB.CONFIG.TENCENT_MAP_KEY = k;
    bind();
    go('home');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    if (!k) setTimeout(() => toast('提示：先到「设置」填入腾讯地图Key', 4000), 800);
  }

  document.addEventListener('DOMContentLoaded', start);
  return { toast, _syncPhotos, openTrip };
})();
