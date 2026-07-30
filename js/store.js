/* 저장 계층 — 모든 변경은 즉시 자동 저장된다 */
var Store = (function () {
  var KEY = 'ummandal_v1';
  /* 이 기기에 담긴 근무표가 '누구 계정의 것'인지 표시 (2026-07-30).
     로컬 저장 자리는 하나뿐이라, 계정을 바꿔 로그인하면 앞 계정 내용이 그대로 남는다.
     그 내용을 새 계정 서버로 올려버리는 사고를 막기 위해 소유 계정을 따로 적어둔다. */
  var OWNER = 'ummandal_owner';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 저장 공간 부족 등 — 무시 */ }
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { }
  }
  function owner() {
    try { return localStorage.getItem(OWNER) || null; } catch (e) { return null; }
  }
  function setOwner(uid) {
    try { uid ? localStorage.setItem(OWNER, uid) : localStorage.removeItem(OWNER); } catch (e) { }
  }
  return { load: load, save: save, clear: clear, owner: owner, setOwner: setOwner };
})();
