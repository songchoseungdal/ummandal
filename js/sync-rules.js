/* ===== 로그인 동기화 판단 규칙 (순수 함수) =====
 * 화면·네트워크와 분리해 두는 이유: 이 판단이 틀리면 사용자의 근무표가 사라지거나
 * 남의 명단이 다른 계정으로 복제된다. 자동 테스트로 고정해야 하는 부분이라 따로 뺐다.
 * 실행: node webapp/test/sync.test.mjs   (제정 2026-07-30, v7.9.2)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SyncRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* 입력
   *   own        : 이 기기 근무표의 소유 계정 id (모르면 null)
   *   uid        : 지금 로그인한 계정 id
   *   localEmpty : 이 기기에 근무표가 없는가 (인원 0명 기준)
   *   serverEmpty: 서버에 이 계정 근무표가 없는가 (행이 없거나 인원 0명)
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

  return { decideSync: decideSync };
});
