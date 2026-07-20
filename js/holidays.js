/* ===== 대한민국 공휴일 =====
 * 원칙(2026-07-20 사용자 결정): **인터넷 연결을 전제로 서버에서 받아온다.**
 *   대체공휴일·임시공휴일은 정부가 그때그때 지정하므로, 앱에 박아두면 반드시 낡는다.
 *   정본 = 공공데이터포털 「특일정보」(한국천문연구원) → Supabase Edge Function이 프록시.
 *
 * 내장 표는 '정답'이 아니라 **서버를 못 부를 때만 쓰는 임시값**이다.
 *   (조사·교차검증 2026-07-20. 출처 간 다툼이 있던 항목은 아래 주석 참고)
 *   - 제헌절(7/17): 2026-04-28 국무회의 의결·05-11 시행으로 공휴일 재지정 → 2026년부터 포함
 *   - 근로자의 날(5/1): 「관공서의 공휴일에 관한 규정」상 공휴일이 아니어서 **제외**.
 *     병원이 휴일로 운영한다면 어머니가 직접 추가하시면 된다.
 */
var KR_HOLIDAY_FALLBACK = {
  2026: {
    1: [1], 2: [16, 17, 18], 3: [1, 2], 5: [5, 24, 25], 6: [3, 6], 7: [17],
    8: [15, 17], 9: [24, 25, 26], 10: [3, 5, 9], 12: [25]
  },
  2027: {
    1: [1], 2: [6, 7, 8, 9], 3: [1], 5: [5, 13], 6: [6], 7: [17],
    8: [15, 16], 9: [14, 15, 16], 10: [3, 4, 9, 11], 12: [25, 27]
  },
  2028: {
    1: [1, 26, 27, 28], 3: [1], 4: [12], 5: [2, 5], 6: [6], 7: [17],
    8: [15], 10: [2, 3, 4, 5, 9], 12: [25]
  }
};

/* 서버에서 받아온 연도별 공휴일 (연 → {월: [일...]}) — 받아오면 내장 표보다 우선한다 */
var KR_HOLIDAY_FETCHED = {};
var _krFetching = {};

function krFallbackDays(ym) {
  var a = String(ym).split('-'), y = +a[0], mo = +a[1];
  var yr = KR_HOLIDAY_FALLBACK[y];
  return (yr && yr[mo]) ? yr[mo].slice() : (yr ? [] : null);
}
/* 지금 바로 쓸 수 있는 값 — 서버에서 받은 게 있으면 그것, 없으면 내장 표 */
function krHolidayDays(ym) {
  var a = String(ym).split('-'), y = +a[0], mo = +a[1];
  var got = KR_HOLIDAY_FETCHED[y];
  if (got) return (got[mo] || []).slice();
  return krFallbackDays(ym);
}
/* 서버에서 그 해 공휴일을 받아온다. 성공하면 onDone(true) — 화면을 다시 그리게 한다.
   실패(인터넷 없음·키 미설정 등)해도 조용히 넘어가고 내장 표를 쓴다. */
function krFetchYear(year, onDone) {
  year = +year;
  if (KR_HOLIDAY_FETCHED[year] || _krFetching[year]) { if (onDone) onDone(false); return; }
  if (!(window.Cloud && Cloud.enabled() && Cloud.holidays)) { if (onDone) onDone(false); return; }
  _krFetching[year] = true;
  Cloud.holidays(year).then(function (res) {
    _krFetching[year] = false;
    if (!res || res.status !== 200 || !res.data || !res.data.months) { if (onDone) onDone(false); return; }
    KR_HOLIDAY_FETCHED[year] = res.data.months;
    try { localStorage.setItem('krHoliday_' + year, JSON.stringify(res.data.months)); } catch (e) { }
    if (onDone) onDone(true);
  }, function () { _krFetching[year] = false; if (onDone) onDone(false); });
}
/* 지난번에 받아둔 값을 먼저 되살린다 (앱을 열자마자 옛 값이라도 쓰게) */
(function () {
  for (var y = 2025; y <= 2035; y++) {
    try {
      var raw = localStorage.getItem('krHoliday_' + y);
      if (raw) KR_HOLIDAY_FETCHED[y] = JSON.parse(raw);
    } catch (e) { }
  }
})();
