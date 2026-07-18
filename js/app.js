/* ===== 엄만달 웹앱 v3 — 화면 로직 ===== */
var E = window.UmmandalEngine;
var db = Store.load();
var now = new Date();
var curYM = db.currentMonth || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
var undoStack = [];
var typeNames = { three: '3교대', night: '나이트 전담', day: '평일 상근' };

function save() {
  db.currentMonth = curYM;
  db._updatedAt = Date.now();
  Store.save(db);
  if (window.Cloud && Cloud.enabled() && Cloud.getUser()) {
    Cloud.schedulePush(function () { return db; }, function (res) {
      if (!res.error) renderCloudCard();
    });
  }
}

/* ---- 날짜 도우미 ---- */
function ymParts(ym) { var a = ym.split('-'); return { y: +a[0], m: +a[1] }; }
function daysInYM(ym) { var p = ymParts(ym); return new Date(p.y, p.m, 0).getDate(); }
function firstWeekdayYM(ym) { var p = ymParts(ym); return new Date(p.y, p.m - 1, 1).getDay(); }
function prevYM(ym, back) {
  var p = ymParts(ym);
  var d = new Date(p.y, p.m - 1 - back, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/* ---- 데이터 접근 ---- */
function month(ym) {
  db.months = db.months || {};
  if (!db.months[ym]) db.months[ym] = { codes: {}, wish: {} };
  return db.months[ym];
}
function rules() {
  if (!db.rules) db.rules = {
    wd: { D: 3, E: 3, N: 2 }, we: { D: 3, E: 2, N: 2 },
    maxWork: 5, maxN: 3, offAfterN: 2, backward: 1
  };
  return db.rules;
}
function staffList() { db.staff = db.staff || []; return db.staff; }

function buildHistory(ym) {
  var hist = {};
  staffList().forEach(function (p) { hist[p.id] = { n: 0, weekend: 0, lastCodes: [] }; });
  [2, 1].forEach(function (back) {
    var pm = prevYM(ym, back);
    var rec = (db.months || {})[pm];
    if (!rec || !rec.codes) return;
    var fw = firstWeekdayYM(pm);
    staffList().forEach(function (p) {
      var codes = rec.codes[p.id];
      if (!codes || !codes.length) return;
      codes.forEach(function (c, i) {
        if (c === 'N') hist[p.id].n++;
        if (E.isWeekend(i + 1, fw) && c && c !== 'O') hist[p.id].weekend++;
      });
      if (back === 1) hist[p.id].lastCodes = codes.slice(-5).map(function (c) { return c || 'O'; });
    });
  });
  return hist;
}
function engineConfig(ym) {
  var r = rules();
  var wish = {};
  var m = month(ym);
  staffList().forEach(function (p) { if (m.wish[p.id] && m.wish[p.id].length) wish[p.id] = m.wish[p.id]; });
  return {
    days: daysInYM(ym), firstWeekday: firstWeekdayYM(ym),
    required: { weekday: { D: r.wd.D, E: r.wd.E, N: r.wd.N }, weekend: { D: r.we.D, E: r.we.E, N: r.we.N } },
    maxConsecWork: r.maxWork, maxConsecN: r.maxN, offAfterNights: r.offAfterN,
    forbidBackward: !!+r.backward, wishOffs: wish, history: buildHistory(ym), maxAttempts: 1500
  };
}

/* ---- 탭 ---- */
function showTab(t) {
  hidePicker();
  ['home', 'ward', 'archive'].forEach(function (x) {
    document.getElementById('tab-' + x).style.display = x === t ? '' : 'none';
    document.getElementById('tabBtn-' + x).className = x === t ? 'on' : '';
  });
  if (t === 'home') renderHome();
  if (t === 'ward') { renderStaff(); renderRules(); }
  if (t === 'archive') { renderArchive(); renderCloudCard(); }
  window.scrollTo(0, 0);
}
function moveMonth(dir) {
  hidePicker();
  curYM = prevYM(curYM, -dir);
  save(); renderMonthLabel(); renderHome();
}
function renderMonthLabel() {
  var p = ymParts(curYM);
  document.getElementById('curMonth').textContent = p.y + '년 ' + p.m + '월';
  document.getElementById('printTitle').textContent = p.y + '년 ' + p.m + '월 근무표';
}

/* ---- 상태 판별 ---- */
function cellCode(pid, d) {
  var codes = month(curYM).codes[pid] || [];
  return codes[d - 1] || '';
}
function isWish(pid, d) {
  return (month(curYM).wish[pid] || []).indexOf(d) >= 0;
}
function hasAny() {
  var m = month(curYM);
  return staffList().some(function (p) { return (m.codes[p.id] || []).some(function (c) { return c; }); });
}

/* ---- 홈 화면 (상태에 따라 바뀜) ---- */
function renderHome() {
  renderMonthLabel();
  var staff = staffList();
  var empty = document.getElementById('homeEmpty');
  var prep = document.getElementById('homePrep');
  var tools = document.getElementById('homeTools');
  var gridCard = document.getElementById('gridCard');
  if (!staff.length) {
    empty.style.display = '';
    prep.style.display = 'none';
    gridCard.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  gridCard.style.display = '';
  var filled = hasAny();
  prep.style.display = filled ? 'none' : '';
  tools.style.display = filled ? '' : 'none';
  if (!filled) renderPrep();
  document.getElementById('gridHint').textContent = filled
    ? '칸을 누르면 선택판이 떠서 바로 고칠 수 있어요. 이름 옆에서 사람별 개수, 맨 아래에서 날짜별 인원을 확인하세요.'
    : '칸을 눌러 ★(쉬고 싶은 날)이나 미리 정해진 근무를 표시해 둘 수 있어요.';
  renderGrid();
}
function renderPrep() {
  var staff = staffList();
  var m = month(curYM);
  var wishCount = 0;
  staff.forEach(function (p) { wishCount += (m.wish[p.id] || []).length; });
  var p = ymParts(curYM);
  document.getElementById('prepStatus').innerHTML =
    '<span class="okmark">✔</span> 인원 <b>' + staff.length + '명</b> 등록됨 &nbsp;<a class="link" onclick="showTab(\'ward\')">고치기</a><br>' +
    '<span class="okmark">✔</span> 근무 규칙 준비됨 <span class="hint">(그대로 두셔도 돼요)</span><br>' +
    '<span class="star">★</span> ' + p.m + '월에 쉬고 싶은 날 <b>' + wishCount + '건</b> 표시됨';
}

/* ---- 근무표 그리드 ---- */
function renderGrid() {
  var staff = staffList();
  var area = document.getElementById('gridArea');
  if (!staff.length) { area.innerHTML = ''; return; }
  var days = daysInYM(curYM), fw = firstWeekdayYM(curYM);
  var wdNames = ['일', '월', '화', '수', '목', '금', '토'];
  var m = month(curYM);
  var locks = m.locks || {};
  var html = '<table class="duty"><tr><th class="name">이름</th><th class="cntcol">D·E·N·오프</th>';
  for (var d = 1; d <= days; d++) {
    var wd = (fw + d - 1) % 7;
    var cls = (wd === 0 || wd === 6) ? ' class="wkend"' : '';
    html += '<th' + cls + '>' + d + '<br>' + wdNames[wd] + '</th>';
  }
  html += '</tr>';
  var violMap = currentViolMap();
  var r = rules();
  var dayCnt = [];
  for (var d = 0; d <= days; d++) dayCnt.push({ D: 0, E: 0, N: 0 });
  staff.forEach(function (p) {
    var cnt = { D: 0, E: 0, N: 0, O: 0 };
    var cellsHtml = '';
    for (var d = 1; d <= days; d++) {
      var c = cellCode(p.id, d);
      var w = isWish(p.id, d);
      if (c && dayCnt[d][c] !== undefined) dayCnt[d][c]++;
      if (c) cnt[c]++;
      var cls = 'cell';
      var disp = '';
      if (c === 'O' || (!c && w)) { cls += w ? ' Wm' : ' O'; disp = w ? '★' : '－'; }
      else if (c) { cls += ' ' + c; disp = c + (w ? '★' : ''); }
      if (violMap[p.id + '_' + d]) cls += ' viol';
      cellsHtml += '<td id="c_' + p.id + '_' + d + '" class="' + cls + '" onclick="tapCell(event,\'' + p.id + '\',' + d + ')">' + disp + '</td>';
    }
    var lk = !!locks[p.id];
    html += '<tr' + (lk ? ' class="locked"' : '') + '><td class="name">' +
      '<button class="lockbtn" title="잠그면 다시 만들어도 그대로 유지돼요" onclick="toggleLock(event,\'' + p.id + '\')">' + (lk ? '🔒' : '🔓') + '</button>' +
      '<b>' + esc(p.name) + '</b><br><span class="typebadge">' + typeNames[p.type] + '</span></td>' +
      '<td class="cntcol"><span style="color:var(--d)">' + cnt.D + '</span> <span style="color:var(--e)">' + cnt.E +
      '</span> <span style="color:var(--n)">' + cnt.N + '</span> <span style="color:#868e96">' + cnt.O + '</span></td>' +
      cellsHtml + '</tr>';
  });
  if (hasAny()) {
    [['D', '데이'], ['E', '이브닝'], ['N', '나이트']].forEach(function (pair) {
      var code = pair[0];
      html += '<tr class="cntrow"><td class="lbl" colspan="2">' + pair[1] + ' 인원</td>';
      for (var d = 1; d <= days; d++) {
        var needSet = E.isWeekend(d, fw) ? r.we : r.wd;
        var ok = dayCnt[d][code] === needSet[code];
        html += '<td class="' + (ok ? 'good' : 'bad2') + '">' + dayCnt[d][code] + '</td>';
      }
      html += '</tr>';
    });
  }
  html += '</table>';
  area.innerHTML = html;
  renderStats();
  renderBanner();
}
function toggleLock(ev, pid) {
  ev.stopPropagation();
  var m = month(curYM);
  m.locks = m.locks || {};
  if (m.locks[pid]) delete m.locks[pid]; else m.locks[pid] = true;
  save(); renderGrid();
}
function jumpTo(pid, day) {
  var el = document.getElementById('c_' + pid + '_' + day);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  el.animate([{ boxShadow: 'inset 0 0 0 3px #e03131' }, { boxShadow: 'inset 0 0 0 3px rgba(224,49,49,0)' }], { duration: 1300, iterations: 2 });
}
function currentViols() {
  var staff = staffList();
  if (!hasAny()) return [];
  var m = month(curYM);
  var days = daysInYM(curYM);
  var schedule = {};
  staff.forEach(function (p) {
    var codes = (m.codes[p.id] || []).slice();
    for (var i = 0; i < days; i++) if (!codes[i]) codes[i] = 'O';
    schedule[p.id] = codes.slice(0, days);
  });
  return E.validate(schedule, staff, engineConfig(curYM));
}
function currentViolMap() {
  var map = {};
  currentViols().forEach(function (v) {
    if (v.pid) map[v.pid + '_' + v.day] = true;
  });
  return map;
}
function renderBanner() {
  var b = document.getElementById('banner');
  if (!hasAny()) { b.className = ''; b.style.display = 'none'; return; }
  b.style.display = '';
  var v = currentViols();
  if (!v.length) {
    b.className = 'ok';
    b.innerHTML = '✅ 규칙 위반이 없습니다. 이대로 쓰셔도 좋아요!';
  } else {
    b.className = 'bad';
    var list = v.slice(0, 4).map(function (x) {
      if (x.pid) return '<span class="viol-item" onclick="jumpTo(\'' + x.pid + '\',' + x.day + ')">· ' + x.msg + ' →</span>';
      return '<span>· ' + x.msg + '</span>';
    }).join('<br>');
    b.innerHTML = '⚠️ 확인이 필요한 곳이 <b>' + v.length + '건</b> 있어요.<br>' + list + (v.length > 4 ? '<br>…외 ' + (v.length - 4) + '건' : '');
  }
}
function renderStats() {
  var staff = staffList();
  var el = document.getElementById('statArea');
  if (!hasAny()) { el.innerHTML = ''; return; }
  var m = month(curYM);
  var days = daysInYM(curYM);
  var schedule = {};
  staff.forEach(function (p) {
    var codes = (m.codes[p.id] || []).slice();
    for (var i = 0; i < days; i++) if (!codes[i]) codes[i] = 'O';
    schedule[p.id] = codes.slice(0, days);
  });
  var rep = E.report(schedule, staff, engineConfig(curYM));
  var html = '<h2>공평하게 나눠졌는지 확인 <span class="hint">— 구성원에게 그대로 보여주셔도 됩니다</span></h2>' +
    '<table class="stats"><tr><th>이름</th><th>데이</th><th>이브닝</th><th>나이트</th><th>오프</th><th>주말 근무</th><th>나이트 (3개월 누적)</th></tr>';
  rep.forEach(function (r) {
    html += '<tr><td><b>' + esc(r.name) + '</b></td>' +
      '<td><span class="pill pd">' + r.D + '</span></td>' +
      '<td><span class="pill pe">' + r.E + '</span></td>' +
      '<td><span class="pill pn">' + r.N + '</span></td>' +
      '<td><span class="pill po">' + r.O + '</span></td>' +
      '<td>' + r.weekend + '</td><td>' + r.totalN + '</td></tr>';
  });
  html += '</table>';
  el.innerHTML = html;
}

/* ---- 선택판 ---- */
var pickerTarget = null;
function tapCell(ev, pid, d) {
  var pk = document.getElementById('picker');
  pickerTarget = { pid: pid, d: d };
  var p = staffList().filter(function (x) { return x.id === pid; })[0];
  pk.innerHTML = '<div class="who"><b>' + esc(p ? p.name : '') + '</b> · ' + ymParts(curYM).m + '월 ' + d + '일</div>' +
    '<div class="row">' +
    '<button class="pk-D" onclick="pickCode(\'D\')">D<br><span style="font-size:12px">데이</span></button>' +
    '<button class="pk-E" onclick="pickCode(\'E\')">E<br><span style="font-size:12px">이브닝</span></button>' +
    '<button class="pk-N" onclick="pickCode(\'N\')">N<br><span style="font-size:12px">나이트</span></button>' +
    '<button class="pk-O" onclick="pickCode(\'O\')">－<br><span style="font-size:12px">오프</span></button>' +
    '<button class="pk-W" onclick="pickCode(\'W\')">★<br><span style="font-size:12px">희망</span></button>' +
    '<button class="pk-X" onclick="pickCode(\'\')">✕<br><span style="font-size:12px">지움</span></button>' +
    '</div>';
  pk.style.display = 'block';
  var rect = ev.target.getBoundingClientRect();
  var pkW = 410;
  var x = Math.min(rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - pkW);
  pk.style.left = Math.max(8, x) + 'px';
  pk.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  ev.stopPropagation();
}
function hidePicker() {
  document.getElementById('picker').style.display = 'none';
  pickerTarget = null;
}
document.addEventListener('click', function (ev) {
  var pk = document.getElementById('picker');
  if (pk.style.display === 'block' && !pk.contains(ev.target)) hidePicker();
});
function pickCode(code) {
  if (!pickerTarget) return;
  setCell(pickerTarget.pid, pickerTarget.d, code);
  hidePicker();
}
function setCell(pid, d, code) {
  var m = month(curYM);
  pushUndo();
  if (code === 'W') {
    m.wish[pid] = m.wish[pid] || [];
    var i = m.wish[pid].indexOf(d);
    if (i >= 0) m.wish[pid].splice(i, 1); else m.wish[pid].push(d);
  } else {
    m.codes[pid] = m.codes[pid] || [];
    m.codes[pid][d - 1] = code;
    if (!code) {
      var w = m.wish[pid] || [];
      var i = w.indexOf(d);
      if (i >= 0) w.splice(i, 1);
    }
  }
  save(); renderHome();
}

/* ---- 되돌리기 ---- */
function pushUndo() {
  var m = month(curYM);
  undoStack.push(JSON.stringify({ ym: curYM, codes: m.codes, wish: m.wish }));
  if (undoStack.length > 30) undoStack.shift();
}
function undo() {
  hidePicker();
  if (!undoStack.length) { alert('되돌릴 내용이 없어요.'); return; }
  var s = JSON.parse(undoStack.pop());
  var m = month(s.ym);
  m.codes = s.codes; m.wish = s.wish;
  curYM = s.ym;
  save(); renderMonthLabel(); renderHome();
}

/* ---- 자동 생성 ---- */
function collectLocked(cfg) {
  var m = month(curYM);
  var locks = m.locks || {};
  var locked = {};
  staffList().forEach(function (p) {
    if (!locks[p.id]) return;
    var codes = (m.codes[p.id] || []).slice();
    if (!codes.some(function (c) { return c; })) return;
    for (var i = 0; i < cfg.days; i++) if (!codes[i]) codes[i] = 'O';
    locked[p.id] = codes.slice(0, cfg.days);
  });
  return locked;
}
function generate() {
  hidePicker();
  var staff = staffList();
  if (!staff.length) { alert('먼저 우리 병동 사람들을 등록해주세요.'); showTab('ward'); return; }
  pushUndo();
  var cfg = engineConfig(curYM);
  cfg.locked = collectLocked(cfg);
  var lockedCount = Object.keys(cfg.locked).length;
  var maxAtt = 1500, att = 0, best = null, seed = Date.now() % 100000, t0 = Date.now();
  var prog = document.getElementById('genProgress');
  var bar = document.getElementById('genProgBar');
  var lbl = document.getElementById('genProgLbl');
  var info = document.getElementById('genInfo');
  info.textContent = '';
  prog.className = 'on';
  bar.style.width = '0%';
  function finish(result) {
    prog.className = '';
    if (!result) {
      alert('이 조건으로는 근무표를 만들 수 없었어요.\n규칙에서 필요한 인원 수를 줄이거나, 같은 날짜에 몰린 희망 오프를 나눠보세요.' + (lockedCount ? '\n잠긴 사람을 일부 풀어보셔도 좋아요.' : ''));
      return;
    }
    var m = month(curYM);
    staff.forEach(function (p) { m.codes[p.id] = result.schedule[p.id]; });
    save();
    renderHome();
    info.textContent = '완성! (' + ((Date.now() - t0) / 1000).toFixed(1) + '초) ' +
      (lockedCount ? '🔒 잠근 ' + lockedCount + '명은 그대로 두었어요. ' : '') + '맘에 안 들면 「다시 만들기」를 누르세요.';
    toast('근무표 초안이 완성됐어요 🌙');
  }
  function batch() {
    var end = Math.min(att + 40, maxAtt);
    for (; att < end; att++) {
      var r = E.attempt(staff, cfg, seed, att);
      if (r) {
        if (r.violations.length === 0) { finish(r); return; }
        if (!best || r.violations.length < best.violations.length) best = r;
      }
    }
    bar.style.width = Math.round(att / maxAtt * 100) + '%';
    lbl.textContent = maxAtt.toLocaleString() + '번 중 ' + att.toLocaleString() + '번째 조합을 찾는 중…';
    if (att < maxAtt) setTimeout(batch, 0); else finish(best);
  }
  setTimeout(batch, 30);
}

/* ---- 인원 ---- */
function renderStaff() {
  var el = document.getElementById('staffList');
  var staff = staffList();
  el.innerHTML = staff.map(function (p, i) {
    return '<div class="staffrow"><span class="nm"><b>' + esc(p.name) + '</b></span>' +
      '<select onchange="chgType(' + i + ', this.value)">' +
      ['three', 'night', 'day'].map(function (t) {
        return '<option value="' + t + '"' + (p.type === t ? ' selected' : '') + '>' + typeNames[t] + '</option>';
      }).join('') + '</select>' +
      '<button class="btn warn" onclick="delStaff(' + i + ')">삭제</button></div>';
  }).join('') || '<p class="hint">아직 등록된 사람이 없어요.</p>';
  document.getElementById('sampleHint').style.display = staff.length ? 'none' : '';
}
function addStaff() {
  var name = document.getElementById('newName').value.trim();
  if (!name) { alert('이름을 입력해주세요.'); return; }
  staffList().push({ id: 'p' + Date.now() + Math.floor(Math.random() * 1000), name: name, type: document.getElementById('newType').value });
  document.getElementById('newName').value = '';
  save(); renderStaff();
  toast(name + ' 님을 추가했어요');
}
function trySample() {
  var names3 = ['김영희', '이순자', '박미경', '최정숙', '정혜란', '강민지', '조수연', '윤서현'];
  var namesN = ['한나래', '오지은'];
  var namesD = ['임채원', '신보라'];
  names3.forEach(function (n) { staffList().push({ id: 'p' + Date.now() + Math.floor(Math.random() * 100000), name: n, type: 'three' }); });
  namesN.forEach(function (n) { staffList().push({ id: 'p' + Date.now() + Math.floor(Math.random() * 100000), name: n, type: 'night' }); });
  namesD.forEach(function (n) { staffList().push({ id: 'p' + Date.now() + Math.floor(Math.random() * 100000), name: n, type: 'day' }); });
  save();
  toast('예시 인원 12명을 넣었어요');
  showTab('home');
}
function chgType(i, t) { staffList()[i].type = t; save(); renderStaff(); toast('바꿨어요 ✓'); }
function delStaff(i) {
  var p = staffList()[i];
  if (!confirm(p.name + ' 님을 삭제할까요?')) return;
  staffList().splice(i, 1);
  save(); renderStaff();
}

/* ---- 규칙 (자동 저장) ---- */
var ruleIds = ['r_wd_D', 'r_wd_E', 'r_wd_N', 'r_we_D', 'r_we_E', 'r_we_N', 'r_maxWork', 'r_maxN', 'r_offAfterN', 'r_backward'];
function renderRules() {
  var r = rules();
  document.getElementById('r_wd_D').value = r.wd.D;
  document.getElementById('r_wd_E').value = r.wd.E;
  document.getElementById('r_wd_N').value = r.wd.N;
  document.getElementById('r_we_D').value = r.we.D;
  document.getElementById('r_we_E').value = r.we.E;
  document.getElementById('r_we_N').value = r.we.N;
  document.getElementById('r_maxWork').value = r.maxWork;
  document.getElementById('r_maxN').value = r.maxN;
  document.getElementById('r_offAfterN').value = r.offAfterN;
  document.getElementById('r_backward').value = r.backward;
}
function numVal(id, fallback) {
  var n = parseInt(document.getElementById(id).value, 10);
  return isNaN(n) ? fallback : n;
}
function saveRulesAuto() {
  var r = rules();
  r.wd.D = numVal('r_wd_D', r.wd.D);
  r.wd.E = numVal('r_wd_E', r.wd.E);
  r.wd.N = numVal('r_wd_N', r.wd.N);
  r.we.D = numVal('r_we_D', r.we.D);
  r.we.E = numVal('r_we_E', r.we.E);
  r.we.N = numVal('r_we_N', r.we.N);
  r.maxWork = numVal('r_maxWork', r.maxWork);
  r.maxN = numVal('r_maxN', r.maxN);
  r.offAfterN = numVal('r_offAfterN', r.offAfterN);
  r.backward = numVal('r_backward', r.backward);
  save();
  toast('규칙이 저장됐어요 ✓');
}
function bindRules() {
  ruleIds.forEach(function (id) {
    document.getElementById(id).addEventListener('change', saveRulesAuto);
  });
}

/* ---- 보관함 ---- */
/* ---- 서버 연동 화면 ---- */
function cloudErrMsg(err) {
  var m = (err && err.message) || '';
  if (m.indexOf('Invalid login credentials') >= 0) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (m.indexOf('already registered') >= 0) return '이미 가입된 이메일이에요. 로그인해주세요.';
  if (m.indexOf('at least 6 characters') >= 0) return '비밀번호는 6자 이상으로 해주세요.';
  if (m.indexOf('valid email') >= 0 || m.indexOf('invalid format') >= 0) return '이메일 주소를 다시 확인해주세요.';
  if (m.indexOf('Email not confirmed') >= 0) return '가입 확인 메일을 먼저 눌러주세요. 메일함을 확인해보세요.';
  if (m.indexOf('Failed to fetch') >= 0) return '인터넷 연결을 확인해주세요.';
  return '잠시 후 다시 시도해주세요. (' + m + ')';
}
function renderCloudCard() {
  var card = document.getElementById('cloudCard');
  if (!window.Cloud || !Cloud.enabled()) { card.style.display = 'none'; return; }
  card.style.display = '';
  var body = document.getElementById('cloudBody');
  var u = Cloud.getUser();
  if (!u) {
    body.innerHTML =
      '<p>로그인하면 폰·컴퓨터 어디서든 <b>같은 근무표</b>를 볼 수 있어요.<br>' +
      '<span class="hint">로그인하지 않아도 이 기기에서는 그대로 쓸 수 있습니다.</span></p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="text" id="cloudEmail" placeholder="이메일" style="width:220px" autocomplete="email">' +
      '<input type="password" id="cloudPw" placeholder="비밀번호" style="width:160px;font-size:19px;padding:10px 12px;border:1.5px solid var(--line);border-radius:12px;font-family:inherit">' +
      '</div>' +
      '<div class="toolbar" style="margin-top:6px">' +
      '<button class="btn big" onclick="cloudLogin()">로그인</button>' +
      '<button class="btn gray" onclick="cloudSignup()">처음이면 가입하기</button>' +
      '<span class="hint" id="cloudMsg"></span>' +
      '</div>';
  } else {
    var t = Cloud.getLastSync();
    body.innerHTML =
      '<p><b>' + esc(u.email) + '</b> 님으로 로그인되어 있어요.<br>' +
      '<span class="hint">바뀐 내용은 자동으로 서버에 저장됩니다.' +
      (t ? ' 마지막 저장: ' + t.getHours() + '시 ' + String(t.getMinutes()).padStart(2, '0') + '분' : '') + '</span></p>' +
      '<div class="toolbar"><button class="btn gray" onclick="cloudLogout()">로그아웃</button></div>';
  }
}
function cloudMsg(t) { var el = document.getElementById('cloudMsg'); if (el) el.textContent = t; }
function cloudLogin() {
  var em = document.getElementById('cloudEmail').value.trim();
  var pw = document.getElementById('cloudPw').value;
  if (!em || !pw) { cloudMsg('이메일과 비밀번호를 넣어주세요.'); return; }
  cloudMsg('로그인 중…');
  Cloud.signIn(em, pw).then(function (res) {
    if (res.error) { cloudMsg(cloudErrMsg(res.error)); return; }
    /* 로그인 성공 → onChange에서 동기화 처리 */
  });
}
function cloudSignup() {
  var em = document.getElementById('cloudEmail').value.trim();
  var pw = document.getElementById('cloudPw').value;
  if (!em || !pw) { cloudMsg('이메일과 비밀번호를 넣어주세요.'); return; }
  if (pw.length < 6) { cloudMsg('비밀번호는 6자 이상으로 해주세요.'); return; }
  cloudMsg('가입 중…');
  Cloud.signUp(em, pw).then(function (res) {
    if (res.error) { cloudMsg(cloudErrMsg(res.error)); return; }
    if (res.data && res.data.user && !res.data.session) {
      cloudMsg('확인 메일을 보냈어요. 메일함에서 확인 후 로그인해주세요.');
    }
  });
}
function cloudLogout() {
  Cloud.signOut().then(function () { toast('로그아웃했어요'); renderCloudCard(); });
}
function cloudSyncOnLogin() {
  Cloud.pull().then(function (res) {
    if (res.error) { toast('서버에서 불러오지 못했어요'); renderCloudCard(); return; }
    var server = res.data && res.data.data;
    var localAt = db._updatedAt || 0;
    var serverAt = (server && server._updatedAt) || 0;
    if (!server) {
      /* 서버가 비어 있음 → 이 기기 내용을 올림 */
      Cloud.push(db).then(function () { toast('이 기기 내용을 서버에 올렸어요 ☁'); renderCloudCard(); });
    } else if (serverAt > localAt) {
      db = server;
      Store.save(db);
      curYM = db.currentMonth || curYM;
      renderMonthLabel(); renderRules(); showTab('home');
      toast('서버의 최신 내용을 불러왔어요 ☁');
      renderCloudCard();
    } else {
      Cloud.push(db).then(function () { toast('서버에 저장했어요 ☁'); renderCloudCard(); });
    }
  });
}

function renderArchive() {
  var el = document.getElementById('histList');
  var months = Object.keys(db.months || {}).sort().reverse();
  el.innerHTML = months.filter(function (ym) {
    return staffList().some(function (p) { return ((db.months[ym].codes || {})[p.id] || []).some(function (c) { return c; }); });
  }).map(function (ym) {
    var p = ymParts(ym);
    return '<div class="staffrow"><span class="nm">' + p.y + '년 ' + p.m + '월</span>' +
      '<button class="btn gray" onclick="goMonth(\'' + ym + '\')">보기</button></div>';
  }).join('') || '<p class="hint">아직 기록이 없어요.</p>';
}
function goMonth(ym) { curYM = ym; save(); renderMonthLabel(); showTab('home'); }
function exportData() {
  var blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '엄만달_백업_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  toast('백업 파일을 저장했어요 💾');
}
function importData(ev) {
  var f = ev.target.files[0];
  if (!f) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var data = JSON.parse(reader.result);
      if (!confirm('지금 내용을 백업 파일 내용으로 바꿀까요?')) return;
      db = data; save();
      curYM = db.currentMonth || curYM;
      renderMonthLabel(); showTab('home');
      toast('백업을 불러왔어요 📂');
    } catch (e) { alert('파일을 읽을 수 없어요. 엄만달에서 저장한 백업 파일인지 확인해주세요.'); }
  };
  reader.readAsText(f);
  ev.target.value = '';
}

/* ---- 이미지로 저장 ---- */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function exportImage() {
  var staff = staffList();
  if (!staff.length || !hasAny()) { alert('먼저 근무표를 만들어주세요.'); return; }
  var days = daysInYM(curYM), fw = firstWeekdayYM(curYM), m = month(curYM), pt = ymParts(curYM);
  var wdNames = ['일', '월', '화', '수', '목', '금', '토'];
  var codeColors = { D: '#2f9e44', E: '#e8590c', N: '#3b5bdb' };
  var FF = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  var S = 2;
  var left = 20, top = 76;
  var nameW = 92, cntW = 122, cellW = 34, cellH = 32, gap = 3, headH = 36, cntRowH = 24;
  var rows = staff.length;
  var W = left * 2 + nameW + gap + days * (cellW + gap) + cntW;
  var H = top + headH + gap + rows * (cellH + gap) + 10 + 3 * (cntRowH + gap) + 36;
  var cv = document.createElement('canvas');
  cv.width = W * S; cv.height = H * S;
  var ctx = cv.getContext('2d');
  ctx.scale(S, S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#322e3c';
  ctx.font = '800 24px ' + FF;
  ctx.fillText(pt.y + '년 ' + pt.m + '월 근무표', left, 30);
  ctx.fillStyle = '#948e9e';
  ctx.font = '600 13px ' + FF;
  ctx.fillText('D 데이 · E 이브닝 · N 나이트 · － 오프 · ★ 희망 오프', left, 56);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#aaa4bb';
  ctx.font = '700 14px ' + FF;
  ctx.fillText('🌙 엄만달', W - left, 30);
  function colX(d) { return left + nameW + gap + (d - 1) * (cellW + gap); }
  var cntX = colX(days + 1) + 4;
  /* 머리줄 */
  ctx.textAlign = 'center';
  for (var d = 1; d <= days; d++) {
    var wd = (fw + d - 1) % 7;
    var wk = (wd === 0 || wd === 6);
    ctx.fillStyle = wk ? '#e03131' : '#7b7590';
    ctx.font = '700 13px ' + FF;
    ctx.fillText(String(d), colX(d) + cellW / 2, top + 10);
    ctx.font = '600 11px ' + FF;
    ctx.fillText(wdNames[wd], colX(d) + cellW / 2, top + 26);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7b7590';
  ctx.font = '600 12px ' + FF;
  ctx.fillText('이름', left, top + 18);
  ctx.fillText('D · E · N · 오프', cntX, top + 18);
  /* 사람별 줄 */
  var dayCnt = [];
  for (var d = 0; d <= days; d++) dayCnt.push({ D: 0, E: 0, N: 0 });
  staff.forEach(function (p, i) {
    var y = top + headH + gap + i * (cellH + gap);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#322e3c';
    ctx.font = '700 14px ' + FF;
    ctx.fillText(p.name, left, y + cellH / 2);
    var cnt = { D: 0, E: 0, N: 0, O: 0 };
    for (var d = 1; d <= days; d++) {
      var c = cellCode(p.id, d) || 'O';
      var w = isWish(p.id, d);
      if (dayCnt[d][c] !== undefined) dayCnt[d][c]++;
      cnt[c]++;
      var x = colX(d);
      var bg, tx, disp;
      if (c === 'O') { bg = w ? '#fff3d0' : '#efede7'; tx = w ? '#8a6d00' : '#948e9e'; disp = w ? '★' : '－'; }
      else { bg = codeColors[c]; tx = '#ffffff'; disp = c; }
      ctx.fillStyle = bg;
      roundRect(ctx, x, y, cellW, cellH, 7);
      ctx.fill();
      ctx.fillStyle = tx;
      ctx.textAlign = 'center';
      ctx.font = '800 15px ' + FF;
      ctx.fillText(disp, x + cellW / 2, y + cellH / 2 + 1);
    }
    /* 개수 */
    ctx.textAlign = 'left';
    ctx.font = '700 13px ' + FF;
    var cx = cntX;
    [['D', '#2f9e44'], ['E', '#e8590c'], ['N', '#3b5bdb'], ['O', '#948e9e']].forEach(function (pair) {
      ctx.fillStyle = pair[1];
      ctx.fillText(String(cnt[pair[0]]), cx, y + cellH / 2);
      cx += 30;
    });
  });
  /* 날짜별 인원 확인 줄 */
  var r = rules();
  var baseY = top + headH + gap + rows * (cellH + gap) + 10;
  [['D', '데이 인원'], ['E', '이브닝 인원'], ['N', '나이트 인원']].forEach(function (pair, ri) {
    var y = baseY + ri * (cntRowH + gap);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7b7590';
    ctx.font = '600 12px ' + FF;
    ctx.fillText(pair[1], left, y + cntRowH / 2);
    for (var d = 1; d <= days; d++) {
      var needSet = E.isWeekend(d, fw) ? r.we : r.wd;
      var ok = dayCnt[d][pair[0]] === needSet[pair[0]];
      ctx.fillStyle = ok ? '#e9f9ee' : '#ffe3e3';
      roundRect(ctx, colX(d), y, cellW, cntRowH, 5);
      ctx.fill();
      ctx.fillStyle = ok ? '#2b8a3e' : '#c22525';
      ctx.textAlign = 'center';
      ctx.font = '700 12px ' + FF;
      ctx.fillText(String(dayCnt[d][pair[0]]), colX(d) + cellW / 2, y + cntRowH / 2 + 1);
      ctx.textAlign = 'left';
    }
  });
  ctx.fillStyle = '#aaa4bb';
  ctx.font = '600 12px ' + FF;
  ctx.textAlign = 'center';
  ctx.fillText('엄만달로 1분 만에 만들었어요 · 인터넷 없이 동작하는 근무표 앱', W / 2, H - 16);
  cv.toBlob(function (blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '엄만달_' + pt.y + '년' + pt.m + '월.png';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    toast('근무표 이미지를 저장했어요 📤');
  });
}

/* ---- 인쇄 ---- */
function printSchedule() {
  if (!hasAny()) { alert('먼저 근무표를 만들어주세요.'); return; }
  renderMonthLabel();
  window.print();
}

/* ---- 토스트 ---- */
var toastTimer = null;
function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = ''; }, 2000);
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ---- 시작 ---- */
renderMonthLabel();
renderRules();
bindRules();
showTab('home');
if (window.Cloud && Cloud.enabled()) {
  Cloud.onChange(function (event, userChanged) {
    if (event === 'SIGNED_IN' && userChanged) cloudSyncOnLogin();
    else renderCloudCard();
  });
  Cloud.init();
}
