/* 저장 계층 — 모든 변경은 즉시 자동 저장된다 */
var Store = (function () {
  var KEY = 'ummandal_v1';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 저장 공간 부족 등 — 무시 */ }
  }
  return { load: load, save: save };
})();
