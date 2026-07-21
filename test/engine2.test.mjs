/* 엄만달 엔진 v2 자동 테스트 — 실행: node webapp/test/engine2.test.mjs
 * 주의: 저장소에 package.json "type":"module"을 추가하지 말 것 (UMD 로드 방식이 깨짐).
 * UMD는 named import가 안 되므로 createRequire로 로드한다. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E2 = require('../js/engine2.js');
const E1 = require('../js/engine.js');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; famPush(label); }
}
function famPush(label) { failures.push(label); console.error('  ✗ ' + label); }
function section(t) { console.log('— ' + t); }

/* 결정 난수 (테스트 데이터용) */
function rng(seed) {
  let a = seed | 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mkStaff(nThree, nNight, nDay, opts = {}) {
  const s = [];
  for (let i = 0; i < nThree; i++) s.push({ id: 't' + i, name: '삼교대' + i, type: 'three', pref: (opts.prefs || {})['t' + i] || null });
  for (let i = 0; i < nNight; i++) s.push({ id: 'n' + i, name: '전담' + i, type: 'night' });
  for (let i = 0; i < nDay; i++) s.push({ id: 'd' + i, name: '상근' + i, type: 'day' });
  return s;
}
function famCount(row, f) { return row.filter(c => E2.fam(c) === f).length; }
function codeCount(row, code) { return row.filter(c => c === code).length; }

const BASE_RULES = { maxConsecWork: 5, maxConsecN: 3, offAfterNights: 2, forbidBackward: true };

/* ========== T1. 결정성 ========== */
section('T1 결정성 (같은 seed → 동일 결과)');
{
  const staff = mkStaff(8, 2, 0);
  const cfg = {
    days: 30, firstWeekday: 1, holidays: [3, 6], ...BASE_RULES, maxAttempts: 800,
    required: { weekday: { D: [3, 3], E: [2, 3], N: [1, 1] }, holiday: { D: [2, 2], E: [2, 2], N: [1, 1] } },
  };
  const a = E2.generate(staff, cfg, 42);
  const b = E2.generate(staff, cfg, 42);
  ok(a && b && JSON.stringify(a.schedule) === JSON.stringify(b.schedule), 'T1 같은 seed 동일 스케줄');
  ok(a && a.violations.length === 0, 'T1 위반 0');
}

/* ========== T2. 회귀 30 시나리오 (신규 명명 — v1 원본 테스트는 저장소에 없음) ========== */
section('T2 회귀 30 시나리오 (12명, 28/30/31일 × 요일 × 희망오프 × 이력)');
{
  let allZero = true;
  for (let sc = 0; sc < 30; sc++) {
    const r = rng(1000 + sc);
    const days = [28, 30, 31][sc % 3];
    const firstWeekday = sc % 7;
    const staff = mkStaff(8, 2, 2);
    const wishOffs = {};
    staff.forEach(p => {
      if (p.type === 'night') return; // 전담 짝 동시 희망오프로 N 공백 나는 케이스는 앱에서 방지할 영역
      if (r() < 0.6) {
        const d1 = 1 + Math.floor(r() * days);
        wishOffs[p.id] = [d1];
      }
    });
    const history = sc % 2 === 0 ? {
      t0: { lastCodes: ['E', 'E', 'O'], n: 0, weekend: 4 },
      n0: { lastCodes: ['N', 'N', 'O', 'O'], n: 15, weekend: 8 },
    } : {};
    const cfg = {
      days, firstWeekday, holidays: [], ...BASE_RULES, maxAttempts: 500,
      required: { weekday: { D: [3, 3], E: [2, 2], N: [1, 1] }, holiday: { D: [2, 2], E: [2, 2], N: [1, 1] } },
      wishOffs, history,
    };
    const res = E2.generate(staff, cfg, 77 + sc);
    if (!res || res.violations.length !== 0) {
      allZero = false;
      famPush(`T2 시나리오 ${sc} (days=${days}, fw=${firstWeekday}) 위반 ${res ? res.violations.length : 'null'}` +
        (res && res.violations.length ? ' 예: ' + res.violations[0].msg : ''));
    }
  }
  ok(allZero, 'T2 30 시나리오 전건 위반 0');
}

/* ========== T3. v1 차분 테스트 (같은 입력에서 둘 다 위반 0) ========== */
section('T3 v1/v2 차분 (exact 인원·공휴일 없음·행 잠금)');
{
  let bothOk = true;
  for (let sc = 0; sc < 5; sc++) {
    const days = [28, 30, 31][sc % 3];
    const firstWeekday = (sc * 2) % 7;
    const staff = mkStaff(8, 2, 2).map(p => ({ id: p.id, name: p.name, type: p.type }));
    const v1cfg = {
      days, firstWeekday, ...BASE_RULES, maxAttempts: 500,
      required: { weekday: { D: 3, E: 2, N: 1 }, weekend: { D: 2, E: 2, N: 1 } },
    };
    const v2cfg = {
      days, firstWeekday, holidays: [], ...BASE_RULES, maxAttempts: 500,
      required: { weekday: { D: [3, 3], E: [2, 2], N: [1, 1] }, holiday: { D: [2, 2], E: [2, 2], N: [1, 1] } },
    };
    const r1 = E1.generate(staff, v1cfg, 5 + sc);
    const r2 = E2.generate(staff, v2cfg, 5 + sc);
    if (!r1 || r1.violations.length !== 0) { bothOk = false; famPush(`T3 시나리오 ${sc} v1 실패`); }
    if (!r2 || r2.violations.length !== 0) { bothOk = false; famPush(`T3 시나리오 ${sc} v2 실패`); }
  }
  ok(bothOk, 'T3 5 시나리오 v1·v2 동시 위반 0');
}

/* ========== T4. 6월 실표 재현 — RN ========== */
section('T4 6월 재현 RN (10명, 공휴일 6/3·6/6, 연차 선입력, 시드 5종)');
{
  const staff = mkStaff(8, 2, 0, { prefs: { t0: 'D', t2: 'E' } });
  // 연차(V) 2개/인 — 전담0은 월말(29·30) 배치로 예산 경계 케이스 포함
  const pre = {};
  const vdays = {
    t0: [5, 19], t1: [9, 23], t2: [12, 26], t3: [2, 16],
    t4: [10, 24], t5: [4, 18], t6: [11, 25], t7: [17, 30],
    n0: [29, 30], n1: [8, 22],
  };
  Object.keys(vdays).forEach(pid => { pre[pid] = {}; vdays[pid].forEach(d => { pre[pid][d] = 'V'; }); });
  const cfg = {
    days: 30, firstWeekday: 1, holidays: [3, 6], ...BASE_RULES, maxAttempts: 800,
    required: { weekday: { D: [3, 3], E: [2, 3], N: [1, 1] }, holiday: { D: [2, 2], E: [2, 2], N: [1, 1] } },
    preAssigned: pre,
  };
  // 정규화 검증: 휴일 수 = |주말 ∪ 공휴일| = 9 (6/6 토 겹침 이중계산 금지)
  const norm = E2.normalizeConfig(staff, cfg);
  ok(norm.restDayCount === 9, `T4 휴일 합집합 9 (실제 ${norm.restDayCount})`);
  ok(norm.targetOff === 9, 'T4 targetOff 기본값 9');

  let allOk = true;
  const seeds = [1, 2, 3, 4, 5];
  for (const seed of seeds) {
    const res = E2.generate(staff, cfg, seed);
    if (!res || res.violations.length !== 0) {
      allOk = false; famPush(`T4 seed=${seed} 위반 ${res ? res.violations.length : 'null'}` +
        (res && res.violations.length ? ' 예: ' + res.violations[0].msg : ''));
      continue;
    }
    const s = res.schedule;
    const n0 = famCount(s.n0, 'N'), n1 = famCount(s.n1, 'N');
    if (!(n0 >= 14 && n0 <= 16 && n1 >= 14 && n1 <= 16 && Math.abs(n0 - n1) <= 2)) {
      allOk = false; famPush(`T4 seed=${seed} 전담 N ${n0}/${n1} — 15±1·격차≤2 위배`);
    }
    let genericN = 0;
    for (let i = 0; i < 8; i++) genericN += famCount(s['t' + i], 'N');
    if (genericN !== 0) { allOk = false; famPush(`T4 seed=${seed} 비전담 N ${genericN} ≠ 0`); }
    // 선입력 보존
    let preserved = true;
    Object.keys(vdays).forEach(pid => vdays[pid].forEach(d => { if (s[pid][d - 1] !== 'V') preserved = false; }));
    if (!preserved) { allOk = false; famPush(`T4 seed=${seed} 연차 선입력 소실`); }
    // OFF 밴드 (이봉 분포): 주간 8~12, 전담 11~14
    for (let i = 0; i < 8; i++) {
      const o = codeCount(s['t' + i], 'O');
      if (o < 8 || o > 12) { allOk = false; famPush(`T4 seed=${seed} 주간 t${i} O=${o} 밴드(8~12) 이탈`); }
    }
    for (const pid of ['n0', 'n1']) {
      const o = codeCount(s[pid], 'O');
      if (o < 11 || o > 14) { allOk = false; famPush(`T4 seed=${seed} 전담 ${pid} O=${o} 밴드(11~14) 이탈`); }
    }
    // 소프트 충원 시간 분산: E=3인 평일 수가 전·후반에 극단 쏠림 금지
    let e3First = 0, e3Second = 0;
    for (let d = 1; d <= 30; d++) {
      if (norm.isRestDay(d)) continue;
      let e = 0; staff.forEach(p => { if (E2.fam(s[p.id][d - 1]) === 'E') e++; });
      if (e === 3) { if (d <= 15) e3First++; else e3Second++; }
    }
    if (e3First + e3Second > 0 && Math.abs(e3First - e3Second) > 5) {
      allOk = false; famPush(`T4 seed=${seed} E3 평일 분산 전반 ${e3First}/후반 ${e3Second}`);
    }
  }
  ok(allOk, 'T4 RN 시드 5종 전건 통과');
  // pref 반영 (seed 1): t0(pref D)는 D 우세, t2(pref E)는 E 우세
  const res1 = E2.generate(staff, cfg, 1);
  if (res1 && res1.violations.length === 0) {
    const s = res1.schedule;
    ok(famCount(s.t0, 'D') >= famCount(s.t0, 'E'), `T4 pref D 우세 (D=${famCount(s.t0, 'D')} E=${famCount(s.t0, 'E')})`);
    ok(famCount(s.t2, 'E') >= famCount(s.t2, 'D'), `T4 pref E 우세 (E=${famCount(s.t2, 'E')} D=${famCount(s.t2, 'D')})`);
  } else ok(false, 'T4 pref 검증용 생성 실패');
}

/* ========== T5. 6월 실표 재현 — NA ========== */
section('T5 6월 재현 NA (4명, E 기아 방지)');
{
  const staff = mkStaff(2, 2, 0, { prefs: { t0: 'D' } });
  const pre = {
    t0: { 5: 'V', 20: 'V', 12: 'CO' },     // 주간A형: 연차2+대휴1
    t1: { 9: 'V', 21: 'EDU' },             // 주간B형: 연차1+교육1
    n0: { 15: 'V', 28: 'V' },
    n1: { 3: 'V', 17: 'V' },
  };
  const cfg = {
    days: 30, firstWeekday: 1, holidays: [3, 6], ...BASE_RULES, maxAttempts: 800,
    required: { weekday: { D: [1, 2], E: [0, 1], N: [1, 1] }, holiday: { D: [1, 1], E: [0, 0], N: [1, 1] } },
    preAssigned: pre,
  };
  let allOk = true;
  for (const seed of [1, 2, 3]) {
    const res = E2.generate(staff, cfg, seed);
    if (!res || res.violations.length !== 0) {
      allOk = false; famPush(`T5 seed=${seed} 위반 ${res ? res.violations.length : 'null'}` +
        (res && res.violations.length ? ' 예: ' + res.violations[0].msg : ''));
      continue;
    }
    const s = res.schedule;
    const eTotal = famCount(s.t0, 'E') + famCount(s.t1, 'E');
    if (eTotal < 2) { allOk = false; famPush(`T5 seed=${seed} 주간 E 합계 ${eTotal} < 2 (E 기아)`); }
    const n0 = famCount(s.n0, 'N'), n1 = famCount(s.n1, 'N');
    if (!(n0 >= 14 && n0 <= 16 && n1 >= 14 && n1 <= 16)) { allOk = false; famPush(`T5 seed=${seed} 전담 N ${n0}/${n1}`); }
    ok(s.t0[11] === 'CO' && s.t1[20] === 'EDU', `T5 seed=${seed} 대휴·교육 선입력 보존`);
  }
  ok(allOk, 'T5 NA 시드 3종 전건 통과');
}

/* ========== T6. 선입력 단위 케이스 ========== */
section('T6 선입력 단위 (MD/E2 패밀리·N후V·인접차단·희망오프V)');
{
  const staff5 = mkStaff(6, 0, 0);
  const base = {
    days: 14, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 400,
    required: { weekday: { D: [2, 2], E: [1, 1], N: [0, 0] }, holiday: { D: [1, 1], E: [1, 1], N: [0, 0] } },
  };
  // a. MD가 D계열로 합산 — MD 선입력일에 자동 D는 1명만 추가돼야 함
  {
    const cfg = { ...base, preAssigned: { t0: { 2: 'MD' } } };
    const res = E2.generate(staff5, cfg, 11);
    ok(res && res.violations.length === 0, 'T6a MD 선입력 위반 0');
    if (res && res.violations.length === 0) {
      const s = res.schedule;
      ok(s.t0[1] === 'MD', 'T6a MD 보존');
      let dfam = 0; staff5.forEach(p => { if (E2.fam(s[p.id][1]) === 'D') dfam++; });
      ok(dfam === 2, `T6a 2일 D계열 ${dfam} = 2 (MD 포함 초과 없음)`);
    }
  }
  // b. E2가 E계열로 합산
  {
    const cfg = { ...base, preAssigned: { t1: { 4: 'E2' } } };
    const res = E2.generate(staff5, cfg, 12);
    ok(res && res.violations.length === 0, 'T6b E2 선입력 위반 0');
    if (res && res.violations.length === 0) {
      const s = res.schedule;
      let efam = 0; staff5.forEach(p => { if (E2.fam(s[p.id][3]) === 'E') efam++; });
      ok(efam === 1, `T6b 4일 E계열 ${efam} = 1 (E2 포함 초과 없음)`);
    }
  }
  // c. N 직후 V — 추가 강제 O는 정확히 k-1일
  {
    const staff = mkStaff(4, 2, 0);
    const cfg = {
      days: 14, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 400,
      required: { weekday: { D: [1, 2], E: [1, 1], N: [1, 1] }, holiday: { D: [1, 1], E: [1, 1], N: [1, 1] } },
      preAssigned: { n0: { 1: 'N', 2: 'N', 3: 'V' } },
    };
    const res = E2.generate(staff, cfg, 13);
    ok(res && res.violations.length === 0, 'T6c N후V 위반 0');
    if (res && res.violations.length === 0) {
      const s = res.schedule;
      ok(E2.isRest(s.n0[3]), `T6c 4일 휴식(${s.n0[3]}) — pendingOff가 V를 인정하고 k-1일만 추가`);
    }
  }
  // d. 다음날 근무 선입력 앞에 N 자동 배정 금지 (전방 검사)
  {
    const staff = mkStaff(4, 2, 0);
    const cfg = {
      days: 14, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 400,
      required: { weekday: { D: [1, 2], E: [1, 1], N: [1, 1] }, holiday: { D: [1, 1], E: [1, 1], N: [1, 1] } },
      preAssigned: { n0: { 11: 'N' }, n1: { 11: 'V' } },
      allowGenericNight: false,
    };
    const res = E2.generate(staff, cfg, 14);
    ok(res && res.violations.length === 0, 'T6d 전방 검사 위반 0');
  }
  // e. 희망오프일에 V/CO 선입력 → 충족 판정
  {
    const cfg = { ...base, wishOffs: { t2: [7], t3: [8] }, preAssigned: { t2: { 7: 'V' }, t3: { 8: 'CO' } } };
    const res = E2.generate(staff5, cfg, 15);
    ok(res && res.violations.length === 0, 'T6e 희망오프=V·CO 충족');
  }
  // f. 오늘 자동 E → 내일 D 선입력 역행 차단 (전방 검사 — 대안 인원 존재 시 위반 0)
  {
    const cfg = { ...base, preAssigned: { t0: { 5: 'D' } } };
    let allOk = true;
    for (const seed of [1, 2, 3]) {
      const res = E2.generate(staff5, cfg, seed);
      if (!res || res.violations.length !== 0) { allOk = false; break; }
      if (E2.fam(res.schedule.t0[3]) === 'E') { allOk = false; break; } // 4일 E였다면 5일 D와 역행
    }
    ok(allOk, 'T6f E→선입력D 역행 전방 차단');
  }
  // g. 자동 N + 이어지는 선입력 N 블록이 나이트 연속 한도 초과 금지
  {
    const staff = mkStaff(4, 2, 0);
    const cfg = {
      days: 20, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 400,
      required: { weekday: { D: [1, 2], E: [1, 1], N: [1, 1] }, holiday: { D: [1, 1], E: [1, 1], N: [1, 1] } },
      preAssigned: { n0: { 12: 'N', 13: 'N' } },
    };
    let allOk = true;
    for (const seed of [1, 2, 3]) {
      const res = E2.generate(staff, cfg, seed);
      if (!res || res.violations.length !== 0) { allOk = false; break; }
      let nrun = 0, maxNrun = 0;
      res.schedule.n0.forEach(c => { nrun = E2.fam(c) === 'N' ? nrun + 1 : 0; if (nrun > maxNrun) maxNrun = nrun; });
      if (maxNrun > 3) { allOk = false; break; }
    }
    ok(allOk, 'T6g 자동N+선입력N 연속 한도 준수');
  }
}

/* ========== T6+. 나이트 전담 해제 경로 ========== */
section('T6+ allowGenericNight / 전담 부재');
{
  // a. 전담 없는 병동 — 3교대가 N을 서고 위반 0
  {
    const staff = mkStaff(6, 0, 0);
    const cfg = {
      days: 14, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 400,
      required: { weekday: { D: [1, 2], E: [1, 1], N: [1, 1] }, holiday: { D: [1, 1], E: [1, 1], N: [1, 1] } },
    };
    const res = E2.generate(staff, cfg, 5);
    const nTotal = res && res.violations.length === 0
      ? staff.reduce((a, p) => a + res.schedule[p.id].filter(c => E2.fam(c) === 'N').length, 0) : -1;
    ok(res && res.violations.length === 0 && nTotal === 14, `T6+a 전담 부재 시 3교대 N 커버 (N=${nTotal})`);
  }
  // b. 전담 존재 + allowGenericNight:true — 전담 동시 이탈 날을 3교대가 메움
  {
    const staff = mkStaff(6, 2, 0);
    const cfg = {
      days: 14, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 600, allowGenericNight: true,
      required: { weekday: { D: [1, 2], E: [1, 1], N: [1, 1] }, holiday: { D: [1, 1], E: [1, 1], N: [1, 1] } },
      preAssigned: { n0: { 7: 'V' }, n1: { 7: 'V' } },
    };
    const res = E2.generate(staff, cfg, 6);
    ok(res && res.violations.length === 0 && E2.fam(Object.keys(res.schedule).filter(id => id.startsWith('t')).map(id => res.schedule[id][6]).find(c => E2.fam(c) === 'N') || '') === 'N',
      'T6+b 해제 시 3교대가 N 공백 커버');
  }
}

/* ========== T7. 불능 입력 조기 검출 ========== */
section('T7 preflight (재시도 없이 사유 반환)');
{
  const staff = mkStaff(8, 0, 0);
  const base = {
    days: 14, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 999,
    required: { weekday: { D: [3, 3], E: [2, 2], N: [0, 0] }, holiday: { D: [2, 2], E: [2, 2], N: [0, 0] } },
  };
  // a. 선입력 휴무 과다로 가용 < 최소
  {
    const cfg = { ...base, preAssigned: { t0: { 3: 'V' }, t1: { 3: 'V' }, t2: { 3: 'V' }, t3: { 3: 'CO' } } };
    const res = E2.generate(staff, cfg, 1);
    ok(res && res.infeasible === true && res.attempts === 0, 'T7a 가용부족 즉시 반환');
    ok(res && res.violations.some(v => v.rule === '사전검사' && v.day === 3), 'T7a 사유에 3일 명시');
  }
  // b. 선입력 계열 초과
  {
    const cfg = { ...base, preAssigned: { t0: { 3: 'D' }, t1: { 3: 'D' }, t2: { 3: 'MD' }, t3: { 3: 'D' } } };
    const res = E2.generate(staff, cfg, 1);
    ok(res && res.infeasible === true, 'T7b D계열 선입력 4>max3 검출');
  }
  // c. 유형 모순 (전담에게 D 선입력)
  {
    const staff2 = mkStaff(6, 1, 0);
    const cfg = { ...base, preAssigned: { n0: { 5: 'D' } } };
    const res = E2.generate(staff2, cfg, 1);
    ok(res && res.infeasible === true, 'T7c 전담에게 D 선입력 검출');
  }
  // d. 희망오프일 근무 선입력 충돌
  {
    const cfg = { ...base, wishOffs: { t0: [6] }, preAssigned: { t0: { 6: 'E' } } };
    const res = E2.generate(staff, cfg, 1);
    ok(res && res.infeasible === true, 'T7d 희망오프-선입력 충돌 검출');
  }
  // e. 희망오프일 EDU 선입력 — 검증기 기준(WISH_OK={O,V,CO})과 동일하게 사전 검출
  {
    const cfg = { ...base, wishOffs: { t0: [7] }, preAssigned: { t0: { 7: 'EDU' } } };
    const res = E2.generate(staff, cfg, 1);
    ok(res && res.infeasible === true, 'T7e 희망오프-EDU 선입력 검출');
  }
  // f. 선입력끼리 나이트 휴식창 침범 (N–O–D, k=2)
  {
    const staff2 = mkStaff(6, 1, 0);
    const cfg = {
      ...base,
      required: { weekday: { D: [2, 3], E: [1, 1], N: [0, 1] }, holiday: { D: [1, 2], E: [1, 1], N: [0, 1] } },
      preAssigned: { n0: { 1: 'N', 2: 'O', 3: 'N' }, t0: { 1: 'D', 2: 'D', 3: 'D', 4: 'D', 5: 'D', 6: 'D' } },
    };
    // n0: N 후 1일만 쉬고 N 재개(휴식창 침범) + t0: 연속 6일 선입력
    const res = E2.generate(staff2, cfg, 1);
    ok(res && res.infeasible === true
      && res.violations.some(v => v.msg.includes('휴식 기간'))
      && res.violations.some(v => v.msg.includes('연속 근무')), 'T7f 휴식창 침범·연속 초과 선입력 검출');
  }
  // g. 선입력 나이트 연속 초과 + 전담제 위반 선입력 + 알 수 없는 코드
  {
    const staff2 = mkStaff(6, 1, 0);
    const cfg = {
      ...base,
      required: { weekday: { D: [2, 3], E: [1, 1], N: [0, 1] }, holiday: { D: [1, 2], E: [1, 1], N: [0, 1] } },
      preAssigned: { n0: { 2: 'N', 3: 'N', 4: 'N', 5: 'N' }, t0: { 8: 'N' }, t1: { 10: 'X' } },
    };
    const res = E2.generate(staff2, cfg, 1);
    ok(res && res.infeasible === true
      && res.violations.some(v => v.msg.includes('나이트') && v.msg.includes('연속'))
      && res.violations.some(v => v.msg.includes('전담'))
      && res.violations.some(v => v.msg.includes('알 수 없는 코드')), 'T7g 나이트연속·전담·코드 오류 검출');
  }
  // h. 이력 경계 — 전월 말 N + 1일차 근무 선입력
  {
    const cfg = { ...base, history: { t0: { lastCodes: ['N'] } }, preAssigned: { t0: { 1: 'D' } } };
    const res = E2.generate(staff, cfg, 1);
    ok(res && res.infeasible === true, 'T7h 이력 말미 N + 1일차 근무 선입력 검출');
  }
  // i. 풀 가용 — 전담 2명 같은 날 동시 휴무 선입력 + N 필수
  {
    const staff2 = mkStaff(6, 2, 0);
    const cfg = {
      ...base,
      required: { weekday: { D: [2, 3], E: [1, 1], N: [1, 1] }, holiday: { D: [1, 2], E: [1, 1], N: [1, 1] } },
      preAssigned: { n0: { 9: 'V' }, n1: { 9: 'V' } },
    };
    const res = E2.generate(staff2, cfg, 1);
    ok(res && res.infeasible === true && res.violations.some(v => v.day === 9 && v.msg.includes('나이트 가능')), 'T7i 나이트 풀 가용 부족 검출');
  }
  // j. 풀 가용 — 휴일에 상근만 남는 구성
  {
    const staff2 = mkStaff(2, 0, 2);
    const cfg = {
      days: 14, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 999,
      required: { weekday: { D: [2, 2], E: [2, 2], N: [0, 0] }, holiday: { D: [2, 2], E: [2, 2], N: [0, 0] } },
    };
    const res = E2.generate(staff2, cfg, 1);
    ok(res && res.infeasible === true && res.violations.some(v => v.msg.includes('주간')), 'T7j 휴일 주간 풀 부족 검출 (상근 제외)');
  }
  // k. 규칙 오류 — min > max
  {
    const cfg = { ...base, required: { weekday: { D: [3, 2], E: [2, 2], N: [0, 0] }, holiday: { D: [2, 2], E: [2, 2], N: [0, 0] } } };
    const res = E2.generate(staff, cfg, 1);
    ok(res && res.infeasible === true && res.violations.some(v => v.msg.includes('최대')), 'T7k min>max 검출');
  }
}

/* ========== T7+. 범위 밖 입력 무해화 ========== */
section('T7+ 범위 밖 preAssigned·wishOffs');
{
  const staff = mkStaff(8, 2, 0);
  const base = {
    days: 30, firstWeekday: 1, holidays: [3, 6], ...BASE_RULES, maxAttempts: 800,
    required: { weekday: { D: [3, 3], E: [2, 3], N: [1, 1] }, holiday: { D: [2, 2], E: [2, 2], N: [1, 1] } },
  };
  const clean = E2.generate(staff, base, 42);
  const dirty = E2.generate(staff, {
    ...base,
    preAssigned: { t0: { 35: 'V', 40: 'V' }, t1: { 0: 'V' } },   // 전부 범위 밖 — 무시돼야 함
    wishOffs: { t2: [0, 99] },                                    // 전부 범위 밖 — 유령 위반 금지
  }, 42);
  ok(clean && clean.violations.length === 0 && dirty && dirty.violations.length === 0, 'T7+ 범위 밖 입력 위반 0');
  ok(clean && dirty && JSON.stringify(clean.schedule) === JSON.stringify(dirty.schedule), 'T7+ 범위 밖 입력이 결과에 무영향');
}

/* ========== T8. 경계 ========== */
section('T8 경계 (일요일 시작·공휴일 없음·전담 1명·행 잠금 호환)');
{
  // a. firstWeekday=0 (일요일 시작)
  {
    const staff = mkStaff(8, 2, 0);
    const cfg = {
      days: 31, firstWeekday: 0, holidays: [], ...BASE_RULES, maxAttempts: 500,
      required: { weekday: { D: [3, 3], E: [2, 2], N: [1, 1] }, holiday: { D: [2, 2], E: [2, 2], N: [1, 1] } },
    };
    const res = E2.generate(staff, cfg, 21);
    ok(res && res.violations.length === 0, 'T8a 일요일 시작 31일 위반 0');
  }
  // b. 전담 1명뿐 — 우아한 실패 (throw 금지, null 또는 위반 보고)
  {
    const staff = mkStaff(4, 1, 0);
    const cfg = {
      days: 14, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 60,
      required: { weekday: { D: [1, 1], E: [1, 1], N: [1, 1] }, holiday: { D: [1, 1], E: [1, 1], N: [1, 1] } },
    };
    let threw = false, res = null;
    try { res = E2.generate(staff, cfg, 1); } catch (e) { threw = true; }
    ok(!threw && (res === null || res.violations.length > 0), 'T8b 전담 1명 우아한 실패');
  }
  // c. 행 단위 locked 하위호환
  {
    const staff = mkStaff(6, 0, 0);
    const row = Array(14).fill('O');
    const cfg = {
      days: 14, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 400,
      required: { weekday: { D: [2, 2], E: [1, 1], N: [0, 0] }, holiday: { D: [1, 1], E: [1, 1], N: [0, 0] } },
      locked: { t5: row },
    };
    const res = E2.generate(staff, cfg, 31);
    ok(res && res.violations.length === 0, 'T8c locked 위반 0');
    if (res && res.violations.length === 0)
      ok(res.schedule.t5.every(c => c === 'O'), 'T8c locked 행 보존');
  }
}

/* ========== T9. 월 단위 여력 소프트 경고 (preflight개선 item1) ========== */
section('T9 월 여력 소프트 경고 (생성 막지 않음·warnings로만)');
{
  // a. 통합 풀(전담 없음)이 빠듯 — 소프트 경고 뜨되 infeasible 아님, violations엔 안 섞임
  {
    const staff = mkStaff(5, 0, 0);   // 삼교대 5명, 전담 없음 → 단일 풀
    const cfg = {
      days: 28, firstWeekday: 1, holidays: [], maxConsecWork: 6, maxConsecN: 3,
      offAfterNights: 0, forbidBackward: false, maxAttempts: 1200, targetOff: 13,
      required: { weekday: { D: [1, 2], E: [1, 2], N: [1, 1] }, holiday: { D: [1, 2], E: [1, 2], N: [1, 1] } },
    };
    // Σ최소수요 = 3×28 = 84, Σ여력 = 5×(28-13) = 75 → 84>75 소프트 확정
    const pf = E2.preflight(staff, cfg);
    ok(pf.some(i => i.soft && i.rule === '여력'), 'T9a preflight에 소프트 여력 경고');
    ok(pf.filter(i => i.soft).every(i => i.rule === '여력'), 'T9a 소프트는 여력 규칙만');
    const res = E2.generate(staff, cfg, 7);
    ok(res && res.infeasible !== true, 'T9a 소프트는 생성을 막지 않음(infeasible 아님)');
    ok(res && Array.isArray(res.warnings) && res.warnings.some(w => w.soft && w.rule === '여력'), 'T9a 결과 warnings에 소프트 경고');
    ok(res && (res.violations || []).every(v => !v.soft), 'T9a 소프트가 violations에 안 섞임');
  }
  // b. 여유로운 병동 — 소프트 경고 없음(false positive 금지)
  {
    const staff = mkStaff(8, 0, 0);
    const cfg = {
      days: 28, firstWeekday: 1, holidays: [], ...BASE_RULES, maxAttempts: 600, targetOff: 8,
      required: { weekday: { D: [1, 2], E: [1, 2], N: [1, 1] }, holiday: { D: [1, 2], E: [1, 2], N: [1, 1] } },
    };
    // Σ최소수요 = 84, Σ여력 = 8×(28-8) = 160 → 여유
    const pf = E2.preflight(staff, cfg);
    ok(!pf.some(i => i.soft), 'T9b 여유 병동은 소프트 경고 없음');
    const res = E2.generate(staff, cfg, 7);
    ok(res && res.violations.length === 0 && (!res.warnings || res.warnings.length === 0), 'T9b 여유 병동 위반0·경고0');
  }
  // c. 전담제 — 나이트 풀만 빠듯 → 나이트 메시지 (풀 분리 검증)
  {
    const staff = mkStaff(4, 2, 0);   // 삼교대 4 + 전담 2 → restrictNToNight
    const cfg = {
      days: 28, firstWeekday: 1, holidays: [], maxConsecWork: 6, maxConsecN: 3,
      offAfterNights: 1, forbidBackward: false, maxAttempts: 1200, targetOff: 16,
      required: { weekday: { D: [1, 2], E: [1, 2], N: [1, 1] }, holiday: { D: [1, 2], E: [1, 2], N: [1, 1] } },
    };
    // 나이트 풀: capN=2×(28-16)=24 < minDemandN=28 → 나이트 경고
    // 주간 풀: capDE=4×12=48 ≥ minDemandDE=2×28=56? 56>48 이므로 주간도 뜰 수 있음 → 나이트 메시지 존재만 검증
    const pf = E2.preflight(staff, cfg);
    ok(pf.some(i => i.soft && i.rule === '여력' && i.msg.includes('나이트')), 'T9c 전담 나이트 풀 소프트 경고');
    ok(pf.filter(i => !i.soft).length === 0, 'T9c 하드 위반 없음(선입력·가용 문제 아님)');
  }
  // d. 하드(min>max) + 소프트(빠듯) 동시 → infeasible이되 violations엔 soft 안 섞이고 warnings로 분리 (안전 불변식)
  {
    const staff = mkStaff(5, 0, 0);
    const cfg = {
      days: 28, firstWeekday: 1, holidays: [], maxConsecWork: 6, maxConsecN: 3,
      offAfterNights: 0, forbidBackward: false, maxAttempts: 200, targetOff: 13,
      required: { weekday: { D: [2, 2], E: [2, 1], N: [1, 1] }, holiday: { D: [1, 2], E: [1, 2], N: [1, 1] } },
    };
    // 평일 E min2>max1 = 하드(min>max), 동시에 Σ최소수요≫Σ여력 = 소프트
    const res = E2.generate(staff, cfg, 3);
    ok(res && res.infeasible === true, 'T9d 하드 있으면 infeasible');
    ok(res && (res.violations || []).every(v => !v.soft), 'T9d infeasible violations에 soft 안 섞임');
    ok(res && (res.violations || []).some(v => v.msg.includes('최대')), 'T9d violations에 하드(min>max) 유지');
    ok(res && Array.isArray(res.warnings) && res.warnings.some(w => w.soft && w.rule === '여력'), 'T9d 소프트는 warnings로 분리');
    const ra = E2.attempt(staff, cfg, 3, 0);
    ok(ra && ra.infeasible === true && (ra.violations || []).every(v => !v.soft) && (ra.warnings || []).some(w => w.soft), 'T9d attempt도 하드/소프트 분리');
  }
}

/* ========== 결과 ========== */
console.log('');
console.log(`결과: ${pass} 통과 / ${fail} 실패`);
if (fail > 0) { process.exitCode = 1; }
