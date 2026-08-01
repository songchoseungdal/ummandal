/* 로그인 동기화 판단 규칙 자동 테스트 — 실행: node webapp/test/sync.test.mjs
 * 이 판단이 틀리면 사용자의 근무표가 사라지거나 남의 명단이 다른 계정으로 복제된다.
 * 2026-07-30 실기기 사고(카카오 로그인) 후 회귀 방지용으로 신설. UMD라 createRequire로 로드. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../js/sync-rules.js');

let pass = 0, fail = 0;
const failures = [];
function eq(got, want, label) {
  if (got === want) pass++;
  else { fail++; failures.push(`${label} — 기대 '${want}' / 실제 '${got}'`); console.error(`  ✗ ${label} — 기대 '${want}' / 실제 '${got}'`); }
}
function section(t) { console.log('— ' + t); }
const d = o => S.decideSync(o);

const A = 'uid-A', B = 'uid-B';

section('① 계정 경계 — 다른 계정 근무표는 새 계정에 올리지 않는다 (사고 재발 방지)');
eq(d({ own: A, uid: B, localEmpty: false, serverEmpty: true, localAt: 5000, serverAt: 0 }), 'hold',
  '소유 A·로그인 B·서버 빈 계정 → hold (지우지도 올리지도 않음)');
eq(d({ own: A, uid: B, localEmpty: false, serverEmpty: false, localAt: 5000, serverAt: 1000 }), 'adopt',
  '소유 A·로그인 B·서버에 B 근무표 있음 → adopt (로컬이 더 최신이어도 서버 채택)');
eq(d({ own: A, uid: B, localEmpty: true, serverEmpty: false, localAt: 0, serverAt: 1000 }), 'adopt',
  '소유 A·로그인 B·로컬 비었음 → adopt');
eq(d({ own: A, uid: B, localEmpty: true, serverEmpty: true, localAt: 0, serverAt: 0 }), 'none',
  '소유 A·로그인 B·양쪽 비었음 → none');

section('② 서버 행이 "있지만 비어 있는" 계정 — !server가 아니라 내용으로 판단해야 한다');
eq(d({ own: A, uid: B, localEmpty: false, serverEmpty: true, localAt: 5000, serverAt: 0 }), 'hold',
  '서버 행은 있고 인원 0명(serverEmpty=true) → 여전히 hold (구버전은 여기서 push해 유출됐다)');
eq(d({ own: null, uid: B, localEmpty: false, serverEmpty: true, localAt: 5000, serverAt: 0 }), 'push',
  '소유 미상·서버 빈 계정 → push (로그인 없이 만들어 쓰다 가입한 정상 온보딩)');

section('③ 일반 동기화');
eq(d({ own: A, uid: A, localEmpty: false, serverEmpty: false, localAt: 9000, serverAt: 1000 }), 'push',
  '같은 계정·로컬이 최신 → push');
eq(d({ own: A, uid: A, localEmpty: false, serverEmpty: false, localAt: 1000, serverAt: 9000 }), 'adopt',
  '같은 계정·서버가 최신 → adopt');
eq(d({ own: A, uid: A, localEmpty: false, serverEmpty: false, localAt: 5000, serverAt: 5000 }), 'none',
  '같은 시각 → none (앱 열 때마다 재업로드·토스트 금지)');
eq(d({ own: A, uid: A, localEmpty: true, serverEmpty: false, localAt: 0, serverAt: 1000 }), 'adopt',
  '새 기기(로컬 빔)·서버 데이터 → adopt');
eq(d({ own: A, uid: A, localEmpty: false, serverEmpty: true, localAt: 1000, serverAt: 0 }), 'push',
  '같은 계정·서버 빈 계정 → push');
eq(d({ own: A, uid: A, localEmpty: true, serverEmpty: true, localAt: 0, serverAt: 0 }), 'none',
  '양쪽 빔 → none (빈 서버 행을 만들지 않는다)');

section('④ 첫 로그인·비로그인 등 소유 미상');
eq(d({ own: null, uid: A, localEmpty: true, serverEmpty: false, localAt: 0, serverAt: 1000 }), 'adopt',
  '소유 미상·로컬 빔·서버 있음 → adopt (새 기기 복원)');
eq(d({ own: null, uid: A, localEmpty: true, serverEmpty: true, localAt: 0, serverAt: 0 }), 'none',
  '소유 미상·양쪽 빔 → none');
eq(d({ own: null, uid: A, localEmpty: false, serverEmpty: false, localAt: 9000, serverAt: 1000 }), 'push',
  '소유 미상·양쪽 있음·로컬 최신 → push');

section('⑤ 방어적 입력 (값 없음·같은 계정 표기)');
eq(d({ own: A, uid: A, localEmpty: false, serverEmpty: false }), 'none',
  '시각 정보 없음 → none (임의로 덮지 않는다)');
eq(d({ own: null, uid: null, localEmpty: false, serverEmpty: true }), 'push',
  '로그인 정보 없음 + 서버 빔 → push (호출부가 로그인 확인 후 부르므로 도달 시 정상 경로)');
eq(d({ own: A, uid: null, localEmpty: false, serverEmpty: true, localAt: 1, serverAt: 0 }), 'push',
  'uid 없음이면 계정 경계 판단 불가 → 기존 경로 유지');

section('⑥ isEmptyDb — 인원 말고도 "사람이 넣은 내용"이면 지킨다 (v7.10.0)');
const e = o => S.isEmptyDb(o);
eq(e(null), true, 'null → 빈 것');
eq(e({}), true, '빈 객체 → 빈 것');
eq(e({ staff: [] }), true, '인원 0명뿐 → 빈 것');
eq(e({ staff: [{ id: 'p1' }] }), false, '인원 있음 → 내용 있음');
eq(e({ months: { '2026-06': { codes: { p1: ['D', 'E'] } } } }), false, '근무 배정만 있어도 내용 있음');
eq(e({ months: { '2026-06': { wish: { p1: [3, 7] } } } }), false, '희망 휴무만 있어도 내용 있음');
eq(e({ months: { '2026-06': { pins: { p1: { 5: 'V' } } } } }), false, '고정·연차 핀만 있어도 내용 있음');
eq(e({ customPatterns: ['금요일 나이트를 잘 안 함'] }), false, '채택한 습관 메모만 있어도 내용 있음');
eq(e({ months: { '2026-06': { codes: {}, wish: {}, pins: {} } } }), true, '달 껍데기만 있고 값 없음 → 빈 것');
eq(e({ months: { '2026-06': { codes: { p1: ['', '', ''] } } } }), true, '빈 문자열 배열뿐 → 빈 것 (자동 생성된 껍데기)');
eq(e({ rules2: { RN: { D: [3, 5] } }, months: {} }), true, '규칙(기본값 포함)만으로는 내용 없음 — 첫 로그인 복원을 막지 않기 위해');

section('⑦ isBigShrink — 서버를 받으면 인원이 크게 줄어드는가 (안내 신호, ⚠️임계값 잠정)');
const sh = (b, a) => S.isBigShrink(b, a);
eq(sh(15, 1), true, '15명 → 1명 : 큰 축소');
eq(sh(15, 7), true, '15명 → 7명 : 절반 미만이라 큰 축소');
eq(sh(15, 8), false, '15명 → 8명 : 절반 이상 남음');
eq(sh(4, 1), true, '4명 → 1명 : 큰 축소');
eq(sh(2, 0), false, '원래 2명(3명 미만) → 소규모 병동은 판단하지 않는다');
eq(sh(15, 15), false, '변화 없음');
eq(sh(5, 9), false, '늘어남');
eq(sh(0, 0), false, '양쪽 0');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail) { failures.forEach(f => console.error(' - ' + f)); process.exit(1); }
