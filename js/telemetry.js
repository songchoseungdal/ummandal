/* ===== 사용 품질 텔레메트리 (v7.7.0, 2026-07-29) =====
 * 에러코드·화면 체류·핵심 퍼널을 Supabase app_events로 보내 유지보수에 쓴다.
 * 원칙:
 *  ① 개인정보(이름·근무 내용·이메일·입력값) 미수집 — 수치·코드·상태만 담는다
 *  ② 텔레메트리가 앱을 깨는 일 금지 — 모든 공개 함수는 실패를 삼킨다.
 *     app.js의 훅도 전부 `window.Tel && Tel.x()` 가드라 이 파일이 안 실려도 앱은 무결.
 *  ③ 오프라인 우선 — localStorage 큐에 쌓고, 로그인+온라인일 때만 배치 전송.
 *     전송 성공 후에만 큐에서 지운다(페이지 킬로 유실 없음 — 다음 실행에서 재전송).
 *
 * 큐 항목: {k(로컬키), sid, uid(적재 시점 계정·비로그인 null), ver, ev, code, dur, det, ts}
 * 세션: 30분 비활동이 지나면 새 세션(sid 재발급 + app_open) — 설치형 PWA는 탭이
 *       며칠씩 살아 있어 sessionStorage '탭 단위'만으로는 세션이 끊기지 않는다. */
var Tel = (function () {
  var QKEY = 'ummandal_tel_q', SKEY = 'ummandal_tel_s';
  var MAXQ = 300;                      // 큐 상한 — 넘치면 오래된 것부터 버림
  var BATCH = 25;                      // 배치 전송 크기
  var GAP = 30 * 60 * 1000;            // 세션 경계 = 30분 비활동
  var DWELL_MAX = 30 * 60 * 1000;      // 체류시간 상한(백그라운드 잔존 왜곡 방지)
  var ERR_MAX = 5;                     // 같은 에러코드는 세션당 5회까지만(폭주 방지)
  var sid = null, lastTs = 0, opening = false;
  var surface = null, t0 = 0, lastTab = 'tab:home';
  var inFlight = false, errCount = {}, openDetail = null;

  /* 큐 읽기 — 파손되어 있으면 빈 큐로 자가 회복(Store.load 선례와 동일) */
  function loadQ() {
    try {
      var q = JSON.parse(localStorage.getItem(QKEY) || '[]');
      return Array.isArray(q) ? q : [];
    } catch (e) { return []; }
  }
  function saveQ(q) { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) { } }
  function curUid() {
    try {
      var u = window.Cloud && Cloud.enabled() && Cloud.getUser();
      return u ? u.id : null;
    } catch (e) { return null; }
  }
  /* 에러 문자열 정리 — URL의 쿼리·해시를 지운다(OAuth 토큰·코드가 실릴 수 있는 자리,
     인라인 핸들러 예외의 스택 프레임엔 문서 전체 URL이 들어온다) 후 250자 절단 */
  function scrub(s) {
    s = String(s == null ? '' : s);
    s = s.replace(/(https?:\/\/[^\s)'"?#]+)[?#][^\s)'"]*/g, '$1?***');
    return s.slice(0, 250);
  }
  function touch() {
    lastTs = Date.now();
    try { sessionStorage.setItem(SKEY, sid + '|' + lastTs); } catch (e) { }
  }
  /* 세션 확보 — 30분 넘게 쉬었으면 새 세션으로 보고 app_open을 남긴다 */
  function ensureSession() {
    var t = Date.now();
    if (!sid) {
      try {
        var raw = sessionStorage.getItem(SKEY) || '';
        var i = raw.indexOf('|');
        if (i > 0) { sid = raw.slice(0, i); lastTs = +raw.slice(i + 1) || 0; }
      } catch (e) { }
    }
    if (!sid || (t - lastTs) > GAP) {
      sid = 's' + t.toString(36) + Math.random().toString(36).slice(2, 8);
      errCount = {};
      touch();
      if (!opening) {          // app_open 적재가 다시 ensureSession을 부르는 재귀 방지
        opening = true;
        try { push('funnel', 'app_open', null, openDetail ? openDetail() : null); } catch (e) { }
        opening = false;
      }
    }
    return sid;
  }
  function push(ev, code, dur, det) {
    var q = loadQ();
    q.push({
      k: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      sid: ensureSession(), uid: curUid(), ver: String(window.APP_VER || '?'),
      ev: ev, code: String(code).slice(0, 40),
      dur: (dur == null ? null : Math.max(0, Math.round(dur))),
      det: det || null, ts: new Date().toISOString()
    });
    if (q.length > MAXQ) q = q.slice(q.length - MAXQ);
    saveQ(q);
    touch();
  }

  function event(ev, code, dur, det) { try { push(ev, code, dur, det); } catch (e) { } }
  function error(code, err) {
    try {
      errCount[code] = (errCount[code] || 0) + 1;
      if (errCount[code] > ERR_MAX) return;
      var det = null;
      if (err) det = { msg: scrub(err.message || err), stack: scrub(err.stack || '') };
      push('err', code, null, det);
      flush();
    } catch (e) { }
  }
  /* 표면 전환 — 직전 표면의 체류시간을 확정 적재. 같은 표면 연속 호출은 무시 */
  function screen(name) {
    try {
      name = String(name).slice(0, 40);
      if (surface === name) return;
      closeDwell();
      surface = name;
      t0 = Date.now();
      if (name.indexOf('tab:') === 0) lastTab = name;
      touch();
    } catch (e) { }
  }
  /* 덮개 화면(부속 화면·뷰어·생성·AI 대기)이 닫힐 때 — 밑에 깔린 탭으로 복귀 */
  function back() { screen(lastTab); }
  function closeDwell() {
    if (!surface || !t0) return;
    var d = Date.now() - t0;
    if (d >= 500 && d <= DWELL_MAX) push('screen', surface, d, null);
    t0 = 0;
  }

  /* 전송 — 로그인+온라인일 때만. 성공(또는 재시도 무의미한 4xx)한 항목만 큐에서 제거.
     적재 시점 계정(uid)이 현재 계정과 다른 항목은 폐기(계정 전환 시 오귀속 방지),
     비로그인 시절(uid null) 항목은 현재 계정에 귀속(로그인 전 온보딩 이벤트 보존). */
  function flush() {
    try {
      if (inFlight) return;
      var u = curUid();
      if (!u || !navigator.onLine) return;
      if (!(window.Cloud && Cloud.insertEvents)) return;
      var q = loadQ();
      var send = [], dropped = false;
      for (var i = 0; i < q.length && send.length < BATCH; i++) {
        if (q[i].uid && q[i].uid !== u) { dropped = true; continue; }
        send.push(q[i]);
      }
      if (!send.length) {
        if (dropped) saveQ(q.filter(function (it) { return !(it.uid && it.uid !== u); }));
        return;
      }
      var rows = send.map(function (it) {
        return {
          user_id: u, session_id: it.sid, app_ver: it.ver, event: it.ev,
          code: it.code, dur_ms: it.dur, detail: it.det, client_ts: it.ts
        };
      });
      inFlight = true;
      Cloud.insertEvents(rows).then(function (res) {
        inFlight = false;
        var err = res && res.error;
        var constraint = err && err.code && (String(err.code).indexOf('23') === 0 || String(err.code).indexOf('42') === 0);
        if (!err || constraint) {
          /* 성공, 또는 제약·권한 위반(재시도해도 똑같음 → 폐기) — 전송분·타계정분 제거.
             전송 중에 새로 쌓인 항목은 다시 읽어 보존한다. */
          var sent = {};
          send.forEach(function (it) { sent[it.k] = 1; });
          saveQ(loadQ().filter(function (it) {
            return !sent[it.k] && !(it.uid && it.uid !== u);
          }));
          if (!err && loadQ().length >= BATCH) setTimeout(flush, 400);   // 밀린 분량 이어서
        }
        /* 네트워크류 실패 → 큐 그대로(다음 주기 재시도) */
      }, function () { inFlight = false; });
    } catch (e) { inFlight = false; }
  }

  /* 부팅 훅(app.js) — app_open detail 공급자 등록 + 세션 시작 확정 */
  function boot(fn) {
    try {
      openDetail = fn || null;
      ensureSession();
    } catch (e) { }
  }

  (function init() {
    try {
      window.addEventListener('error', function (e) {
        /* e.filename(URL) 인자는 저장하지 않는다 — 메시지·스택만(scrub 처리) */
        error('E90', (e && e.error) || { message: (e && e.message) || 'unknown' });
      });
      window.addEventListener('unhandledrejection', function (e) {
        var r = e && e.reason;
        error('E91', (r && r.message) ? r : { message: String(r) });
      });
      document.addEventListener('visibilitychange', function () {
        try {
          if (document.visibilityState === 'hidden') { closeDwell(); flush(); }
          else { ensureSession(); if (surface && !t0) t0 = Date.now(); }
        } catch (e) { }
      });
      setInterval(function () { try { flush(); } catch (e) { } }, 30000);
      if (window.Cloud && Cloud.onChange) Cloud.onChange(function (event) {
        try {
          if (event === 'SIGNED_OUT') saveQ([]);   // 계정 경계 — 잔류 큐가 다음 계정에 붙지 않게
          else flush();                             // 로그인·토큰 갱신 시 밀린 큐 전송
        } catch (e) { }
      });
    } catch (e) { }
  })();

  return { event: event, error: error, screen: screen, back: back, boot: boot, flush: flush };
})();
