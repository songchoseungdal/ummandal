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

  function signUp(email, pw) {
    /* 확인 메일이 돌아올 주소를 명시 — 없으면 서버 기본값에 의존해 엉뚱한 곳(루트 404)으로 갈 수 있다 */
    var to = CLOUD_CONFIG.siteUrl || (location.origin + location.pathname);
    return sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: to } });
  }
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
  /* 서버 인증 설정(제공자 활성 여부) — 세션당 1회 조회 캐시 */
  var settingsCache = null;
  function authSettings() {
    if (!settingsCache) {
      settingsCache = fetch(CLOUD_CONFIG.url + '/auth/v1/settings', { headers: { apikey: CLOUD_CONFIG.key } })
        .then(function (r) { return r.json(); })
        .catch(function () { settingsCache = null; return null; });
    }
    return settingsCache;
  }
  function signInOAuth(provider) {
    /* 제공자가 꺼져 있으면 이동하지 말 것 — 이동해 버리면 서버가 안내 없는 JSON 400 페이지를
       띄워 사용자가 갇힌다. 이동 전에 설정을 조회해 앱 안에서 한국어로 안내한다. */
    return authSettings().then(function (s) {
      if (s && s.external && s.external[provider] === false) {
        return { error: { message: 'provider is not enabled' } };
      }
      var to = CLOUD_CONFIG.siteUrl || (location.origin + location.pathname);
      /* 카카오 요청 범위(account_email·profile_image·profile_nickname)는 Supabase 서버가
         고정으로 보낸다 — 클라이언트 scopes 옵션은 추가만 될 뿐 줄일 수 없음(2026-07-19 실측).
         따라서 카카오 콘솔에는 세 동의항목이 모두 설정되어 있어야 한다(아니면 KOE205). */
      return sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: to } });
    });
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
