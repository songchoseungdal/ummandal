/* ===== 서버 연동 (Supabase) =====
   설정(config.js)이 비어 있으면 조용히 꺼진 상태 — 앱은 로컬 전용으로 동작한다. */
var Cloud = (function () {
  var sb = null;
  var user = null;
  var pushTimer = null;
  var lastSync = null;
  var listeners = [];

  function enabled() {
    return !!(window.CLOUD_CONFIG && CLOUD_CONFIG.url && CLOUD_CONFIG.key && window.supabase);
  }
  function init() {
    if (!enabled()) return;
    sb = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.key);
    sb.auth.onAuthStateChange(function (event, session) {
      var before = user && user.id;
      user = session ? session.user : null;
      var after = user && user.id;
      listeners.forEach(function (fn) { fn(event, before !== after); });
    });
  }
  function onChange(fn) { listeners.push(fn); }
  function getUser() { return user; }
  function getLastSync() { return lastSync; }

  function signUp(email, pw) { return sb.auth.signUp({ email: email, password: pw }); }
  function signIn(email, pw) { return sb.auth.signInWithPassword({ email: email, password: pw }); }
  function signOut() { return sb.auth.signOut(); }

  /* 다단계 인증(비밀번호 재설정 등) 진행 중 — 이 동안 SIGNED_IN이 화면을 덮지 않게 앱이 참조 */
  var authFlow = false;
  function setAuthFlow(v) { authFlow = !!v; }
  function inAuthFlow() { return authFlow; }
  /* ---- 소셜 로그인 (구글·카카오) — PKCE 리다이렉트, 정적 웹앱 표준 ---- */
  function oauthProviders() {
    return (enabled() && CLOUD_CONFIG.oauth) ? CLOUD_CONFIG.oauth : [];
  }
  function signInOAuth(provider) {
    var to = CLOUD_CONFIG.siteUrl || (location.origin + location.pathname);
    return sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: to } });
  }
  function setPassword(pw) { return sb.auth.updateUser({ password: pw }); }
  /* 비번 재설정 후 다른 기기 세션 무효화 (이 기기는 유지) */
  function signOutOthers() { return sb.auth.signOut({ scope: 'others' }); }
  function resetEmail(email) {
    var to = CLOUD_CONFIG.siteUrl || (location.origin + location.pathname);
    return sb.auth.resetPasswordForEmail(email, { redirectTo: to });
  }

  function pull() {
    if (!user) return Promise.resolve({ data: null });
    return sb.from('user_data').select('data, updated_at').eq('user_id', user.id).maybeSingle();
  }
  function push(data) {
    if (!user) return Promise.resolve({ error: null });
    return sb.from('user_data')
      .upsert({ user_id: user.id, data: data, updated_at: new Date().toISOString() })
      .then(function (res) {
        if (!res.error) lastSync = new Date();
        return res;
      });
  }
  function schedulePush(getData, done) {
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      push(getData()).then(function (res) { if (done) done(res); });
    }, 2500);
  }

  return {
    enabled: enabled, init: init, onChange: onChange,
    getUser: getUser, getLastSync: getLastSync,
    signUp: signUp, signIn: signIn, signOut: signOut,
    pull: pull, push: push, schedulePush: schedulePush,
    setAuthFlow: setAuthFlow, inAuthFlow: inAuthFlow,
    oauthProviders: oauthProviders, signInOAuth: signInOAuth,
    setPassword: setPassword, signOutOthers: signOutOthers, resetEmail: resetEmail
  };
})();
