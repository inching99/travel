// ===== 日记分享长图（Canvas 生成）=====
RB.Poster = (function () {
  // 生成行程概览长图或日记长图，返回 dataURL
  async function makeDiaryPoster(diary, trip) {
    const W = RB.CONFIG.POSTER_WIDTH;
    const photos = (diary.photos || []).slice(0, 3);
    const H = 380 + (diary.text ? Math.ceil(diary.text.length / 24) * 44 : 0) + photos.length * 520 + 160;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e293b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // 头部
    ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 40px sans-serif';
    ctx.fillText('🚗 自驾路书 · 旅行日记', 40, 80);
    ctx.fillStyle = '#94a3b8'; ctx.font = '28px sans-serif';
    const d = new Date(diary.ts);
    ctx.fillText(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${trip ? trip.title : ''}`, 40, 130);

    let y = 200;
    // 正文（自动换行）
    if (diary.text) {
      ctx.fillStyle = '#f1f5f9'; ctx.font = '32px sans-serif';
      let line = '';
      for (const ch of diary.text) {
        line += ch;
        if (line.length >= 22) { ctx.fillText(line, 40, y); y += 44; line = ''; }
      }
      if (line) { ctx.fillText(line, 40, y); y += 44; }
      y += 20;
    }
    // 地点/标签
    const meta = [diary.place].concat(diary.tags || []).filter(Boolean).join(' · ');
    if (meta) { ctx.fillStyle = '#38bdf8'; ctx.font = '28px sans-serif'; ctx.fillText(meta.slice(0, 26), 40, y); y += 60; }

    // 照片
    for (const ph of photos) {
      try {
        const img = await loadImage(ph);
        const h = Math.min(520, Math.round(W - 80) * (img.height / img.width));
        ctx.drawImage(img, 40, y, W - 80, h);
        y += h + 20;
      } catch (e) {}
    }

    // 底部
    ctx.fillStyle = '#64748b'; ctx.font = '26px sans-serif';
    ctx.fillText('记录于 自驾路书 RoadBook', 40, H - 60);
    return cv.toDataURL('image/jpeg', 0.9);
  }

  // 行程长图：时间表概览
  async function makeTripPoster(trip) {
    const W = RB.CONFIG.POSTER_WIDTH;
    const rows = (trip.plan || []);
    const H = 300 + rows.length * 120 + 200;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e293b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 44px sans-serif';
    ctx.fillText('🚗 ' + (trip.title || '我的行程'), 40, 90);
    const s = trip.planSummary || {};
    ctx.fillStyle = '#94a3b8'; ctx.font = '28px sans-serif';
    ctx.fillText(`${s.startClock || ''} 出发 · 全程约 ${s.driveKm || 0} km · 驾车 ${RB.Planner.fmtHM(s.driveMin || 0)}`, 40, 140);
    ctx.fillText(`预计 ${s.endClock || ''} 结束 · 总时长 ${RB.Planner.fmtHM(s.totalMin || 0)}`, 40, 185);

    let y = 250;
    rows.forEach((t, i) => {
      ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 32px sans-serif';
      ctx.fillText(`${i + 1}. ${t.point.name}`, 40, y);
      ctx.fillStyle = '#cbd5e1'; ctx.font = '27px sans-serif';
      ctx.fillText(`${RB.Planner.fmtClock(t.arrive)} 到达 · 停留 ${RB.Planner.fmtHM(t.stay)} · ${RB.Planner.fmtClock(t.leave)} 离开`, 40, y + 42);
      y += 120;
    });
    ctx.fillStyle = '#64748b'; ctx.font = '26px sans-serif';
    ctx.fillText('由 自驾路书 RoadBook 生成', 40, H - 60);
    return cv.toDataURL('image/jpeg', 0.9);
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img); img.onerror = rej; img.src = src;
    });
  }

  function download(dataURL, filename) {
    const a = document.createElement('a');
    a.href = dataURL; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  return { makeDiaryPoster, makeTripPoster, download };
})();
