/* ===== 엄만달 웹앱 v4 — 화면 로직 (배정 엔진 v2 통합) ===== */
var E = window.UmmandalEngine2;
var db = Store.load();
var now = new Date();
var curYM = db.currentMonth || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
var undoStack = [];
var typeNames = { three: '3교대', night: '나이트 전담', day: '평일 상근' };
var groupNames = { RN: '간호사', NA: '조무사' };
var prefNames = { '': '자동', D: '데이 위주', E: '이브닝 위주' };
/* 셀 표시: 근무 5종 + 휴무 4종 */
var codeDisp = { D: 'D', MD: 'MD', E: 'E', E2: 'E2', N: 'N', O: '－', V: '휴', CO: '대', EDU: '교' };
var codeLabels = { D: '데이', MD: '미들데이', E: '이브닝', E2: '이브닝2', N: '나이트', O: '오프', V: '연차', CO: '대휴', EDU: '교육' };
function staffGroup(p) { return p.group === 'NA' ? 'NA' : 'RN'; }
function groupsPresent() {
  var has = { RN: false, NA: false };
  staffList().forEach(function (p) { has[staffGroup(p)] = true; });
  return ['RN', 'NA'].filter(function (g) { return has[g]; });
}
function groupStaff(g) { return staffList().filter(function (p) { return staffGroup(p) === g; }); }

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
  var m = db.months[ym];
  m.wish = m.wish || {};
  m.codes = m.codes || {};
  m.pins = m.pins || {};          // 선입력(사용자가 손으로 찍은 셀) — 재생성에도 불가침
  m.holidays = m.holidays || [];  // 이 달의 공휴일 일자
  return m;
}
/* 규칙 v2: 직군별 [최소,최대] 범위. 구 db.rules는 구버전 클라이언트 호환을 위해 남겨둔다(더는 안 씀). */
function rules2() {
  if (!db.rules2) {
    var old = db.rules || { wd: { D: 3, E: 3, N: 2 }, we: { D: 3, E: 2, N: 2 }, maxWork: 5, maxN: 3, offAfterN: 2, backward: 1 };
    function rr(v) { return [v, v]; }
    db.rules2 = {
      groups: {
        RN: {
          wd: { D: rr(old.wd.D), E: rr(old.wd.E), N: rr(old.wd.N) },
          hd: { D: rr(old.we.D), E: rr(old.we.E), N: rr(old.we.N) }
        },
        /* NA 기본값: 기초자료_2병동_2026-06.md §9 하한표 */
        NA: { wd: { D: [1, 2], E: [0, 1], N: [1, 1] }, hd: { D: [1, 1], E: [0, 0], N: [1, 1] } }
      },
      maxWork: old.maxWork, maxN: old.maxN, offAfterN: old.offAfterN, backward: old.backward
    };
  }
  return db.rules2;
}
function staffList() { db.staff = db.staff || []; return db.staff; }
function isRestDayApp(d, ym) {
  var m = month(ym || curYM);
  return E.isWeekend(d, firstWeekdayYM(ym || curYM)) || m.holidays.indexOf(d) >= 0;
}

function buildHistory(ym) {
  var hist = {};
  staffList().forEach(function (p) { hist[p.id] = { n: 0, weekend: 0, lastCodes: [] }; });
  [2, 1].forEach(function (back) {
    var pm = prevYM(ym, back);
    var rec = (db.months || {})[pm];
    if (!rec || !rec.codes) return;
    var fw = firstWeekdayYM(pm);
    var hd = rec.holidays || [];
    staffList().forEach(function (p) {
      var codes = rec.codes[p.id];
      if (!codes || !codes.length) return;
      codes.forEach(function (c, i) {
        if (E.fam(c) === 'N') hist[p.id].n++;
        if ((E.isWeekend(i + 1, fw) || hd.indexOf(i + 1) >= 0) && c && E.fam(c)) hist[p.id].weekend++;
      });
      if (back === 1) hist[p.id].lastCodes = codes.slice(-5).map(function (c) { return c || 'O'; });
    });
  });
  return hist;
}
/* 선입력 수집: 손으로 찍은 셀(pins) + 잠근 사람의 전체 행 */
function collectPre(ym, gStaff) {
  var m = month(ym);
  var days = daysInYM(ym);
  var locks = m.locks || {};
  var pre = {};
  gStaff.forEach(function (p) {
    var row = {};
    var pins = m.pins[p.id] || {};
    Object.keys(pins).forEach(function (d) { row[d] = pins[d]; });
    if (locks[p.id]) {
      var codes = m.codes[p.id] || [];
      for (var d = 1; d <= days; d++) if (row[d] === undefined) row[d] = codes[d - 1] || 'O';
    }
    if (Object.keys(row).length) pre[p.id] = row;
  });
  return pre;
}
function engineConfig(ym, g) {
  var r = rules2();
  var gr = r.groups[g] || r.groups.RN;
  var m = month(ym);
  var gStaff = groupStaff(g);
  var wish = {};
  gStaff.forEach(function (p) { if (m.wish[p.id] && m.wish[p.id].length) wish[p.id] = m.wish[p.id]; });
  var nightCount = gStaff.filter(function (p) { return p.type === 'night'; }).length;
  var maxNmin = Math.max(gr.wd.N[0], gr.hd.N[0]);
  return {
    days: daysInYM(ym), firstWeekday: firstWeekdayYM(ym), holidays: m.holidays.slice(),
    required: {
      weekday: { D: gr.wd.D.slice(), E: gr.wd.E.slice(), N: gr.wd.N.slice() },
      holiday: { D: gr.hd.D.slice(), E: gr.hd.E.slice(), N: gr.hd.N.slice() }
    },
    maxConsecWork: r.maxWork, maxConsecN: r.maxN, offAfterNights: r.offAfterN,
    forbidBackward: !!+r.backward,
    /* 전담이 나이트 수요를 홀로 감당 못 하는 구성(예시 병동 등)이면 3교대도 나이트 허용 */
    allowGenericNight: nightCount < 2 * maxNmin,
    wishOffs: wish, history: buildHistory(ym),
    preAssigned: collectPre(ym, gStaff), maxAttempts: 1500
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
  var r = rules2();
  var gs = groupsPresent();
  var multi = gs.length > 1;
  var html = '<table class="duty"><tr><th class="name">이름</th><th class="cntcol">D·E·N·오프</th>';
  for (var d = 1; d <= days; d++) {
    var wd = (fw + d - 1) % 7;
    var cls = isRestDayApp(d) ? ' class="wkend"' : '';
    html += '<th' + cls + '>' + d + '<br>' + (m.holidays.indexOf(d) >= 0 ? '휴' : wdNames[wd]) + '</th>';
  }
  html += '</tr>';
  var violMap = currentViolMap();
  gs.forEach(function (g) {
    var gStaff = groupStaff(g);
    var gr = r.groups[g];
    var dayCnt = [];
    for (var d = 0; d <= days; d++) dayCnt.push({ D: 0, E: 0, N: 0 });
    if (multi) html += '<tr class="grouprow"><td colspan="' + (days + 2) + '">' + groupNames[g] + ' (' + g + ')</td></tr>';
    gStaff.forEach(function (p) {
      var cnt = { D: 0, E: 0, N: 0, O: 0 };
      var pins = m.pins[p.id] || {};
      var cellsHtml = '';
      for (var d = 1; d <= days; d++) {
        var c = cellCode(p.id, d);
        var w = isWish(p.id, d);
        var f = E.fam(c);
        if (f) { dayCnt[d][f]++; cnt[f]++; }
        else if (c) cnt.O++;
        var cls = 'cell';
        var disp = '';
        if (!c) { if (w) { cls += ' Wm'; disp = '★'; } }
        else if (f) { cls += ' ' + c; disp = codeDisp[c] + (w ? '★' : ''); }
        else { cls += (c === 'O' && w) ? ' Wm' : ' ' + c; disp = (c === 'O' && w) ? '★' : codeDisp[c]; }
        if (pins[d]) cls += ' pin';
        if (violMap[p.id + '_' + d]) cls += ' viol';
        cellsHtml += '<td id="c_' + p.id + '_' + d + '" class="' + cls + '" onclick="tapCell(event,\'' + p.id + '\',' + d + ')">' + disp + '</td>';
      }
      var lk = !!locks[p.id];
      html += '<tr' + (lk ? ' class="locked"' : '') + '><td class="name">' +
        '<button class="lockbtn" title="잠그면 다시 만들어도 그대로 유지돼요" onclick="toggleLock(event,\'' + p.id + '\')">' + (lk ? '🔒' : '🔓') + '</button>' +
        '<b>' + esc(p.name) + '</b><br><span class="typebadge">' + typeNames[p.type] + (p.pref ? ' · ' + prefNames[p.pref] : '') + '</span></td>' +
        '<td class="cntcol"><span style="color:var(--d)">' + cnt.D + '</span> <span style="color:var(--e)">' + cnt.E +
        '</span> <span style="color:var(--n)">' + cnt.N + '</span> <span style="color:#868e96">' + cnt.O + '</span></td>' +
        cellsHtml + '</tr>';
    });
    if (hasAny()) {
      [['D', '데이'], ['E', '이브닝'], ['N', '나이트']].forEach(function (pair) {
        var code = pair[0];
        html += '<tr class="cntrow"><td class="lbl" colspan="2">' + (multi ? g + ' ' : '') + pair[1] + ' 인원</td>';
        for (var d = 1; d <= days; d++) {
          var needSet = isRestDayApp(d) ? gr.hd : gr.wd;
          var range = needSet[code];
          var ok = dayCnt[d][code] >= range[0] && dayCnt[d][code] <= range[1];
          html += '<td class="' + (ok ? 'good' : 'bad2') + '">' + dayCnt[d][code] + '</td>';
        }
        html += '</tr>';
      });
    }
  });
  html += '</table>';
  area.innerHTML = html;
  var hi = document.getElementById('holidayInput');
  if (hi && document.activeElement !== hi) hi.value = m.holidays.join(', ');
  renderStats();
  renderBanner();
}
function saveHolidays() {
  var hi = document.getElementById('holidayInput');
  var days = daysInYM(curYM);
  var list = hi.value.split(/[,\s]+/).map(function (s) { return parseInt(s, 10); })
    .filter(function (n) { return !isNaN(n) && n >= 1 && n <= days; });
  list = list.filter(function (v, i) { return list.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
  month(curYM).holidays = list;
  save();
  toast(list.length ? '공휴일: ' + list.join(', ') + '일 ✓' : '공휴일 없음으로 저장했어요 ✓');
  renderGrid();
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
function buildSchedule(gStaff) {
  var m = month(curYM);
  var days = daysInYM(curYM);
  var schedule = {};
  gStaff.forEach(function (p) {
    var codes = (m.codes[p.id] || []).slice();
    for (var i = 0; i < days; i++) if (!codes[i]) codes[i] = 'O';
    schedule[p.id] = codes.slice(0, days);
  });
  return schedule;
}
function currentViols() {
  if (!hasAny()) return [];
  var out = [];
  groupsPresent().forEach(function (g) {
    var gStaff = groupStaff(g);
    out = out.concat(E.validate(buildSchedule(gStaff), gStaff, engineConfig(curYM, g)));
  });
  return out;
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
  var el = document.getElementById('statArea');
  if (!hasAny()) { el.innerHTML = ''; return; }
  var html = '<h2>공평하게 나눠졌는지 확인 <span class="hint">— 구성원에게 그대로 보여주셔도 됩니다</span></h2>' +
    '<table class="stats"><tr><th>이름</th><th>데이</th><th>이브닝</th><th>나이트</th><th>오프</th><th>휴가·교육</th><th>휴일 근무</th><th>나이트 (3개월 누적)</th></tr>';
  groupsPresent().forEach(function (g) {
    var gStaff = groupStaff(g);
    var rep = E.report(buildSchedule(gStaff), gStaff, engineConfig(curYM, g));
    rep.forEach(function (r) {
      html += '<tr><td><b>' + esc(r.name) + '</b></td>' +
        '<td><span class="pill pd">' + r.D + '</span></td>' +
        '<td><span class="pill pe">' + r.E + '</span></td>' +
        '<td><span class="pill pn">' + r.N + '</span></td>' +
        '<td><span class="pill po">' + r.O + '</span></td>' +
        '<td>' + (r.V + r.CO + r.EDU) + '</td>' +
        '<td>' + r.weekend + '</td><td>' + r.totalN + '</td></tr>';
    });
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
  pk.innerHTML = '<div class="who"><b>' + esc(p ? p.name : '') + '</b> · ' + ymParts(curYM).m + '월 ' + d + '일 <span class="hint">직접 고른 칸은 📌 고정돼요</span></div>' +
    '<div class="row">' +
    '<button class="pk-D" onclick="pickCode(\'D\')">D<br><span style="font-size:12px">데이</span></button>' +
    '<button class="pk-D" onclick="pickCode(\'MD\')">MD<br><span style="font-size:12px">미들</span></button>' +
    '<button class="pk-E" onclick="pickCode(\'E\')">E<br><span style="font-size:12px">이브닝</span></button>' +
    '<button class="pk-E" onclick="pickCode(\'E2\')">E2<br><span style="font-size:12px">이브닝2</span></button>' +
    '<button class="pk-N" onclick="pickCode(\'N\')">N<br><span style="font-size:12px">나이트</span></button>' +
    '</div><div class="row">' +
    '<button class="pk-O" onclick="pickCode(\'O\')">－<br><span style="font-size:12px">오프</span></button>' +
    '<button class="pk-V" onclick="pickCode(\'V\')">휴<br><span style="font-size:12px">연차</span></button>' +
    '<button class="pk-V" onclick="pickCode(\'CO\')">대<br><span style="font-size:12px">대휴</span></button>' +
    '<button class="pk-V" onclick="pickCode(\'EDU\')">교<br><span style="font-size:12px">교육</span></button>' +
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
    m.pins[pid] = m.pins[pid] || {};
    if (code) m.pins[pid][d] = code;      // 손으로 고른 칸 = 선입력(재생성에도 그대로)
    else {
      delete m.pins[pid][d];
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
  undoStack.push(JSON.stringify({ ym: curYM, codes: m.codes, wish: m.wish, pins: m.pins, holidays: m.holidays }));
  if (undoStack.length > 30) undoStack.shift();
}
function undo() {
  hidePicker();
  if (!undoStack.length) { alert('되돌릴 내용이 없어요.'); return; }
  var s = JSON.parse(undoStack.pop());
  var m = month(s.ym);
  m.codes = s.codes; m.wish = s.wish;
  m.pins = s.pins || {}; m.holidays = s.holidays || [];
  curYM = s.ym;
  save(); renderMonthLabel(); renderHome();
}

/* ---- 자동 생성 (직군별 순차 배치) ---- */
function generate() {
  hidePicker();
  var staff = staffList();
  if (!staff.length) { alert('먼저 우리 병동 사람들을 등록해주세요.'); showTab('ward'); return; }
  var gs = groupsPresent();
  /* 사전 검사: 선입력·희망오프·규칙 모순은 재시도로 못 고치므로 먼저 사유를 보여준다 */
  var preIssues = [];
  var jobs = gs.map(function (g) {
    var gStaff = groupStaff(g);
    var cfg = engineConfig(curYM, g);
    preIssues = preIssues.concat(E.preflight(gStaff, cfg));
    return { g: g, staff: gStaff, cfg: cfg };
  });
  if (preIssues.length) {
    alert('만들기 전에 먼저 고쳐야 할 것이 있어요:\n\n' +
      preIssues.slice(0, 6).map(function (v) { return '· ' + v.msg; }).join('\n') +
      (preIssues.length > 6 ? '\n…외 ' + (preIssues.length - 6) + '건' : ''));
    return;
  }
  pushUndo();
  var perMax = 1500, seed = Date.now() % 100000, t0 = Date.now();
  var totalMax = perMax * jobs.length;
  var prog = document.getElementById('genProgress');
  var bar = document.getElementById('genProgBar');
  var lbl = document.getElementById('genProgLbl');
  var info = document.getElementById('genInfo');
  info.textContent = '';
  prog.className = 'on';
  bar.style.width = '0%';
  var ji = 0, att = 0, doneAtt = 0, best = null;
  var results = {};
  function accept(r) { return r.violations.length === 0 && (r.nightGap || 0) <= 2; }
  function failAll(msg) {
    prog.className = '';
    undoStack.pop();
    alert(msg);
  }
  function finishAll() {
    prog.className = '';
    var m = month(curYM);
    var warn = [];
    jobs.forEach(function (job) {
      var r = results[job.g];
      job.staff.forEach(function (p) { m.codes[p.id] = r.schedule[p.id]; });
      if (r.violations.length) warn.push(groupNames[job.g] + ' ' + r.violations.length + '건');
    });
    save();
    renderHome();
    info.textContent = '완성! (' + ((Date.now() - t0) / 1000).toFixed(1) + '초) ' +
      (warn.length ? '⚠️ 다 지키진 못했어요(' + warn.join(', ') + ') — 빨간 칸을 확인해 주세요. ' : '') +
      '맘에 안 들면 「다시 만들기」를 누르세요.';
    toast(warn.length ? '초안이 나왔어요 — 확인이 필요한 곳이 있어요' : '근무표 초안이 완성됐어요 🌙');
  }
  function batch() {
    var job = jobs[ji];
    var end = Math.min(att + 40, perMax);
    for (; att < end; att++) {
      var r = E.attempt(job.staff, job.cfg, seed + ji * 7, att);
      if (r && r.schedule) {
        if (accept(r)) { results[job.g] = r; break; }
        var key = r.violations.length * 100 + (r.nightGap || 0);
        if (!best || key < best.key) best = { r: r, key: key };
      }
    }
    if (results[job.g] || att >= perMax) {
      if (!results[job.g]) {
        if (best) { results[job.g] = best.r; }
        else {
          failAll('이 조건으로는 ' + groupNames[job.g] + ' 근무표를 만들 수 없었어요.\n' +
            '규칙의 최소 인원을 줄이거나, 같은 날짜에 몰린 희망 오프·선입력을 나눠보세요.');
          return;
        }
      }
      doneAtt += att;
      ji++; att = 0; best = null;
      if (ji >= jobs.length) { finishAll(); return; }
    }
    var cur = doneAtt + att;
    bar.style.width = Math.round(cur / totalMax * 100) + '%';
    lbl.textContent = (jobs.length > 1 ? groupNames[jobs[Math.min(ji, jobs.length - 1)].g] + ' — ' : '') +
      '조합을 찾는 중… (' + cur.toLocaleString() + ')';
    setTimeout(batch, 0);
  }
  setTimeout(batch, 30);
}

/* ---- 인원 ---- */
function renderStaff() {
  var el = document.getElementById('staffList');
  var staff = staffList();
  el.innerHTML = staff.map(function (p, i) {
    return '<div class="staffrow"><span class="nm"><b>' + esc(p.name) + '</b></span>' +
      '<select onchange="chgGroup(' + i + ', this.value)" title="직군">' +
      ['RN', 'NA'].map(function (g) {
        return '<option value="' + g + '"' + (staffGroup(p) === g ? ' selected' : '') + '>' + groupNames[g] + '</option>';
      }).join('') + '</select>' +
      '<select onchange="chgType(' + i + ', this.value)" title="근무 형태">' +
      ['three', 'night', 'day'].map(function (t) {
        return '<option value="' + t + '"' + (p.type === t ? ' selected' : '') + '>' + typeNames[t] + '</option>';
      }).join('') + '</select>' +
      '<select onchange="chgPref(' + i + ', this.value)" title="선호 근무">' +
      ['', 'D', 'E'].map(function (v) {
        return '<option value="' + v + '"' + ((p.pref || '') === v ? ' selected' : '') + '>' + prefNames[v] + '</option>';
      }).join('') + '</select>' +
      '<button class="btn warn" onclick="delStaff(' + i + ')">삭제</button></div>';
  }).join('') || '<p class="hint">아직 등록된 사람이 없어요.</p>';
  document.getElementById('sampleHint').style.display = staff.length ? 'none' : '';
}
function addStaff() {
  var name = document.getElementById('newName').value.trim();
  if (!name) { alert('이름을 입력해주세요.'); return; }
  staffList().push({
    id: 'p' + Date.now() + Math.floor(Math.random() * 1000), name: name,
    type: document.getElementById('newType').value,
    group: document.getElementById('newGroup').value, pref: ''
  });
  document.getElementById('newName').value = '';
  save(); renderStaff();
  toast(name + ' 님을 추가했어요');
}
function chgGroup(i, g) { staffList()[i].group = g; save(); renderStaff(); toast('바꿨어요 ✓'); }
function chgPref(i, v) { staffList()[i].pref = v; save(); renderStaff(); toast('바꿨어요 ✓'); }
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

/* ---- 규칙 (자동 저장, 직군별 범위) ---- */
var RULE_KINDS = [['wd', '평일'], ['hd', '주말·공휴일']];
var RULE_FAMS = [['D', '데이'], ['E', '이브닝'], ['N', '나이트']];
function renderRules() {
  var r = rules2();
  var gs = groupsPresent();
  if (!gs.length) gs = ['RN'];
  var html = gs.map(function (g) {
    var gr = r.groups[g];
    return '<div class="rulegroup">' +
      (gs.length > 1 || g === 'NA' ? '<h3>' + groupNames[g] + '(' + g + ') 하루 인원</h3>' : '<h3>하루 인원</h3>') +
      RULE_KINDS.map(function (kd) {
        return '<div class="rulerow"><span class="lbl">' + kd[1] + '</span>' +
          RULE_FAMS.map(function (fm) {
            var v = gr[kd[0]][fm[0]];
            return fm[1] + ' <input type="number" min="0" max="20" id="r2_' + g + '_' + kd[0] + '_' + fm[0] + '_0" value="' + v[0] + '">' +
              '~<input type="number" min="0" max="20" id="r2_' + g + '_' + kd[0] + '_' + fm[0] + '_1" value="' + v[1] + '">';
          }).join(' ') + '</div>';
      }).join('') + '</div>';
  }).join('') +
    '<p class="hint">최소~최대 인원이에요. 딱 정해진 수면 두 칸에 같은 숫자를 넣으세요.</p>' +
    '<div class="rulerow"><span class="lbl">연속으로 일할 수 있는 최대 일수</span><input type="number" id="r_maxWork" min="1" max="7" value="' + r.maxWork + '"></div>' +
    '<div class="rulerow"><span class="lbl">연속으로 설 수 있는 나이트 최대 개수</span><input type="number" id="r_maxN" min="1" max="5" value="' + r.maxN + '"></div>' +
    '<div class="rulerow"><span class="lbl">나이트가 끝나면 쉬는 날 수</span><input type="number" id="r_offAfterN" min="0" max="3" value="' + r.offAfterN + '"></div>' +
    '<div class="rulerow"><span class="lbl">이브닝 다음날 데이 금지 (역행 금지)</span>' +
    '<select id="r_backward"><option value="1"' + (+r.backward ? ' selected' : '') + '>금지</option><option value="0"' + (+r.backward ? '' : ' selected') + '>허용</option></select></div>';
  document.getElementById('rulesArea').innerHTML = html;
}
function numVal(id, fallback) {
  var el = document.getElementById(id);
  if (!el) return fallback;
  var n = parseInt(el.value, 10);
  return isNaN(n) ? fallback : n;
}
function saveRulesAuto() {
  var r = rules2();
  Object.keys(r.groups).forEach(function (g) {
    RULE_KINDS.forEach(function (kd) {
      RULE_FAMS.forEach(function (fm) {
        var v = r.groups[g][kd[0]][fm[0]];
        v[0] = numVal('r2_' + g + '_' + kd[0] + '_' + fm[0] + '_0', v[0]);
        v[1] = numVal('r2_' + g + '_' + kd[0] + '_' + fm[0] + '_1', v[1]);
        if (v[1] < v[0]) v[1] = v[0];
      });
    });
  });
  r.maxWork = numVal('r_maxWork', r.maxWork);
  r.maxN = numVal('r_maxN', r.maxN);
  r.offAfterN = numVal('r_offAfterN', r.offAfterN);
  r.backward = numVal('r_backward', r.backward);
  save();
  renderRules();
  toast('규칙이 저장됐어요 ✓');
}
function bindRules() {
  document.getElementById('rulesArea').addEventListener('change', saveRulesAuto);
}

/* ---- 보관함 ---- */
/* ---- 서버 연동 화면 (인증 상태 기계) ---- */
function cloudErrMsg(err) {
  var m = (err && err.message) || '';
  var c = (err && err.code) || '';
  if (m.indexOf('Invalid login credentials') >= 0) return '번호(또는 이메일)나 비밀번호가 맞지 않아요.';
  if (m.indexOf('already registered') >= 0 || m.indexOf('User already exists') >= 0) return '이미 가입되어 있어요. 로그인하거나 「비밀번호를 잊었어요」를 눌러주세요.';
  if (m.indexOf('at least 6 characters') >= 0 || c === 'weak_password') return '비밀번호는 6자 이상으로 해주세요.';
  if (m.indexOf('valid email') >= 0 || m.indexOf('invalid format') >= 0) return '주소/번호를 다시 확인해주세요.';
  if (m.indexOf('Email not confirmed') >= 0) return '가입 확인 메일을 먼저 눌러주세요. 메일함을 확인해보세요.';
  if (m.indexOf('Failed to fetch') >= 0) return '인터넷 연결을 확인해주세요.';
  /* 전화 인증 계열 */
  if (c === 'otp_expired' || m.indexOf('expired') >= 0 || m.indexOf('Token has expired') >= 0 || m.indexOf('invalid') >= 0)
    return '인증번호가 맞지 않거나 시간이 지났어요. 「다시 보내기」로 새 번호를 받아주세요.';
  if (c === 'over_sms_send_rate_limit' || m.indexOf('security purposes') >= 0 || m.indexOf('rate limit') >= 0)
    return '문자를 너무 자주 보냈어요. 1분 뒤에 다시 눌러주세요.';
  if (m.indexOf('Signups not allowed for otp') >= 0 || c === 'otp_disabled')
    return '가입된 번호가 아니에요. 번호를 확인하거나 먼저 회원가입을 해주세요.';
  if (c === 'phone_provider_disabled' || m.indexOf('Phone signups are disabled') >= 0 || m.indexOf('phone provider') >= 0)
    return '전화 가입이 아직 열리지 않았어요. 이메일로 가입해주세요.';
  if (m.indexOf('Error sending sms') >= 0 || m.indexOf('sms') >= 0)
    return '문자 발송이 잘 안 됐어요. 잠시 후 다시 시도해주세요.';
  return '잠시 후 다시 시도해주세요. (' + m + ')';
}
var cloudView = 'main';   // main | signup | otp | reset | newpw | emailReset | emailLogin
var authCtx = { phone: null, mode: null, cooldown: 0, timer: null }; // mode: 'signup' | 'reset'
function pwInput(id, ph) {
  return '<input type="password" id="' + id + '" placeholder="' + ph + '" style="width:170px;font-size:19px;padding:10px 12px;border:1.5px solid var(--line);border-radius:12px;font-family:inherit">';
}
function backLink() { return '<p class="hint" style="margin-top:10px"><a class="link" onclick="cloudGoto(\'main\')">← 처음으로</a></p>'; }
function renderCloudCard() {
  var card = document.getElementById('cloudCard');
  if (!window.Cloud || !Cloud.enabled()) { card.style.display = 'none'; return; }
  card.style.display = '';
  var body = document.getElementById('cloudBody');
  var u = Cloud.getUser();
  var phoneOn = Cloud.phoneEnabled();
  if (u && cloudView !== 'newpw') {
    var t = Cloud.getLastSync();
    var who = u.email || (u.phone ? Cloud.phoneDisp('+' + String(u.phone).replace(/^\+/, '')) : '회원');
    body.innerHTML =
      '<p><b>' + esc(who) + '</b> 님으로 로그인되어 있어요.<br>' +
      '<span class="hint">바뀐 내용은 자동으로 서버에 저장됩니다.' +
      (t ? ' 마지막 저장: ' + t.getHours() + '시 ' + String(t.getMinutes()).padStart(2, '0') + '분' : '') + '</span></p>' +
      '<div class="toolbar"><button class="btn gray" onclick="cloudLogout()">로그아웃</button></div>';
    return;
  }
  if (cloudView === 'signup') {
    body.innerHTML =
      '<h3 class="authtitle">회원가입 <span class="hint">— 휴대폰 번호로 가입해요</span></h3>' +
      '<p class="hint">📢 <b>이미 이메일로 가입해서 쓰고 계셨다면</b> 새로 가입하지 마시고 <a class="link" onclick="cloudGoto(\'emailLogin\')">이메일 로그인</a>을 눌러주세요. 새로 가입하면 근무표가 새 계정에 따로 저장돼요.</p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="tel" id="authPhone" placeholder="휴대폰 번호 (010…)" style="width:210px" autocomplete="tel">' +
      pwInput('authPw', '비밀번호 (6자 이상)') + pwInput('authPw2', '비밀번호 다시') +
      '</div>' +
      '<div class="toolbar" style="margin-top:6px">' +
      '<button class="btn big" onclick="cloudPhoneSignup()">📩 인증번호 받기</button>' +
      '<span class="hint" id="cloudMsg"></span></div>' + backLink();
  } else if (cloudView === 'otp') {
    body.innerHTML =
      '<h3 class="authtitle">인증번호 입력</h3>' +
      '<p>' + esc(Cloud.phoneDisp(authCtx.phone)) + ' 번호로 문자를 보냈어요.<br>문자에 적힌 <b>숫자 6자리</b>를 넣어주세요.</p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="tel" id="authOtp" class="otpinput" placeholder="000000" maxlength="6" autocomplete="one-time-code">' +
      '<button class="btn big" onclick="cloudOtpVerify()">확인</button>' +
      '<button class="btn gray" id="resendBtn" onclick="cloudOtpResend()">다시 보내기</button>' +
      '</div>' +
      '<p class="hint" id="cloudMsg">문자가 안 오면 1분쯤 기다렸다가 「다시 보내기」를 눌러주세요.</p>' + backLink();
  } else if (cloudView === 'newpw') {
    body.innerHTML =
      '<h3 class="authtitle">새 비밀번호 만들기</h3>' +
      '<p>본인 확인이 끝났어요. 이제 쓸 <b>새 비밀번호</b>를 정해주세요.</p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      pwInput('authPw', '새 비밀번호 (6자 이상)') + pwInput('authPw2', '한 번 더') +
      '<button class="btn big" onclick="cloudSetNewPw()">바꾸기</button>' +
      '</div><span class="hint" id="cloudMsg"></span>';
  } else if (cloudView === 'reset') {
    body.innerHTML =
      '<h3 class="authtitle">비밀번호 찾기</h3>' +
      '<p>가입할 때 쓴 <b>휴대폰 번호</b>를 넣으면 인증번호를 보내드려요.</p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="tel" id="authPhone" placeholder="휴대폰 번호 (010…)" style="width:210px" autocomplete="tel">' +
      '<button class="btn big" onclick="cloudResetStart()">📩 인증번호 받기</button>' +
      '</div><span class="hint" id="cloudMsg"></span>' +
      '<p class="hint">이메일로 가입하셨나요? → <a class="link" onclick="cloudGoto(\'emailReset\')">이메일로 비밀번호 찾기</a></p>' + backLink();
  } else if (cloudView === 'emailReset') {
    body.innerHTML =
      '<h3 class="authtitle">비밀번호 찾기 (이메일)</h3>' +
      '<p>가입할 때 쓴 <b>이메일</b>을 넣으면 비밀번호를 새로 정할 수 있는 <b>메일</b>을 보내드려요.</p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="text" id="cloudEmail" placeholder="이메일" style="width:220px" autocomplete="email">' +
      '<button class="btn big" onclick="cloudEmailReset()">📮 메일 보내기</button>' +
      '</div><span class="hint" id="cloudMsg"></span>' + backLink();
  } else if (cloudView === 'emailLogin' || (!phoneOn && cloudView === 'main')) {
    body.innerHTML =
      '<p>로그인하면 폰·컴퓨터 어디서든 <b>같은 근무표</b>를 볼 수 있어요.<br>' +
      '<span class="hint">로그인하지 않아도 이 기기에서는 그대로 쓸 수 있습니다.</span></p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="text" id="cloudEmail" placeholder="이메일" style="width:220px" autocomplete="email">' +
      pwInput('cloudPw', '비밀번호') +
      '</div>' +
      '<div class="toolbar" style="margin-top:6px">' +
      '<button class="btn big" onclick="cloudLogin()">로그인</button>' +
      (phoneOn ? '' : '<button class="btn gray" onclick="cloudSignup()">처음이면 가입하기</button>') +
      '<span class="hint" id="cloudMsg"></span>' +
      '</div>' +
      '<p class="hint">' +
      (phoneOn ? '<a class="link" onclick="cloudGoto(\'main\')">← 전화번호로 로그인</a> · ' : '') +
      '비밀번호를 잊으셨나요? → <a class="link" onclick="cloudGoto(\'emailReset\')">비밀번호 찾기</a></p>';
  } else {
    /* main + 전화 인증 켜짐 */
    body.innerHTML =
      '<p>로그인하면 폰·컴퓨터 어디서든 <b>같은 근무표</b>를 볼 수 있어요.</p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="tel" id="authPhone" placeholder="휴대폰 번호 (010…)" style="width:210px" autocomplete="tel">' +
      pwInput('cloudPw', '비밀번호') +
      '</div>' +
      '<div class="toolbar" style="margin-top:6px">' +
      '<button class="btn big" onclick="cloudPhoneLogin()">로그인</button>' +
      '<button class="btn gray" onclick="cloudGoto(\'signup\')">처음이면 회원가입</button>' +
      '<span class="hint" id="cloudMsg"></span>' +
      '</div>' +
      '<p class="hint">비밀번호를 잊으셨나요? → <a class="link" onclick="cloudGoto(\'reset\')">비밀번호 찾기</a>' +
      ' · <a class="link" onclick="cloudGoto(\'emailLogin\')">이메일로 로그인</a></p>';
  }
}
function cloudGoto(v) {
  cloudView = v;
  if (v === 'main') { Cloud.setAuthFlow(false); authCtx.mode = null; stopCooldown(); }
  renderCloudCard();
}
function cloudMsg(t) { var el = document.getElementById('cloudMsg'); if (el) el.textContent = t; }
/* ---- 재전송 쿨다운 ---- */
function startCooldown(sec) {
  stopCooldown();
  authCtx.cooldown = sec;
  authCtx.timer = setInterval(function () {
    authCtx.cooldown--;
    var b = document.getElementById('resendBtn');
    if (b) {
      b.disabled = authCtx.cooldown > 0;
      b.textContent = authCtx.cooldown > 0 ? '다시 보내기 (' + authCtx.cooldown + '초)' : '다시 보내기';
    }
    if (authCtx.cooldown <= 0) stopCooldown();
  }, 1000);
  var b = document.getElementById('resendBtn');
  if (b) { b.disabled = true; b.textContent = '다시 보내기 (' + sec + '초)'; }
}
function stopCooldown() { clearInterval(authCtx.timer); authCtx.timer = null; }
/* ---- 흐름 완료 공통 ---- */
function finishAuthFlow(msg) {
  Cloud.setAuthFlow(false);
  cloudView = 'main';
  authCtx.mode = null;
  stopCooldown();
  if (msg) toast(msg);
  if (Cloud.getUser()) cloudSyncOnLogin(); else renderCloudCard();
}
/* ---- 이메일 로그인/가입/재설정 ---- */
function cloudLogin() {
  var em = document.getElementById('cloudEmail').value.trim();
  var pw = document.getElementById('cloudPw').value;
  if (!em || !pw) { cloudMsg('이메일과 비밀번호를 넣어주세요.'); return; }
  cloudMsg('로그인 중…');
  Cloud.signIn(em, pw).then(function (res) {
    if (res.error) { cloudMsg(cloudErrMsg(res.error)); return; }
    cloudView = 'main';
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
function cloudEmailReset() {
  var em = document.getElementById('cloudEmail').value.trim();
  if (!em) { cloudMsg('이메일을 넣어주세요.'); return; }
  cloudMsg('보내는 중…');
  Cloud.resetEmail(em).then(function (res) {
    if (res.error) { cloudMsg(cloudErrMsg(res.error)); return; }
    cloudMsg('메일을 보냈어요. 메일함에서 「비밀번호 재설정」 링크를 눌러주세요. (몇 분 걸릴 수 있어요)');
  });
}
/* ---- 전화 로그인/가입/재설정 ---- */
function readPhone() {
  var p = Cloud.phoneNorm(document.getElementById('authPhone').value);
  if (!p) { cloudMsg('휴대폰 번호를 확인해주세요 — 010으로 시작하는 11자리예요.'); return null; }
  return p;
}
function cloudPhoneLogin() {
  var p = readPhone(); if (!p) return;
  var pw = document.getElementById('cloudPw').value;
  if (!pw) { cloudMsg('비밀번호를 넣어주세요.'); return; }
  cloudMsg('로그인 중…');
  Cloud.signInPhone(p, pw).then(function (res) {
    if (res.error) { cloudMsg(cloudErrMsg(res.error)); return; }
    cloudView = 'main';
  });
}
function cloudPhoneSignup() {
  var p = readPhone(); if (!p) return;
  var pw = document.getElementById('authPw').value;
  var pw2 = document.getElementById('authPw2').value;
  if (pw.length < 6) { cloudMsg('비밀번호는 6자 이상으로 해주세요.'); return; }
  if (pw !== pw2) { cloudMsg('비밀번호 두 칸이 서로 달라요. 같게 넣어주세요.'); return; }
  cloudMsg('인증번호를 보내는 중…');
  Cloud.setAuthFlow(true);
  authCtx.phone = p; authCtx.mode = 'signup';
  Cloud.signUpPhone(p, pw).then(function (res) {
    if (res.error) { Cloud.setAuthFlow(false); cloudMsg(cloudErrMsg(res.error)); return; }
    if (res.data && res.data.session) { finishAuthFlow('가입 완료! 🎉'); return; } // 전화 확인 꺼진 설정 대비
    cloudView = 'otp';
    renderCloudCard();
    startCooldown(60);
  });
}
function cloudResetStart() {
  var p = readPhone(); if (!p) return;
  cloudMsg('인증번호를 보내는 중…');
  Cloud.setAuthFlow(true);
  authCtx.phone = p; authCtx.mode = 'reset';
  Cloud.sendOtp(p).then(function (res) {
    if (res.error) { Cloud.setAuthFlow(false); cloudMsg(cloudErrMsg(res.error)); return; }
    cloudView = 'otp';
    renderCloudCard();
    startCooldown(60);
  });
}
function cloudOtpResend() {
  if (authCtx.cooldown > 0) return;
  cloudMsg('다시 보내는 중…');
  var job = authCtx.mode === 'signup' ? Cloud.resendOtp(authCtx.phone) : Cloud.sendOtp(authCtx.phone);
  job.then(function (res) {
    if (res.error) { cloudMsg(cloudErrMsg(res.error)); return; }
    cloudMsg('새 인증번호를 보냈어요.');
    startCooldown(60);
  });
}
function cloudOtpVerify() {
  var code = (document.getElementById('authOtp').value || '').replace(/\D/g, '');
  if (code.length !== 6) { cloudMsg('문자에 적힌 숫자 6자리를 넣어주세요.'); return; }
  cloudMsg('확인 중…');
  Cloud.verifyOtp(authCtx.phone, code).then(function (res) {
    if (res.error) { cloudMsg(cloudErrMsg(res.error)); return; }
    if (authCtx.mode === 'reset') { cloudView = 'newpw'; renderCloudCard(); }
    else finishAuthFlow('가입 완료! 🎉 이제 자동으로 저장돼요.');
  });
}
function cloudSetNewPw() {
  var pw = document.getElementById('authPw').value;
  var pw2 = document.getElementById('authPw2').value;
  if (pw.length < 6) { cloudMsg('비밀번호는 6자 이상으로 해주세요.'); return; }
  if (pw !== pw2) { cloudMsg('비밀번호 두 칸이 서로 달라요. 같게 넣어주세요.'); return; }
  cloudMsg('바꾸는 중…');
  Cloud.setPassword(pw).then(function (res) {
    if (res.error) { cloudMsg(cloudErrMsg(res.error)); return; }
    Cloud.signOutOthers().catch(function () { });   // 다른 기기 세션 정리 (실패해도 진행)
    finishAuthFlow('비밀번호를 바꿨어요 ✓ 로그인된 상태예요.');
  });
}
function cloudLogout() {
  Cloud.signOut().then(function () { toast('로그아웃했어요'); cloudView = 'main'; renderCloudCard(); });
}
function cloudSyncOnLogin() {
  Cloud.pull().then(function (res) {
    if (res.error) { toast('서버에서 불러오지 못했어요'); renderCloudCard(); return; }
    var server = res.data && res.data.data;
    var localAt = db._updatedAt || 0;
    var serverAt = (server && server._updatedAt) || 0;
    function isEmptyDb(d) { return !d || !(d.staff && d.staff.length); }
    function adoptServer() {
      db = server;
      Store.save(db);
      curYM = db.currentMonth || curYM;
      renderMonthLabel(); renderRules(); showTab('home');
      toast('서버의 최신 내용을 불러왔어요 ☁');
      renderCloudCard();
    }
    if (!server) {
      /* 서버가 비어 있음 → 이 기기 내용을 올림 */
      Cloud.push(db).then(function () { toast('이 기기 내용을 서버에 올렸어요 ☁'); renderCloudCard(); });
    } else if (isEmptyDb(db) && !isEmptyDb(server)) {
      /* 새 기기(빈 상태)로 로그인 — 시계가 뭐라 하든 서버 데이터를 지킨다 (실데이터 비파괴) */
      adoptServer();
    } else if (serverAt > localAt) {
      adoptServer();
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
  var staff = [];
  groupsPresent().forEach(function (g) { staff = staff.concat(groupStaff(g)); });
  if (!staff.length || !hasAny()) { alert('먼저 근무표를 만들어주세요.'); return; }
  var days = daysInYM(curYM), fw = firstWeekdayYM(curYM), m = month(curYM), pt = ymParts(curYM);
  var gs = groupsPresent();
  var wdNames = ['일', '월', '화', '수', '목', '금', '토'];
  var codeColors = { D: '#2f9e44', MD: '#66a80f', E: '#e8590c', E2: '#f08c00', N: '#3b5bdb' };
  var restDisp = { O: '－', V: '휴', CO: '대', EDU: '교' };
  var FF = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  var S = 2;
  var left = 20, top = 76;
  var nameW = 92, cntW = 122, cellW = 34, cellH = 32, gap = 3, headH = 36, cntRowH = 24;
  var rows = staff.length;
  var W = left * 2 + nameW + gap + days * (cellW + gap) + cntW;
  var H = top + headH + gap + rows * (cellH + gap) + 10 + gs.length * 3 * (cntRowH + gap) + 36;
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
  ctx.fillText('D 데이 · MD 미들 · E/E2 이브닝 · N 나이트 · － 오프 · 휴 연차 · 대 대휴 · 교 교육 · ★ 희망', left, 56);
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
    var wk = isRestDayApp(d);
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
  /* 사람별 줄 (직군 묶음 순서) */
  var r = rules2();
  var dayCntG = {};
  gs.forEach(function (g) {
    dayCntG[g] = [];
    for (var d = 0; d <= days; d++) dayCntG[g].push({ D: 0, E: 0, N: 0 });
  });
  staff.forEach(function (p, i) {
    var y = top + headH + gap + i * (cellH + gap);
    var g = staffGroup(p);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#322e3c';
    ctx.font = '700 14px ' + FF;
    ctx.fillText(p.name, left, y + cellH / 2);
    var cnt = { D: 0, E: 0, N: 0, O: 0 };
    for (var d = 1; d <= days; d++) {
      var c = cellCode(p.id, d) || 'O';
      var w = isWish(p.id, d);
      var f = E.fam(c);
      if (f) { dayCntG[g][d][f]++; cnt[f]++; } else cnt.O++;
      var x = colX(d);
      var bg, tx, disp;
      if (!f) {
        var isO = c === 'O';
        bg = (isO && w) ? '#fff3d0' : (isO ? '#efede7' : '#fde9c8');
        tx = (isO && w) ? '#8a6d00' : (isO ? '#948e9e' : '#9a6700');
        disp = (isO && w) ? '★' : restDisp[c] || '－';
      } else { bg = codeColors[c]; tx = '#ffffff'; disp = c; }
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
  /* 날짜별 인원 확인 줄 (직군별) */
  var baseY = top + headH + gap + rows * (cellH + gap) + 10;
  var ri = 0;
  gs.forEach(function (g) {
    var gr = r.groups[g];
    [['D', '데이 인원'], ['E', '이브닝 인원'], ['N', '나이트 인원']].forEach(function (pair) {
      var y = baseY + ri * (cntRowH + gap);
      ri++;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7b7590';
      ctx.font = '600 12px ' + FF;
      ctx.fillText((gs.length > 1 ? g + ' ' : '') + pair[1], left, y + cntRowH / 2);
      for (var d = 1; d <= days; d++) {
        var needSet = isRestDayApp(d) ? gr.hd : gr.wd;
        var range = needSet[pair[0]];
        var v2 = dayCntG[g][d][pair[0]];
        var ok = v2 >= range[0] && v2 <= range[1];
        ctx.fillStyle = ok ? '#e9f9ee' : '#ffe3e3';
        roundRect(ctx, colX(d), y, cellW, cntRowH, 5);
        ctx.fill();
        ctx.fillStyle = ok ? '#2b8a3e' : '#c22525';
        ctx.textAlign = 'center';
        ctx.font = '700 12px ' + FF;
        ctx.fillText(String(v2), colX(d) + cellW / 2, y + cntRowH / 2 + 1);
        ctx.textAlign = 'left';
      }
    });
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
    if (event === 'PASSWORD_RECOVERY') {
      /* 이메일 재설정 링크로 돌아온 상태 — 새 비밀번호 화면으로 */
      Cloud.setAuthFlow(true);
      cloudView = 'newpw';
      authCtx.mode = 'reset';
      showTab('archive');
      return;
    }
    if (Cloud.inAuthFlow()) return;   // 가입 인증·재설정 진행 중 — 화면을 덮지 않는다
    if (event === 'SIGNED_IN' && userChanged) cloudSyncOnLogin();
    else renderCloudCard();
  });
  Cloud.init();
}
