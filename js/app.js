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

/* ===== 단색 선형 SVG 아이콘 (UI_SPEC §5 — 컬러 이모지 대신) ===== */
var ICONS = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 17.5h.01M12 17.5h.01"/>',
  people: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 20c.6-3.4 3.1-5.5 6.2-5.5s5.6 2.1 6.2 5.5"/><path d="M15.5 5.6a3.5 3.5 0 0 1 0 5.8M17.6 14.8c2 .8 3.3 2.6 3.6 5.2"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M9.5 13h5"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  back: '<path d="M15 4l-8 8 8 8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  bang: '<path d="M12 5v9M12 18.5h.01"/>',
  camera: '<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5z"/><circle cx="12" cy="13.5" r="3.4"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 9v12"/>',
  edit: '<path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20z"/><path d="M14.5 7l3 3"/>',
  "import": '<path d="M12 3v11M7.5 10L12 14.5 16.5 10"/><path d="M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3"/>',
  doc: '<path d="M6.5 3h7L18.5 8v11a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v6h6M8.5 13h7M8.5 16.5h7"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.4-9A5.5 5.5 0 0 1 17.3 11 3.8 3.8 0 0 1 17 18.5H7z"/>',
  scale: '<path d="M12 4v16M7 20h10M12 6H5.5M12 6h6.5M5.5 6L3 12h5L5.5 6zM18.5 6L16 12h5l-2.5-6z"/><path d="M3 12a2.5 2.5 0 0 0 5 0M16 12a2.5 2.5 0 0 0 5 0"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-10.7a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/>',
  calstar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 12.2l.95 1.9 2.1.3-1.5 1.5.35 2.1-1.9-1-1.9 1 .35-2.1-1.5-1.5 2.1-.3z"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9M20 3v4h-4"/>',
  link: '<path d="M9.5 14.5l5-5M8 11l-2.3 2.3a3.5 3.5 0 0 0 5 5L13 16M11 8l2.3-2.3a3.5 3.5 0 0 1 5 5L16 13"/>',
  kebab: '<path d="M12 5.5h.01M12 12h.01M12 18.5h.01"/>'
};
function ic(name, extra) {
  return '<svg class="svgi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + (ICONS[name] || '') + '</svg>';
}
/* data-ic 속성이 붙은 정적 요소를 아이콘으로 채운다(시작 시 1회) */
function renderIcons(root) {
  (root || document).querySelectorAll('[data-ic]').forEach(function (el) {
    if (!el.innerHTML) el.innerHTML = ic(el.getAttribute('data-ic'));
  });
}

/* ===== 바텀시트 공통 ===== */
function openSheet(html) {
  var w = document.getElementById('sheetWrap');
  document.getElementById('sheet').innerHTML = '<div class="sh-grip"></div>' + html;
  w.className = 'on';
  w.onclick = function (ev) { if (ev.target === w) closeSheet(); };
}
function closeSheet() {
  var w = document.getElementById('sheetWrap');
  w.className = ''; document.getElementById('sheet').innerHTML = '';
  sheetCtx = null;
}
var sheetCtx = null;   // 열려 있는 시트의 작업 상태(구성원 편집·근무 선택 등)

/* ===== 부속 화면(뒤로가기 헤더) 공통 — 08 규칙 · 14 데이터 · 15 희망휴무 ===== */
var openScreenId = null;
function openScreen(id) {
  closeSheet();
  openScreenId = id;
  document.body.classList.add('nonav');
  document.getElementById(id).classList.add('on');
  document.getElementById(id).scrollTop = 0;
}
function closeScreen() {
  if (!openScreenId) return;
  document.getElementById(openScreenId).classList.remove('on');
  openScreenId = null;
  document.body.classList.remove('nonav');
}
function ssTop(title, doneLabel, doneFn) {
  return '<div class="ss-top"><button class="ss-back" onclick="' + (doneFn || 'closeScreen()') + '" aria-label="뒤로">' + ic('back') + '</button>' +
    '<span class="ss-title">' + title + '</span>' +
    '<button class="ss-done" onclick="' + (doneFn || 'closeScreen()') + '">' + (doneLabel || '완료') + '</button></div>';
}

/* ===== 머리글 ⋮ 메뉴 ===== */
function toggleKebab(ev) {
  ev.stopPropagation();
  var m = document.getElementById('kebabMenu');
  if (m.classList.contains('on')) { m.classList.remove('on'); return; }
  var u = window.Cloud && Cloud.enabled() && Cloud.getUser();
  var items = '';
  if (!isStandalone() && !alreadyInstalled)
    items += '<button onclick="hideKebab();installEntry()">' + ic('link') + ' 홈 화면에 바로가기 만들기</button>';
  if (u) items += '<button onclick="hideKebab();aiImportStart()">' + ic('camera') + ' 사진·PDF로 근무표 읽기</button>';
  items += '<button onclick="hideKebab();forceUpdate()">' + ic('refresh') + ' 최신으로 새로고침</button>';
  items += '<div class="km-ver"><span class="appver"></span></div>';
  m.innerHTML = items;
  var v = document.querySelector('footer .appver');
  var kv = m.querySelector('.appver');
  if (v && kv) kv.textContent = v.textContent;
  var btn = document.getElementById('kebabBtn');
  var r = btn.getBoundingClientRect();
  m.style.top = (r.bottom + 4) + 'px';
  m.style.right = '14px'; m.style.left = 'auto';
  m.classList.add('on');
}
function hideKebab() { document.getElementById('kebabMenu').classList.remove('on'); }
document.addEventListener('click', function (ev) {
  var m = document.getElementById('kebabMenu');
  if (m.classList.contains('on') && !m.contains(ev.target)) hideKebab();
});

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
  closeSheet();
  closeScreen();
  hideKebab();
  ['home', 'ward', 'archive'].forEach(function (x) {
    document.getElementById('tab-' + x).style.display = x === t ? '' : 'none';
    document.getElementById('tabBtn-' + x).className = x === t ? 'on' : '';
  });
  if (t !== 'home') setLoginView(false);   // 다른 탭에서는 로그인 전용 배치를 풀어둔다
  if (t === 'home') renderHome();
  if (t === 'ward') renderStaff();
  if (t === 'archive') { renderArchive(); renderCloudCard(); renderInstallCard(); }
  renderBrowserGate();
  window.scrollTo(0, 0);
}
function moveMonth(dir) {
  closeSheet();
  curYM = prevYM(curYM, -dir);
  save(); renderMonthLabel(); renderHome();
}
function renderMonthLabel() {
  var p = ymParts(curYM);
  document.querySelectorAll('.mn-cur').forEach(function (el) { el.textContent = p.y + '년 ' + p.m + '월'; });
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
/* 홈 상태 판정용: 초안이 있는가 — 손으로 미리 찍은 📌 고정만 있는 달은 아직 '준비' 단계다.
   (고정 몇 칸 찍었다고 「초안 완성」 화면으로 넘어가면 만들기 버튼이 사라져 헤맨다) */
function hasDraft() {
  var m = month(curYM);
  return staffList().some(function (p) {
    var pins = m.pins[p.id] || {};
    return (m.codes[p.id] || []).some(function (c, i) { return c && !pins[i + 1]; });
  });
}

/* ---- 홈 화면 (상태에 따라 바뀜) ---- */
/* 구버전 머리글 계정 버튼 자리 — 로그아웃은 「데이터 및 계정」(14)으로 이동 */
function renderAcctBtn() { }
/* 로그인 화면 전용 배치 — 머리글·하단 탭·푸터를 감추고 한 화면에 담는다 */
function setLoginView(on) {
  /* body.className을 통째로 바꾸면 다른 상태 클래스(예: 가로 전체화면 grid-open)가 지워진다 —
     loginview만 토글해 보존한다(2026-07-22). */
  document.body.classList.toggle('loginview', on);
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
  ensureHolidays(curYM);
  var staff = staffList();
  var empty = document.getElementById('homeEmpty');
  var prep = document.getElementById('homePrep');
  var done = document.getElementById('homeDone');
  var loginCard = document.getElementById('homeLoginCard');
  /* 로그인 안 된 상태(처음 연 사람 + 로그아웃 직후)에는 인원 유무와 상관없이 로그인 화면만 보여준다. */
  var showLogin = window.Cloud && Cloud.enabled() && !Cloud.getUser() && !loginSkippedNow;
  setLoginView(showLogin);
  loginCard.style.display = showLogin ? '' : 'none';
  if (showLogin) {
    empty.style.display = 'none'; prep.style.display = 'none'; done.style.display = 'none';
    authTarget = 'homeLoginBody'; cloudView = 'main'; renderAuth();
    return;
  }
  if (!staff.length) {
    empty.style.display = ''; prep.style.display = 'none'; done.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  var filled = hasDraft();
  prep.style.display = filled ? 'none' : '';
  done.style.display = filled ? '' : 'none';
  if (!filled) renderPrep();
  else { renderDoneHead(); renderGrid(); }
}
/* 「로그인 없이 쓰기」는 이번 실행에서만 유효하다(저장하지 않음).
   예전처럼 db.loginSkipped에 영구 저장하면, 한 번 누른 뒤로는 로그아웃해도 로그인 화면이 영영 안 뜬다. */
var loginSkippedNow = false;
function skipLogin() { loginSkippedNow = true; renderHome(); }

/* ---- 상태 2: 자동 생성 준비(09) — 체크리스트 ---- */
function renderPrep() {
  var staff = staffList();
  var m = month(curYM);
  var wishCount = 0, pinCount = 0;
  staff.forEach(function (p) {
    wishCount += (m.wish[p.id] || []).length;
    pinCount += Object.keys(m.pins[p.id] || {}).length;
  });
  var p = ymParts(curYM);
  document.getElementById('prepTitle').textContent = p.m + '월 근무표 만들기';
  var gs = groupsPresent();
  var grpTx = gs.map(function (g) { return groupNames[g]; }).join('·');
  var wpTx = [];
  if (wishCount) wpTx.push('희망 휴무 ' + wishCount + '건');
  if (pinCount) wpTx.push('고정 근무 ' + pinCount + '건');
  var wpDone = wishCount + pinCount > 0;
  function row(iconOk, title, sub, go, fn) {
    return '<button class="preprow" onclick="' + fn + '">' +
      '<span class="pr-ico ' + (iconOk ? 'ok' : 'warn') + '">' + ic(iconOk ? 'check' : 'bang') + '</span>' +
      '<span class="pr-tx"><b>' + title + '</b><span class="pr-sub">' + sub + '</span></span>' +
      '<span class="pr-go">' + go + ic('chevR') + '</span></button>';
  }
  document.getElementById('prepStatus').innerHTML =
    row(true, '병동 구성', staff.length + '명 준비됨', '확인', "showTab('ward')") +
    row(true, '근무 규칙', grpTx + ' 설정됨', '확인', 'openRulesScreen()') +
    row(wpDone, '희망 휴무·고정 근무', wpDone ? wpTx.join(' · ') + ' 입력됨' : '아직 입력한 날이 없어요', '입력', 'openWishScreen()');
  /* 형평성 안내 — 지난 기록이 있어야 이어받는다 */
  var hasHist = [1, 2].some(function (back) {
    var rec = (db.months || {})[prevYM(curYM, back)];
    return rec && rec.codes && Object.keys(rec.codes).length;
  });
  document.getElementById('fairnoteTx').innerHTML = hasHist
    ? '지난 2개월 기록을 반영해<br>나이트와 휴일 근무를 고르게 배정해요.'
    : '근무표를 만들수록 지난 기록이 쌓여<br>나이트와 휴일 근무가 더 고르게 배정돼요.';
}
function editRules() { openRulesScreen(); }

/* ---- 상태 3: 완성(11) — 제목·상태 칩 ---- */
function renderDoneHead() {
  var p = ymParts(curYM);
  document.getElementById('doneTitle').textContent = p.m + '월 근무표 초안이 완성됐어요';
  var v = currentViols();
  var chips = v.length
    ? '<button class="chip red" onclick="openGridFull()">확인할 곳 ' + v.length + '곳</button>'
    : '<span class="chip green">' + ic('check') + ' 규칙 위반 없음</span>';
  /* 형평성(상대): 같은 직군에서 최대 휴무자보다 2일+ 덜 쉰 사람이 있는가 */
  var short = fairnessShortNames();
  chips += short.length
    ? '<button class="chip red" onclick="openGridFull()">공평성 확인 ' + short.length + '명</button>'
    : '<span class="chip green">공평성 양호</span>';
  document.getElementById('doneChips').innerHTML = chips;
}
/* 같은 직군에서 남들(최대 휴무자)보다 2일+ 덜 쉰 사람 이름 목록 */
function fairnessShortNames() {
  var out = [];
  var days = daysInYM(curYM);
  groupsPresent().forEach(function (g) {
    var gStaff = groupStaff(g);
    if (gStaff.length < 2) return;
    var rests = [], maxRest = 0;
    gStaff.forEach(function (p) {
      var rc = 0, fl = 0;
      for (var d = 1; d <= days; d++) { var c = cellCode(p.id, d); if (c) { fl++; if (!E.fam(c)) rc++; } }
      if (fl === days) { rests.push({ name: p.name, rest: rc }); if (rc > maxRest) maxRest = rc; }
    });
    rests.forEach(function (x) { if (maxRest - x.rest >= 2) out.push(x.name); });
  });
  return out;
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
    html += '<th id="dh_' + d + '"' + cls + '>' + d + '<br>' + (m.holidays.indexOf(d) >= 0 ? '휴' : wdNames[wd]) + '</th>';
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
  renderDoneHead();
  if (document.body.classList.contains('grid-open')) { fitGridFull(); renderViewerPanel(); }
  else fitGridThumb();
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
/* 하이라이트는 '한 번에 한 칸'만 — 이전에 켜둔 칸은 끄고 새 칸만 켠다.
   (예전엔 칸마다 개별 타이머라, 한 곳을 켠 채 다른 곳을 누르면 둘이 동시에 반짝여 헷갈렸다.) */
var activeFlash = null;
function flashCellEl(el, cls, ms) {
  if (activeFlash && activeFlash.el) {
    activeFlash.el.classList.remove('viol-flash', 'fix-flash');
    clearTimeout(activeFlash.t);
  }
  el.classList.remove(cls);
  void el.offsetWidth;                 // 재클릭 시 애니메이션 재시작(리플로우 강제)
  el.classList.add(cls);
  var t = setTimeout(function () {
    el.classList.remove(cls);
    if (activeFlash && activeFlash.el === el) activeFlash = null;
  }, ms);
  activeFlash = { el: el, t: t };
}
function jumpTo(pid, day) {
  /* 위반 칸으로 데려간다. 세로에선 먼저 가로 뷰어를 열고(레이아웃 잡힌 뒤 재호출),
     그 칸 주변으로 알맞게 줌인한 뒤 애플식 포커스 링으로 잔잔히 띄운다. */
  if (!document.body.classList.contains('grid-open')) {
    openGridFull();
    setTimeout(function () { jumpTo(pid, day); }, 320);
    return;
  }
  var el = document.getElementById('c_' + pid + '_' + day);
  if (!el) return;
  vzFocus = { id: 'c_' + pid + '_' + day, t: Date.now() };   // 회전·재렌더 직후 재중앙용
  vzFocusCell(el);
  flashCellEl(el, 'viol-flash', 2400);
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
    var vs = E.validate(buildSchedule(groupStaff(g)), groupStaff(g), engineConfig(curYM, g));
    vs.forEach(function (v) { v._g = g; });   // 제안 계산이 어느 직군인지 알 수 있게 태그
    out = out.concat(vs);
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
/* 위반 상세 목록은 뷰어 우측 패널(renderViewerPanel)에서 본다.
   홈에는 상태 칩(renderDoneHead)만 — 옛 배너는 v7 개편으로 없앴다. */
var violExpanded = false;   // (구버전 잔재 — 미사용)
/* ---- 제안(수정 추천) ----
   위반 1건을 '한 칸'만 바꿔 없앨 수 있는지 엔진으로 시뮬레이션한다. 후보를 실제 적용해 재검증하고,
   ① 그 위반이 사라지고 ② 전체 위반 수가 '진짜 줄어드는'(다른 곳을 새로 만들지 않는) 안전한 수정만
   돌려준다 — "고치면 이 오류가 사라진다"가 보장되는 것만 보여줘 헛제안을 막는다. 엔진은 읽기만 한다. */
var _sugMemo = {};
function _groupCtx(g) {
  if (_sugMemo[g]) return _sugMemo[g];
  var gStaff = groupStaff(g);
  var cfg = engineConfig(curYM, g);
  var base = buildSchedule(gStaff);
  var baseCount = E.validate(base, gStaff, cfg).length;
  return (_sugMemo[g] = { gStaff: gStaff, cfg: cfg, base: base, baseCount: baseCount });
}
function _famCountOn(sched, staff, d, f) {
  var n = 0;
  staff.forEach(function (p) { if (E.fam(sched[p.id][d - 1]) === f) n++; });
  return n;
}
function suggestForViol(v) {
  if (!v || v._g == null) return null;
  var ctx = _groupCtx(v._g);
  var gStaff = ctx.gStaff, cfg = ctx.cfg, base = ctx.base;
  var cands = [];
  var staffing = (!v.pid && v.rule === '인원' && v.day);
  var needFam = null, needRange = null;
  if (v.pid && v.day) {                                          // 사람 지정 위반 → 그 칸 자체를 바꾼다
    var cur = (base[v.pid] || [])[v.day - 1];
    if (v.rule === '선입력') {                                   // 미리 정한 값으로 되돌리기
      var pin = ((month(curYM).pins || {})[v.pid] || {})[v.day];
      if (pin != null && pin !== cur) cands.push({ pid: v.pid, day: v.day, code: pin, kind: 'restore' });
    }
    if (cur !== 'O') cands.push({ pid: v.pid, day: v.day, code: 'O', kind: 'self' });  // 오프로 — 대부분 해소
    if (v.rule === '전환') cands.push({ pid: v.pid, day: v.day, code: 'E', kind: 'self' });  // 이브닝(일손 유지)
  } else if (staffing) {                                         // 그 날 '그 계열'의 부족/초과만 겨냥
    /* 계열은 엔진이 위반에 실어주는 구조화 필드(v.fam)로 안다 — 예전 msg 정규식 파싱은 문구를
       사람 말로 바꾸는 순간 깨지므로 폐기(2026-07-25). 인원수(msg의 '명')로는 목표 해소를 판정하지
       않는다 — 초과/부족이 2 이상이면 한 칸 바꿔도 여전히 범위 밖이라, 반드시 아래에서
       '그 계열이 실제로 최소~최대 범위 안에 드는가'로 확인한다(거짓 약속 방지). */
    needFam = v.fam || null;
    if (!needFam) return null;
    var nc = E.normalizeConfig(gStaff, cfg);
    var d = v.day;
    needRange = (nc.isRestDay(d) ? nc.required.holiday : nc.required.weekday)[needFam];
    var isOver = (v.over != null) ? v.over : v.msg.indexOf('초과') >= 0;   // 방향도 구조화 필드 우선(문구 결합 제거)
    if (isOver)                                                  // 초과 → 그 계열 근무자를 오프로
      gStaff.forEach(function (p) { if (E.fam(base[p.id][d - 1]) === needFam) cands.push({ pid: p.id, day: d, code: 'O', kind: 'trim' }); });
    else                                                         // 부족 → 쉬는 사람을 그 계열로
      gStaff.forEach(function (p) { if (!E.fam(base[p.id][d - 1])) cands.push({ pid: p.id, day: d, code: needFam, kind: 'fill' }); });
  }
  var best = null;
  for (var ci = 0; ci < cands.length; ci++) {
    var cd = cands[ci];
    var trial = {}; for (var k in base) trial[k] = base[k];
    trial[cd.pid] = base[cd.pid].slice();
    trial[cd.pid][cd.day - 1] = cd.code;
    var nv = E.validate(trial, gStaff, cfg);
    var cleared = staffing
      ? (function () { var c = _famCountOn(trial, gStaff, v.day, needFam); return c >= needRange[0] && c <= needRange[1]; })()
      : !nv.some(function (x) { return x.rule === v.rule && x.pid === v.pid && x.day === v.day; });
    if (!cleared) continue;                                      // 목표가 실제로 해소돼야 함
    var delta = ctx.baseCount - nv.length;
    if (delta <= 0) continue;                                    // 전체가 줄지 않으면(다른 곳을 새로 만들면) 버림
    var score = delta * 100 + (E.isRest(cd.code) ? 10 : 0) + (cd.kind === 'restore' ? 5 : 0);
    if (!best || score > best.score) best = { cd: cd, score: score };
    if (staffing) break;                                         // 인원은 첫 유효안이면 충분(누굴 빼든/넣든 동등) — 시뮬 절약
  }
  if (!best) return null;
  var cd = best.cd;
  var pName = (gStaff.filter(function (p) { return p.id === cd.pid; })[0] || {}).name || '';
  /* 문구의 근무 이름은 항상 "약자(한글)" — 약자만 쓰면 못 알아듣는다(2026-07-25 초승달 지시) */
  var full = codeDisp[cd.code] + (codeLabels[cd.code] ? '(' + codeLabels[cd.code] + ')' : '');
  var label;
  if (cd.kind === 'restore') label = '이 칸을 원래 정한 ' + full + '(으)로 되돌리면 이 문제가 사라져요';
  else if (cd.kind === 'self') label = '이 칸을 ' + full + '(으)로 바꾸면 이 문제가 사라져요';
  else if (cd.kind === 'fill') label = esc(pName) + ' 님 ' + cd.day + '일을 ' + full + '(으)로 바꾸면 인원이 채워져요';
  else label = esc(pName) + ' 님 ' + cd.day + '일을 －(오프)로 바꾸면 인원이 맞춰져요';
  return { pid: cd.pid, day: cd.day, code: cd.code, label: label };
}

/* 크게보기 뷰어 우측 라이브 패널 — 현재 규칙 위반을 실시간으로 보여주고(항목을 누르면 그 칸으로 데려가
   포커스 링으로 띄운다), 안전한 수정이 있으면 아래에 초록 '제안'을 단다.
   제안 문구를 누르면 바뀔 칸을 미리 보여주기만 하고(줌인+초록 링, 적용 없음 — 사용자 의도와
   다를 수 있으므로), '고치기' 버튼을 눌러야 실제로 적용한다. 편집할 때마다(renderGrid) 자동 갱신된다. */
var viewerSuggestions = [];
function renderViewerPanel() {
  var panel = document.getElementById('viewerPanel');
  if (!panel) return;
  var v = currentViols();
  if (!v.length) {
    viewerSuggestions = [];
    panel.innerHTML = '<div class="vp-ok">✅<br>규칙 위반이<br>없어요<span>이대로 쓰셔도 좋아요</span></div>';
    return;
  }
  _sugMemo = {};                       // 이번 렌더 동안만 직군별 기준표를 재사용
  viewerSuggestions = [];
  /* 위반이 아주 많으면(초안이 크게 어긋난 상태) 한 칸 제안으로 풀 단계가 아니라 '다시 만들기'가 답 —
     매 편집마다 도는 시뮬레이션 비용도 크므로 이때는 제안 계산을 건너뛴다. */
  var withSug = v.length <= 40;
  var html = '<button class="vp-head" onclick="showAllViols()">⚠️ 확인할 곳 <b>' + v.length + '</b>곳' +
    '<span class="vp-headgo">한눈에 보기›</span></button>';
  html += v.map(function (x, i) {
    var sug = withSug ? suggestForViol(x) : null;
    var num = '<span class="vp-num">' + (i + 1) + '</span><span class="vp-msg">' + esc(x.msg) + '</span>';
    var head = x.pid
      ? '<button class="vp-item' + (sug ? ' has-fix' : '') + '" onclick="jumpTo(\'' + x.pid + '\',' + x.day + ')">' + num + '<span class="vp-go">보기›</span></button>'
      : x.day
        ? '<button class="vp-item vp-general' + (sug ? ' has-fix' : '') + '" onclick="jumpToDay(' + x.day + ')">' + num + '<span class="vp-go">보기›</span></button>'
        : '<div class="vp-item vp-general' + (sug ? ' has-fix' : '') + '">' + num + '</div>';
    var fix = '';
    if (sug) {
      var si = viewerSuggestions.push(sug) - 1;
      fix = '<div class="vp-fix"><button class="vp-fixsee" onclick="jumpToSuggest(' + si + ')"><span class="vp-fixtag">제안</span>' +
        '<span class="vp-fixmsg">' + sug.label + '</span></button>' +
        '<button class="vp-fixgo" onclick="applySuggest(' + si + ')">고치기›</button></div>';
    }
    return '<div class="vp-block">' + head + fix + '</div>';
  }).join('');
  panel.innerHTML = html;
}
/* '확인할 곳' 머리글 탭 = 전체 조망 — 줌을 전체 보기로 되돌리고 위반 칸 전부에 빨간 링을
   동시에 띄워, 어디어디를 확인해야 하는지 한눈에 보여준다(하나씩은 각 항목의 '보기›'로 줌인).
   상시 표시(td.cell.viol의 얇은 안쪽 테두리)는 전체 축소 배율에선 1px 수준이라 잘 안 보이기 때문. */
var violsAllT = null;
function showAllViols() {
  vzFocus = null;
  vzReset(); fitGridFull();                        // 표 전체가 보이는 배율에서
  if (activeFlash) {                               // 단일 플래시가 켜져 있으면 정리(타이머 충돌 방지)
    activeFlash.el.classList.remove('viol-flash', 'fix-flash');
    clearTimeout(activeFlash.t); activeFlash = null;
  }
  clearTimeout(violsAllT);
  var els = [], seen = {};
  currentViols().forEach(function (v) {
    /* 사람 칸 위반은 그 칸을, 날짜 단위(인원) 위반은 그 날짜 머리칸을 켠다 */
    var el = v.pid ? document.getElementById('c_' + v.pid + '_' + v.day)
      : (v.day ? document.getElementById('dh_' + v.day) : null);
    if (el && !seen[el.id]) { seen[el.id] = 1; els.push(el); }
  });
  if (!els.length) return;
  els.forEach(function (el) { el.classList.remove('viol-flash'); });
  void els[0].offsetWidth;                         // 재탭 시 애니메이션 재시작
  els.forEach(function (el) { el.classList.add('viol-flash'); });
  violsAllT = setTimeout(function () {
    els.forEach(function (el) { el.classList.remove('viol-flash'); });
  }, 4000);
}
/* 날짜 단위(인원) 위반의 '보기' — 특정 칸이 없으므로 그 날짜 머리칸으로 줌인해 띄운다 */
function jumpToDay(day) {
  if (!document.body.classList.contains('grid-open')) {
    openGridFull();
    setTimeout(function () { jumpToDay(day); }, 320);
    return;
  }
  var el = document.getElementById('dh_' + day);
  if (!el) return;
  vzFocus = { id: 'dh_' + day, t: Date.now() };
  vzFocusCell(el);
  flashCellEl(el, 'viol-flash', 2400);
}
/* 제안 문구 탭 = 미리보기 — 적용하지 않고, 바뀔 칸("이 칸")으로 줌인해 초록 링으로 보여준다.
   제안 대상은 위반 칸과 다른 사람 칸일 수도 있어(인원 초과를 남의 칸으로 푸는 경우) 더 필요하다. */
function jumpToSuggest(i) {
  var s = viewerSuggestions[i];
  if (!s) return;
  var el = document.getElementById('c_' + s.pid + '_' + s.day);
  if (!el) return;
  vzFocus = { id: 'c_' + s.pid + '_' + s.day, t: Date.now() };
  vzFocusCell(el);
  flashCellEl(el, 'fix-flash', 2400);
}
/* 제안 적용('고치기') — 손으로 그 칸을 고른 것과 동일(고정됨). 고친 칸으로 줌인해 초록으로 확인시킨다. */
function applySuggest(i) {
  /* 더블탭 가드: 적용 직후 패널이 재렌더되며 '다음' 제안의 고치기가 같은 자리에 올라오므로,
     빠른 두 번째 탭이 보지도 않은 제안을 적용해버리는 것을 막는다(적대 검토 확정). */
  var now = Date.now();
  if (now - (applySuggest._t || 0) < 450) return;
  applySuggest._t = now;
  var s = viewerSuggestions[i];
  if (!s) return;
  setCell(s.pid, s.day, s.code);       // save + renderHome(→renderGrid→renderViewerPanel 자동 갱신)
  var el = document.getElementById('c_' + s.pid + '_' + s.day);
  if (el) {
    vzFocus = { id: 'c_' + s.pid + '_' + s.day, t: Date.now() };
    vzFocusCell(el);
    flashCellEl(el, 'fix-flash', 1500);
  }
  toast(currentViols().length ? '고쳤어요 — 남은 곳을 확인해 주세요' : '규칙 위반이 모두 없어졌어요 🌙');
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

/* ---- 근무 선택(16) — 바텀시트: 코드 + 고정 여부를 함께 편집 ---- */
function hidePicker() { closeSheet(); }
function tapCell(ev, pid, d) {
  vzFocus = null;                      // 편집을 시작하면 '보기' 자동 줌의 재중앙은 해제
  ev.stopPropagation();
  openCodeSheet(pid, d, null);
}
var CODE_SHEET_ROWS = [
  ['D', 'E', 'N', 'O'],
  ['V', 'CO', 'EDU', 'W'],
  ['MD', 'E2', 'X']
];
var codeBig = { D: 'D', MD: 'MD', E: 'E', E2: 'E2', N: 'N', O: '－', V: '휴', CO: '대', EDU: '교', W: '★', X: '✕' };
var codeSheetLbl = { D: '데이', MD: '미들', E: '이브닝', E2: '이브닝2', N: '나이트', O: '오프', V: '연차', CO: '대휴', EDU: '교육', W: '희망 휴무', X: '지움' };
/* opts.pinOnly = 희망 화면의 「고정 근무」 입력 — 고정이 전제라 토글·희망을 숨긴다 */
function openCodeSheet(pid, d, opts) {
  opts = opts || {};
  var p = staffList().filter(function (x) { return x.id === pid; })[0];
  var cur = cellCode(pid, d);
  var sel = cur || (isWish(pid, d) ? 'W' : '');
  sheetCtx = { kind: 'code', pid: pid, d: d, sel: sel || null, pinOnly: !!opts.pinOnly, after: opts.after || null };
  var codes = [];
  CODE_SHEET_ROWS.forEach(function (r) {
    r.forEach(function (c) {
      if (opts.pinOnly && c === 'W') return;   // 고정 입력에선 ★(희망)은 달력에서 직접 찍는다
      codes.push(c);
    });
  });
  var grid = codes.map(function (c) {
    return '<button class="codebtn c' + c + (sheetCtx.sel === c ? ' on' : '') + '" id="cbtn_' + c + '" ' +
      'onclick="codeSheetPick(\'' + c + '\')"><span class="cb-big">' + codeBig[c] + '</span>' +
      '<span class="cb-lbl">' + codeSheetLbl[c] + '</span></button>';
  }).join('');
  var pinRow = opts.pinOnly ? '' :
    '<div class="pinrow"><span class="pin-tx"><b>이 근무를 고정하기</b>' +
    '<span class="pin-sub">다시 만들어도 이 칸은 바뀌지 않아요.</span></span>' +
    '<label class="tgl"><input type="checkbox" id="codePin" checked><span class="knob"></span></label></div>';
  openSheet(
    '<div class="sh-head center"><h3>근무 선택</h3></div>' +
    '<p class="sh-sub">' + esc(p ? p.name : '') + ' · ' + ymParts(curYM).m + '월 ' + d + '일</p>' +
    '<div class="codegrid">' + grid + '</div>' + pinRow +
    '<div class="btnrow"><button class="btn outline" onclick="closeSheet()">취소</button>' +
    '<button class="btn big" onclick="codeSheetApply()">적용</button></div>'
  );
}
function codeSheetPick(c) {
  if (!sheetCtx || sheetCtx.kind !== 'code') return;
  sheetCtx.sel = c;
  document.querySelectorAll('.codebtn').forEach(function (el) { el.classList.remove('on'); });
  var el = document.getElementById('cbtn_' + c);
  if (el) el.classList.add('on');
}
function codeSheetApply() {
  var c = sheetCtx && sheetCtx.sel;
  if (!sheetCtx || c == null) { closeSheet(); return; }
  var ctx = sheetCtx;
  var pinEl = document.getElementById('codePin');
  var noPin = !ctx.pinOnly && pinEl && !pinEl.checked;
  closeSheet();
  if (c === 'X') setCell(ctx.pid, ctx.d, '');
  else setCell(ctx.pid, ctx.d, c, noPin);
  if (ctx.after) ctx.after();
}
function setCell(pid, d, code, noPin) {
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
    if (code && !noPin) m.pins[pid][d] = code;      // 손으로 고른 칸 = 선입력(재생성에도 그대로)
    else if (!code) {
      delete m.pins[pid][d];
      var w = m.wish[pid] || [];
      var i = w.indexOf(d);
      if (i >= 0) w.splice(i, 1);
    } else delete m.pins[pid][d];                    // 고정 끄고 적용 = 이번만 바꾸기
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
/* ---- 생성 불가 안내 시트 — 무엇이 문제인지 + 어디서 고치는지 + 바로가기 (2026-07-26) ----
   preflight 하드 이슈의 fix 필드('rules'|'staff'|'pre')로 목적지를 묶는다(문구 파싱 없음).
   사람별 충돌은 그 사람의 희망·고정 화면으로 직행한다. */
var _genFixTarget = null;   // 「희망·고정에서 고치기」가 열 사람·모드 {pid, mode}
var GEN_FIX_DEST = {
  rules: ['근무 규칙에서 고치기', '하루 최소 인원·근무 제한을 조정해요'],
  staff: ['병동 구성에서 고치기', '사람 유형(3교대·나이트 전담)을 확인해요'],
  pre: ['희망 휴무·고정 근무에서 고치기', '겹친 날짜를 지우거나 옮겨요']
};
function genFixGo(dest) {
  if (dest === 'rules') { openRulesScreen(); return; }
  if (dest === 'staff' || !staffList().length) { showTab('ward'); return; }
  var i = 0, mode = 'pin';
  if (_genFixTarget) {
    staffList().some(function (p, ix) { if (p.id === _genFixTarget.pid) { i = ix; return true; } return false; });
    mode = _genFixTarget.mode;
  }
  wsIdx = i; wsMode = mode;
  renderWishScreen();
  openScreen('screen-wish');
}
function genFixRow(dest) {
  var t = GEN_FIX_DEST[dest];
  return '<button class="preprow" onclick="genFixGo(\'' + dest + '\')">' +
    '<span class="pr-ico warn">' + ic('bang') + '</span>' +
    '<span class="pr-tx"><b>' + t[0] + '</b><span class="pr-sub">' + t[1] + '</span></span>' +
    '<span class="pr-go">이동' + ic('chevR') + '</span></button>';
}
function showGenIssuesSheet(hardIssues) {
  var groups = { rules: [], staff: [], pre: [] };
  hardIssues.forEach(function (v) { (groups[v.fix] || groups.rules).push(v); });
  /* 사람이 특정된 첫 충돌로 바로가기 대상 지정 — 희망 오프 충돌이면 희망 탭, 아니면 고정 탭 */
  var pre1 = groups.pre.filter(function (v) { return v.pid != null; })[0];
  _genFixTarget = pre1 ? { pid: pre1.pid, mode: /희망 오프/.test(pre1.msg) ? 'wish' : 'pin' } : null;
  var html = '<div class="sh-head"><h3>아직 만들 수 없어요</h3></div>' +
    '<p class="hint" style="margin:0 0 12px">아래 문제를 고치면 만들 수 있어요. 버튼을 누르면 고치는 화면으로 바로 가요.</p>';
  ['rules', 'staff', 'pre'].forEach(function (dest) {
    var list = groups[dest];
    if (!list.length) return;
    html += '<div class="fixcard"><ul class="fix-list">' +
      list.slice(0, 4).map(function (v) { return '<li>' + esc(v.msg) + '</li>'; }).join('') +
      (list.length > 4 ? '<li>…외 ' + (list.length - 4) + '건</li>' : '') +
      '</ul>' + genFixRow(dest) + '</div>';
  });
  openSheet(html);
}
function showGenExhaustSheet(msg, softMsgs) {
  _genFixTarget = null;
  openSheet('<div class="sh-head"><h3>근무표를 만들지 못했어요</h3></div>' +
    '<p class="hint" style="margin:0 0 12px">' + esc(msg) +
    (softMsgs && softMsgs.length ? '<br>⚠️ ' + softMsgs.map(esc).join('<br>⚠️ ') : '') + '</p>' +
    '<div class="fixcard"><ul class="fix-list"><li>하루 최소 인원을 줄이면 조합이 쉬워져요</li></ul>' + genFixRow('rules') + '</div>' +
    '<div class="fixcard"><ul class="fix-list"><li>같은 날짜에 몰린 희망 휴무·고정 근무를 나눠보세요</li></ul>' + genFixRow('pre') + '</div>');
}

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
    showGenIssuesSheet(hardIssues);
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
  genShow(staff.length);
  var info = document.getElementById('genInfo');
  info.textContent = softMsgs.map(function (m) { return '⚠️ ' + m; }).join('\n');
  var ji = 0, att = 0, doneAtt = 0, best = null;
  var results = {};
  function accept(r) { return r.violations.length === 0 && (r.nightGap || 0) <= 2; }
  function failAll(msg) {
    genHide();
    undoStack.pop();
    showGenExhaustSheet(msg, softMsgs);
  }
  function finishAll() {
    genHide();
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
    if (genCanceled) { failAllQuiet(); return; }
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
          failAll('이 조건으로는 ' + groupNames[job.g] + ' 근무표를 만들 수 없었어요.');
          return;
        }
      }
      doneAtt += att;
      ji++; att = 0; best = null;
      if (ji >= jobs.length) { finishAll(); return; }
    }
    genUpdate((doneAtt + att) / totalMax);
    setTimeout(batch, 0);
  }
  function failAllQuiet() {   // 사용자가 「생성 취소」 — 조용히 원상 복구
    genHide();
    undoStack.pop();
    toast('만들기를 취소했어요');
  }
  setTimeout(batch, 30);
}

/* ---- 자동 생성 진행 화면(10) — 원형 진행률 + 실제 처리 단계 ---- */
var genCanceled = false;
var GEN_R = 76, GEN_CIRC = Math.round(2 * Math.PI * 76);
function genShow(nStaff) {
  genCanceled = false;
  var el = document.getElementById('genScreen');
  el.innerHTML = '<div class="gs-in">' +
    '<div class="ring"><svg width="168" height="168" viewBox="0 0 168 168">' +
    '<circle class="track" cx="84" cy="84" r="' + GEN_R + '" fill="none" stroke-width="13"/>' +
    '<circle class="bar" id="genRing" cx="84" cy="84" r="' + GEN_R + '" fill="none" stroke-width="13" ' +
    'stroke-dasharray="' + GEN_CIRC + '" stroke-dashoffset="' + GEN_CIRC + '"/></svg>' +
    '<span class="pct" id="genPct">0%</span></div>' +
    '<h2>근무표를 만들고 있어요</h2>' +
    '<p class="gs-sub">' + nStaff + '명의 한 달 근무를 규칙에 맞게 조합하고 있어요.</p>' +
    '<div class="gsteps">' +
    ['인원 배치', '규칙 확인', '공평성 조정'].map(function (t, i) {
      return '<div class="gstep" id="gstep_' + i + '"><span class="g-ico">' + ic('check') + '</span>' + t +
        '<span class="g-state"></span></div>';
    }).join('') + '</div>' +
    '<p class="gs-warn">지난달 기록과 희망 휴무도 함께 반영하고 있어요.<br><b>화면을 닫지 말아 주세요.</b></p>' +
    '<button class="gs-cancel" onclick="genCancel()">생성 취소</button>' +
    '</div>';
  el.className = 'on';
  genUpdate(0);
}
function genUpdate(frac) {
  frac = Math.max(0, Math.min(1, frac));
  var ring = document.getElementById('genRing');
  var pct = document.getElementById('genPct');
  if (!ring || !pct) return;
  ring.style.strokeDashoffset = Math.round(GEN_CIRC * (1 - frac));
  pct.textContent = Math.round(frac * 100) + '%';
  /* 실제 처리 순서(배치 시도 → 규칙 검사 → 형평성 비교)를 단계로 보여준다 */
  var states = frac < 0.12 ? ['doing', '', ''] : frac < 0.82 ? ['done', 'doing', ''] : ['done', 'done', 'doing'];
  var labels = { doing: '진행 중', done: '완료', '': '대기' };
  states.forEach(function (s, i) {
    var el = document.getElementById('gstep_' + i);
    if (!el) return;
    el.className = 'gstep ' + s;
    el.querySelector('.g-state').textContent = labels[s];
  });
}
function genHide() {
  var el = document.getElementById('genScreen');
  el.className = ''; el.innerHTML = '';
}
function genCancel() { genCanceled = true; }

/* ---- 우리 병동(06) — 이름·요약 목록, 행을 누르면 편집 바텀시트(07) ---- */
function renderStaff() {
  var el = document.getElementById('staffList');
  var staff = staffList();
  document.getElementById('wardCount').textContent = staff.length + '명';
  var html = '';
  groupsPresent().forEach(function (g) {
    var gStaff = groupStaff(g);
    html += '<div class="grouplabel">' + groupNames[g] + '<span>' + gStaff.length + '명</span></div>';
    gStaff.forEach(function (p) {
      var i = staff.indexOf(p);
      html += '<button class="listrow personrow" onclick="openStaffSheet(' + i + ')">' +
        '<span class="lr-ico">' + ic('people') + '</span>' +
        '<span class="lr-tx"><b>' + esc(p.name) + '</b><span class="lr-sub">' +
        typeNames[p.type] + ' · ' + (prefNames[p.pref || ''] || '자동') + '</span></span>' +
        '<span class="lr-go">' + ic('chevR') + '</span></button>';
    });
  });
  el.innerHTML = html || '<p class="hint" style="margin:8px 0 14px">아직 등록된 사람이 없어요. 위 「사람 추가」나 「기존 근무표 불러오기」로 시작해보세요.</p>';
  document.getElementById('sampleHint').style.display = staff.length ? 'none' : '';
  renderPatternMemo();
}
/* 구성원 편집 바텀시트(07). i = staff 인덱스, -1 = 새로 추가 */
function openStaffSheet(i) {
  var isNew = i < 0;
  var p = isNew ? { name: '', group: 'RN', type: 'three', pref: '' } : staffList()[i];
  if (!p) return;
  sheetCtx = { kind: 'staff', i: i, group: staffGroup(p), type: p.type, pref: p.pref || '' };
  function segBtn(field, val, label) {
    return '<button id="sf_' + field + '_' + val + '" class="' + (sheetCtx[field] === val ? 'on' : '') + '" ' +
      'onclick="staffSheetSeg(\'' + field + '\',\'' + val + '\')">' + label + '</button>';
  }
  var typeCards = TYPE_ORDER.map(function (t) {
    return '<button class="radiocard' + (sheetCtx.type === t ? ' on' : '') + '" id="sf_type_' + t + '" onclick="staffSheetType(\'' + t + '\')">' +
      typeNames[t] + '<span class="rc-dot">' + ic('check') + '</span></button>';
  }).join('');
  openSheet(
    '<div class="sh-head"><h3>' + (isNew ? '사람 추가' : '구성원 편집') + '</h3>' +
    '<button class="sh-x" onclick="closeSheet()" aria-label="닫기">' + ic('close') + '</button></div>' +
    '<div class="sh-label">이름</div>' +
    '<input type="text" class="sh-input" id="sfName" value="' + esc(p.name) + '" placeholder="이름을 입력하세요">' +
    '<div class="sh-label">직군</div>' +
    '<div class="seg">' + segBtn('group', 'RN', '간호사') + segBtn('group', 'NA', '조무사') + '</div>' +
    '<div class="sh-label">근무 형태</div>' + typeCards +
    '<div class="sh-label">근무 성향</div>' +
    '<div class="seg">' + segBtn('pref', '', '자동') + segBtn('pref', 'D', '데이 위주') + segBtn('pref', 'E', '이브닝 위주') + '</div>' +
    '<div class="btnrow" style="margin-top:14px"><button class="btn big xl" onclick="staffSheetSave()">저장</button></div>' +
    (isNew ? '' : '<button class="sh-danger" onclick="staffSheetDelete()">구성원 삭제</button>')
  );
  if (isNew) setTimeout(function () { var e = document.getElementById('sfName'); if (e) e.focus(); }, 50);
}
function staffSheetSeg(field, val) {
  if (!sheetCtx || sheetCtx.kind !== 'staff') return;
  sheetCtx[field] = val;
  ['RN', 'NA', '', 'D', 'E'].forEach(function (v) {
    var el = document.getElementById('sf_' + field + '_' + v);
    if (el) el.className = sheetCtx[field] === v ? 'on' : '';
  });
}
function staffSheetType(t) {
  if (!sheetCtx || sheetCtx.kind !== 'staff') return;
  sheetCtx.type = t;
  TYPE_ORDER.forEach(function (x) {
    var el = document.getElementById('sf_type_' + x);
    if (el) el.className = 'radiocard' + (x === t ? ' on' : '');
  });
}
function staffSheetSave() {
  if (!sheetCtx || sheetCtx.kind !== 'staff') return;
  var name = (document.getElementById('sfName').value || '').trim();
  if (!name) { alert('이름을 입력해주세요.'); return; }
  if (sheetCtx.i < 0) {
    staffList().push({ id: 'p' + Date.now() + Math.floor(Math.random() * 1000), name: name,
      group: sheetCtx.group, type: sheetCtx.type, pref: sheetCtx.pref });
    toast(name + ' 님을 추가했어요');
  } else {
    var p = staffList()[sheetCtx.i];
    p.name = name; p.group = sheetCtx.group; p.type = sheetCtx.type; p.pref = sheetCtx.pref;
    toast('저장했어요 ✓');
  }
  closeSheet();
  save(); renderStaff();
}
function staffSheetDelete() {
  if (!sheetCtx || sheetCtx.kind !== 'staff' || sheetCtx.i < 0) return;
  var p = staffList()[sheetCtx.i];
  if (!p) return;
  if (!confirm(p.name + ' 님을 삭제할까요?')) return;
  staffList().splice(sheetCtx.i, 1);
  closeSheet();
  save(); renderStaff();
  toast('삭제했어요');
}
/* 기존 근무표 불러오기 — 방법 선택 시트(사진·PDF·엑셀) */
function openImportSheet() {
  openSheet(
    '<div class="sh-head"><h3>기존 근무표 불러오기</h3>' +
    '<button class="sh-x" onclick="closeSheet()" aria-label="닫기">' + ic('close') + '</button></div>' +
    '<div class="onboard-opts">' +
    '<button class="onboard-card" onclick="closeSheet();aiImportStart()">' +
    '<span class="ob-ico">' + ic('camera') + '</span>' +
    '<span class="ob-txt"><b>사진으로 불러오기</b><span class="ob-sub">찍거나 앨범에서 고르면 자동으로 읽어요 (최대 3장)</span></span></button>' +
    '<button class="onboard-card" onclick="closeSheet();aiImportPdfStart()">' +
    '<span class="ob-ico">' + ic('doc') + '</span>' +
    '<span class="ob-txt"><b>PDF로 불러오기</b><span class="ob-sub">PDF 근무표 파일을 자동으로 읽어요</span></span></button>' +
    '<button class="onboard-card" onclick="closeSheet();document.getElementById(\'importFileXlsx\').click()">' +
    '<span class="ob-ico">' + ic('sheet') + '</span>' +
    '<span class="ob-txt"><b>엑셀 파일 불러오기</b><span class="ob-sub">사용하던 엑셀(.xlsx)을 그대로 가져와요</span></span></button>' +
    '</div>'
  );
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

/* ---- 근무 규칙 화면(08) — 직군 탭 + 스테퍼, 바꾸면 바로 저장 ---- */
var RULE_KINDS = [['wd', '평일'], ['hd', '휴일·공휴일']];
var RULE_FAMS = [['D', '데이'], ['E', '이브닝'], ['N', '나이트']];
var rsGroup = 'RN';   // 규칙 화면에서 보고 있는 직군
function openRulesScreen() {
  var gs = groupsPresent();
  rsGroup = gs.length ? (gs.indexOf(rsGroup) >= 0 ? rsGroup : gs[0]) : 'RN';
  renderRulesScreen();
  openScreen('screen-rules');
}
function renderRules() {   // 구버전 이름 호환 — 규칙 화면이 열려 있으면 다시 그린다
  if (openScreenId === 'screen-rules') renderRulesScreen();
}
function stepperHtml(id, val, unit) {
  return '<span class="stepper">' +
    '<button onclick="ruleStep(\'' + id + '\',-1)" aria-label="줄이기">−</button>' +
    '<span class="st-val">' + val + unit + '</span>' +
    '<button onclick="ruleStep(\'' + id + '\',1)" aria-label="늘리기">＋</button></span>';
}
function renderRulesScreen() {
  var r = rules2();
  var gs = groupsPresent();
  if (!gs.length) gs = ['RN'];
  if (gs.indexOf(rsGroup) < 0) rsGroup = gs[0];
  var seg = gs.length > 1
    ? '<div class="seg" style="margin-bottom:6px">' + gs.map(function (g) {
        return '<button class="' + (rsGroup === g ? 'on' : '') + '" onclick="rsGroup=\'' + g + '\';renderRulesScreen()">' + groupNames[g] + '</button>';
      }).join('') + '</div>'
    : '';
  var gr = r.groups[rsGroup] || r.groups.RN;
  var need = RULE_KINDS.map(function (kd) {
    return '<div class="rulesec">' + kd[1] + '</div><div class="rulecard">' +
      RULE_FAMS.map(function (fm) {
        var v = gr[kd[0]][fm[0]];
        return '<div class="rrow"><span class="rr-lbl">' + fm[1] + '</span>' +
          stepperHtml(rsGroup + '.' + kd[0] + '.' + fm[0] + '.0', v[0], '명') +
          '<span class="rr-tilde">~</span>' +
          stepperHtml(rsGroup + '.' + kd[0] + '.' + fm[0] + '.1', v[1], '명') + '</div>';
      }).join('') + '</div>';
  }).join('');
  var limits = '<div class="rulesec">근무 제한</div><div class="rulecard">' +
    '<div class="rrow"><span class="rr-lbl">최대 연속 근무</span>' + stepperHtml('g.maxWork', r.maxWork, '일') + '</div>' +
    '<div class="rrow"><span class="rr-lbl">최대 연속 나이트</span>' + stepperHtml('g.maxN', r.maxN, '개') + '</div>' +
    '<div class="rrow"><span class="rr-lbl">나이트 후 휴식</span>' + stepperHtml('g.offAfterN', r.offAfterN, '일') + '</div>' +
    '<div class="rrow"><span class="rr-lbl">이브닝 다음날 데이 금지<span class="hint">역행 근무를 막아요</span></span>' +
    '<label class="tgl"><input type="checkbox"' + (+r.backward ? ' checked' : '') + ' onchange="ruleBackward(this.checked)"><span class="knob"></span></label></div>' +
    '</div>';
  document.getElementById('rulesScreenBody').innerHTML =
    ssTop('근무 규칙', '완료') + seg +
    '<div class="rulesec" style="margin-top:8px">하루 필요 인원 <span class="hint" style="font-weight:400">— 최소~최대예요. 바꾸면 바로 저장돼요.</span></div>' +
    need + limits;
}
function ruleStep(path, delta) {
  var r = rules2();
  var a = path.split('.');
  if (a[0] === 'g') {
    var lim = { maxWork: [1, 7], maxN: [1, 5], offAfterN: [0, 3] }[a[1]];
    r[a[1]] = Math.max(lim[0], Math.min(lim[1], (+r[a[1]] || 0) + delta));
  } else {
    var v = r.groups[a[0]][a[1]][a[2]];
    var i = +a[3];
    v[i] = Math.max(0, Math.min(20, v[i] + delta));
    if (i === 0 && v[1] < v[0]) v[1] = v[0];   // 최소를 올리면 최대도 따라온다
    if (i === 1 && v[1] < v[0]) v[0] = v[1];   // 최대를 내리면 최소도 따라온다
  }
  save();
  renderRulesScreen();
}
function ruleBackward(on) {
  rules2().backward = on ? 1 : 0;
  save();
  toast(on ? '이브닝 다음날 데이를 금지해요' : '이브닝 다음날 데이를 허용해요');
}

/* ---- 희망 휴무·고정 근무 화면(15) — 사람별 달력 입력 ---- */
var wsIdx = 0, wsMode = 'wish';   // wish | pin
function openWishScreen() {
  if (!staffList().length) { showTab('ward'); return; }
  wsIdx = 0; wsMode = 'wish';
  renderWishScreen();
  openScreen('screen-wish');
}
function closeWishScreen() { closeScreen(); renderHome(); }
function renderWishScreen() {
  var staff = staffList();
  if (!staff.length) { closeWishScreen(); return; }
  if (wsIdx >= staff.length) wsIdx = staff.length - 1;
  var p = staff[wsIdx];
  var m = month(curYM);
  var pt = ymParts(curYM);
  var wishes = m.wish[p.id] || [];
  var pins = m.pins[p.id] || {};
  var days = daysInYM(curYM), fw = firstWeekdayYM(curYM);
  /* 달력 */
  var cal = '<table><tr>' + ['일', '월', '화', '수', '목', '금', '토'].map(function (w, i) {
    return '<th class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</th>';
  }).join('') + '</tr><tr>';
  for (var b = 0; b < fw; b++) cal += '<td></td>';
  for (var d = 1; d <= days; d++) {
    var wd = (fw + d - 1) % 7;
    if (d > 1 && wd === 0) cal += '</tr><tr>';
    var cls = 'day' + (wd === 0 ? ' sun' : wd === 6 ? ' sat' : '') + (m.holidays.indexOf(d) >= 0 ? ' hol' : '');
    var badge = '';
    if (wishes.indexOf(d) >= 0) cls += ' wish';
    if (pins[d]) { cls += ' pin'; badge = '<span class="pcode">' + codeDisp[pins[d]] + '</span>'; }
    cal += '<td><button class="' + cls + '" onclick="wishTapDay(' + d + ')">' + d + badge + '</button></td>';
  }
  cal += '</tr></table>';
  var isLast = wsIdx >= staff.length - 1;
  document.getElementById('wishScreenBody').innerHTML =
    ssTop('희망 휴무·고정 근무', '완료', 'closeWishScreen()') +
    '<div class="wz-month" style="margin:0">' + pt.y + '년 ' + pt.m + '월</div>' +
    '<button class="wp-person" onclick="openWishPersonSheet()">' +
    '<span class="wpp-av">' + esc(p.name.charAt(0)) + '</span>' +
    '<span class="wpp-tx"><b>' + esc(p.name) + '</b><span class="wpp-sub">희망 휴무 ' + wishes.length + '건 · 고정 근무 ' + Object.keys(pins).length + '건</span></span>' +
    '<span class="lr-go">' + ic('chevR') + '</span></button>' +
    '<p class="wp-guide">날짜를 눌러 표시하세요</p>' +
    '<div class="wcal">' + cal + '</div>' +
    '<div class="modeseg">' +
    '<button class="mwish' + (wsMode === 'wish' ? ' on' : '') + '" onclick="wsMode=\'wish\';renderWishScreen()">' + ic('calstar') + ' 희망 휴무</button>' +
    '<button class="mpin' + (wsMode === 'pin' ? ' on' : '') + '" onclick="wsMode=\'pin\';renderWishScreen()">' + ic('pin') + ' 고정 근무</button>' +
    '</div>' +
    '<div class="wp-legend"><span class="lg"><span class="dotw"></span>희망 휴무</span>' +
    '<span class="lg"><span class="dotp"></span>고정 근무</span><br>' +
    '희망 휴무는 자동 배정에서 쉬는 날로 우선 반영해요.</div>' +
    '<button class="btn big xl" onclick="' + (isLast ? 'closeWishScreen()' : 'wsIdx++;renderWishScreen()') + '">' +
    (isLast ? '입력 끝내기' : '다음 사람') + '</button>' +
    '<p class="wp-count">' + (wsIdx + 1) + ' / ' + staff.length + '명</p>';
}
function wishTapDay(d) {
  var p = staffList()[wsIdx];
  if (!p) return;
  if (wsMode === 'wish') {
    setCell(p.id, d, 'W');
    renderWishScreen();
  } else {
    var pins = month(curYM).pins[p.id] || {};
    if (pins[d]) {   // 이미 고정된 날 다시 누르면 바로 해제(어르신 동선 단축)
      setCell(p.id, d, '');
      renderWishScreen();
      return;
    }
    openCodeSheet(p.id, d, { pinOnly: true, after: renderWishScreen });
  }
}
function openWishPersonSheet() {
  var staff = staffList();
  var m = month(curYM);
  openSheet(
    '<div class="sh-head"><h3>사람 고르기</h3>' +
    '<button class="sh-x" onclick="closeSheet()" aria-label="닫기">' + ic('close') + '</button></div>' +
    staff.map(function (p, i) {
      var w = (m.wish[p.id] || []).length, pn = Object.keys(m.pins[p.id] || {}).length;
      return '<button class="listrow" onclick="wsIdx=' + i + ';closeSheet();renderWishScreen()">' +
        '<span class="lr-ico" style="border-radius:999px">' + esc(p.name.charAt(0)) + '</span>' +
        '<span class="lr-tx"><b>' + esc(p.name) + '</b><span class="lr-sub">희망 ' + w + '건 · 고정 ' + pn + '건</span></span>' +
        (i === wsIdx ? '<span class="lr-val" style="color:var(--brand);font-weight:800">보는 중</span>' : '') +
        '</button>';
    }).join('')
  );
}

/* ---- 데이터 및 계정 화면(14) ---- */
function openDataScreen() { renderDataScreen(); openScreen('screen-data'); }
function renderDataScreen() {
  var u = window.Cloud && Cloud.enabled() && Cloud.getUser();
  var savedAt = db._updatedAt ? new Date(db._updatedAt) : null;
  var savedTx = savedAt
    ? (savedAt.getMonth() + 1) + '월 ' + savedAt.getDate() + '일 ' +
      String(savedAt.getHours()).padStart(2, '0') + ':' + String(savedAt.getMinutes()).padStart(2, '0')
    : '아직 없음';
  var syncCard =
    '<div class="rulesec">동기화</div><div class="datacard">' +
    '<div class="datarow"><span class="dr-tx"><b>서버 동기화</b><span class="dr-sub">로그인한 기기에서 같은 근무표를 이어서 쓸 수 있어요.</span></span>' +
    '<span class="dr-val">' + (u ? '저장됨<span class="okdot"></span>' : '로그인 안 됨') + '</span></div>' +
    '<div class="datarow"><span class="dr-tx"><b>마지막 저장</b></span><span class="dr-val">' + savedTx + '</span></div>' +
    '</div>';
  var fileCard =
    '<div class="rulesec">파일 백업</div><div class="datacard">' +
    '<button class="datarow" onclick="exportData()">' +
    '<span class="dr-tx"><b>파일로 백업하기</b><span class="dr-sub">현재 인원·규칙·근무표를 저장해요</span></span>' +
    '<span class="dr-go">' + ic('chevR') + '</span></button>' +
    '<button class="datarow" onclick="document.getElementById(\'importFile\').click()">' +
    '<span class="dr-tx"><b>백업 불러오기</b><span class="dr-sub">이전에 저장한 파일로 복원해요</span></span>' +
    '<span class="dr-go">' + ic('chevR') + '</span></button>' +
    '</div>' +
    '<input type="file" id="importFile" accept=".json" style="display:none" onchange="importData(event)">';
  var acctCard = u
    ? '<div class="rulesec">계정</div><div class="datacard">' +
      '<div class="datarow"><span class="dr-tx"><b>로그인 계정</b></span><span class="dr-val">' + esc(u.email || '') + '</span></div>' +
      '<button class="datarow" onclick="openPwChangeSheet()">' +
      '<span class="dr-tx"><b>비밀번호 변경</b></span><span class="dr-go">' + ic('chevR') + '</span></button>' +
      '</div>' +
      '<button class="logoutbtn" onclick="cloudLogout()">로그아웃</button>'
    : '';
  document.getElementById('dataScreenBody').innerHTML =
    ssTop('데이터 및 계정', '완료') + syncCard + fileCard + acctCard;
}
function openPwChangeSheet() {
  openSheet(
    '<div class="sh-head"><h3>비밀번호 변경</h3>' +
    '<button class="sh-x" onclick="closeSheet()" aria-label="닫기">' + ic('close') + '</button></div>' +
    '<div class="sh-label">새 비밀번호 (6자 이상)</div>' +
    '<input type="password" class="sh-input" id="pwNew1">' +
    '<div class="sh-label">한 번 더</div>' +
    '<input type="password" class="sh-input" id="pwNew2">' +
    '<span class="authmsg" id="pwMsg"></span>' +
    '<button class="btn big xl" onclick="pwChangeApply()">바꾸기</button>'
  );
}
function pwChangeApply() {
  var pw = document.getElementById('pwNew1').value;
  var pw2 = document.getElementById('pwNew2').value;
  var msg = document.getElementById('pwMsg');
  if (pw.length < 6) { msg.textContent = '비밀번호는 6자 이상으로 해주세요.'; return; }
  if (pw !== pw2) { msg.textContent = '비밀번호 두 칸이 서로 달라요. 같게 넣어주세요.'; return; }
  msg.textContent = '바꾸는 중…';
  Cloud.setPassword(pw).then(function (res) {
    if (res.error) { msg.textContent = cloudErrMsg(res.error); return; }
    Cloud.signOutOthers().catch(function () { });
    closeSheet();
    toast('비밀번호를 바꿨어요 ✓');
  });
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
  ], '<p class="hint" style="margin-top:6px">이미 만들어져 있으면 이 항목이 안 보일 수 있어요. 그때는 홈 화면의 달 모양 아이콘으로 열어주세요.</p>');
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
    '<div class="gate-in"><div class="gate-moon"><svg class="moon" viewBox="0 0 48 48" aria-hidden="true"><use href="#moonlogo"/></svg></div>' +
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
    : '<p>홈 화면에 달 모양 아이콘이 생겨서, 주소를 찾지 않고 바로 열 수 있어요.</p>' +
      installStepsHtml();
  /* 왜 원터치가 안 되는지 알려주는 작은 진단 표시 — 문제 보고용 */
  var diag = '<p class="insdiag">진단: 원터치신호 ' + (deferredInstall ? '있음' : '없음') +
    ' · 이미있음 ' + (navigator.getInstalledRelatedApps ? (alreadyInstalled ? '예' : '아니오') : '모름') + '</p>';
  m.innerHTML = '<div class="ins-card"><h2>홈 화면에 바로가기 만들기</h2>' + inner + diag +
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
  /* 이미 바로가기(PWA)로 실행 중이면 설치 안내 카드를 아예 띄우지 않는다(UI_SPEC §10) */
  if (isStandalone()) { card.style.display = 'none'; body.innerHTML = ''; return; }
  card.style.display = '';
  if (alreadyInstalled) {
    body.innerHTML = '<p>✅ 홈 화면에 <b>이미 만들어져 있어요</b>.<br>홈 화면의 🌙 <b>엄만달</b> 아이콘으로 열어주세요.</p>';
    return;
  }
  body.innerHTML =
    '<p>홈 화면에 달 모양 아이콘이 생겨서, 주소를 찾지 않고 바로 열 수 있어요.</p>' +
    (deferredInstall
      ? '<button class="btn big xl" onclick="installApp()">지금 만들기</button>'
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
/* ---- 인증 화면 공통 조각 ---- */
function authField(icon, type, id, ph, auto) {
  return '<div class="authfield"><span class="af-ico">' + ic(icon) + '</span>' +
    '<input type="' + type + '" id="' + id + '" placeholder="' + ph + '"' + (auto ? ' autocomplete="' + auto + '"' : '') + '></div>';
}
function authLogo() {
  return '<div class="auth-logo"><svg class="moon" viewBox="0 0 48 48" aria-hidden="true"><use href="#moonlogo"/></svg>' +
    '<div class="bname">엄만달</div></div>';
}
function authBack() {
  return '<div class="auth-top"><button class="auth-back" onclick="cloudGoto(\'main\')" aria-label="뒤로">' + ic('back') + '</button></div>';
}
/* 카카오 로그인 = 준비 중(비즈앱 인증 후 개통 — 2026-07-25 초승달 결정: 비활성 버튼으로 표시) */
function kakaoSoon() { toast('카카오 로그인은 준비 중이에요. 지금은 Google이나 이메일로 로그인해주세요'); }
/* 로그인 전 화면(01 로그인 · 02 회원가입 · 03 비밀번호찾기)을 현재 authTarget에 렌더한다.
   홈(homeLoginBody)과 보관함 카드(cloudBody)에 같은 id 입력칸이 공존하면
   getElementById가 엉키므로, 렌더 직전에 반대쪽 컨테이너를 반드시 비운다. */
function renderAuth() {
  var other = authTarget === 'homeLoginBody' ? 'cloudBody' : 'homeLoginBody';
  var oe = document.getElementById(other);
  if (oe) oe.innerHTML = '';
  var body = document.getElementById(authTarget);
  if (!body) return;
  if (cloudView === 'signup') {
    body.innerHTML = '<div class="auth-wrap">' + authBack() + authLogo() +
      '<p class="auth-title">엄만달 시작하기</p>' +
      '<p class="auth-sub">계정을 만들면 근무표가 안전하게 저장되고<br>다른 기기와도 이어져요.</p>' +
      authField('mail', 'text', 'cloudEmail', '이메일', 'email') +
      authField('lock', 'password', 'authPw', '비밀번호 (6자 이상)', 'new-password') +
      authField('lock', 'password', 'authPw2', '비밀번호 확인', 'new-password') +
      '<button class="btn big xl" onclick="cloudSignup()">회원가입</button>' +
      '<span class="authmsg" id="cloudMsg"></span>' +
      '<div class="auth-links">이미 계정이 있나요? <a class="link" onclick="cloudGoto(\'main\')">로그인</a></div>' +
      '<p class="auth-note">가입하면 확인 메일이 가요.<br>메일함에서 링크를 한 번만 눌러주시면 가입이 끝나요.</p>' +
      '</div>';
  } else if (cloudView === 'newpw') {
    body.innerHTML = '<div class="auth-wrap" style="padding-top:4px">' +
      '<p class="auth-title" style="font-size:22px">새 비밀번호 만들기</p>' +
      '<p class="auth-sub">본인 확인이 끝났어요. 이제 쓸 <b>새 비밀번호</b>를 정해주세요.</p>' +
      authField('lock', 'password', 'authPw', '새 비밀번호 (6자 이상)', 'new-password') +
      authField('lock', 'password', 'authPw2', '한 번 더', 'new-password') +
      '<button class="btn big xl" onclick="cloudSetNewPw()">바꾸기</button>' +
      '<span class="authmsg" id="cloudMsg"></span></div>';
  } else if (cloudView === 'emailReset') {
    body.innerHTML = '<div class="auth-wrap">' + authBack() + authLogo() +
      '<p class="auth-title">비밀번호 찾기</p>' +
      '<p class="auth-sub">가입한 이메일을 입력하면 비밀번호를<br>다시 설정할 수 있는 링크를 보내드려요.</p>' +
      authField('mail', 'text', 'cloudEmail', '이메일', 'email') +
      '<button class="btn big xl" onclick="cloudEmailReset()">재설정 링크 보내기</button>' +
      '<span class="authmsg" id="cloudMsg"></span>' +
      '<p class="auth-note"><b>메일이 오지 않나요?</b><br>스팸함을 확인하거나 잠시 후 다시 시도해 주세요.</p>' +
      '<div class="auth-links"><a class="link" onclick="cloudGoto(\'main\')">로그인으로 돌아가기</a></div>' +
      '</div>';
  } else {
    /* main(01) — 소셜 로그인 + 이메일 로그인 */
    var provs = Cloud.oauthProviders();
    /* 인앱 브라우저에서는 구글 로그인이 차단되므로 기본 브라우저로 안내 */
    var inapp = inAppBrowser()
      ? '<div style="background:var(--warn-soft);border:1px solid #F0C36D;border-radius:14px;padding:12px 14px;margin-bottom:14px;font-size:15.5px">' +
        '⚠️ 카카오톡·네이버 앱 안에서는 <b>Google 로그인이 막혀 있어요</b>.' +
        '<button class="btn big" style="margin-top:10px;width:100%" onclick="openInBrowser()">크롬(브라우저)으로 열기</button></div>'
      : '';
    var socials = '';
    if (provs.indexOf('google') >= 0)
      socials += '<button class="btn-google" onclick="cloudOAuth(\'google\')">' + GOOGLE_SVG + 'Google로 계속하기</button>';
    socials += '<button class="btn-kakao soon" onclick="kakaoSoon()">' + KAKAO_SVG + '카카오로 계속하기</button>';
    body.innerHTML = '<div class="auth-wrap">' + authLogo() +
      '<p class="auth-title">다시 만나서 반가워요</p>' +
      '<p class="auth-sub">로그인하면 어느 기기에서든<br>같은 근무표를 이어서 쓸 수 있어요.</p>' +
      inapp +
      '<div class="socialbtns">' + socials + '</div>' +
      '<div class="authdivider">또는</div>' +
      authField('mail', 'text', 'cloudEmail', '이메일', 'email') +
      authField('lock', 'password', 'cloudPw', '비밀번호', 'current-password') +
      '<button class="btn big xl" onclick="cloudLogin()">로그인</button>' +
      '<span class="authmsg" id="cloudMsg"></span>' +
      '<div class="auth-links"><a class="link" onclick="cloudGoto(\'emailReset\')">비밀번호 찾기</a><br>' +
      '처음이신가요? <a class="link" onclick="cloudGoto(\'signup\')">회원가입</a></div>' +
      '</div>';
  }
  renderIcons(body);
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
  var months = Object.keys(db.months || {}).sort().reverse().filter(function (ym) {
    return staffList().some(function (p) { return ((db.months[ym].codes || {})[p.id] || []).some(function (c) { return c; }); });
  }).slice(0, 12);   // 너무 오래된 기록까지 위반 검사를 돌리지 않는다
  el.innerHTML = months.map(function (ym) {
    var p = ymParts(ym);
    var st = archMonthStatus(ym);
    var mini = archMiniHtml(ym);
    var sub = st.people + '명 · ' + (st.viols
      ? '<span class="red">확인할 곳 ' + st.viols + '곳</span>'
      : (st.fairShort ? '공평성 확인 ' + st.fairShort + '명' : '공평성 양호'));
    return '<button class="listrow archrow" onclick="goMonth(\'' + ym + '\')">' +
      '<span class="ar-mini">' + mini + '</span>' +
      '<span class="lr-tx ar-tx"><b>' + p.y + '년 ' + p.m + '월</b>' +
      (st.viols ? '' : '<span><span class="ar-chip green">완료</span></span>') +
      '<span class="lr-sub ar-sub">' + sub + '</span></span>' +
      '<span class="lr-go">' + ic('chevR') + '</span></button>';
  }).join('') || '<p class="hint" style="margin:4px 0 14px">아직 기록이 없어요. 근무표를 만들면 자동으로 이곳에 쌓여요.</p>';
  /* 계정 및 동기화 행의 상태 문구 */
  var sync = document.getElementById('syncSub');
  if (sync) {
    var u = window.Cloud && Cloud.enabled() && Cloud.getUser();
    sync.innerHTML = u ? '서버에 안전하게 저장됨<span class="okdot"></span>' : '로그인하면 서버에 저장돼요';
  }
}
/* 보관함 달 카드의 상태 — 그 달 기준 규칙으로 위반·형평성을 계산한다(읽기 전용) */
function archMonthStatus(ym) {
  var days = daysInYM(ym);
  var viols = 0, people = 0, fairShort = 0;
  groupsPresent().forEach(function (g) {
    var gStaff = groupStaff(g).filter(function (p) {
      return ((db.months[ym].codes || {})[p.id] || []).some(function (c) { return c; });
    });
    if (!gStaff.length) return;
    people += gStaff.length;
    var sched = {}, rests = [], maxRest = 0;
    gStaff.forEach(function (p) {
      var codes = ((db.months[ym].codes || {})[p.id] || []).slice(0, days);
      for (var i = 0; i < days; i++) if (!codes[i]) codes[i] = 'O';
      sched[p.id] = codes;
      var rc = codes.filter(function (c) { return !E.fam(c); }).length;
      rests.push(rc); if (rc > maxRest) maxRest = rc;
    });
    try { viols += E.validate(sched, gStaff, engineConfig(ym, g)).length; } catch (e) { }
    if (gStaff.length >= 2) rests.forEach(function (rc) { if (maxRest - rc >= 2) fairShort++; });
  });
  return { viols: viols, people: people, fairShort: fairShort };
}
/* 달 카드 미니 미리보기 — 앞사람 5명 × 1~7일 */
function archMiniHtml(ym) {
  var mrec = db.months[ym] || {};
  var rows = staffList().filter(function (p) { return ((mrec.codes || {})[p.id] || []).some(function (c) { return c; }); }).slice(0, 5);
  if (!rows.length) return '';
  var html = '<table>';
  rows.forEach(function (p) {
    html += '<tr>';
    for (var d = 1; d <= 7; d++) {
      var c = (mrec.codes[p.id] || [])[d - 1] || '';
      var f = E.fam(c);
      var cls = f ? 'a' + f : (c && c !== 'O' ? 'aV' : 'aO');
      var tx = f ? f : (c && c !== 'O' ? '휴' : '－');
      html += '<td class="' + cls + '">' + tx + '</td>';
    }
    html += '</tr>';
  });
  return html + '</table>';
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
   실측 2분 안팎 걸린다(2026-07-26 로그: 126초 성공 — 예전 "30초" 안내는 실제와 어긋났다).
   진행 중임을 계속 보여주고, 그동안 뒤로가기·새로고침·다른 조작으로 취소되지 않게 막는다.
   (중간에 끊기면 서버 횟수만 소모되고 결과는 못 받는다) */
var aiBusy = false, aiTick = null, aiT0 = 0;
/* 문구가 자꾸 바뀌면 기다리는 사람이 되레 불안하다(초승달 2026-07-26) — 2분 약속 하나로 고정하고,
   약속을 넘겼을 때만 딱 한 번 "늦어지고 있어요"로 바꾼다. 5분 넘으면 cloud.js가 자동 중단. */
var AI_STEPS = [
  [0, '사진을 서버로 보내는 중…'],
  [8, 'AI가 근무표를 읽고 있어요. 보통 2분쯤 걸려요'],
  [125, '생각보다 늦어지고 있네요. 조금만 더 기다려주세요']
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
  /* 막으려고 쌓아둔 기록 한 칸을 조용히 정리 — 전역 뒤로가기 핸들러가 사용자 입력으로 오인하지 않게 */
  if (history.state && history.state.ai) { backSilent++; history.back(); }
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
    if (!res || !res.status) { alert((res && res.data && res.data.error) || '분석 요청에 실패했어요. 인터넷 연결을 확인해주세요.'); return; }
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
  /* 하한 0 안내(2026-07-26) — 근무가 있긴 한데(최대>0) 하한이 0이면 "아무도 없어도 통과"라는 뜻.
     표에 0명인 날이 이틀 이상 관찰됐을 때만 나오는 값이므로, 사람이 맞는지 확인하게 짚어준다. */
  var zeroLo = groups.some(function (gk) {
    return ['wd', 'hd'].some(function (kd) {
      return ['D', 'E', 'N'].some(function (f) {
        var v = _wiz.rules[gk][kd][f]; return v[0] === 0 && v[1] > 0;
      });
    });
  });
  var zeroNote = zeroLo
    ? '<p class="hint wz-note">⚠️ <b>0명으로 시작하는 항목</b>은 그 날 아무도 없어도 된다는 뜻이에요. 꼭 필요한 최소 인원이 있으면 「아니요, 고칠게요」에서 올려주세요.</p>'
    : '';
  if (!_wiz.rulesOpen) {
    return '<div class="wz-ask"><p class="wz-q">하루에 이만큼 근무하나요?</p>' +
      '<div class="wz-summary">' + groups.map(sumFor).join('') + '</div>' +
      '<p class="hint">데이=D, 이브닝=E, 나이트=N (MD·E2도 각 계열에 포함돼요)</p>' + zeroNote + '</div>' +
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
  return '<p class="hint" style="margin:2px 0 8px">하루에 몇 명이 서는지 최소~최대로 고쳐주세요.</p>' + zeroNote +
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
renderIcons();
document.getElementById('kebabBtn').innerHTML = ic('kebab');
renderMonthLabel();
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
   2026-07-22 재정립(v6.0.5): 앱 화면 방향은 '기기의 시스템 자동회전 설정을 따른다' — 자동회전 끄면
   세로 유지, 켜면 회전. 이를 위해 manifest에서 orientation을 뺐다(→ WebAPK screenOrientation=unspecified).
   히스토리: v4.7.4에 manifest 'any'(=fullSensor, 시스템 잠금 무시하고 회전)를 막으려 'portrait'(항상 세로)로
   고정했으나 이는 '자동회전 켜도 세로'라 과했다. 진짜 요구 = 시스템 설정 존중이라 orientation을 뗀다.
   ⚠️ 설치형 WebAPK는 manifest 변경이 즉시 반영 안 됨 — Chrome이 재빌드하거나 재설치해야 새 orientation 적용.
   앱을 JS로 세로 강제(lockPortrait 등)하지 않는다(시스템을 거스르므로). '크게 보기' 뷰어에서만 가로로 잠근다. */

window.addEventListener('orientationchange', function () {
  if (document.body.classList.contains('grid-open')) setTimeout(fitGridFull, 250);  // 뷰어: 회전 후 재적합
  // 일반 화면은 시스템 방향을 그대로 따른다 — 강제하지 않는다.
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
  area.style.transform = ''; area.style.width = ''; area.style.height = '';   // 남은 값 정리
  var table = area.querySelector('table.duty');
  if (!table) { thumb.style.height = ''; return; }
  table.style.transform = '';                    // 실측 위해 초기화(표를 직접 축소)
  var w = table.scrollWidth, h = table.offsetHeight;
  var avail = thumb.clientWidth;
  if (!w || !avail) return;                      // 숨겨져 있으면(폭 0) 건너뜀
  var s = Math.min(1, avail / w);
  table.style.transformOrigin = 'top left';
  table.style.transform = 'scale(' + s + ')';
  /* 사람이 많아 표가 길면 미니맵이 화면을 다 먹지 않도록 높이 제한(아래는 페이드로 가려짐) */
  thumb.style.height = Math.min(h * s, Math.round(window.innerHeight * 0.42)) + 'px';
}

/* 뷰어(가로): 표 '전체'가 좌측 영역(#gridArea = 우측 패널 뺀 공간)에 들어오도록 축소해 가운데 보여준다.
   #gridArea가 flex center이고 table을 중심 기준 scale로 줄인다(잘림 없음). 표를 꽉 채우진 않음(사람 많으면 그만큼 작아짐). */
function fitGridFull() {
  var area = document.getElementById('gridArea');
  if (!area || !document.body.classList.contains('grid-open')) return;
  var table = area.querySelector('table.duty');
  if (!table) return;
  area.style.transform = '';
  table.style.transform = '';                    // 실측 위해 초기화
  var tW = table.scrollWidth, tH = table.offsetHeight;
  var availW = area.clientWidth - 12, availH = area.clientHeight - 12;   // 좌측 표 영역
  if (!tW || !tH || availW <= 0 || availH <= 0) return;
  var s = Math.min(availW / tW, availH / tH);    // 가로·세로 둘 다 들어오는 배율 = 전체가 보임
  vzFit = s;
  vzClamp(area, table);                          // 회전·재렌더 후에도 확대 상태를 한계 안에서 유지
  applyViewerTransform(table);
  /* 방금 '보기'로 데려간 칸이 있으면(회전·재렌더로 배율이 바뀐 직후) 새 배율 기준으로 다시 중앙에 */
  if (vzFocus && Date.now() - vzFocus.t < 1500) {
    var fe = document.getElementById(vzFocus.id);
    if (fe) vzFocusCell(fe, true);
  }
}

/* ---- 뷰어 핀치 확대 (v6.3.0) ----
   전체화면(가로잠금의 필수 전제) 중에는 Android Chrome이 브라우저 핀치줌을 차단하는 것을
   실기기로 확인(2026-07-25) — 그래서 뷰어 안에서 두 손가락 확대·이동을 직접 구현한다.
   fitGridFull의 전체맞춤 배율(vzFit)에 사용자 배율(vzScale 1~4)·이동(vzX,vzY)을 얹어
   transform 하나로 적용한다. 편집은 그대로 — 배율 1에선 개입하지 않고, 확대 중에도
   8px 미만 움직임은 탭으로 취급되어 선택판이 열린다. */
var vzScale = 1, vzX = 0, vzY = 0, vzFit = 1;
var vzFocus = null, vzAnimT = null;              // '보기'로 데려간 칸(재적합 시 재중앙용) · 전환 타이머
function applyViewerTransform(table) {
  table.style.transformOrigin = 'center center';
  table.style.transform = 'translate(' + vzX + 'px,' + vzY + 'px) scale(' + (vzFit * vzScale) + ')';
}
function vzReset() { vzScale = 1; vzX = 0; vzY = 0; vzFocus = null; }
/* fly-in(0.45s) 도중 손가락이 잡으면: 렌더 중인 보간값을 변수로 역산해 그 자리에 동결(순간이동 방지) */
function vzGrab(table) {
  vzFocus = null;
  if (!table.style.transition) return;
  var m = getComputedStyle(table).transform.match(/matrix\(([^)]+)\)/);
  if (m) { var a = m[1].split(',').map(Number); vzScale = a[0] / vzFit; vzX = a[4]; vzY = a[5]; }
  table.style.transition = '';
  applyViewerTransform(table);
}
/* '확인할 곳 → 보기'의 자동 줌 — 그 칸이 화면 가운데 오도록 알맞게 확대한다.
   목표 배율은 셀이 원래 크기의 약 0.8배로 보이는 정도(1.5~3배 — 과한 확대는 피함).
   사용자가 이미 더 크게 확대해 뒀으면 배율은 존중하고 위치만 옮긴다.
   instant = 재적합(회전·재렌더) 직후의 재중앙 — 전환 애니메이션 없이 바로. */
function vzFocusCell(el, instant) {
  var area = document.getElementById('gridArea');
  var table = area && area.querySelector('table.duty');
  if (!table || !el || !document.body.classList.contains('grid-open')) return;
  /* u = 이 칸의 표 위 위치(표 중심 기준, 원배율 좌표) — 핀치 코드와 같은 규약.
     rect가 아니라 레이아웃 오프셋으로 구한다: transform과 무관해서 전환 애니메이션
     도중(이전 '보기'의 이동 중)에 또 눌러도 정확하다. */
  var u = { x: el.offsetLeft + el.offsetWidth / 2 - table.scrollWidth / 2,
            y: el.offsetTop + el.offsetHeight / 2 - table.offsetHeight / 2 };
  vzScale = Math.max(vzScale, Math.min(3, Math.max(1.5, 0.8 / vzFit)));
  var S = vzFit * vzScale;
  vzX = -S * u.x; vzY = -S * u.y;
  vzClamp(area, table);
  clearTimeout(vzAnimT);
  var noMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (instant || noMotion) table.style.transition = '';
  else {
    table.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)';
    vzAnimT = setTimeout(function () { table.style.transition = ''; }, 500);
  }
  applyViewerTransform(table);
}
function vzClamp(area, table) {
  vzScale = Math.min(4, Math.max(1, vzScale));
  if (vzScale === 1) { vzX = 0; vzY = 0; return; }
  var S = vzFit * vzScale;
  var maxX = Math.max(0, (table.scrollWidth * S - area.clientWidth) / 2 + 24);
  var maxY = Math.max(0, (table.offsetHeight * S - area.clientHeight) / 2 + 24);
  vzX = Math.min(maxX, Math.max(-maxX, vzX));
  vzY = Math.min(maxY, Math.max(-maxY, vzY));
}
(function () {
  var tp = null;                                 // 진행 중인 제스처(pinch/pan)
  function els() {
    var area = document.getElementById('gridArea');
    var table = area && area.querySelector('table.duty');
    return table ? { area: area, table: table } : null;
  }
  function mid(ts) { return { x: (ts[0].clientX + ts[1].clientX) / 2, y: (ts[0].clientY + ts[1].clientY) / 2 }; }
  function dist(ts) { return Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY) || 1; }
  document.addEventListener('touchstart', function (ev) {
    if (!document.body.classList.contains('grid-open')) return;
    var e = els();
    if (!e || !e.area.contains(ev.target)) return;
    var ts = ev.touches;
    if (ts.length === 2) {
      vzGrab(e.table);                 // 손가락이 잡으면 자동 줌은 손 뗀다(현 위치 동결)
      var r = e.area.getBoundingClientRect();
      var c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      var m = mid(ts), S = vzFit * vzScale;
      /* u = 손가락 중점 아래의 표 위 지점(표 중심 기준) — 확대해도 이 지점이 손끝에 붙어 있도록 */
      tp = { kind: 'pinch', d0: dist(ts), s0: vzScale, c: c, u: { x: (m.x - c.x - vzX) / S, y: (m.y - c.y - vzY) / S } };
    } else if (ts.length === 1 && vzScale > 1) {
      vzGrab(e.table);
      tp = { kind: 'pan', x0: ts[0].clientX, y0: ts[0].clientY, px: vzX, py: vzY, moved: false };
    }
  }, { passive: true });
  document.addEventListener('touchmove', function (ev) {
    if (!tp) return;
    var e = document.body.classList.contains('grid-open') && els();
    if (!e) { tp = null; return; }
    var ts = ev.touches;
    if (tp.kind === 'pinch' && ts.length >= 2) {
      vzScale = tp.s0 * (dist(ts) / tp.d0);
      var S = vzFit * Math.min(4, Math.max(1, vzScale));
      var m = mid(ts);
      vzX = m.x - tp.c.x - S * tp.u.x;
      vzY = m.y - tp.c.y - S * tp.u.y;
      vzClamp(e.area, e.table);
      applyViewerTransform(e.table);
      ev.preventDefault();
    } else if (tp.kind === 'pan' && ts.length === 1) {
      var dx = ts[0].clientX - tp.x0, dy = ts[0].clientY - tp.y0;
      if (!tp.moved && Math.abs(dx) + Math.abs(dy) < 8) return;   // 탭 판정 보호
      tp.moved = true;
      vzX = tp.px + dx; vzY = tp.py + dy;
      vzClamp(e.area, e.table);
      applyViewerTransform(e.table);
      ev.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('touchend', function (ev) {
    if (!tp) return;
    if (!ev.touches.length) { tp = null; return; }
    if (tp.kind === 'pinch' && ev.touches.length === 1)   // 손가락 하나 남으면 이동 모드로 이어감
      tp = { kind: 'pan', x0: ev.touches[0].clientX, y0: ev.touches[0].clientY, px: vzX, py: vzY, moved: true };
  }, { passive: true });
})();

/* 표를 가로 전체화면으로 크게 — #gridThumb를 화면 가득 채우고(클래스 토글) 가로로 잠근다. */
function openGridFull() {
  if (document.body.classList.contains('grid-open')) return;
  if (!document.querySelector('#gridArea table.duty')) return;   // 아직 표가 없으면 무시
  document.body.classList.add('grid-open');
  var thumb = document.getElementById('gridThumb');
  if (thumb) { thumb.style.height = ''; thumb.scrollTop = 0; }
  var oarea = document.getElementById('gridArea');
  if (oarea) oarea.style.transform = '';         // 미니맵에서 쓴 값 정리
  vzReset();                                     // 지난번 확대 상태는 이어받지 않는다
  lockLandscape();
  fitGridFull();                                 // 회전 전 우선 적합, 회전 완료되면 재적합
  renderViewerPanel();                           // 우측 라이브 오류 패널
  if (!openGridFull._hint) { openGridFull._hint = 1; toast('두 손가락으로 벌리면 크게 볼 수 있어요'); }
}
function closeGridFull(ev) {
  if (ev) ev.stopPropagation();
  vzReset();
  document.body.classList.remove('grid-open');
  var area = document.getElementById('gridArea');
  if (area) { area.style.transform = ''; area.style.width = ''; area.style.height = '';
    var _t = area.querySelector('table.duty'); if (_t) { _t.style.transform = ''; _t.style.transition = ''; } }
  /* 뷰어의 가로 잠금을 풀어 기기의 시스템 방향 설정을 다시 따르게 한다(세로 강제 아님 — 자동회전 존중).
     이 기기는 lock/unlock이 전체화면에서만 되므로, 전체화면 상태에서 unlock한 뒤 나간다. */
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { }
  try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { }
  fitGridThumb();
}
/* 가로 잠금: 이 기기(안드로이드 Chrome/WebAPK)는 orientation.lock에 '전체화면'이 필수(SecurityError) —
   전체화면을 먼저 켜고 landscape로 잠근다. iOS 등 전체화면/lock 미지원이면 조용히 실패하고,
   표는 그대로 (세로에서도) 전체가 축소되어 보인다(fitGridFull). */
function lockLandscape() {
  var lockLand = function () {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').then(function () { setTimeout(fitGridFull, 200); },
                                                   function () { setTimeout(fitGridFull, 200); });
      }
    } catch (e) { /* 무시 */ }
  };
  try {
    var el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().then(lockLand, lockLand);
    else lockLand();
  } catch (e) { lockLand(); }
}
/* Esc 또는 시스템이 전체화면을 해제하면 큰 화면도 닫는다 */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && document.body.classList.contains('grid-open')) closeGridFull();
});
document.addEventListener('fullscreenchange', function () {
  if (!document.fullscreenElement && document.body.classList.contains('grid-open')) closeGridFull();
});

/* ===== 시스템 뒤로가기(안드로이드) — v7.2.0 =====
   예전엔 뒤로가기를 누르면 앱이 바로 꺼졌다(히스토리가 1칸뿐이라). 완충용 기록 1칸을 깔아두고,
   뒤로 누르면 열려 있는 것(메뉴→시트→안내창→가져오기 확인→생성 중→뷰어→부속화면→다른 탭→로그인 하위화면)을
   위에서부터 한 겹만 닫는다. 홈 바닥에서는 "한 번 더 누르면 종료"(2초) 후에야 실제로 나간다.
   ※ AI 분석 중 차단(aiBlockBack)은 별도 유지 — 여기서는 aiBusy면 손대지 않는다.
   ※ 뷰어 전체화면 중의 뒤로가기는 안드로이드가 전체화면 해제로 소비(위 fullscreenchange가 닫음)
      — 히스토리가 안 빠지므로 이 핸들러와 겹치지 않는다. */
var backExitAt = 0;    // 마지막 '한 번 더 누르면 종료' 안내 시각
var backSilent = 0;    // 프로그램이 부른 history.back()을 사용자 입력과 구분하는 카운터
function backStep() {
  var el = document.getElementById('kebabMenu');
  if (el && el.classList.contains('on')) { hideKebab(); return true; }
  el = document.getElementById('sheetWrap');
  if (el && el.classList.contains('on')) { closeSheet(); return true; }
  el = document.getElementById('installModal');
  if (el && el.classList.contains('on')) { closeInstallModal(); return true; }
  el = document.getElementById('importReview');
  if (el && el.classList.contains('on')) {
    /* AI 결과는 평생 3회 — 실수 뒤로가기로 날리지 않게 단계만 되돌리고 화면은 지킨다 */
    if (_wiz && _wiz.step > 0) wizBack();
    else toast('가져온 내용을 확인 중이에요 — 화면의 버튼으로 진행해주세요');
    return true;
  }
  el = document.getElementById('genScreen');
  if (el && el.classList.contains('on')) { genCancel(); return true; }
  if (document.body.classList.contains('grid-open')) { closeGridFull(); return true; }
  if (openScreenId) {
    if (openScreenId === 'screen-wish') closeWishScreen(); else closeScreen();
    return true;
  }
  if (document.getElementById('tab-home').style.display === 'none') { showTab('home'); return true; }
  /* 홈 로그인 화면의 하위(가입·비번찾기)면 첫 로그인 화면으로 */
  var lc = document.getElementById('homeLoginCard');
  if (lc && lc.style.display !== 'none' && cloudView !== 'main') { cloudGoto('main'); return true; }
  return false;
}
window.addEventListener('popstate', function () {
  if (backSilent > 0) { backSilent--; return; }
  if (aiBusy) return;                                   // 분석 중 — aiBlockBack이 도로 채운다
  if (backStep()) { history.pushState({ um: 1 }, '', location.href); return; }
  if (Date.now() - backExitAt < 2000) { history.back(); return; }   // 2초 안 두 번 = 진짜 종료
  backExitAt = Date.now();
  toast('한 번 더 누르면 앱이 종료돼요');
  history.pushState({ um: 1 }, '', location.href);
});
/* 완충 1칸 — 새로고침 시(state가 남아 있음) 중복으로 쌓지 않는다 */
if (!(history.state && (history.state.um || history.state.ai)))
  history.pushState({ um: 1 }, '', location.href);
