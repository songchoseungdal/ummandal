/* ===== 엄만달 웹앱 v4 — 화면 로직 (배정 엔진 v2 통합) ===== */
var E = window.UmmandalEngine2;
var db = Store.load();
var now = new Date();
var curYM = db.currentMonth || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
var undoStack = [];
/* 근무 형태. two = 2교대(데이·이브닝만, 나이트 없음) — 어머니 병동이 이 방식(2026-07-20).
   MD·E2 같은 건 데이/이브닝의 변형이라 별도 형태가 아니다. */
var typeNames = { three: '3교대', two: '2교대(데이·이브닝)', night: '나이트 전담', day: '평일 상근' };
var TYPE_ORDER = ['three', 'two', 'night', 'day'];
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
  if (!m.holidays) m.holidays = [];   // 이 달의 공휴일 일자
  /* 법정공휴일 자동 반영 — 사람이 ※ 칸을 저장한 적이 없는 달에만.
     저장하면 holidaysAuto=false가 되어 그 뒤로는 자동 반영이 덮지 않는다.
     자동인 달은 표가 갱신되면(임시공휴일 지정 등) 따라 바뀐다. */
  if (m.holidaysAuto !== false && typeof krHolidayDays === 'function') {
    var auto = krHolidayDays(ym);
    if (auto && auto.join(',') !== m.holidays.join(',')) { m.holidays = auto; m.holidaysAuto = true; }
    else if (auto) m.holidaysAuto = true;
  }
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
  if (t !== 'home') setLoginView(false);   // 다른 탭에서는 로그인 전용 배치를 풀어둔다
  if (t === 'home') renderHome();
  if (t === 'ward') { renderStaff(); renderRules(); }
  if (t === 'archive') { renderArchive(); renderCloudCard(); renderInstallCard(); }
  renderInstallBtn();
  renderBrowserGate();
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
/* 머리글 로그아웃 버튼 — 로그인 상태에서만 표시 */
function renderAcctBtn() {
  var b = document.getElementById('acctBtn');
  if (!b) return;
  var u = window.Cloud && Cloud.enabled() && Cloud.getUser();
  b.style.display = u ? '' : 'none';
  /* AI 분석은 로그인 사용자만 쓸 수 있다. 첫 세팅뿐 아니라 나중에도 다시 쓸 수 있게
     머리글에 상설(2026-07-20) — 서버의 「세팅된 계정 차단」이 폐지되어 재사용이 가능해졌다. */
  var ai = document.getElementById('aiBtn');
  if (ai) ai.style.display = u ? '' : 'none';
}
/* 로그인 화면 전용 배치 — 월 달력·하단 탭·푸터를 감추고 여백을 줄여 한 화면에 담는다.
   (로그인 전에는 달력도 탭도 쓸 데가 없다) */
function setLoginView(on) {
  /* body.className을 통째로 바꾸면 다른 상태 클래스(예: 가로 전체화면 grid-open)가 지워진다 —
     loginview만 토글해 보존한다(2026-07-22). */
  document.body.classList.toggle('loginview', on);
  document.querySelector('header').className = on ? 'authonly' : '';
  var mn = document.getElementById('monthNav');
  if (mn) mn.style.display = on ? 'none' : '';
}
/* 보고 있는 달(과 다음 달)의 공휴일을 서버에서 받아온다 — 받아오면 화면을 다시 그린다.
   대체·임시공휴일이 새로 지정돼도 따라가려면 앱에 박아두면 안 되고 매번 물어봐야 한다. */
function ensureHolidays(ym) {
  if (typeof krFetchYear !== 'function') return;
  krFetchYear(String(ym).slice(0, 4), function (updated) {
    if (!updated) return;
    var m = db.months && db.months[ym];
    if (m && m.holidaysAuto === false) return;   // 사람이 정한 달은 건드리지 않는다
    month(ym);                                    // 새 값으로 다시 채워진다
    save();
    if (document.getElementById('tab-home').style.display !== 'none') renderGrid();
  });
}
function renderHome() {
  renderMonthLabel();
  renderAcctBtn();
  ensureHolidays(curYM);
  var staff = staffList();
  var empty = document.getElementById('homeEmpty');
  var prep = document.getElementById('homePrep');
  var tools = document.getElementById('homeTools');
  var gridCard = document.getElementById('gridCard');
  var loginCard = document.getElementById('homeLoginCard');
  /* 로그인 안 된 상태(처음 연 사람 + 로그아웃 직후)에는 인원 유무와 상관없이 로그인 카드만 보여준다. */
  var showLogin = window.Cloud && Cloud.enabled() && !Cloud.getUser() && !loginSkippedNow;
  setLoginView(showLogin);
  if (showLogin) {
    loginCard.style.display = '';
    empty.style.display = 'none';
    prep.style.display = 'none';
    gridCard.style.display = 'none';
    authTarget = 'homeLoginBody'; cloudView = 'main'; renderAuth();
    return;
  }
  loginCard.style.display = 'none';
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
/* 「로그인 없이 쓰기」는 이번 실행에서만 유효하다(저장하지 않음).
   예전처럼 db.loginSkipped에 영구 저장하면, 한 번 누른 뒤로는 로그아웃해도 로그인 화면이 영영 안 뜬다. */
var loginSkippedNow = false;
function skipLogin() { loginSkippedNow = true; renderHome(); }
function renderPrep() {
  var staff = staffList();
  var m = month(curYM);
  var wishCount = 0;
  staff.forEach(function (p) { wishCount += (m.wish[p.id] || []).length; });
  var p = ymParts(curYM);
  document.getElementById('prepStatus').innerHTML =
    '<span class="okmark">✔</span> 인원 <b>' + staff.length + '명</b> 등록됨 &nbsp;<a class="link" onclick="showTab(\'ward\')">고치기</a><br>' +
    '<span class="okmark">✔</span> 근무 규칙 준비됨 &nbsp;<a class="link" onclick="editRules()">고치기</a> <span class="hint">(그대로 두셔도 돼요)</span><br>' +
    '<span class="star">★</span> ' + p.m + '월에 쉬고 싶은 날 <b>' + wishCount + '건</b> 표시됨';
}

/* 「근무 규칙 준비됨 → 고치기」 — 우리 병동 탭으로 가서 규칙 상자를 펼치고 그 자리로 데려간다.
   (규칙 상자는 평소 접혀 있어서 탭만 옮기면 어디를 고쳐야 하는지 안 보인다) */
function editRules() {
  showTab('ward');
  var box = document.getElementById('rulesBox');
  if (!box) return;
  box.open = true;
  box.scrollIntoView({ block: 'start' });
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
    /* 형평성(상대): 같은 직군에서 '남들보다' 덜 쉰 사람만 강조.
       절대 목표가 아니라 최대 휴무자 대비 — 전원 똑같이 쉬면(빠듯해도) 강조 안 함(그게 공평).
       스케줄이 다 찬 사람끼리만 비교(부분 편집 중엔 비교 무의미). */
    var restOf = {}, maxRest = 0;
    gStaff.forEach(function (p) {
      var rc = 0, fl = 0;
      for (var d = 1; d <= days; d++) { var c = cellCode(p.id, d); if (c) { fl++; if (!E.fam(c)) rc++; } }
      restOf[p.id] = { rest: rc, full: fl === days };
      if (restOf[p.id].full && rc > maxRest) maxRest = rc;
    });
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
        '</span> <span style="color:var(--n)">' + cnt.N + '</span> ' +
        (restOf[p.id].full && gStaff.length >= 2 && maxRest - cnt.O >= 2
          ? '<span class="off-low" title="같은 직군의 다른 분보다 덜 쉬었어요 (가장 많이 쉰 분은 ' + maxRest + '일)">' + cnt.O + '</span>'
          : '<span style="color:#868e96">' + cnt.O + '</span>') +
        '</td>' +
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
  fitGridThumb();
}
function saveHolidays() {
  var hi = document.getElementById('holidayInput');
  var days = daysInYM(curYM);
  var list = hi.value.split(/[,\s]+/).map(function (s) { return parseInt(s, 10); })
    .filter(function (n) { return !isNaN(n) && n >= 1 && n <= days; });
  list = list.filter(function (v, i) { return list.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
  var mm = month(curYM);
  mm.holidays = list;
  mm.holidaysAuto = false;   // 사람이 정했으니 이후 자동 반영이 덮지 않는다
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
/* 위반 칸으로 데려가기.
   2026-07-20 수정: scrollIntoView만으로는 이름·개수 열이 고정(sticky)으로 왼쪽을 덮고 있어
   칸이 그 아래로 숨거나, 가로로 멀리 밀려 있으면 어디인지 못 찾는 문제가 있었다.
   고정 열 폭을 빼고 남는 영역의 한가운데로 직접 밀어준 뒤, 눈에 띄게 오래 깜빡인다. */
function jumpTo(pid, day) {
  /* 위반 칸은 큰 화면에서 짚어준다 — 세로 미니맵은 축소돼 있어 칸을 가리킬 수 없다.
     2026-07-22: 세로면 먼저 가로 전체화면을 열고, 레이아웃이 잡힌 뒤 그 칸으로 데려간다. */
  if (!document.body.classList.contains('grid-open')) {
    openGridFull();
    setTimeout(function () { jumpTo(pid, day); }, 280);
    return;
  }
  var el = document.getElementById('c_' + pid + '_' + day);
  if (!el) return;
  var wrap = document.getElementById('gridArea');   // 가로 스크롤러(.gridwrap)
  if (wrap) {
    var nameCell = wrap.querySelector('td.name');
    var cntCell = wrap.querySelector('td.cntcol');
    var stick = (nameCell ? nameCell.offsetWidth : 0) + (cntCell ? cntCell.offsetWidth : 0);
    var wr = wrap.getBoundingClientRect(), er = el.getBoundingClientRect();
    var viewCenter = wr.left + stick + (wr.width - stick) / 2;
    /* 부드러운 스크롤은 브라우저에 따라 조용히 무시된다(2026-07-20 실측) — 즉시 이동 + 강조를 크게. */
    wrap.scrollLeft = Math.max(0, wrap.scrollLeft + ((er.left + er.width / 2) - viewCenter));
  }
  /* 전체화면에선 세로 스크롤러가 #gridThumb다(본문 스크롤은 잠겨 있음) */
  var vs = document.getElementById('gridThumb');
  if (vs) {
    var vr = vs.getBoundingClientRect(), r2 = el.getBoundingClientRect();
    vs.scrollTop = Math.max(0, vs.scrollTop + (r2.top - vr.top) - vs.clientHeight / 2 + r2.height / 2);
  }
  /* 도착한 자리에서 크게 깜빡여 어디인지 확실히 알린다 */
  el.animate([
    { boxShadow: 'inset 0 0 0 4px #e03131', transform: 'scale(1)' },
    { boxShadow: 'inset 0 0 0 4px #e03131', transform: 'scale(1.18)' },
    { boxShadow: 'inset 0 0 0 4px rgba(224,49,49,0)', transform: 'scale(1)' }
  ], { duration: 900, iterations: 3 });
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
var violExpanded = false;   // 위반 목록을 모두 펼쳤는가
function toggleViols() { violExpanded = !violExpanded; renderBanner(); }
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
    /* 기본은 4건만. 「모두 보기」를 누르면 전부 펼친다 — 예전엔 "…외 N건"이 어떤 항목인지
       알 수도, 눌러서 갈 수도 없었다(2026-07-20). */
    var shown = violExpanded ? v : v.slice(0, 4);
    var list = shown.map(function (x) {
      if (x.pid) return '<span class="viol-item" onclick="jumpTo(\'' + x.pid + '\',' + x.day + ')">· ' + x.msg + ' →</span>';
      return '<span>· ' + x.msg + '</span>';
    }).join('<br>');
    var more = '';
    if (v.length > 4) {
      more = violExpanded
        ? '<br><a class="link violmore" onclick="toggleViols()">↑ 접기</a>'
        : '<br><a class="link violmore" onclick="toggleViols()">…외 ' + (v.length - 4) + '건 — 모두 보기</a>';
    }
    b.innerHTML = '⚠️ 확인이 필요한 곳이 <b>' + v.length + '건</b> 있어요.<br>' + list + more;
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
  var pkW = pk.offsetWidth || 410;   // 실제 폭으로 계산 — 고정값이면 좁은 폰에서 화면 밖으로 나간다
  var pkH = pk.offsetHeight || 240;
  if (document.body.classList.contains('grid-open')) {
    /* 가로 전체화면: #picker가 뷰포트 기준(fixed)으로 뜨므로 스크롤 오프셋 없이 배치하고,
       아래로 넘치면 칸 위로 띄운다(가로 화면은 세로가 짧아 아래 공간이 부족할 수 있다). */
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var fx = rect.left;
    var fy = rect.bottom + 6;
    if (fy + pkH > vh - 8) fy = rect.top - pkH - 6;   // 아래로 넘치면 칸 위로
    /* 어떤 경우에도 화면 밖으로 나가지 않게 최종 클램프 */
    fx = Math.min(Math.max(8, fx), Math.max(8, vw - pkW - 8));
    fy = Math.min(Math.max(8, fy), Math.max(8, vh - pkH - 8));
    pk.style.left = fx + 'px';
    pk.style.top = fy + 'px';
  } else {
    var x = Math.min(rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - pkW - 8);
    pk.style.left = Math.max(8, x) + 'px';
    pk.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  }
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

/* ---- 이번 달 초기화 ---- */
/* 위반이 얽혀 손으로는 못 푸는 상태를 한 번에 정리한다. 사람·규칙·지난 달 기록은 건드리지 않는다. */
function resetMonth() {
  hidePicker();
  if (!hasAny() && !Object.keys(month(curYM).pins || {}).length) {
    alert('이번 달은 이미 비어 있어요.');
    return;
  }
  if (!confirm('이번 달 근무표를 모두 지울까요?\n\n지워지는 것 — 이번 달 근무, 📌 직접 고정한 칸, ★ 희망\n그대로 두는 것 — 사람, 규칙, 공휴일, 지난 달 기록\n\n되돌리기(↩)로 되살릴 수 있어요.')) return;
  pushUndo();
  var m = month(curYM);
  m.codes = {}; m.pins = {}; m.wish = {};
  violExpanded = false;
  save(); renderHome();
  toast('이번 달 근무표를 지웠어요');
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
    var iss = E.preflight(gStaff, cfg);
    iss.forEach(function (v) { v._g = g; });   // 소프트 메시지에 직군 라벨을 붙이기 위한 태그
    preIssues = preIssues.concat(iss);
    return { g: g, staff: gStaff, cfg: cfg };
  });
  var hardIssues = preIssues.filter(function (v) { return !v.soft; });
  if (hardIssues.length) {
    alert('만들기 전에 먼저 고쳐야 할 것이 있어요:\n\n' +
      hardIssues.slice(0, 6).map(function (v) { return '· ' + v.msg; }).join('\n') +
      (hardIssues.length > 6 ? '\n…외 ' + (hardIssues.length - 6) + '건' : ''));
    return;
  }
  /* 소프트 경고(월 여력 부족) — 생성을 막지 않고 참고로만 안내.
     다직군(간호사+조무사)이면 어느 직군인지 라벨을 붙인다. 중복 메시지는 제거. */
  var multiGroup = gs.length > 1;
  var softMsgs = [];
  preIssues.forEach(function (v) {
    if (!v.soft) return;
    var m = (multiGroup ? groupNames[v._g] + ' — ' : '') + v.msg;
    if (softMsgs.indexOf(m) < 0) softMsgs.push(m);
  });
  pushUndo();
  var perMax = 1500, seed = Date.now() % 100000, t0 = Date.now();
  var totalMax = perMax * jobs.length;
  var prog = document.getElementById('genProgress');
  var bar = document.getElementById('genProgBar');
  var lbl = document.getElementById('genProgLbl');
  var info = document.getElementById('genInfo');
  info.textContent = softMsgs.map(function (m) { return '⚠️ ' + m; }).join('\n');
  prog.className = 'on';
  bar.style.width = '0%';
  var ji = 0, att = 0, doneAtt = 0, best = null;
  var results = {};
  function accept(r) { return r.violations.length === 0 && (r.nightGap || 0) <= 2; }
  function failAll(msg) {
    prog.className = '';
    undoStack.pop();
    alert((softMsgs.length ? softMsgs.join('\n') + '\n\n' : '') + msg);
  }
  function finishAll() {
    prog.className = '';
    var m = month(curYM);
    var warn = [], short = [];
    jobs.forEach(function (job) {
      var r = results[job.g];
      // 형평성(상대): 같은 직군에서 최대 휴무자보다 2일+ 덜 쉰 사람만 — 전원 고르게 쉬면(빠듯해도) 안 잡음.
      var rests = job.staff.map(function (p) {
        m.codes[p.id] = r.schedule[p.id];
        return { name: p.name, rest: r.schedule[p.id].filter(function (c) { return c && !E.fam(c); }).length };
      });
      var maxRest = rests.reduce(function (mx, x) { return Math.max(mx, x.rest); }, 0);
      if (job.staff.length >= 2) rests.forEach(function (x) { if (maxRest - x.rest >= 2) short.push(x.name); });
      if (r.violations.length) warn.push(groupNames[job.g] + ' ' + r.violations.length + '건');
    });
    save();
    renderHome();
    var lines = ['완성! (' + ((Date.now() - t0) / 1000).toFixed(1) + '초)'];
    if (warn.length) lines.push('⚠️ 다 지키진 못했어요(' + warn.join(', ') + ') — 빨간 칸을 확인해 주세요.');
    softMsgs.forEach(function (m) { lines.push('⚠️ ' + m); });
    if (short.length) lines.push('⚖️ ' +
      (short.length <= 3 ? short.join('·') + ' 님이' : short.length + '명이') +
      ' 같은 직군의 다른 분들보다 덜 쉬었어요 — 표의 주황색 오프 숫자를 확인하고, 필요하면 근무를 바꿔주세요.');
    lines.push('맘에 안 들면 「다시 만들기」를 누르세요.');
    info.textContent = lines.join('\n');
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
      TYPE_ORDER.map(function (t) {
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
  renderPatternMemo();
}
/* 우리 병동 습관 메모 — AI가 읽어 저장한 참고 목록. 자동 강제 없음(초안 참고용).
   저장된 게 없으면 카드 자체를 숨긴다(빈 카드가 화면을 어지럽히지 않게). */
function renderPatternMemo() {
  var card = document.getElementById('patternCard');
  var area = document.getElementById('patternArea');
  if (!card || !area) return;
  var list = db.customPatterns || [];
  if (!list.length) { card.style.display = 'none'; area.innerHTML = ''; return; }
  card.style.display = '';
  area.innerHTML =
    '<p class="hint" style="margin:0 0 10px">AI가 근무표에서 읽어 저장한 습관이에요. 초안을 만들 때 참고하시라고 적어둔 메모예요 — <b>자동으로 근무표에 반영되지는 않아요.</b></p>' +
    list.map(function (p) {
      var when = /^\d{4}-\d{2}$/.test(p.ym || '') ? p.ym.replace('-', '년 ') + '월 근무표에서' : '';
      return '<div class="patmemo"><div class="pm-t">“' + esc(p.text) + '”' +
        (when ? '<span class="pm-src">' + when + '</span>' : '') + '</div>' +
        '<button class="pm-del" onclick="removePattern(\'' + esc(p.id) + '\')">지우기</button></div>';
    }).join('');
}
function removePattern(id) {
  if (!db.customPatterns) return;
  db.customPatterns = db.customPatterns.filter(function (p) { return p.id !== id; });
  save();
  renderPatternMemo();
  toast('메모를 지웠어요');
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
  if (m.indexOf('provider is not enabled') >= 0 || m.indexOf('Unsupported provider') >= 0)
    return '이 로그인 방식은 아직 준비 중이에요. 이메일로 로그인해주세요.';
  /* 인증번호(비밀번호 재설정 메일 링크 만료 등) 계열 — 이메일 복구에도 해당 */
  if (c === 'otp_expired' || m.indexOf('expired') >= 0 || m.indexOf('Token has expired') >= 0 || m.indexOf('invalid') >= 0)
    return '인증번호가 맞지 않거나 시간이 지났어요. 「다시 보내기」로 새 번호를 받아주세요.';
  if (c === 'over_sms_send_rate_limit' || m.indexOf('security purposes') >= 0 || m.indexOf('rate limit') >= 0)
    return '문자를 너무 자주 보냈어요. 1분 뒤에 다시 눌러주세요.';
  return '잠시 후 다시 시도해주세요. (' + m + ')';
}
var cloudView = 'main';   // main | signup | newpw | emailReset
var authTarget = 'cloudBody';  // 인증 UI 렌더 대상: 'cloudBody'(보관함 카드) | 'homeLoginBody'(홈 첫 화면 카드)
var authCtx = { mode: null }; // mode: 'reset' (이메일 비밀번호 재설정 진행 표시)
/* 소셜 로그인 버튼용 인라인 로고 (외부 요청 없이 정적 웹앱에서 바로 렌더) */
var GOOGLE_SVG = '<svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">' +
  '<path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>' +
  '<path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>' +
  '<path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/>' +
  '<path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>';
var KAKAO_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
  '<path fill="#191919" d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.68 1.78 5.03 4.46 6.36-.2.73-.72 2.64-.82 3.05-.13.5.18.5.39.36.16-.11 2.6-1.77 3.66-2.49.6.09 1.22.13 1.85.13 5.25 0 9.5-3.36 9.5-7.5S17.25 3.5 12 3.5z"/></svg>';
/* 홈 화면 바로가기(PWA) — 크롬이 「설치 가능」을 알려주면 원터치로 만든다.
   만들어두면 아이콘으로 바로 실행되어 인앱 브라우저 문제 자체가 사라진다.
   사용자 표기는 「바로가기 만들기」로 통일(2026-07-20) — "앱 설치"는 스토어 앱으로 오해된다.
   (카톡 내장 브라우저·iOS에서는 이 이벤트가 오지 않아 손 안내로 대체) */
var deferredInstall = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredInstall = e;
  renderInstallCard(); renderInstallBtn();
  /* 홈 로그인 카드가 떠 있고 아직 입력을 시작하지 않았을 때만 다시 그린다 (입력 중 내용 보호) */
  var em = document.getElementById('cloudEmail');
  var home = document.getElementById('tab-home');
  if (home && home.style.display !== 'none' && (!em || !em.value)) renderHome();
});
window.addEventListener('appinstalled', function () {
  deferredInstall = null;
  renderInstallCard(); renderInstallBtn();
  toast('만들었어요! 홈 화면에서 🌙 엄만달을 눌러 열어주세요');
});
function installApp() {
  if (!deferredInstall) return;
  var p = deferredInstall;
  deferredInstall = null;
  p.prompt();
  p.userChoice.then(function (r) {
    if (r && r.outcome === 'accepted') toast('만들었어요! 홈 화면에서 🌙 엄만달을 눌러 열어주세요');
    renderInstallCard(); renderInstallBtn();
  });
}
/* 이미 홈 화면에 만들어져 있는가 — 브라우저 탭으로 열었을 때도 알 수 있다.
   ★ 크롬은 이미 설치된 앱에는 beforeinstallprompt를 아예 보내지 않는다. 그래서
   "원터치가 안 되는" 진짜 이유가 대개 이것이다. manifest의 related_applications(webapp)와
   짝을 이뤄 동작한다(2026-07-20). */
var alreadyInstalled = false, installCheckDone = false;
function checkAlreadyInstalled() {
  if (!navigator.getInstalledRelatedApps) { installCheckDone = true; return Promise.resolve(false); }
  return navigator.getInstalledRelatedApps().then(function (apps) {
    alreadyInstalled = !!(apps && apps.length);
    installCheckDone = true;
    renderInstallBtn(); renderInstallCard();
    return alreadyInstalled;
  }, function () { installCheckDone = true; return false; });
}
/* 이미 앱으로 실행 중인가 (설치본으로 열었으면 설치 안내가 필요 없다) */
function isStandalone() {
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
         navigator.standalone === true;
}
/* 브라우저 종류 — 설치 방법이 저마다 달라서 안내 문구를 갈라야 한다 */
function browserKind() {
  var ua = navigator.userAgent || '';
  if (inAppBrowser()) return 'inapp';
  if (/iPhone|iPad|iPod/i.test(ua)) return /CriOS|FxiOS|EdgiOS|Whale/i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Whale/i.test(ua)) return 'whale';
  if (/FxiOS|Firefox/i.test(ua)) return 'firefox';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/Chrome|CriOS/i.test(ua)) return 'chrome';
  return 'other';
}
/* 「바로가기 만들기」 안내 — 크롬이 원터치를 지원하면 버튼, 아니면 기기별 손 안내. */
function installStepsHtml() {
  var kind = browserKind();
  var box = function (title, steps, extra) {
    return '<p><b>' + title + '</b></p><ol class="installsteps">' +
      steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' + (extra || '');
  };
  if (kind === 'inapp') {
    return '<p>지금은 <b>카카오톡·네이버 같은 앱 안의 브라우저</b>로 보고 계세요. 여기서는 만들 수 없어요.</p>' +
      '<button class="btn big" onclick="openInChrome()">🌐 크롬으로 열기</button>' +
      '<p class="hint" style="margin-top:6px">크롬으로 열린 다음, 다시 눌러주세요.</p>';
  }
  if (kind === 'ios-safari') {
    return box('아이폰 · 사파리', [
      '화면 <b>아래쪽 가운데 공유 단추</b>(⬆️ 네모에 화살표)를 누르세요.',
      '목록을 위로 넘겨 <b>「홈 화면에 추가」</b>를 누르세요.',
      '오른쪽 위 <b>「추가」</b>를 누르면 끝이에요.'
    ]);
  }
  if (kind === 'ios-other') {
    return box('아이폰', [
      '아이폰은 <b>사파리</b>에서만 만들 수 있어요.',
      '주소를 복사해 <b>사파리</b>로 연 뒤, 아래 <b>공유 단추</b> → <b>「홈 화면에 추가」</b>를 누르세요.'
    ], '<button class="btn gray" style="margin-top:8px" onclick="copyAppLink()">🔗 주소 복사하기</button>');
  }
  if (kind === 'samsung') {
    return box('삼성 인터넷', [
      '화면 <b>아래쪽 줄 세 개(≡)</b>를 누르세요.',
      '<b>「현재 페이지 추가」</b> 또는 <b>「페이지 추가」</b>를 누르세요.',
      '<b>「홈 화면」</b>을 고르면 끝이에요.'
    ]);
  }
  if (kind === 'firefox' || kind === 'whale' || kind === 'edge' || kind === 'other') {
    return box('만드는 방법', [
      '브라우저 <b>메뉴(⋮ 또는 ≡)</b>를 누르세요.',
      '<b>「홈 화면에 추가」</b>를 누르세요.'
    ], '<p class="hint" style="margin-top:6px">메뉴에 없다면 <b>크롬</b>으로 열면 한 번에 만들 수 있어요.</p>');
  }
  /* 크롬인데 안내 이벤트가 아직 안 온 경우 (이미 만들어져 있거나, 잠시 뒤 나타남) */
  return box('크롬', [
    '오른쪽 위 <b>메뉴(⋮)</b>를 누르세요.',
    '<b>「홈 화면에 추가」</b>를 누르세요.'
  ], '<p class="hint" style="margin-top:6px">이미 만들어져 있으면 이 항목이 안 보일 수 있어요. 그때는 홈 화면의 🌙 아이콘으로 열어주세요.</p>');
}
/* ---- 비지원 브라우저 안내막 ----
   2026-07-20 사용자 결정: 크롬 외 브라우저에서 로그인·기능을 쓰면 정체 모를 오류가 난다
   (예: 로그인하지 않았는데 로그인한 것처럼 보임 — supabase 스크립트가 그 브라우저에서
   실행되지 않으면 Cloud가 조용히 꺼져 로그인 관문 자체가 사라진다).
   그래서 크롬이 아니면 앱을 아예 가리고 「크롬으로 열기」·「설치」 두 가지만 안내한다.
   ※ 아이폰은 예외 — 사파리에서만 홈 화면 설치가 되므로 사파리를 정상 취급한다. */
/* 로그인 기능이 살아 있는가 — 설정은 있는데 supabase 스크립트가 실행되지 않은 브라우저에서는
   Cloud가 조용히 꺼지고 로그인 관문이 통째로 사라진다(= 로그인 없이 기능을 쓰게 되는 경로).
   그런 브라우저는 지원 목록에 들어 있더라도 막는다. */
function cloudBroken() {
  return !!(window.CLOUD_CONFIG && CLOUD_CONFIG.url && CLOUD_CONFIG.key) &&
         !(window.Cloud && Cloud.enabled());
}
function browserOk() {
  if (cloudBroken()) return false;          // 로그인이 불가능한 브라우저 — 설치본이어도 막는다
  if (isStandalone()) return true;          // 이미 앱으로 실행 중이면 통과
  var k = browserKind();
  if (k === 'ios-safari') return true;      // 아이폰의 유일한 설치 경로
  return k === 'chrome';
}
/* 안드로이드에서 크롬을 콕 집어 여는 주소.
   크롬이 없는 기기에서는 browser_fallback_url 덕에 그냥 평소 브라우저로 열린다(먹통 방지). */
function chromeIntentUrl() {
  var https = 'https://' + location.host + location.pathname;
  return 'intent://' + location.host + location.pathname +
    '#Intent;scheme=https;package=com.android.chrome;' +
    'S.browser_fallback_url=' + encodeURIComponent(https) + ';end';
}
/* 어떤 방법으로 크롬을 열지 결정만 한다 (검증하기 쉽게 분리).
   2026-07-20 수정: 예전엔 카톡·네이버일 때 openInBrowser()(=kakaotalk 외부열기)를 먼저 썼는데,
   그건 크롬이 아니라 「기본 브라우저」를 연다. 기본값이 삼성 인터넷인 기기에서는
   삼성 인터넷 → 안내막 → 다시 크롬, 이렇게 두 번을 눌러야 했다.
   안드로이드면 인앱이든 아니든 크롬을 직접 지목한다. */
function openInChromePlan() {
  if (/Android/i.test(navigator.userAgent || '')) return { how: 'chrome-intent', url: chromeIntentUrl() };
  if (inAppBrowser()) return { how: 'default-browser' };   // 아이폰 인앱 등 — 기본 브라우저로라도 탈출
  return { how: 'copy-link' };
}
function openInChrome() {
  var plan = openInChromePlan();
  if (plan.how === 'chrome-intent') { location.href = plan.url; return; }
  if (plan.how === 'default-browser') { openInBrowser(); return; }
  copyAppLink();
  toast('주소를 복사했어요. 크롬을 열고 붙여넣어 주세요');
}
function renderBrowserGate() {
  var g = document.getElementById('browserGate');
  if (!g) return;
  if (browserOk()) { g.className = ''; g.innerHTML = ''; return; }
  /* 2026-07-20 사용자 결정: 탈출구(「그냥 여기서 볼게요」) 제거 — 그리로 들어가면
     로그인 없이 기능을 쓰게 되어 데이터가 어긋난다. 크롬·사파리 외에는 완전 차단. */
  var ios = browserKind() === 'ios-other' || (cloudBroken() && /iPhone|iPad|iPod/i.test(navigator.userAgent || ''));
  g.innerHTML =
    '<div class="gate-in"><div class="gate-moon">🌙</div>' +
    '<h2>' + (ios ? '사파리에서 열어주세요' : '크롬에서 열어주세요') + '</h2>' +
    '<p>지금 브라우저에서는 <b>로그인이 되지 않아</b><br>근무표가 어긋날 수 있어요.<br>' +
    (ios ? '아이폰은 <b>사파리</b>에서 써주세요.' : '<b>크롬</b>에서 열면 문제없이 쓸 수 있어요.') + '</p>' +
    /* 2026-07-20 사용자 결정: 여기서는 「크롬으로 열기」 하나만 — 선택지를 늘리면 헷갈린다 */
    (ios
      ? '<button class="btn big xl" onclick="copyAppLink()">🔗 주소 복사하기</button>'
      : '<button class="btn big xl" onclick="openInChrome()">🌐 크롬으로 열기</button>') +
    '</div>';
  g.className = 'on';
}

/* 머리글 「바로가기 만들기」 버튼 — 바로가기로 실행 중이 아니면 항상 보인다(엄만달 제목과 같은 줄, 오른쪽). */
function renderInstallBtn() {
  var b = document.getElementById('installBtn');
  if (!b) return;
  /* 앱으로 실행 중이거나 이미 홈 화면에 만들어져 있으면 버튼 자체를 감춘다 */
  b.style.display = (isStandalone() || alreadyInstalled) ? 'none' : '';
}
/* 버튼을 누르면 — 되도록 안내 없이 바로 만든다.
   크롬이 「설치 가능」 신호(beforeinstallprompt)를 늦게 주는 경우가 있어, 잠깐 기다렸다가
   그래도 없으면 그때만 손 안내를 띄운다. (기다림은 사용자 클릭 유효시간 안이라 바로 실행된다) */
function installEntry() {
  if (deferredInstall) { installApp(); return; }
  var btn = document.getElementById('installBtn');
  var label = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '준비 중…'; }
  var waited = 0;
  var timer = setInterval(function () {
    waited += 200;
    if (deferredInstall) { clearInterval(timer); restore(); installApp(); return; }
    if (waited >= 1200) { clearInterval(timer); restore(); openInstallModal(); }
  }, 200);
  function restore() { if (btn) { btn.disabled = false; btn.textContent = label; } }
}
function openInstallModal() {
  var m = document.getElementById('installModal');
  var inner = alreadyInstalled
    ? '<p>✅ 홈 화면에 <b>이미 만들어져 있어요</b>.<br>홈 화면의 🌙 <b>엄만달</b> 아이콘으로 열어주세요.</p>'
    : '<p>홈 화면에 🌙 아이콘이 생겨서, 주소를 찾지 않고 바로 열 수 있어요. 화면은 세로로 고정돼요(근무표는 「크게 보기」로 가로로 볼 수 있어요).</p>' +
      installStepsHtml();
  /* 왜 원터치가 안 되는지 알려주는 작은 진단 표시 — 문제 보고용 */
  var diag = '<p class="insdiag">진단: 원터치신호 ' + (deferredInstall ? '있음' : '없음') +
    ' · 이미있음 ' + (navigator.getInstalledRelatedApps ? (alreadyInstalled ? '예' : '아니오') : '모름') + '</p>';
  m.innerHTML = '<div class="ins-card"><h2>🔗 홈 화면에 바로가기 만들기</h2>' + inner + diag +
    '<div class="imp-actions"><button class="btn gray" onclick="closeInstallModal()">닫기</button></div></div>';
  m.className = 'on';
  m.onclick = function (ev) { if (ev.target === m) closeInstallModal(); };
}
function closeInstallModal() {
  var m = document.getElementById('installModal');
  m.className = ''; m.innerHTML = '';
}
function renderInstallCard() {
  var card = document.getElementById('installCard');
  var body = document.getElementById('installBody');
  if (!card || !body) return;
  card.style.display = '';
  if (isStandalone()) {
    body.innerHTML = '<p>✅ 이미 <b>바로가기로 실행</b> 중이에요. 그대로 쓰시면 됩니다.</p>';
    return;
  }
  if (alreadyInstalled) {
    body.innerHTML = '<p>✅ 홈 화면에 <b>이미 만들어져 있어요</b>.<br>홈 화면의 🌙 <b>엄만달</b> 아이콘으로 열어주세요.</p>';
    return;
  }
  body.innerHTML =
    '<p>홈 화면에 🌙 아이콘이 생겨서, 주소를 찾지 않고 바로 열 수 있어요. 화면은 세로로 고정돼요(근무표는 「크게 보기」로 가로로 볼 수 있어요).</p>' +
    (deferredInstall
      ? '<button class="btn big xl" onclick="installApp()">🔗 지금 만들기</button>'
      : installStepsHtml());
}
/* 아이폰 등에서 주소만 복사 — 다른 브라우저로 옮겨가야 할 때 */
function copyAppLink() {
  var url = location.origin + location.pathname;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { toast('주소를 복사했어요'); },
      function () { toast(url); });
  } else { toast(url); }
}
/* 인앱 브라우저(카톡·네이버·라인 등) 감지 — 구글이 앱 내장 브라우저(WebView) 로그인을
   정책으로 차단한다(403 disallowed_useragent). 감지되면 기본 브라우저로 안내한다. */
function inAppBrowser() {
  var ua = navigator.userAgent || '';
  return /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps/i.test(ua);
}
function openInBrowser() {
  var ua = navigator.userAgent || '';
  var url = location.origin + location.pathname;
  if (/KAKAOTALK/i.test(ua)) { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url); return; }
  if (/Line\//i.test(ua)) { location.href = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'openExternalBrowser=1'; return; }
  if (/Android/i.test(ua)) { location.href = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;end'; return; }
  toast('화면 아래 ⋯ 메뉴에서 「다른 브라우저로 열기」를 눌러주세요');
}
function pwInput(id, ph) {
  return '<input type="password" id="' + id + '" placeholder="' + ph + '" style="width:170px;font-size:19px;padding:10px 12px;border:1.5px solid var(--line);border-radius:12px;font-family:inherit">';
}
function backLink() { return '<p class="hint" style="margin-top:10px"><a class="link" onclick="cloudGoto(\'main\')">← 처음으로</a></p>'; }
/* 로그아웃 뷰(main·signup·newpw·emailReset)를 현재 authTarget에 렌더한다.
   홈 로그인 카드(homeLoginBody)와 보관함 카드(cloudBody)에 같은 id 입력칸이 공존하면
   getElementById가 엉키므로, 렌더 직전에 반대쪽 컨테이너를 반드시 비운다. */
function renderAuth() {
  var other = authTarget === 'homeLoginBody' ? 'cloudBody' : 'homeLoginBody';
  var oe = document.getElementById(other);
  if (oe) oe.innerHTML = '';
  var body = document.getElementById(authTarget);
  if (!body) return;
  if (cloudView === 'signup') {
    body.innerHTML =
      '<h3 class="authtitle">이메일로 가입하기</h3>' +
      '<p class="hint">가입하면 확인 메일이 가요. 메일함에서 링크를 한 번만 눌러주시면 가입이 끝나요.</p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="text" id="cloudEmail" placeholder="이메일" style="width:220px" autocomplete="email">' +
      pwInput('authPw', '비밀번호 (6자 이상)') + pwInput('authPw2', '비밀번호 다시') +
      '</div>' +
      '<div class="toolbar" style="margin-top:6px">' +
      '<button class="btn big" onclick="cloudSignup()">가입하기</button>' +
      '<span class="hint" id="cloudMsg"></span></div>' + backLink();
  } else if (cloudView === 'newpw') {
    body.innerHTML =
      '<h3 class="authtitle">새 비밀번호 만들기</h3>' +
      '<p>본인 확인이 끝났어요. 이제 쓸 <b>새 비밀번호</b>를 정해주세요.</p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      pwInput('authPw', '새 비밀번호 (6자 이상)') + pwInput('authPw2', '한 번 더') +
      '<button class="btn big" onclick="cloudSetNewPw()">바꾸기</button>' +
      '</div><span class="hint" id="cloudMsg"></span>';
  } else if (cloudView === 'emailReset') {
    body.innerHTML =
      '<h3 class="authtitle">비밀번호 찾기 (이메일)</h3>' +
      '<p>가입할 때 쓴 <b>이메일</b>을 넣으면 비밀번호를 새로 정할 수 있는 <b>메일</b>을 보내드려요.</p>' +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="text" id="cloudEmail" placeholder="이메일" style="width:220px" autocomplete="email">' +
      '<button class="btn big" onclick="cloudEmailReset()">📮 메일 보내기</button>' +
      '</div><span class="hint" id="cloudMsg"></span>' + backLink();
  } else {
    /* main — 소셜 로그인(구글·카카오) + 이메일 로그인 */
    var provs = Cloud.oauthProviders();
    /* 인앱 브라우저에서는 구글 로그인이 차단되므로 기본 브라우저로 안내 */
    var inapp = inAppBrowser()
      ? '<div style="background:#FFF6E5;border:1.5px solid #F0C36D;border-radius:12px;padding:12px 14px;margin-bottom:12px">' +
        '⚠️ 카카오톡·네이버 앱 안에서는 <b>Google 로그인이 막혀 있어요</b>.<br>' +
        '<button class="btn big" style="margin-top:8px" onclick="openInBrowser()">🌐 크롬(브라우저)으로 열기</button></div>'
      : '';
    var socials = '';
    if (provs.indexOf('google') >= 0)
      socials += '<button class="btn-google" onclick="cloudOAuth(\'google\')">' + GOOGLE_SVG + 'Google로 계속하기</button>';
    if (provs.indexOf('kakao') >= 0)
      socials += '<button class="btn-kakao" onclick="cloudOAuth(\'kakao\')">' + KAKAO_SVG + '카카오로 계속하기</button>';
    /* 소개 문단은 보관함 카드(cloudBody)일 때만 — 홈 로그인 카드는 카드 자체에 환영 문구가 있다 */
    var intro = authTarget === 'cloudBody'
      ? '<p>로그인하면 폰·컴퓨터 어디서든 <b>같은 근무표</b>를 볼 수 있어요.<br>' +
        '<span class="hint">로그인하지 않아도 이 기기에서는 그대로 쓸 수 있습니다.</span></p>'
      : '';
    body.innerHTML =
      intro + inapp +
      (socials ? '<div class="socialbtns">' + socials + '</div><div class="authdivider">또는 이메일로</div>' : '') +
      '<div class="staffrow" style="border-bottom:none">' +
      '<input type="text" id="cloudEmail" placeholder="이메일" style="width:220px" autocomplete="email">' +
      pwInput('cloudPw', '비밀번호') +
      '</div>' +
      '<div class="toolbar" style="margin-top:6px">' +
      '<button class="btn big" onclick="cloudLogin()">로그인</button>' +
      '<button class="btn gray" onclick="cloudGoto(\'signup\')">처음이면 이메일 가입</button>' +
      '<span class="hint" id="cloudMsg"></span>' +
      '</div>' +
      '<p class="hint">비밀번호를 잊으셨나요? → <a class="link" onclick="cloudGoto(\'emailReset\')">비밀번호 찾기</a></p>' +
      /* 바로가기 안내는 머리글 버튼 한 곳으로 모았다(2026-07-20) — 로그인 화면을 한 화면에 담기 위해 */
      '';
  }
}
/* 보관함의 클라우드 카드 — 2026-07-20 사용자 결정으로 「여러 기기에서 함께 쓰기」 안내는 없앴다.
   로그인 상태는 머리글 로그아웃 버튼으로 충분하다.
   단, 비밀번호 재설정(메일 링크로 돌아온 경우)은 이 자리에서만 진행되므로 그때만 띄운다. */
function renderCloudCard() {
  renderAcctBtn();
  var card = document.getElementById('cloudCard');
  if (!card) return;
  var body = document.getElementById('cloudBody');
  if (cloudView === 'newpw') {
    authTarget = 'cloudBody';
    card.style.display = '';
    renderAuth();
    return;
  }
  card.style.display = 'none';
  if (body) body.innerHTML = '';   // 홈 로그인 카드와 입력칸 id 충돌 방지
}
function cloudGoto(v) {
  cloudView = v;
  if (v === 'main') { Cloud.setAuthFlow(false); authCtx.mode = null; }
  renderAuth();   // 로그인됨 상태는 cloudGoto를 타지 않으므로 현재 authTarget에 맞게 다시 그리면 된다
}
function cloudMsg(t) { var el = document.getElementById('cloudMsg'); if (el) el.textContent = t; }
/* ---- 흐름 완료 공통 ---- */
function finishAuthFlow(msg) {
  Cloud.setAuthFlow(false);
  cloudView = 'main';
  authCtx.mode = null;
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
  var pw = document.getElementById('authPw').value;
  var pw2 = document.getElementById('authPw2').value;
  if (!em) { cloudMsg('이메일을 넣어주세요.'); return; }
  if (pw.length < 6) { cloudMsg('비밀번호는 6자 이상으로 해주세요.'); return; }
  if (pw !== pw2) { cloudMsg('비밀번호 두 칸이 서로 달라요. 같게 넣어주세요.'); return; }
  cloudMsg('가입 중…');
  Cloud.signUp(em, pw).then(function (res) {
    if (res.error) { cloudMsg(cloudErrMsg(res.error)); return; }
    if (res.data && res.data.user && !res.data.session) {
      cloudMsg('확인 메일을 보냈어요. 메일함에서 확인 후 로그인해주세요.');
    }
  });
}
/* ---- 소셜 로그인 (구글·카카오) ---- */
function cloudOAuth(provider) {
  if (provider === 'google' && inAppBrowser()) {
    cloudMsg('카카오톡 등 앱 안에서는 Google 로그인이 막혀 있어요. 크롬으로 열어드릴게요.');
    openInBrowser();
    return;
  }
  cloudMsg('로그인 화면으로 이동 중…');
  Cloud.signInOAuth(provider).then(function (res) {
    if (res.error) cloudMsg(cloudErrMsg(res.error));
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
  Cloud.signOut().then(function () {
    toast('로그아웃했어요'); cloudView = 'main';
    /* 「로그인 없이 쓰기」 선택은 해제한다 — 안 그러면 로그아웃해도 로그인 카드가 안 뜬다.
       예전 버전이 기기에 저장해둔 영구 플래그도 함께 지운다 */
    loginSkippedNow = false;
    if (db.loginSkipped) { db.loginSkipped = false; save(); }
    renderAcctBtn();
    showTab('home');   // 어느 탭에 있었든 로그인 화면(홈)으로 돌려보낸다
  });
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
      Cloud.push(db).then(function () { toast('이 기기 내용을 서버에 올렸어요 ☁'); renderCloudCard(); renderHome(); });
    } else if (isEmptyDb(db) && !isEmptyDb(server)) {
      /* 새 기기(빈 상태)로 로그인 — 시계가 뭐라 하든 서버 데이터를 지킨다 (실데이터 비파괴) */
      adoptServer();
    } else if (serverAt > localAt) {
      adoptServer();
    } else {
      Cloud.push(db).then(function () { toast('서버에 저장했어요 ☁'); renderCloudCard(); renderHome(); });
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

/* ---- 기존 근무표(엑셀) 불러오기 ---- */
var _importParse = null;   // 기준(최근) 달 parse 결과 — 확인 화면 → 적용에서 재사용
var _importPrevSheets = [];  // 함께 올린 이전 달들 — 이력으로만 저장(사람·규칙은 기준 달로)
var _importPatterns = [];    // AI가 관찰한 습관 메모(사진·PDF 경로만). 「맞아요」한 것만 계정에 저장(자동 강제 X)
/* 습관 메모 dedup용 — 공백만 다른 같은 문장을 중복 저장하지 않도록 정규화 */
function normPatText(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
function importXlsx(ev) {
  var f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  if (typeof XLSX === 'undefined') { alert('엑셀 읽기 도구를 불러오지 못했어요. 인터넷에 한 번 연결한 뒤 새로고침해주세요.'); return; }
  var reader = new FileReader();
  reader.onload = function () {
    var res;
    try { res = Importer.parse(reader.result); }
    catch (e) { alert('엑셀 파일을 읽을 수 없어요. 근무표 엑셀(.xlsx) 파일인지 확인해주세요.'); return; }
    if (res.error) { alert(res.error + '\n\n날짜(1, 2, 3 …)가 한 줄에 이어진 근무표 엑셀인지 확인해주세요.'); return; }
    if (!res.rows || !res.rows.length) { alert('사람 이름을 찾지 못했어요. 이름이 한글로 적힌 근무표인지 확인해주세요.'); return; }
    _importParse = res;
    _importPrevSheets = [];                 // 엑셀은 한 장짜리
    _importPatterns = [];                   // 엑셀 경로는 습관 관찰이 없다(서버 AI 경로 전용)
    renderImportReview(prevYM(curYM, 1));   // 기본값: 지난달
  };
  reader.onerror = function () { alert('파일을 읽는 중 문제가 생겼어요. 다시 시도해주세요.'); };
  reader.readAsArrayBuffer(f);
}
/* ---- 사진/PDF AI 가져오기 (2단계) — 서버가 표를 읽고, 분석·확인은 엑셀과 같은 흐름 ---- */
function aiImportReady() {
  if (!(window.Cloud && Cloud.enabled() && Cloud.getUser())) {
    toast('로그인한 뒤에 쓸 수 있어요. 위에서 먼저 로그인해주세요');
    return false;
  }
  if (aiBusy) return false;
  return true;
}
/* 사진 — 카메라·앨범 선택창 */
function aiImportStart() {
  if (!aiImportReady()) return;
  document.getElementById('aiImportFile').click();
}
/* PDF — 파일 선택창 (드물게 쓰는 경로라 따로 둔다) */
function aiImportPdfStart() {
  if (!aiImportReady()) return;
  document.getElementById('aiImportPdf').click();
}
/* 파일 → base64 (사진은 긴 변 2200px·JPEG로 축소해 용량·비용 절감) */
function aiFileToB64(file) {
  return new Promise(function (resolve, reject) {
    if (file.type === 'application/pdf') {
      var r = new FileReader();
      r.onload = function () { resolve({ media_type: 'application/pdf', data: String(r.result).split(',')[1] }); };
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, 2200 / Math.max(img.width, img.height));
      var cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      resolve({ media_type: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.85).split(',')[1] });
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했어요')); };
    img.src = url;
  });
}
/* ---- 분석 중 화면 ----
   30초쯤 걸리는데 토스트가 사라지면 되는지 안 되는지 알 수 없다는 제보(2026-07-20).
   진행 중임을 계속 보여주고, 그동안 뒤로가기·새로고침·다른 조작으로 취소되지 않게 막는다.
   (중간에 끊기면 서버 횟수만 소모되고 결과는 못 받는다) */
var aiBusy = false, aiTick = null, aiT0 = 0;
var AI_STEPS = [
  [0, '사진을 준비하는 중…'],
  [4, '근무표를 서버로 보내는 중…'],
  [10, 'AI가 표를 한 칸씩 읽는 중…'],
  [26, '거의 다 됐어요. 조금만 더…'],
  [50, '표가 크면 1분 넘게 걸리기도 해요. 그대로 기다려주세요…']
];
function aiStepText(sec) {
  var t = AI_STEPS[0][1];
  for (var i = 0; i < AI_STEPS.length; i++) if (sec >= AI_STEPS[i][0]) t = AI_STEPS[i][1];
  return t;
}
function aiBlockBack() {
  if (!aiBusy) return;
  history.pushState({ ai: 1 }, '', location.href);
  toast('분석 중이에요. 조금만 기다려주세요');
}
function aiBlockUnload(e) {
  if (!aiBusy) return;
  e.preventDefault();
  e.returnValue = '';
  return '';
}
function aiLoadingShow() {
  var el = document.getElementById('aiLoading');
  if (!el) return;
  aiBusy = true;
  aiT0 = Date.now();
  el.innerHTML =
    '<div class="ai-card"><div class="ai-spin"></div>' +
    '<h2>근무표를 읽는 중이에요</h2>' +
    '<p class="ai-step" id="aiStep">' + aiStepText(0) + '</p>' +
    '<p class="ai-sec" id="aiSec">0초 지났어요</p>' +
    '<p class="ai-warn">⚠️ 다 될 때까지 <b>앱을 닫거나 뒤로 가지 마세요</b>.<br>중간에 멈추면 처음부터 다시 해야 해요.</p></div>';
  el.className = 'on';
  aiTick = setInterval(function () {
    var sec = Math.floor((Date.now() - aiT0) / 1000);
    var s = document.getElementById('aiStep'), c = document.getElementById('aiSec');
    if (s) s.textContent = aiStepText(sec);
    if (c) c.textContent = sec + '초 지났어요';
  }, 1000);
  /* 뒤로가기 차단 — 한 칸 쌓아두고, 뒤로 누르면 도로 채워 넣는다 */
  history.pushState({ ai: 1 }, '', location.href);
  window.addEventListener('popstate', aiBlockBack);
  window.addEventListener('beforeunload', aiBlockUnload);
}
function aiLoadingHide() {
  aiBusy = false;
  if (aiTick) { clearInterval(aiTick); aiTick = null; }
  window.removeEventListener('popstate', aiBlockBack);
  window.removeEventListener('beforeunload', aiBlockUnload);
  var el = document.getElementById('aiLoading');
  if (el) { el.className = ''; el.innerHTML = ''; }
  /* 막으려고 쌓아둔 기록 한 칸을 조용히 정리 */
  if (history.state && history.state.ai) history.back();
}
function aiImport(ev) {
  var fl = Array.prototype.slice.call(ev.target.files || []);
  ev.target.value = '';
  if (!fl.length) return;
  if (fl.length > 3) { alert('한 번에 3개까지 올릴 수 있어요. (지금 ' + fl.length + '개를 고르셨어요)\n\n달이 여러 개면 최근 3개 달만 골라주세요.'); return; }
  if (aiBusy) return;                     // 두 번 눌러 겹치지 않게
  aiLoadingShow();
  Promise.all(fl.map(aiFileToB64)).then(function (files) {
    return Cloud.aiAnalyze(files);
  }).then(function (res) {
    aiLoadingHide();
    if (!res || !res.status) { alert('분석 요청에 실패했어요. 인터넷 연결을 확인해주세요.'); return; }
    if (res.status !== 200) { alert((res.data && res.data.error) || '분석에 실패했어요. 다시 시도해주세요.'); return; }
    applyAiResult(res.data);
  }).catch(function () {
    aiLoadingHide();
    alert('분석 중 문제가 생겼어요. 다시 시도해주세요.');
  });
}
/* 서버가 읽어온 표(원문 셀) 한 장을 엑셀 가져오기와 같은 형태로 변환 */
function aiSheetToParse(sheet) {
  var days = sheet.days | 0;
  if (days < 28 || days > 31) days = 31;
  var unknown = [];
  var rows = (sheet.rows || []).map(function (r) {
    var cells = (r.cells || []).slice(0, days);
    while (cells.length < days) cells.push('');
    return {
      name: String(r.name || '').trim(),
      group: r.group === 'NA' ? 'NA' : 'RN',
      codes: cells.map(function (c) {
        var s = String(c == null ? '' : c).trim();
        /* AI가 표 머리글(요일·날짜)을 셀로 옮겨오는 경우 — 근무 코드가 아니므로 빈칸 처리 */
        if (/^[일월화수목금토](요일)?$/.test(s) || /^\d{1,2}$/.test(s)) return '';
        return Importer._normCode(s, unknown);
      })
    };
  }).filter(function (r) { return /^[가-힣]{2,5}$/.test(r.name); });
  return { ym: /^\d{4}-\d{2}$/.test(sheet.ym || '') ? sheet.ym : '', days: days, rows: rows, unknownCodes: unknown };
}
/* 여러 장(달)을 받아 **가장 최근 달을 기준**으로 삼고, 이전 달들은 이력으로만 저장한다.
   2026-07-20: 예전엔 서버가 여러 장을 무조건 한 표로 합쳐서, 5·6월을 같이 올리면
   뒤섞여 한 달치만 쓴 것처럼 보였다. 이제 달별로 분리해 받는다.
   사람·규칙은 최근 달 기준(전월은 근무 패턴을 이어받기 위한 참고). */
function applyAiResult(d) {
  /* 옛 응답(단일 표) 호환 */
  var sheets = d.sheets && d.sheets.length ? d.sheets : [{ ym: d.ym, days: d.days, rows: d.rows }];
  var parsed = sheets.map(aiSheetToParse).filter(function (p) { return p.rows.length; });
  if (!parsed.length) { alert('사람 이름을 찾지 못했어요. 표 전체가 잘 보이게 다시 찍어주세요.'); return; }

  /* 연-월을 아는 것끼리는 날짜순, 모르는 것은 받은 순서 유지 → 마지막이 가장 최근 달 */
  var known = parsed.filter(function (p) { return p.ym; }).sort(function (a, b) { return a.ym < b.ym ? -1 : 1; });
  var unknownYm = parsed.filter(function (p) { return !p.ym; });
  var ordered = known.length === parsed.length ? known : unknownYm.concat(known);

  var base = ordered[ordered.length - 1];          // 기준 = 가장 최근 달
  _importParse = { days: base.days, rows: base.rows, unknownCodes: base.unknownCodes };
  _importPrevSheets = ordered.slice(0, -1);        // 그 앞의 달들 = 이력용
  /* 서버(Claude)가 근무표에서 읽어낸 반복 습관 — 확인 화면에서 사람이 채택 여부를 고른다.
     옛 응답(patterns 없음)이나 형식 오류는 조용히 빈 목록으로(무회귀). */
  _importPatterns = Array.isArray(d.patterns)
    ? d.patterns.filter(function (p) { return p && typeof p.text === 'string' && p.text.trim(); })
                .map(function (p) { return { text: p.text.trim() }; }).slice(0, 8)
    : [];
  var ym = base.ym || prevYM(curYM, 1);
  toast(ordered.length > 1
    ? ordered.length + '장을 읽었어요! 가장 최근 달을 기준으로 확인해주세요 ✓'
    : '다 읽었어요! 내용을 확인해주세요 ✓');
  renderImportReview(ym);
}
/* ===== 불러온 근무표 확인 — 3단계 마법사(한 장씩) =====
   한 화면에 인원·하루인원·습관을 다 쏟으면 어지럽다는 피드백(2026-07-21).
   인원 → 하루 인원 → 습관 순으로 한 장씩. 대부분 「네」만 누르면 넘어가고 틀린 것만 「아니오」로 펼쳐 고친다.
   단계 이동에도 입력이 안 날아가게 작업 상태(_wiz)에 담아둔다. */
var _wiz = null;

function clampNum(v, lo, hi, fb) { var n = parseInt(v, 10); if (isNaN(n)) return fb; return Math.max(lo, Math.min(hi, n)); }

/* analyze 결과로 작업 상태를 만든다. prevByName가 있으면(월 변경 등) 직군·빼기 편집을 이름으로 잇는다. */
function wizBuild(ym, prevByName, keepPatterns) {
  var res = _importParse;
  var an = Importer.analyze(res.rows, res.days, ym);
  var staff = res.rows.map(function (row, i) {
    var s = an.staff[i];
    var prev = prevByName && prevByName[row.name];
    return {
      name: s.name, group: prev ? prev.group : s.group,
      type: s.type, pref: s.pref, note: s.note, workDays: s.workDays,
      codes: row.codes, exc: prev ? prev.exc : (s.workDays === 0)
    };
  });
  return {
    ym: ym, step: 0, peopleOpen: false, rulesOpen: false,
    staff: staff, rules: an.rulesByGroup,
    global: { maxWork: an.global.maxWork, maxN: an.global.maxN, offAfterN: an.global.offAfterN, backward: an.global.backward },
    meta: an.meta, days: res.days, unknownCodes: res.unknownCodes || [],
    patterns: keepPatterns || _importPatterns.map(function (p) { return { text: p.text, choice: '' }; })
  };
}
/* 직군·빼기 편집을 반영해 하루 인원 규칙을 다시 뽑는다(직군을 바꾸면 규칙도 달라져야 한다 — 2026-07-20 교훈). */
function wizDeriveRules() {
  var res = _importParse;
  var eff = _wiz.staff.filter(function (s) { return !s.exc; })
    .map(function (s) { return { name: s.name, group: s.group, codes: s.codes }; });
  var an = Importer.analyze(eff.length ? eff : res.rows, res.days, _wiz.ym);
  _wiz.rules = an.rulesByGroup;
  _wiz.global = { maxWork: an.global.maxWork, maxN: an.global.maxN, offAfterN: an.global.offAfterN, backward: an.global.backward };
}
/* 지금 단계의 화면 입력을 작업 상태로 읽어들인다(단계 이동·월 변경 전에 호출 — 입력 보존). */
function wizReadStep() {
  if (!_wiz) return;
  if (_wiz.step === 0 && _wiz.peopleOpen) {
    _wiz.staff.forEach(function (s, i) {
      var g = document.getElementById('wzGroup_' + i); if (g) s.group = g.value;
      var e = document.getElementById('wzExc_' + i); if (e) s.exc = e.checked;
    });
  } else if (_wiz.step === 1 && _wiz.rulesOpen) {
    Object.keys(_wiz.rules).forEach(function (gk) {
      ['wd', 'hd'].forEach(function (kind) {
        ['D', 'E', 'N'].forEach(function (f) {
          var lo = document.getElementById('wzR_' + gk + '_' + kind + '_' + f + '_lo');
          var hi = document.getElementById('wzR_' + gk + '_' + kind + '_' + f + '_hi');
          if (!lo || !hi) return;
          var l = clampNum(lo.value, 0, 20, _wiz.rules[gk][kind][f][0]);
          var h = clampNum(hi.value, 0, 20, _wiz.rules[gk][kind][f][1]);
          if (h < l) h = l;
          _wiz.rules[gk][kind][f] = [l, h];
        });
      });
    });
  } else if (_wiz.step === 2) {
    _wiz.patterns.forEach(function (p, i) {
      var sel = document.querySelector('input[name="wzPat_' + i + '"]:checked');
      p.choice = sel ? sel.value : '';
    });
  }
}
function wizNext() {
  wizReadStep();
  if (_wiz.step === 0) wizDeriveRules();   // 직군 편집을 규칙에 반영
  _wiz.step = Math.min(2, _wiz.step + 1);
  renderWiz();
}
function wizBack() { wizReadStep(); _wiz.step = Math.max(0, _wiz.step - 1); renderWiz(); }
function wizOpenPeople() { wizReadStep(); _wiz.peopleOpen = true; renderWiz(); }
function wizOpenRules() { wizReadStep(); _wiz.rulesOpen = true; renderWiz(); }
function wizToggleExc(i) {
  var e = document.getElementById('wzExc_' + i); if (!e) return;
  var card = document.getElementById('wzCard_' + i); if (card) card.classList.toggle('off', e.checked);
}
function wizSetMonth() {
  wizReadStep();
  var y = document.getElementById('wzYear').value, mo = document.getElementById('wzMonth').value;
  var prevByName = {};
  _wiz.staff.forEach(function (s) { prevByName[s.name] = { group: s.group, exc: s.exc }; });
  var keepPat = _wiz.patterns, open = _wiz.peopleOpen;
  _wiz = wizBuild(y + '-' + String(mo).padStart(2, '0'), prevByName, keepPat);
  _wiz.peopleOpen = open;
  renderWiz();
}
function closeImportReview() {
  var h = document.getElementById('importReview');
  h.className = ''; h.innerHTML = '';
  _importParse = null; _wiz = null;
}
function renderImportReview(ym) {
  if (!_importParse) return;
  _wiz = wizBuild(ym, null, null);
  renderWiz();
}
/* 마법사 렌더 — 현재 단계만 그린다 */
function renderWiz() {
  if (!_wiz) return;
  var titles = ['인원 확인', '하루 근무 인원', '근무 습관'];
  var dots = titles.map(function (t, i) {
    return '<span class="wz-dot' + (i === _wiz.step ? ' on' : (i < _wiz.step ? ' done' : '')) + '"></span>';
  }).join('');
  var body = _wiz.step === 0 ? wizPeopleHTML() : (_wiz.step === 1 ? wizRulesHTML() : wizPatternsHTML());
  var html =
    '<div class="imp-card wiz">' +
    '<div class="wz-top"><div class="wz-dots">' + dots + '</div><span class="wz-count">' + (_wiz.step + 1) + ' / 3</span></div>' +
    '<h2>' + titles[_wiz.step] + '</h2>' + body + '</div>';
  var host = document.getElementById('importReview');
  host.innerHTML = html; host.className = 'on';
}
/* --- 1단계: 인원 --- */
function wizPeopleHTML() {
  var pt = ymParts(_wiz.ym), nowY = new Date().getFullYear();
  var yearOpts = '', monOpts = '';
  for (var yy = nowY - 1; yy <= nowY + 1; yy++) yearOpts += '<option value="' + yy + '"' + (yy === pt.y ? ' selected' : '') + '>' + yy + '년</option>';
  for (var mm = 1; mm <= 12; mm++) monOpts += '<option value="' + mm + '"' + (mm === pt.m ? ' selected' : '') + '>' + mm + '월</option>';
  var rn = _wiz.staff.filter(function (s) { return !s.exc && s.group === 'RN'; }).length;
  var na = _wiz.staff.filter(function (s) { return !s.exc && s.group === 'NA'; }).length;
  var monthSel = '<div class="wz-month">📅 <select id="wzYear" onchange="wizSetMonth()">' + yearOpts + '</select> ' +
    '<select id="wzMonth" onchange="wizSetMonth()">' + monOpts + '</select> 근무표예요</div>';
  var multi = _importPrevSheets.length
    ? '<p class="hint wz-note">📚 ' + (_importPrevSheets.length + 1) + '개 달을 읽었어요. 사람·규칙은 이 달 기준, 이전 달은 기록으로만 저장돼요.</p>' : '';
  var warn = (_wiz.unknownCodes && _wiz.unknownCodes.length)
    ? '<p class="hint wz-note">못 알아본 표시: ' + _wiz.unknownCodes.map(esc).join(', ') + ' (빈칸으로 들어가요)</p>' : '';

  if (!_wiz.peopleOpen) {
    return monthSel + multi + warn +
      '<div class="wz-ask"><p class="wz-q">간호사 <b>' + rn + '명</b>' + (na ? ' · 조무사 <b>' + na + '명</b>' : '') + '<br>맞나요?</p>' +
      '<p class="hint">이 근무표에서 읽은 사람 수예요.</p></div>' +
      '<div class="imp-actions wz-nav">' +
      '<button class="btn gray" onclick="wizOpenPeople()">아니요, 고칠게요</button>' +
      '<button class="btn big" onclick="wizNext()">네, 맞아요 →</button></div>';
  }
  var rows = _wiz.staff.map(function (s, i) {
    var grpSel = ['RN', 'NA'].map(function (g) { return '<option value="' + g + '"' + (s.group === g ? ' selected' : '') + '>' + groupNames[g] + '</option>'; }).join('');
    return '<div class="wz-person' + (s.exc ? ' off' : '') + '" id="wzCard_' + i + '">' +
      '<b class="wz-name">' + esc(s.name) + '</b>' +
      '<select id="wzGroup_' + i + '" class="wz-grp">' + grpSel + '</select>' +
      '<label class="wz-del"><input type="checkbox" id="wzExc_' + i + '"' + (s.exc ? ' checked' : '') + ' onchange="wizToggleExc(' + i + ')"> 빼기</label></div>';
  }).join('');
  return monthSel + multi + warn +
    '<p class="hint" style="margin:6px 0 6px">틀린 사람은 「빼기」, 직군이 다르면 간호사↔조무사로 바꿔주세요. 근무 형태·성향은 나중에 「우리 병동」에서 고칠 수 있어요.</p>' +
    '<div class="wz-people">' + rows + '</div>' +
    '<div class="imp-actions wz-nav"><button class="btn gray" onclick="closeImportReview()">취소</button>' +
    '<button class="btn big" onclick="wizNext()">다음 →</button></div>';
}
/* --- 2단계: 하루 인원 --- */
function wizRulesHTML() {
  var groups = Object.keys(_wiz.rules);
  function rng(a) { return a[0] === a[1] ? a[0] + '명' : a[0] + '~' + a[1] + '명'; }
  function sumFor(gk) {
    var lb = groups.length > 1 ? groupNames[gk] + ' ' : '';
    var r = _wiz.rules[gk];
    return '<div class="wz-sumline"><b>' + lb + '평일</b><br>데이(D) ' + rng(r.wd.D) + ' · 이브닝(E) ' + rng(r.wd.E) + ' · 나이트(N) ' + rng(r.wd.N) + '</div>' +
      '<div class="wz-sumline"><b>' + lb + '주말·공휴일</b><br>데이(D) ' + rng(r.hd.D) + ' · 이브닝(E) ' + rng(r.hd.E) + ' · 나이트(N) ' + rng(r.hd.N) + '</div>';
  }
  if (!_wiz.rulesOpen) {
    return '<div class="wz-ask"><p class="wz-q">하루에 이만큼 근무하나요?</p>' +
      '<div class="wz-summary">' + groups.map(sumFor).join('') + '</div>' +
      '<p class="hint">데이=D, 이브닝=E, 나이트=N (MD·E2도 각 계열에 포함돼요)</p></div>' +
      '<div class="imp-actions wz-nav">' +
      '<button class="btn gray" onclick="wizBack()">← 이전</button>' +
      '<button class="btn gray" onclick="wizOpenRules()">아니요, 고칠게요</button>' +
      '<button class="btn big" onclick="wizNext()">네, 맞아요 →</button></div>';
  }
  var rows = '';
  groups.forEach(function (gk) {
    [['wd', '평일'], ['hd', '주말·공휴일']].forEach(function (kd) {
      function box(f) {
        var id = 'wzR_' + gk + '_' + kd[0] + '_' + f, v = _wiz.rules[gk][kd[0]][f];
        return '<td class="rgcell"><input type="number" min="0" max="20" id="' + id + '_lo" value="' + v[0] + '"><span>~</span><input type="number" min="0" max="20" id="' + id + '_hi" value="' + v[1] + '"></td>';
      }
      rows += '<tr><td class="rgname">' + (groups.length > 1 ? groupNames[gk] + '<br>' : '') + '<span class="hint">' + kd[1] + '</span></td>' + box('D') + box('E') + box('N') + '</tr>';
    });
  });
  return '<p class="hint" style="margin:2px 0 8px">하루에 몇 명이 서는지 최소~최대로 고쳐주세요.</p>' +
    '<div class="imp-scroll2"><table class="rgtable"><tr><th>&nbsp;</th><th>데이(D)</th><th>이브닝(E)</th><th>나이트(N)</th></tr>' + rows + '</table></div>' +
    '<div class="imp-actions wz-nav"><button class="btn gray" onclick="wizBack()">← 이전</button>' +
    '<button class="btn big" onclick="wizNext()">다음 →</button></div>';
}
/* --- 3단계: 습관 --- */
function wizPatternsHTML() {
  var body;
  if (!_wiz.patterns.length) {
    body = '<div class="wz-ask"><p class="wz-q">특별한 습관은 없었어요 👍</p><p class="hint">이 근무표에서 눈에 띄는 반복 습관을 찾지 못했어요. 그대로 적용하면 돼요.</p></div>';
  } else {
    var items = _wiz.patterns.map(function (p, i) {
      return '<div class="imppat"><div class="imppat-t">“' + esc(p.text) + '”</div>' +
        '<div class="imppat-c">' +
        '<label><input type="radio" name="wzPat_' + i + '" value="yes"' + (p.choice === 'yes' ? ' checked' : '') + '> 맞아요</label>' +
        '<label><input type="radio" name="wzPat_' + i + '" value="no"' + (p.choice === 'no' ? ' checked' : '') + '> 우연이에요</label>' +
        '</div></div>';
    }).join('');
    body = '<p class="hint" style="margin:0 0 8px">AI가 읽어낸 반복 습관이에요. 맞으면 「맞아요」를 눌러주세요. <b>「맞아요」한 것만</b> 「우리 병동 메모」에 참고로 저장돼요 — <b>근무표에 자동으로 넣지는 않아요.</b></p>' + items;
  }
  return body +
    '<div class="imp-actions wz-nav"><button class="btn gray" onclick="wizBack()">← 이전</button>' +
    '<button class="btn big" onclick="applyImport()">이대로 적용 ✓</button></div>';
}
function applyImport() {
  if (!_wiz) return;
  wizReadStep();                 // 지금 단계(습관) 선택을 마지막으로 반영
  var ym = _wiz.ym;

  var staff = [], codesById = {};
  _wiz.staff.forEach(function (s, i) {
    if (s.exc) return;
    var id = 'imp' + Date.now() + '_' + i;
    staff.push({ id: id, name: s.name, group: s.group, type: s.type, pref: s.pref });
    codesById[id] = s.codes.slice();
  });
  if (!staff.length) { alert('등록할 사람이 없어요. 「빼기」를 하나 이상 풀어주세요.'); return; }
  if (staffList().length && !confirm('기존 인원 ' + staffList().length + '명을 지우고 새로 등록합니다. 계속할까요?')) return;

  /* 규칙: 마법사에서 확정한 값(_wiz.rules)을 그대로 쓴다. 직군 편집은 wizDeriveRules로 이미 반영됨. */
  var r = rules2();
  Object.keys(_wiz.rules).forEach(function (g) { r.groups[g] = _wiz.rules[g]; });
  r.maxWork = _wiz.global.maxWork; r.maxN = _wiz.global.maxN; r.offAfterN = _wiz.global.offAfterN; r.backward = _wiz.global.backward;

  /* 인원 교체 + 선택 월 코드 저장 */
  db.staff = staff;
  var dim = daysInYM(ym), codes = {};
  staff.forEach(function (p) {
    var src = codesById[p.id] || [], arr = [];
    for (var d = 0; d < dim; d++) arr.push(src[d] || '');
    codes[p.id] = arr;
  });
  db.months = db.months || {};
  db.months[ym] = { codes: codes, wish: {}, pins: {}, holidays: [] };

  /* 함께 올린 이전 달들 — 이름이 같은 사람에게만 붙여 이력으로 저장(그만둔/새 사람은 자연히 빠짐) */
  var byName = {};
  staff.forEach(function (p) { byName[p.name] = p.id; });
  var histSaved = 0;
  _importPrevSheets.forEach(function (sheet, idx) {
    var back = _importPrevSheets.length - idx;
    var hym = sheet.ym || prevYM(ym, back);
    var hdim = daysInYM(hym), hcodes = {}, matched = 0;
    sheet.rows.forEach(function (row) {
      var id = byName[row.name]; if (!id) return;
      var arr = []; for (var d = 0; d < hdim; d++) arr.push(row.codes[d] || '');
      hcodes[id] = arr; matched++;
    });
    if (matched) { db.months[hym] = { codes: hcodes, wish: {}, pins: {}, holidays: [] }; histSaved++; }
  });

  /* AI 습관 메모 — 「맞아요」한 것만 이 계정에 저장(dedup·자동 강제 X, 참고 표시용) */
  var patAdded = 0, patShown = _wiz.patterns.length;
  if (patShown) {
    db.customPatterns = db.customPatterns || [];
    var seen = db.customPatterns.map(function (p) { return normPatText(p.text); });
    var nowIso = new Date().toISOString();
    _wiz.patterns.forEach(function (p, i) {
      if (p.choice !== 'yes') return;
      var key = normPatText(p.text);
      if (!key || seen.indexOf(key) >= 0) return;
      seen.push(key);
      db.customPatterns.push({ id: 'pat' + Date.now() + '_' + i, text: p.text, source: 'ai', ym: ym, adoptedAt: nowIso });
      patAdded++;
    });
  }
  save();
  closeImportReview();
  renderRules();
  showTab('home');
  var msg = '근무표를 불러왔어요 — ' + staff.length + '명 등록 ✓';
  if (histSaved) msg += ' · 이전 ' + histSaved + '개 달은 기록으로 저장됨';
  else if (ym !== curYM) msg += ' (이력으로 저장됨 — 다음 달 만들 때 반영)';
  if (patAdded) msg += ' · 습관 메모 ' + patAdded + '개 저장';
  else if (patShown) msg += ' (습관 메모는 저장하지 않았어요)';
  toast(msg);
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
checkAlreadyInstalled();   // 이미 홈 화면에 있으면 버튼·안내를 그에 맞게 바꾼다
/* 소셜 로그인 실패로 돌아온 경우 — URL의 error_description을 사람 말로 알려주고 주소를 정리한다 */
(function () {
  var mch = (location.search + location.hash).match(/[?#&]error_description=([^&]+)/);
  if (!mch) return;
  var desc = decodeURIComponent(mch[1].replace(/\+/g, ' '));
  toast('로그인이 안 됐어요: ' + cloudErrMsg({ message: desc }));
  history.replaceState(null, '', location.pathname);
})();
if (window.Cloud && Cloud.enabled()) {
  Cloud.onChange(function (event, userChanged) {
    if (event === 'PASSWORD_RECOVERY') {
      /* 이메일 재설정 링크로 돌아온 상태 — 새 비밀번호 화면으로 */
      Cloud.setAuthFlow(true);
      cloudView = 'newpw';
      authCtx.mode = 'reset';
      authTarget = 'cloudBody';   // 재설정은 보관함 카드에서 진행
      showTab('archive');
      return;
    }
    if (Cloud.inAuthFlow()) return;   // 가입 인증·재설정 진행 중 — 화면을 덮지 않는다
    if (event === 'SIGNED_IN' && userChanged) cloudSyncOnLogin();
    /* 지금 보이는 탭의 인증 UI를 갱신한다. 홈이면 홈 로그인 카드(homeLoginBody),
       아니면 보관함 카드(cloudBody). 초기 INITIAL_SESSION이 홈 카드를 지우지 않게 하기 위함. */
    else if (document.getElementById('tab-home').style.display !== 'none') renderHome();
    else renderCloudCard();
  });
  Cloud.init();
}

/* 근무표 보기: 세로에선 축소 미리보기(미니맵), 탭하면 가로 전체화면으로 '표 전체'를 크게 본다.
   2026-07-22 재수정(v6.0.1): 앱 화면 '세로 고정'은 의도된 설계다(v4.7.4 — 설치형 PWA가 시스템
   회전 잠금을 무시해 어르신 사용자에게 화면이 멋대로 도는 게 불편). v6.0.0에서 이걸 통째로
   풀었다가 그 문제가 재발 → 다시 세로 고정으로 복귀하되, '표 크게 보기' 뷰어에서만 가로로 잠근다.
   그리고 뷰어는 표를 잘리지 않게 화면에 '전체가 들어오도록' 축소해 가운데 보여준다. */

/* 앱 세로 고정 — 로드·회전·복귀 때마다 다시 건다. 단, 표 뷰어가 열려 있으면(가로) 건드리지 않는다. */
function lockPortrait() {
  if (document.body.classList.contains('grid-open')) return;   // 뷰어는 가로 유지
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(function () { });
    }
  } catch (e) { /* 미지원 기기 — 무시 */ }
}
lockPortrait();
window.addEventListener('orientationchange', function () {
  if (document.body.classList.contains('grid-open')) setTimeout(fitGridFull, 250);  // 회전 후 뷰포트 확정되면 재적합
  else lockPortrait();
});
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') lockPortrait();
});
window.addEventListener('resize', function () {
  if (document.body.classList.contains('grid-open')) fitGridFull(); else fitGridThumb();
});

/* 미니맵(세로): 그리드 전체가 카드 폭에 들어오도록 축소해 '한 달 표가 있구나'를 한눈에 보여준다. */
function fitGridThumb() {
  var thumb = document.getElementById('gridThumb');
  var area = document.getElementById('gridArea');
  if (!thumb || !area) return;
  if (document.body.classList.contains('grid-open')) return;   // 전체화면 중엔 미니맵 축소 안 함
  area.style.width = ''; area.style.height = '';                // 뷰어에서 쓴 값 정리
  var table = area.querySelector('table.duty');
  if (!table) { area.style.transform = ''; thumb.style.height = ''; return; }
  area.style.transform = '';                    // 실측 위해 초기화
  var w = table.scrollWidth, h = table.offsetHeight;
  var avail = thumb.clientWidth;
  if (!w || !avail) return;                      // 숨겨져 있으면(폭 0) 건너뜀
  var s = Math.min(1, avail / w);
  area.style.transformOrigin = 'top left';
  area.style.transform = 'scale(' + s + ')';
  /* 사람이 많아 표가 길면 미니맵이 화면을 다 먹지 않도록 높이 제한(아래는 페이드로 가려짐) */
  thumb.style.height = Math.min(h * s, Math.round(window.innerHeight * 0.42)) + 'px';
}

/* 뷰어(가로 전체화면): 표 '전체'가 한 화면에 들어오도록 축소해 가운데 보여준다(잘림 없음). */
function fitGridFull() {
  var thumb = document.getElementById('gridThumb');
  var area = document.getElementById('gridArea');
  if (!thumb || !area) return;
  if (!document.body.classList.contains('grid-open')) return;
  var table = area.querySelector('table.duty');
  if (!table) return;
  area.style.transform = ''; area.style.width = ''; area.style.height = '';   // 실측 위해 초기화
  var tW = table.scrollWidth, tH = table.offsetHeight;
  var availW = thumb.clientWidth - 16, availH = thumb.clientHeight - 16;       // 여백
  if (!tW || !tH || availW <= 0 || availH <= 0) return;
  var s = Math.min(availW / tW, availH / tH);    // 가로·세로 둘 다 들어오는 배율 = 전체가 보임
  /* #gridArea를 네이티브 크기 그대로 두고(폭/높이 안 건드림·overflow visible) 중심 기준으로 축소한다.
     #gridThumb가 flex center라 네이티브 박스 중심이 화면 중심에 오고, 중심 기준 scale이라 전체가 가운데 정렬.
     ⚠️ 폭/높이를 축소값으로 박고 overflow:hidden 하면 표가 먼저 그 폭으로 '잘린 뒤' 축소돼 잘림으로 보인다(v6.0.1 버그, v6.0.2 수정). */
  area.style.transformOrigin = 'center center';
  area.style.transform = 'scale(' + s + ')';
}

/* 표를 가로 전체화면으로 크게 — #gridThumb를 화면 가득 채우고(클래스 토글) 가로로 잠근다. */
function openGridFull() {
  if (document.body.classList.contains('grid-open')) return;
  if (!document.querySelector('#gridArea table.duty')) return;   // 아직 표가 없으면 무시
  document.body.classList.add('grid-open');
  var thumb = document.getElementById('gridThumb');
  if (thumb) { thumb.style.height = ''; thumb.scrollTop = 0; }
  lockLandscape();
  fitGridFull();                                 // 회전 전 우선 적합, 회전 완료되면 재적합
}
function closeGridFull(ev) {
  if (ev) ev.stopPropagation();
  document.body.classList.remove('grid-open');
  var area = document.getElementById('gridArea');
  if (area) { area.style.transform = ''; area.style.width = ''; area.style.height = ''; }
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { }
  lockPortrait();     // 기본은 세로 고정 — 닫으면 세로로 되돌린다
  fitGridThumb();
}
/* 가로 잠금: 설치형 앱(안드로이드)에선 바로 되고, 브라우저 탭에서 거부되면 전체화면을 먼저 켜고 재시도.
   iOS 사파리 등 미지원 기기에선 조용히 실패 — 표는 그대로 축소돼 전체가 보이므로 세로로도 열람은 된다. */
function lockLandscape() {
  try {
    if (!(screen.orientation && screen.orientation.lock)) return;
    screen.orientation.lock('landscape').then(function () {
      setTimeout(fitGridFull, 250);   // 회전 완료 후 새(가로) 뷰포트로 재적합
    }).catch(function () {
      var el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().then(function () {
          try { screen.orientation.lock('landscape').then(function () { setTimeout(fitGridFull, 250); }).catch(function () { }); } catch (e) { }
        }).catch(function () { });
      }
    });
  } catch (e) { /* 미지원 — 무시 */ }
}
/* Esc 또는 시스템이 전체화면을 해제하면 큰 화면도 닫는다 */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && document.body.classList.contains('grid-open')) closeGridFull();
});
document.addEventListener('fullscreenchange', function () {
  if (!document.fullscreenElement && document.body.classList.contains('grid-open')) closeGridFull();
});
