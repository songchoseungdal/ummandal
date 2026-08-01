/* ===== 로그인 동기화 판단 규칙 (순수 함수) =====
 * 화면·네트워크와 분리해 두는 이유: 이 판단이 틀리면 사용자의 근무표가 사라지거나
 * 남의 명단이 다른 계정으로 복제된다. 자동 테스트로 고정해야 하는 부분이라 따로 뺐다.
 * 실행: node webapp/test/sync.test.mjs   (제정 2026-07-30, v7.9.2 / 확장 v7.10.0)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SyncRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* 이 기기(또는 서버)에 '사람이 넣은 내용'이 하나도 없는가.
     v7.9.2까지는 인원(staff)만 봤다 — 그래서 인원을 아직 안 넣고 규칙만 정성껏 맞춰뒀거나
     희망 휴무·습관 메모만 있는 기기가 '빈 기기'로 취급돼, 스냅샷도 없이 서버 내용으로
     덮였다(2026-07-30 적대 검토 지적 ④). 실제 입력이 있으면 전부 '내용 있음'으로 본다.
     ⚠️ 기본값(규칙 초기값·자동 공휴일 등)은 세지 않는다 — 세면 새 기기 첫 로그인에서
     서버 복원(adopt)이 막힌다. */
  function isEmptyDb(d) {
    if (!d) return true;
    if (d.staff && d.staff.length) return false;
    if (d.customPatterns && d.customPatterns.length) return false;   // 채택한 AI 습관 메모
    var ms = d.months || {};
    for (var ym in ms) {
      if (!Object.prototype.hasOwnProperty.call(ms, ym)) continue;
      var m = ms[ym] || {};
      if (hasAny(m.codes) || hasAny(m.wish) || hasAny(m.pins)) return false;
    }
    return true;
  }
  /* {사람id: 값} 묶음에 실제 값이 하나라도 있는가 (빈 배열·빈 객체는 없는 것으로 본다) */
  function hasAny(rec) {
    if (!rec) return false;
    for (var k in rec) {
      if (!Object.prototype.hasOwnProperty.call(rec, k)) continue;
      var v = rec[k];
      if (v == null) continue;
      if (Array.isArray(v)) { if (v.some(function (x) { return !!x; })) return true; }
      else if (typeof v === 'object') { if (Object.keys(v).length) return true; }
      else if (v) return true;
    }
    return false;
  }

  /* 서버 내용을 받으면(adopt) 인원이 크게 줄어드는가 — '거의 빈 서버'가 최신인 조합 방어.
     막지는 않는다(퇴사 반영 같은 정상 감축을 가로막으면 더 나쁘고, 되돌리기 스냅샷도 남는다).
     대신 호출부가 조용한 토스트 대신 '되돌리기'가 붙은 안내를 띄우게 하는 신호로만 쓴다.
     ⚠️ 임계값 3명·50%는 실사용 근거가 없는 **잠정값**이다(2026-07-30 신설, 재검토 대상).
        기준: 병동 최소 인원이 보통 3명 이상이고, 절반 미만으로 주는 것은 정상 편집으로 보기 어렵다. */
  var SHRINK_MIN = 3, SHRINK_RATIO = 0.5;
  function isBigShrink(before, after) {
    before = before || 0; after = after || 0;
    if (before < SHRINK_MIN) return false;
    return after < before * SHRINK_RATIO;
  }

  /* 입력
   *   own        : 이 기기 근무표의 소유 계정 id (모르면 null)
   *   uid        : 지금 로그인한 계정 id
   *   localEmpty : 이 기기에 근무표가 없는가 (isEmptyDb 기준)
   *   serverEmpty: 서버에 이 계정 근무표가 없는가 (행이 없거나 내용이 없음)
   *   localAt / serverAt : 마지막 저장 시각(ms)
   * 반환
   *   'adopt' 서버 내용을 받아 이 기기에 채운다
   *   'push'  이 기기 내용을 서버에 올린다
   *   'hold'  올리지도 받지도 않고 이 기기에만 둔다 (다른 계정 근무표 보호 — 지우지 않는다)
   *   'none'  할 일 없음 (같은 내용이거나 양쪽 다 비었음)
   */
  function decideSync(o) {
    var own = o.own || null, uid = o.uid || null;
    var localEmpty = !!o.localEmpty, serverEmpty = !!o.serverEmpty;
    var localAt = o.localAt || 0, serverAt = o.serverAt || 0;

    /* 이 기기 내용이 '다른 계정' 것이면 새 계정 서버로 올리지 않는다.
       서버에 그 계정 근무표가 있으면 그걸 받고(=이 기기 내용은 스냅샷 보존),
       없으면 아무것도 하지 않고 그대로 둔다 — 지우는 쪽을 기본값으로 삼지 않는다. */
    if (own && uid && own !== uid && !localEmpty) return serverEmpty ? 'hold' : 'adopt';

    /* 새 기기(이 기기가 비었음) — 시계가 뭐라 하든 서버 근무표를 지킨다 */
    if (localEmpty && !serverEmpty) return 'adopt';
    /* 양쪽 다 비었음 — 빈 내용을 굳이 올리지 않는다(빈 서버 행을 만들지 않기 위해) */
    if (localEmpty && serverEmpty) return 'none';
    /* 서버가 빈 계정 — 이 기기 내용을 올린다 */
    if (serverEmpty) return 'push';

    if (serverAt > localAt) return 'adopt';
    if (localAt > serverAt) return 'push';
    return 'none';   /* 같은 시각 = 같은 내용. 앱을 열 때마다 다시 올리지 않는다 */
  }

  return { decideSync: decideSync, isEmptyDb: isEmptyDb, isBigShrink: isBigShrink };
});
