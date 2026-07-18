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

  /* ---- 전화 인증 (config.phoneAuth로 켜고 끔) ---- */
  function phoneEnabled() { return enabled() && !!CLOUD_CONFIG.phoneAuth; }
  /* 다단계 인증(가입 OTP·비번 재설정) 진행 중 — 이 동안 SIGNED_IN이 화면을 덮지 않게 앱이 참조 */
  var authFlow = false;
  function setAuthFlow(v) { authFlow = !!v; }
  function inAuthFlow() { return authFlow; }
  /* 한국 휴대폰 번호 정규화: 하이픈·공백·+82/82 접두 제거 후 010########만 수락 → E.164 */
  function phoneNorm(raw) {
    var s = String(raw || '').replace(/[\s\-().]/g, '');
    if (s.indexOf('+82') === 0) s = '0' + s.slice(3);
    else if (s.indexOf('82') === 0 && s.length >= 11) s = '0' + s.slice(2);
    if (!/^010\d{8}$/.test(s)) return null;
    return '+82' + s.slice(1);
  }
  function phoneDisp(e164) {
    if (!e164) return '';
    var s = e164.indexOf('+82') === 0 ? '0' + e164.slice(3) : e164;
    return s.length === 11 ? s.slice(0, 3) + '-' + s.slice(3, 7) + '-' + s.slice(7) : s;
  }
  function signUpPhone(phone, pw) { return sb.auth.signUp({ phone: phone, password: pw }); }
  function signInPhone(phone, pw) { return sb.auth.signInWithPassword({ phone: phone, password: pw }); }
  function sendOtp(phone) { return sb.auth.signInWithOtp({ phone: phone, options: { shouldCreateUser: false } }); }
  function resendOtp(phone) { return sb.auth.resend({ type: 'sms', phone: phone }); }
  function verifyOtp(phone, token) { return sb.auth.verifyOtp({ phone: phone, token: token, type: 'sms' }); }
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
    phoneEnabled: phoneEnabled, setAuthFlow: setAuthFlow, inAuthFlow: inAuthFlow,
    phoneNorm: phoneNorm, phoneDisp: phoneDisp,
    signUpPhone: signUpPhone, signInPhone: signInPhone,
    sendOtp: sendOtp, resendOtp: resendOtp, verifyOtp: verifyOtp,
    setPassword: setPassword, signOutOthers: signOutOthers, resetEmail: resetEmail
  };
})();
