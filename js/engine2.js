/* ===== 엄만달 배정 엔진 v2 + 검증기 =====
 * v1(engine.js — 수정 금지 검증본)의 알고리즘 골격(일자별 그리디 + 증강 경로 매칭 +
 * 온도 재시도 + mulberry32 결정 난수)을 계승한 확장판. v1은 그대로 두고 병행한다.
 *
 * v1 대비 확장 (기초자료_2병동_2026-06.md 기반, 적대 검토 반영 2026-07-18):
 *  1. 인원 범위: required.{weekday,holiday}.{D,E,N} = [min,max] (min 하드, max까지 소프트 충원)
 *  2. 공휴일: config.holidays = [일자...] — 주말∪공휴일 = 휴일 취급(isRestDay)
 *  3. 코드 확장: 근무 D/MD/E/E2/N + 비근무 O/V(연차)/CO(대휴)/EDU(교육)
 *     - 패밀리 합산: MD→D계열, E2→E계열 (생성기 slotCnt·검증기 집계 공통 매핑)
 *     - REST={O,V,CO,EDU}: 연속근무 리셋·나이트 후 휴식 충족 (생성기 상태 갱신도 동일 기준)
 *     - 자동 생성은 D/E/N/O만 산출. MD·E2는 선입력·손편집 전용
 *  4. 셀 단위 선입력 preAssigned[pid][day]=code — 불가침(증강 매칭 제외), 상태에는 반영,
 *     전방 검사 3종(N 휴식창·N 연속 / E→D 역행 / 연속 근무 한도)으로 선입력 인접 위반 사전 차단.
 *     행 단위 locked도 흡수. 범위 밖 일자 키는 무시.
 *  5. 개인 성향 staff.pref('D'|'E') — 온도 연동 소프트 가중
 *  6. 나이트 전담 하드 규칙: 그룹에 night 유형이 있으면 N은 night 유형에게만
 *     (config.allowGenericNight=true로 해제 가능) + 전담 짝 N 격차 ≤2 수용 조건
 *  7. 사전 검사 preflight: 불능 입력(선입력 과다·min>가용·유형/전환/희망오프 모순)을
 *     재시도 없이 즉시 사유와 함께 반환
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.UmmandalEngine2 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FAM = { D: 'D', MD: 'D', E: 'E', E2: 'E', N: 'N' };      // 근무 코드 → 패밀리
  var REST = { O: 1, V: 1, CO: 1, EDU: 1 };                     // 휴식 취급 코드
  var WISH_OK = { O: 1, V: 1, CO: 1 };                          // 희망오프 충족 코드(EDU 제외)
  var ALL_CODES = ['D', 'MD', 'E', 'E2', 'N', 'O', 'V', 'CO', 'EDU'];

  function fam(c) { return FAM[c] || null; }
  function isRest(c) { return !!REST[c]; }
  function isWork(c) { return !!FAM[c]; }

  function isWeekend(day, firstWeekday) {
    var wd = (firstWeekday + day - 1) % 7;
    return wd === 0 || wd === 6;
  }

  /* ---------- 설정 정규화 ---------- */
  function toRange(v) {
    if (Array.isArray(v)) return [v[0] | 0, v[1] | 0];
    return [v | 0, v | 0];
  }
  function normalizeConfig(staff, config) {
    var cfg = {};
    cfg.days = config.days;
    cfg.firstWeekday = config.firstWeekday;
    cfg.maxConsecWork = config.maxConsecWork;
    cfg.maxConsecN = config.maxConsecN;
    cfg.offAfterNights = config.offAfterNights || 0;
    cfg.forbidBackward = !!config.forbidBackward;
    cfg.maxAttempts = config.maxAttempts || 1500;
    cfg.history = config.history || {};
    cfg.allowGenericNight = !!config.allowGenericNight;

    // 희망오프: 범위 밖 일자는 무시(유령 위반 방지). wishSet은 생성기·사전검사 공용
    cfg.wishOffs = {};
    cfg.wishSet = {};
    var srcWish = config.wishOffs || {};
    Object.keys(srcWish).forEach(function (pid) {
      var list = (srcWish[pid] || []).filter(function (d) { return d >= 1 && d <= cfg.days; });
      cfg.wishOffs[pid] = list;
      cfg.wishSet[pid] = {};
      list.forEach(function (d) { cfg.wishSet[pid][d] = true; });
    });

    cfg.holidaySet = {};
    (config.holidays || []).forEach(function (d) { cfg.holidaySet[d] = true; });
    cfg.isRestDay = function (d) { return isWeekend(d, cfg.firstWeekday) || !!cfg.holidaySet[d]; };

    var restDays = 0;
    for (var d = 1; d <= cfg.days; d++) if (cfg.isRestDay(d)) restDays++;
    cfg.restDayCount = restDays;                                  // 주말∪공휴일 (합집합)
    cfg.targetOff = config.targetOff != null ? config.targetOff : restDays; // O 전용 예산(V·CO·EDU 제외)

    var req = config.required || {};
    var wd = req.weekday || {};
    var hd = req.holiday || req.weekend || {};                    // 하위호환: weekend → holiday
    cfg.required = {
      weekday: { D: toRange(wd.D || 0), E: toRange(wd.E || 0), N: toRange(wd.N || 0) },
      holiday: { D: toRange(hd.D || 0), E: toRange(hd.E || 0), N: toRange(hd.N || 0) }
    };

    // 선입력: preAssigned + 행 단위 locked 흡수 (locked 배열의 빈 값은 'O')
    // 범위 밖 일자는 버림 — O 예산 회계(preNonORemain·capOf)를 영구 왜곡하기 때문
    cfg.pre = {};
    var srcPre = config.preAssigned || {};
    Object.keys(srcPre).forEach(function (pid) {
      cfg.pre[pid] = {};
      Object.keys(srcPre[pid]).forEach(function (ds) {
        var dn = ds | 0;
        if (dn >= 1 && dn <= cfg.days) cfg.pre[pid][dn] = srcPre[pid][ds];
      });
    });
    var locked = config.locked || {};
    Object.keys(locked).forEach(function (pid) {
      cfg.pre[pid] = cfg.pre[pid] || {};
      for (var d = 1; d <= cfg.days; d++) {
        if (cfg.pre[pid][d] === undefined) cfg.pre[pid][d] = locked[pid][d - 1] || 'O';
      }
    });

    cfg.nightStaffIds = {};
    cfg.hasNightStaff = false;
    staff.forEach(function (p) {
      if (p.type === 'night') { cfg.nightStaffIds[p.id] = true; cfg.hasNightStaff = true; }
    });
    cfg.restrictNToNight = cfg.hasNightStaff && !cfg.allowGenericNight;
    return cfg;
  }

  function typeAllows(type, code) {
    if (isRest(code)) return true;
    var f = fam(code);
    if (type === 'night') return f === 'N';
    if (type === 'day') return f === 'D';
    /* 2교대 — 데이·이브닝만 돈다(나이트 없음). MD·E2 같은 변형 근무는 각 계열에 속하므로 허용된다 */
    if (type === 'two') return f === 'D' || f === 'E';
    return true;
  }

  /* ---------- 월 단위 여력 계산 (preflight 소프트 검사 ↔ tryOnce 예산 풀 공유) ----------
   * 분류(누가 나이트/주간 풀인가)·집계(풀별 여력 합)까지 poolCapacities 한 곳에서 산출해
   * 두 소비처가 반드시 같은 수치를 쓰게 한다(드리프트 방지 — [[기능-preflight개선]] 리스크 #3).
   *  - monthMinDemand: 한 달 최소 근무 슬롯 합(N 계열 / D·E 계열 분리)
   *  - capOfPerson: 한 사람이 휴무 목표(targetOff)를 지키며 설 수 있는 최대 근무일.
   *    선입력된 비-O 휴식(V·CO·EDU)은 그만큼 근무 여력이 줄므로 제외(O는 목표에 기여하므로 안 뺌).
   *    ※ 한계(의도된 하한): 유형별 실근무 가능일(상근=평일만·2교대=N불가·잠금행)을 세밀히 빼지
   *      않아 Σ여력을 과대추정할 수 있다 → 소프트 경고는 "뜨면 확실, 안 떠도 안심 못 함"인
   *      하한 신호. 과대추정은 경고를 '덜' 띄우는 방향이라 false positive는 없다.
   *  - poolCapacities: 전담제면 {N,DE} 풀 분리, 아니면 {all} 통합. preflight·tryOnce 공용. */
  function monthMinDemand(cfg) {
    var mdN = 0, mdDE = 0;
    for (var d = 1; d <= cfg.days; d++) {
      var nd = cfg.isRestDay(d) ? cfg.required.holiday : cfg.required.weekday;
      mdN += nd.N[0];
      mdDE += nd.D[0] + nd.E[0];
    }
    return { N: mdN, DE: mdDE };
  }
  function capOfPerson(p, cfg) {
    var preRestNonO = 0;
    var row = cfg.pre[p.id] || {};
    Object.keys(row).forEach(function (ds) { if (isRest(row[ds]) && row[ds] !== 'O') preRestNonO++; });
    return Math.max(0, cfg.days - cfg.targetOff - preRestNonO);
  }
  function poolCapacities(staff, cfg) {
    var md = monthMinDemand(cfg);
    if (cfg.restrictNToNight) {
      var capN = 0, capDE = 0;
      staff.forEach(function (p) {
        if (p.type === 'night') capN += capOfPerson(p, cfg); else capDE += capOfPerson(p, cfg);
      });
      return { restrict: true, md: md, capN: capN, capDE: capDE };
    }
    var capAll = 0;
    staff.forEach(function (p) { capAll += capOfPerson(p, cfg); });
    return { restrict: false, md: md, capAll: capAll };
  }

  /* ---------- 사전 검사 (불능 입력 조기 검출) ----------
   * 선입력·희망오프·이력은 시도 간 불변이라, 여기 걸리는 모순은 재시도로 절대 해소되지 않는다.
   * 따라서 검출 즉시 사유를 반환해 maxAttempts 낭비와 "원인 없는 실패"를 막는다. */
  function preflight(staff, config) {
    var cfg = normalizeConfig(staff, config);
    var issues = [];
    var k = cfg.offAfterNights;

    // 0) 규칙 자체 오류: min > max
    ['weekday', 'holiday'].forEach(function (kind) {
      ['D', 'E', 'N'].forEach(function (f) {
        var r = cfg.required[kind][f];
        if (r[0] > r[1])
          issues.push({ day: null, pid: null, rule: '사전검사', msg: (kind === 'weekday' ? '평일' : '휴일') + ' ' + f + ' — 최소 ' + r[0] + '명이 최대 ' + r[1] + '명보다 큽니다' });
      });
    });

    // p가 d일에 f 계열 근무를 설 수 있는가 (유형·전담제·상근 휴일)
    function capableFam(p, f, d) {
      if (p.type === 'night') return f === 'N';
      if (f === 'N' && cfg.restrictNToNight) return false;
      if (p.type === 'day') return f === 'D' && !cfg.isRestDay(d);
      if (p.type === 'two') return f !== 'N';   // 2교대는 나이트를 서지 않는다
      return true;
    }

    /* 0) 그룹 단위 선검사 — 나이트를 설 수 있는 사람이 아예 없는데 나이트를 요구하는 구성.
       일자별로 돌리면 같은 말이 31번 쌓여 진짜 원인이 묻힌다(2026-07-20 적대 검토 지적). */
    var needN0 = Math.max(cfg.required.weekday.N[0], cfg.required.holiday.N[0]);
    if (needN0 > 0) {
      var anyN = staff.some(function (p) { return typeAllows(p.type, 'N'); });
      if (!anyN) {
        issues.push({
          day: null, pid: null, rule: '사전검사',
          msg: '나이트를 설 수 있는 사람이 없어요 — 등록된 인원이 모두 2교대·평일 상근이에요. ' +
               '「우리 병동 > 근무 규칙」에서 나이트 인원을 0명으로 바꾸거나, 3교대·나이트 전담 인원을 넣어주세요.'
        });
        return issues;   // 이 상태에서는 일자별 검사가 의미 없다
      }
    }

    // 1) 일자별 가용 — 풀 분리(나이트/주간): 휴일의 상근, 전담제의 비전담을 가용으로 세면 안 된다
    for (var d = 1; d <= cfg.days; d++) {
      var need = cfg.isRestDay(d) ? cfg.required.holiday : cfg.required.weekday;
      var famPre = { D: 0, E: 0, N: 0 };
      var availAll = 0, availN = 0, availDE = 0;
      staff.forEach(function (p) {
        var c = cfg.pre[p.id] && cfg.pre[p.id][d];
        /* 선입력 근무 — 슬롯에 계상. 단 그 사람 유형이 설 수 없는 근무면 정원으로 세지 않는다
           (세면 "나이트 가능 인원 부족" 경고가 가려져 수정 왕복이 늘어난다 — 2026-07-20) */
        if (c !== undefined && fam(c)) { if (typeAllows(p.type, c)) famPre[fam(c)]++; return; }
        if ((c !== undefined && isRest(c)) || (cfg.wishSet[p.id] || {})[d]) return; // 선입력 휴무·희망오프 — 강제 휴식
        availAll++;
        if (capableFam(p, 'N', d)) availN++;
        if (capableFam(p, 'D', d) || capableFam(p, 'E', d)) availDE++;
      });
      var minSum = need.D[0] + need.E[0] + need.N[0];
      var preSum = famPre.D + famPre.E + famPre.N;
      if (preSum + availAll < minSum)
        issues.push({ day: d, pid: null, rule: '사전검사', msg: d + '일 — 휴무(선입력·희망오프) 제외 가용 ' + (preSum + availAll) + '명 < 최소 필요 ' + minSum + '명' });
      if (famPre.N + availN < need.N[0])
        issues.push({ day: d, pid: null, rule: '사전검사', msg: d + '일 — 나이트 가능 인원 ' + (famPre.N + availN) + '명 < 최소 ' + need.N[0] + '명' });
      if (famPre.D + famPre.E + availDE < need.D[0] + need.E[0])
        issues.push({ day: d, pid: null, rule: '사전검사', msg: d + '일 — 주간(D·E) 가능 인원 ' + (famPre.D + famPre.E + availDE) + '명 < 최소 ' + (need.D[0] + need.E[0]) + '명' });
      ['D', 'E', 'N'].forEach(function (f) {
        if (famPre[f] > need[f][1])
          issues.push({ day: d, pid: null, rule: '사전검사', msg: d + '일 — ' + f + ' 계열 선입력 ' + famPre[f] + '명 > 최대 ' + need[f][1] + '명' });
      });
    }

    // 2) 인별 선입력 행 검사 — 이력(lastCodes) 말미와 접합해 시작
    staff.forEach(function (p) {
      var row = cfg.pre[p.id] || {};
      var wish = cfg.wishSet[p.id] || {};
      var hl = (cfg.history[p.id] || {}).lastCodes || [];
      var prev = hl.length ? hl[hl.length - 1] : undefined;
      var runPre = 0, nrunPre = 0;
      for (var i = hl.length - 1; i >= 0; i--) { if (isWork(hl[i])) runPre++; else break; }
      for (var i = hl.length - 1; i >= 0; i--) { if (fam(hl[i]) === 'N') nrunPre++; else break; }
      // 이력 나이트 휴식창이 월초로 넘어오는 일수(스필) — 이 구간의 근무 선입력은 모순
      var spill = 0;
      if (k > 0 && hl.length) {
        for (var i = hl.length - 1; i >= Math.max(0, hl.length - k - 1); i--) {
          if (fam(hl[i]) === 'N') {
            if (i < hl.length - 1) spill = Math.max(0, (i + 1 + k) - hl.length);
            break;
          }
        }
      }
      for (var d = 1; d <= cfg.days; d++) {
        var c = row[d];
        if (c === undefined) { prev = undefined; runPre = 0; nrunPre = 0; continue; }
        if (ALL_CODES.indexOf(c) < 0) {
          issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 알 수 없는 코드 ' + c });
          prev = c; continue;
        }
        if (!typeAllows(p.type, c))
          issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 이 사람 유형은 ' + c + ' 선입력 불가' });
        if (p.type === 'day' && isWork(c) && cfg.isRestDay(d))
          issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 상근은 휴일 근무 선입력 불가' });
        if (cfg.restrictNToNight && fam(c) === 'N' && !cfg.nightStaffIds[p.id])
          issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 나이트는 전담 인원만 설 수 있어요 (선입력 충돌)' });
        if (wish[d] && !WISH_OK[c])
          issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 희망 오프일과 ' + c + ' 선입력 충돌' });
        if (d <= spill && isWork(c))
          issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 지난달 말 나이트 후 휴식 기간에 근무 선입력' });
        if (isWork(c)) { runPre++; if (runPre > cfg.maxConsecWork) issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 선입력·이력만으로 연속 근무 ' + runPre + '일 초과' }); }
        else runPre = 0;
        if (fam(c) === 'N') { nrunPre++; if (nrunPre > cfg.maxConsecN) issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 선입력·이력만으로 나이트 ' + nrunPre + '개 연속 초과' }); }
        else nrunPre = 0;
        if (prev !== undefined) {
          if (fam(prev) === 'N' && isWork(c) && fam(c) !== 'N')
            issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 나이트 다음날 ' + c + ' 선입력 불가' });
          if (cfg.forbidBackward && fam(prev) === 'E' && fam(c) === 'D')
            issues.push({ day: d, pid: p.id, rule: '사전검사', msg: p.name + ' ' + d + '일 — 이브닝 다음날 데이 선입력 불가' });
        }
        // 나이트 휴식창: 블록 종료가 선입력으로 확정된 경우(다음 셀이 비N으로 지정),
        // 이후 k일 창 안의 모든 근무 선입력(재진입 N 포함)은 모순.
        // 다음 셀이 미지정이면 엔진이 블록을 이어붙일 수 있으므로 여기서 단정하지 않는다.
        if (k > 0 && fam(c) === 'N') {
          var nxt = row[d + 1];
          if (nxt !== undefined && fam(nxt) !== 'N') {
            for (var j = 1; j <= k && d + j <= cfg.days; j++) {
              var w2 = row[d + j];
              if (w2 !== undefined && isWork(w2)) {
                issues.push({ day: d + j, pid: p.id, rule: '사전검사', msg: p.name + ' ' + (d + j) + '일 — 나이트 후 휴식 기간에 근무 선입력' });
                break;
              }
            }
          }
        }
        prev = c;
      }
    });

    /* 월 단위 여력(off-budget) 소프트 검사 — 하드 위반이 아니라 "인원이 빠듯해 모두가
       휴무 목표(targetOff)만큼 쉬긴 어렵다"는 조기 안내. Σ최소수요 > Σ여력이면 비둘기집
       원리상 누군가는 목표 미달이 확정이라 false positive가 없다. 생성은 막지 않는다(soft:true).
       분류·집계는 poolCapacities로 tryOnce 예산 풀과 공유(동일 수치 보장).
       문구는 어르신 UX: 진단 숫자·'여력' 용어 대신 "빠듯하다 + 해결책"으로 간결하게. */
    var off = '목표(한 달 휴무 약 ' + cfg.targetOff + '일)만큼 쉬기 어려울 수 있어요.';
    var pc = poolCapacities(staff, cfg);
    if (pc.restrict) {
      if (pc.capN < pc.md.N)
        issues.push({ day: null, pid: null, rule: '여력', soft: true, msg: '나이트가 빠듯해요 — 지금 나이트 인원으로는 ' + off + ' 나이트 전담을 늘리거나 나이트 최소 인원을 줄여보세요.' });
      if (pc.capDE < pc.md.DE)
        issues.push({ day: null, pid: null, rule: '여력', soft: true, msg: '주간이 빠듯해요 — 지금 주간(D·E) 인원으로는 ' + off + ' 주간 인원을 늘리거나 주간 최소 인원을 줄여보세요.' });
    } else {
      if (pc.capAll < pc.md.N + pc.md.DE)
        issues.push({ day: null, pid: null, rule: '여력', soft: true, msg: '인원이 빠듯해요 — 지금 인원으로는 모두가 ' + off + ' 최소 인원을 줄이거나 사람을 늘리면 여유로워져요.' });
    }
    return issues;
  }

  /* ---------- 검증기 ---------- */
  function validate(schedule, staff, config) {
    var cfg = normalizeConfig(staff, config);
    var v = [];
    for (var d = 1; d <= cfg.days; d++) {
      var need = cfg.isRestDay(d) ? cfg.required.holiday : cfg.required.weekday;
      var cnt = { D: 0, E: 0, N: 0 };
      staff.forEach(function (p) {
        var f = fam(schedule[p.id][d - 1]);
        if (f) cnt[f]++;
      });
      ['D', 'E', 'N'].forEach(function (f) {
        if (cnt[f] < need[f][0])
          v.push({ day: d, pid: null, rule: '인원', msg: d + '일 ' + f + ' 계열 ' + cnt[f] + '명 (최소 ' + need[f][0] + '명 부족)' });
        if (cnt[f] > need[f][1])
          v.push({ day: d, pid: null, rule: '인원', msg: d + '일 ' + f + ' 계열 ' + cnt[f] + '명 (최대 ' + need[f][1] + '명 초과)' });
      });
    }
    staff.forEach(function (p) {
      var hist = cfg.history[p.id] || {};
      var prevCodes = hist.lastCodes || [];
      var seq = prevCodes.concat(schedule[p.id]);
      var off0 = prevCodes.length;
      for (var i = off0; i < seq.length; i++) {
        var day = i - off0 + 1, c = seq[i];
        if (!typeAllows(p.type, c))
          v.push({ day: day, pid: p.id, rule: '유형', msg: p.name + ' ' + day + '일 — 이 사람은 ' + c + ' 근무를 설 수 없어요' });
        if (p.type === 'day' && cfg.isRestDay(day) && isWork(c))
          v.push({ day: day, pid: p.id, rule: '유형', msg: p.name + ' ' + day + '일 — 상근은 휴일에 쉬어야 해요' });
        if (cfg.restrictNToNight && fam(c) === 'N' && !cfg.nightStaffIds[p.id])
          v.push({ day: day, pid: p.id, rule: '전담', msg: p.name + ' ' + day + '일 — 나이트는 전담 인원만 설 수 있어요' });
      }
      for (var i = 1; i < seq.length; i++) {
        var a = seq[i - 1], b = seq[i];
        var day = i - off0 + 1;
        if (day < 1) continue;
        if (fam(a) === 'N' && isWork(b) && fam(b) !== 'N')
          v.push({ day: day, pid: p.id, rule: '전환', msg: p.name + ' ' + day + '일 — 나이트 다음날 ' + b + ' 근무는 안 돼요' });
        if (cfg.forbidBackward && fam(a) === 'E' && fam(b) === 'D')
          v.push({ day: day, pid: p.id, rule: '전환', msg: p.name + ' ' + day + '일 — 이브닝 다음날 데이는 안 돼요' });
      }
      var run = 0, nrun = 0;
      for (var i = 0; i < seq.length; i++) {
        var c = seq[i], day = i - off0 + 1;
        run = isWork(c) ? run + 1 : 0;
        nrun = fam(c) === 'N' ? nrun + 1 : 0;
        if (day >= 1 && run > cfg.maxConsecWork)
          v.push({ day: day, pid: p.id, rule: '연속', msg: p.name + ' ' + day + '일 — 연속 근무가 ' + run + '일이에요 (최대 ' + cfg.maxConsecWork + '일)' });
        if (day >= 1 && nrun > cfg.maxConsecN)
          v.push({ day: day, pid: p.id, rule: '연속', msg: p.name + ' ' + day + '일 — 나이트가 ' + nrun + '개 연속이에요 (최대 ' + cfg.maxConsecN + '개)' });
      }
      var k = cfg.offAfterNights;
      if (k > 0) {
        for (var i = 1; i < seq.length; i++) {
          if (fam(seq[i - 1]) === 'N' && fam(seq[i]) !== 'N') {
            for (var j = 0; j < k && i + j < seq.length; j++) {
              var day = i + j - off0 + 1;
              if (day < 1) continue;
              if (!isRest(seq[i + j])) {
                v.push({ day: day, pid: p.id, rule: '나이트휴식', msg: p.name + ' ' + day + '일 — 나이트 후 ' + k + '일은 쉬어야 해요' });
                break;
              }
            }
          }
        }
      }
      var wish = (cfg.wishOffs[p.id]) || [];
      wish.forEach(function (d) {
        if (!WISH_OK[schedule[p.id][d - 1]])
          v.push({ day: d, pid: p.id, rule: '희망오프', msg: p.name + ' ' + d + '일 — 희망 오프가 반영되지 않았어요' });
      });
      var row = cfg.pre[p.id];
      if (row) {
        Object.keys(row).forEach(function (ds) {
          var d = ds | 0;
          if (d >= 1 && d <= cfg.days && schedule[p.id][d - 1] !== row[d])
            v.push({ day: d, pid: p.id, rule: '선입력', msg: p.name + ' ' + d + '일 — 미리 정한 ' + row[d] + '가 바뀌었어요' });
        });
      }
    });
    return v;
  }

  /* ---------- 결정 난수 (v1 동일) ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 생성 ---------- */
  function nightGap(schedule, staff, cfg) {
    var counts = [];
    staff.forEach(function (p) {
      if (p.type !== 'night') return;
      var n = 0;
      schedule[p.id].forEach(function (c) { if (fam(c) === 'N') n++; });
      counts.push(n);
    });
    if (counts.length < 2) return 0;
    return Math.max.apply(null, counts) - Math.min.apply(null, counts);
  }

  function generate(staff, config, seed) {
    var cfg = normalizeConfig(staff, config);
    var issues = preflight(staff, config);
    var hardIssues = issues.filter(function (i) { return !i.soft; });
    var warnings = issues.filter(function (i) { return i.soft; });   // 소프트는 violations에 안 섞고 warnings로만(안전 불변식)
    if (hardIssues.length) return { schedule: null, attempts: 0, violations: hardIssues, warnings: warnings, infeasible: true };
    var best = null;
    for (var att = 0; att < cfg.maxAttempts; att++) {
      var rnd = mulberry32((seed || 1) * 7919 + att * 104729);
      var temp = 8 + Math.floor(att / 10) * 30;
      var res = tryOnce(staff, cfg, rnd, temp);
      if (res) {
        var viol = validate(res, staff, config);
        var gap = nightGap(res, staff, cfg);
        if (viol.length === 0 && gap <= 2)
          return { schedule: res, attempts: att + 1, violations: [], warnings: warnings };
        var key = viol.length * 100 + gap;
        if (!best || key < best.key) best = { schedule: res, attempts: att + 1, violations: viol, key: key };
      }
    }
    if (best) { delete best.key; best.warnings = warnings; return best; }
    // 시도 전부 실패 — null 대신 사유를 담아 반환 (사용자에게 원인 없는 실패를 주지 않는다)
    return {
      schedule: null, attempts: cfg.maxAttempts, infeasible: false, exhausted: true,
      violations: [{ day: null, pid: null, rule: '생성실패', msg: cfg.maxAttempts + '회 시도에도 조건을 만족하는 조합을 찾지 못했어요 — 인원 수와 최소 인원·연속 한도 규칙을 확인해 주세요' }],
      warnings: warnings
    };
  }

  function attempt(staff, config, seed, att) {
    var cfg = normalizeConfig(staff, config);
    var issues = preflight(staff, config);
    var hardIssues = issues.filter(function (i) { return !i.soft; });
    var warnings = issues.filter(function (i) { return i.soft; });   // 소프트는 violations에 안 섞고 warnings로만(안전 불변식)
    if (hardIssues.length) return { schedule: null, violations: hardIssues, warnings: warnings, infeasible: true };
    var rnd = mulberry32((seed || 1) * 7919 + att * 104729);
    var temp = 8 + Math.floor(att / 10) * 30;
    var res = tryOnce(staff, cfg, rnd, temp);
    if (!res) return null;
    // nightGap: 전담 짝 N 격차 — generate의 수용 조건(≤2)과 같은 기준을 배치 루프(앱)도 쓰도록 노출
    return { schedule: res, violations: validate(res, staff, config), nightGap: nightGap(res, staff, cfg), warnings: warnings };
  }

  function tryOnce(staff, cfg, rnd, temp) {
    var days = cfg.days;
    var sched = {}; staff.forEach(function (p) { sched[p.id] = []; });
    var state = {};
    staff.forEach(function (p) {
      var hist = cfg.history[p.id] || {};
      var last = hist.lastCodes || [];
      var run = 0, nrun = 0;
      for (var i = last.length - 1; i >= 0; i--) { if (isWork(last[i])) run++; else break; }
      for (var i = last.length - 1; i >= 0; i--) { if (fam(last[i]) === 'N') nrun++; else break; }
      // 이력 나이트 휴식창의 월초 스필 — 말미가 'N 직후 근무'(규칙 위반 이력)여도
      // 남은 창만큼은 쉬게 해 검증기(월 경계 창 검사)와 일치시킨다
      var pendingOff = 0;
      var k = cfg.offAfterNights;
      if (k > 0 && last.length) {
        for (var i = last.length - 1; i >= Math.max(0, last.length - k - 1); i--) {
          if (fam(last[i]) === 'N') {
            if (i < last.length - 1) pendingOff = Math.max(0, (i + 1 + k) - last.length);
            break;
          }
        }
      }
      var cnt = {};
      ALL_CODES.forEach(function (c) { cnt[c] = 0; });
      // 개인 O 예산 계산용: 남은 기간의 선입력 셀 수(O 제외 — O 선입력은 예산 충족에 기여)
      var preNonO = 0;
      var row = cfg.pre[p.id] || {};
      Object.keys(row).forEach(function (ds) { if (row[ds] !== 'O') preNonO++; });
      state[p.id] = {
        run: run, nrun: nrun, pendingOff: pendingOff,
        cnt: cnt, famCnt: { D: 0, E: 0, N: 0 },
        histN: hist.n || 0, histWk: hist.weekend || 0, wkWork: 0,
        prevFam: last.length ? fam(last[last.length - 1]) : null,
        preNonORemain: preNonO
      };
    });
    var wishSet = {};
    staff.forEach(function (p) { wishSet[p.id] = cfg.wishSet[p.id] || {}; });

    /* 소프트 충원 예산 풀 — 분류·집계는 poolCapacities로 preflight 소프트 검사와 공유(동일 수치).
       - 전담제(restrict=true): N 슬롯은 전담자만 서므로 N/DE 풀을 나눠 각각의 여력을 따로 관리한다.
         전담의 남는 capacity가 D/E 예산으로 새면 주간이 과충원되어 O 하한(≈targetOff)이 무너지기 때문.
       - 전담 없음: 누구나 D/E/N을 설 수 있으므로 풀을 나누면 안 된다. 나누면 capN=0이라 N 예산이 0에 갇혀,
         규칙에서 N을 [2,3]으로 잡아도 최소치(2)를 절대 못 넘고 남는 여력이 전부 D/E로 흘러 주간만
         과충원된다(2026-07-20 적대 검토 확정). 하나의 풀로 합쳐 총 여력을 공유한다. */
    var pc = poolCapacities(staff, cfg);
    var budgetPool, usedPool, poolOf;
    if (pc.restrict) {
      budgetPool = { N: Math.max(0, pc.capN - pc.md.N), DE: Math.max(0, pc.capDE - pc.md.DE) };
      usedPool = { N: 0, DE: 0 };
      poolOf = function (code) { return code === 'N' ? 'N' : 'DE'; };
    } else {
      budgetPool = { all: Math.max(0, pc.capAll - (pc.md.N + pc.md.DE)) };
      usedPool = { all: 0 };
      poolOf = function () { return 'all'; };
    }

    function preAt(pid, d) {
      var row = cfg.pre[pid];
      return row ? row[d] : undefined;
    }
    // 이 사람이 오늘 근무를 더 서도 남은 날로 O 예산(targetOff)을 채울 수 있는가
    function budgetOk(pid, d) {
      var st = state[pid];
      var oNeed = cfg.targetOff - st.cnt.O;
      if (oNeed <= 0) return true;
      var futureFree = (days - d) - st.preNonORemain;
      return futureFree >= oNeed;
    }
    function canAssign(p, code, d) {
      if (!typeAllows(p.type, code)) return false;
      if (code === 'N' && cfg.restrictNToNight && !cfg.nightStaffIds[p.id]) return false;
      var st = state[p.id];
      if (st.prevFam === 'N' && code !== 'N') return false;
      if (cfg.forbidBackward && st.prevFam === 'E' && code === 'D') return false;
      if (code === 'N' && st.nrun >= cfg.maxConsecN) return false;
      if (st.run >= cfg.maxConsecWork) return false;
      if (p.type === 'day' && cfg.isRestDay(d)) return false;
      // 전방 검사 1: 오늘 N이면 나이트 후 휴식 구간(내일~k일)에 비N 근무 선입력이 있으면 불가,
      //             이어지는 선입력 N 블록과 합쳐 나이트 연속 한도를 넘어도 불가
      if (code === 'N') {
        var k = Math.max(1, cfg.offAfterNights);
        for (var j = 1; j <= k && d + j <= days; j++) {
          var nx = preAt(p.id, d + j);
          if (nx !== undefined && isWork(nx) && fam(nx) !== 'N') return false;
        }
        var futureN = 0;
        for (var j = 1; d + j <= days; j++) {
          var nxN = preAt(p.id, d + j);
          if (nxN !== undefined && fam(nxN) === 'N') futureN++;
          else break;
        }
        if (st.nrun + 1 + futureN > cfg.maxConsecN) return false;
      }
      // 전방 검사 2: 오늘 E계열이면 내일 D계열 선입력과 역행(E→D) 충돌 불가
      if (cfg.forbidBackward && fam(code) === 'E' && fam(preAt(p.id, d + 1)) === 'D') return false;
      // 전방 검사 3: 오늘 근무 + 이후 연속 선입력 근무 블록이 연속 한도를 넘으면 불가
      var futureRun = 0;
      for (var j = 1; d + j <= days; j++) {
        var nx2 = preAt(p.id, d + j);
        if (nx2 !== undefined && isWork(nx2)) futureRun++;
        else break;
      }
      if (st.run + 1 + futureRun > cfg.maxConsecWork) return false;
      return true;
    }
    function score(p, code, restD, st, dNow) {
      var s = 0;
      if (code === 'N') {
        if (p.type === 'night') s -= 100;
        if (st.prevFam === 'N') s -= 200;
        else s += (st.famCnt.N + st.histN * 0.5) * 70;
      } else {
        if (p.type === 'day' && code === 'D') s -= 100;
        s += st.famCnt[code] * 4;
        if (p.pref) {
          // 작게 유지 — 크면 "선호 코드로 일하기"가 아니라 "매일 우선 징발"이 되어 과로한다.
          // 작업량 균형은 아래 cnt.O 항(×12)이 담당하고, 선호는 코드 선택만 기울인다.
          var w = 15 + temp * 0.15;
          if (p.pref === code) s -= w; else s += w;
        }
      }
      if (restD) s += (st.wkWork + st.histWk * 0.5) * 6;
      s += st.run * st.run * 3;
      s -= st.cnt.O * 12;   // 작업량(휴무 수) 균형 — 범위 충원에서는 이 항이 배분을 주도해야 한다
      // 휴무 예산 압력: 남은 날로 O 목표(targetOff)를 채우기 빠듯한 사람은 근무 후보에서 뒤로
      var oNeed = cfg.targetOff - st.cnt.O;
      if (oNeed > 0) {
        var slack = (days - dNow) - st.preNonORemain - oNeed;
        if (slack < 4) s += (4 - slack) * 45;
      }
      s += rnd() * (temp || 8);
      return s;
    }

    for (var d = 1; d <= days; d++) {
      var restD = cfg.isRestDay(d);
      var need = restD ? cfg.required.holiday : cfg.required.weekday;
      var assigned = {};
      var slotCnt = { N: 0, D: 0, E: 0 };
      // 1) 선입력 셀 seed (불가침 — cand 생성 전에 확정, 패밀리 매핑으로 집계)
      staff.forEach(function (p) {
        var c = preAt(p.id, d);
        if (c !== undefined) {
          assigned[p.id] = c;
          var f = fam(c);
          if (f) slotCnt[f]++;
        }
      });
      // 2) 강제 휴무 (이미 배정된 사람은 건너뜀 — 선입력 덮어쓰기 금지)
      staff.forEach(function (p) {
        if (p.id in assigned) return;
        var st = state[p.id];
        if (wishSet[p.id][d]) { assigned[p.id] = 'O'; return; }
        if (st.pendingOff > 0) { assigned[p.id] = 'O'; return; }
        if (p.type === 'day' && restD) { assigned[p.id] = 'O'; return; }
        if (st.prevFam === 'N' && st.nrun >= cfg.maxConsecN) { assigned[p.id] = 'O'; }
      });
      // 3) 후보 목록 (N은 전담 우선: 전담자끼리는 famCnt.N 오름차순 하드 정렬)
      var codesArr = ['N', 'D', 'E'];
      var cand = {};
      codesArr.forEach(function (code) {
        var list = staff.filter(function (p) { return !(p.id in assigned) && canAssign(p, code, d); });
        // 점수는 정렬 전에 1회 계산해 캐시 — 비교자 안에서 rnd를 소비하면 정렬 구현(브라우저별)에
        // 따라 난수 소비 순서가 달라져 같은 seed의 교차 재현이 깨지고, 비교자 일관성도 무너진다.
        var sc = {}, tierOf = {};
        list.forEach(function (p) {
          sc[p.id] = score(p, code, restD, state[p.id], d);
          // 휴무 예산 티어: 더 일하면 O 목표를 못 채우는 사람은 대안이 있는 한 뒤로 (전원 빠듯하면 무효과)
          tierOf[p.id] = budgetOk(p.id, d) ? 0 : 1;
        });
        if (code === 'N') {
          // 전담 우선 + 예산 티어 + 점수(블록 지속·형평·온도). 짝 격차는 generate의 수용 조건(≤2)이 관리
          // — famCnt 하드 정렬은 결정적 교대 리듬을 만들어 선입력(V)과의 충돌을 재시도로 못 피하게 하므로 금지.
          list.sort(function (a, b) {
            var an = a.type === 'night' ? 0 : 1, bn = b.type === 'night' ? 0 : 1;
            if (an !== bn) return an - bn;
            var t2 = tierOf[a.id] - tierOf[b.id];
            if (t2 !== 0) return t2;
            return sc[a.id] - sc[b.id];
          });
        } else {
          list.sort(function (a, b) {
            var t2 = tierOf[a.id] - tierOf[b.id];
            if (t2 !== 0) return t2;
            return sc[a.id] - sc[b.id];
          });
        }
        cand[code] = list;
      });
      // 4) 최소 인원 충원 (v1 방식: 여유 적은 코드부터 + 증강 경로)
      codesArr.sort(function (a, b) {
        return (cand[a].length - (need[a][0] - slotCnt[a])) - (cand[b].length - (need[b][0] - slotCnt[b]));
      });
      codesArr.forEach(function (code) {
        for (var i = 0; i < cand[code].length && slotCnt[code] < need[code][0]; i++) {
          var p = cand[code][i];
          if (!(p.id in assigned)) { assigned[p.id] = code; slotCnt[code]++; }
        }
      });
      function augment(code, visited) {
        var list = cand[code];
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          if (visited[p.id]) continue;
          visited[p.id] = true;
          if (!(p.id in assigned)) { assigned[p.id] = code; slotCnt[code]++; return true; }
          var cur = assigned[p.id];
          if (preAt(p.id, d) !== undefined) continue;            // 선입력 불가침
          if (!(cur === 'N' || cur === 'D' || cur === 'E')) continue; // 강제 O 등은 재배치 불가
          delete assigned[p.id]; slotCnt[cur]--;
          if (augment(cur, visited)) { assigned[p.id] = code; slotCnt[code]++; return true; }
          assigned[p.id] = cur; slotCnt[cur]++;
        }
        return false;
      }
      var dayOk = true;
      for (var ci = 0; ci < codesArr.length && dayOk; ci++) {
        var code = codesArr[ci];
        while (slotCnt[code] < need[code][0]) {
          if (!augment(code, {})) { dayOk = false; break; }
        }
      }
      if (!dayOk) return null;
      // 5) 소프트 충원 (min→max): 충원율 낮은 코드부터, 개인 O 예산·풀별 전역 예산·페이스 준수
      var guard = 0;
      while (guard++ < 64) {
        var order = ['D', 'E', 'N'].filter(function (c) {
          if (slotCnt[c] >= need[c][1]) return false;
          var pl = poolOf(c);
          var paceCap = Math.ceil(budgetPool[pl] * d / days);
          return usedPool[pl] < budgetPool[pl] && usedPool[pl] < paceCap;
        });
        if (!order.length) break;
        order.sort(function (a, b) {
          var ra = (slotCnt[a] - need[a][0]) / Math.max(1, need[a][1] - need[a][0]);
          var rb = (slotCnt[b] - need[b][0]) / Math.max(1, need[b][1] - need[b][0]);
          if (ra !== rb) return ra - rb;
          return slotCnt[a] - slotCnt[b];
        });
        var added = false;
        for (var oi = 0; oi < order.length && !added; oi++) {
          var code2 = order[oi];
          for (var i = 0; i < cand[code2].length; i++) {
            var p2 = cand[code2][i];
            if (p2.id in assigned) continue;
            if (!budgetOk(p2.id, d)) continue;
            assigned[p2.id] = code2; slotCnt[code2]++; usedPool[poolOf(code2)]++; added = true; break;
          }
        }
        if (!added) break;
      }
      // 6) 나머지는 O + 상태 갱신 (선입력 포함 전원, REST/패밀리 기준)
      staff.forEach(function (p) {
        if (!(p.id in assigned)) assigned[p.id] = 'O';
        var c = assigned[p.id];
        var st = state[p.id];
        var f = fam(c);
        if (st.pendingOff > 0 && isRest(c)) st.pendingOff--;
        if (st.prevFam === 'N' && f !== 'N') st.pendingOff = Math.max(st.pendingOff, cfg.offAfterNights - 1);
        st.prevFam = f;
        st.run = isWork(c) ? st.run + 1 : 0;
        st.nrun = f === 'N' ? st.nrun + 1 : 0;
        st.cnt[c] = (st.cnt[c] || 0) + 1;
        if (f) st.famCnt[f]++;
        if (restD && isWork(c)) st.wkWork++;
        if (preAt(p.id, d) !== undefined && c !== 'O') st.preNonORemain--;
        sched[p.id].push(c);
      });
    }
    return sched;
  }

  /* ---------- 리포트 ---------- */
  function report(schedule, staff, config) {
    var cfg = normalizeConfig(staff, config);
    return staff.map(function (p) {
      var hist = cfg.history[p.id] || {};
      var cnt = {};
      ALL_CODES.forEach(function (c) { cnt[c] = 0; });
      var famCnt = { D: 0, E: 0, N: 0 }, restWork = 0;
      schedule[p.id].forEach(function (c, i) {
        cnt[c] = (cnt[c] || 0) + 1;
        var f = fam(c);
        if (f) famCnt[f]++;
        if (cfg.isRestDay(i + 1) && isWork(c)) restWork++;
      });
      return {
        id: p.id, name: p.name, type: p.type,
        D: famCnt.D, E: famCnt.E, N: famCnt.N, O: cnt.O,
        V: cnt.V, CO: cnt.CO, EDU: cnt.EDU,
        MD: cnt.MD, E2: cnt.E2,
        weekend: restWork, totalN: famCnt.N + (hist.n || 0), totalWeekend: restWork + (hist.weekend || 0)
      };
    });
  }

  return {
    generate: generate, attempt: attempt, validate: validate, report: report,
    preflight: preflight, isWeekend: isWeekend, fam: fam, isRest: isRest,
    normalizeConfig: normalizeConfig
  };
});
