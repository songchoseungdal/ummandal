/* 엄만달 — importer.js 자동 테스트
 * 실행: node webapp/test/importer.test.mjs
 * 주의: importer.js는 전역 XLSX를 전제로 하므로 로드 전에 global.XLSX를 심는다.
 * (저장소에 package.json "type":"module" 추가 금지 — UMD 로드가 깨짐)
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

global.XLSX = require('../js/vendor/xlsx.full.min.js');
const Importer = require('../js/importer.js');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + label); } }
function section(t) { console.log('— ' + t); }

const buf = readFileSync(join(__dirname, 'sample_2병동_202606.xlsx'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const res = Importer.parse(ab);
const YM = '2026-06';
const an = Importer.analyze(res.rows, res.days, YM);

function findRow(name) { return res.rows.filter(r => r.name === name)[0]; }
function findStaff(name) { return an.staff.filter(s => s.name === name)[0]; }
function nCount(row) { return row.codes.filter(c => c === 'N').length; }

/* ① parse: 인원 14명, RN 10 / NA 4 */
section('① parse 인원·직군');
ok(!res.error, '오류 없이 파싱');
ok(res.days === 30, 'days=30 (실제 ' + res.days + ')');
ok(res.rows.length === 14, '인원 14명 (실제 ' + res.rows.length + ')');
const rnN = res.rows.filter(r => r.group === 'RN').length;
const naN = res.rows.filter(r => r.group === 'NA').length;
ok(rnN === 10, 'RN 10명 (실제 ' + rnN + ')');
ok(naN === 4, 'NA 4명 (실제 ' + naN + ')');

/* ② 나이트 전담 4명 type=night, N 각 15 */
section('② 나이트 전담');
['이달빛', '김새벽', '차분희', '김선율'].forEach(function (nm) {
  const s = findStaff(nm), row = findRow(nm);
  ok(s && s.type === 'night', nm + ' type=night (실제 ' + (s && s.type) + ')');
  ok(row && nCount(row) === 15, nm + ' N=15 (실제 ' + (row && nCount(row)) + ')');
});

/* ③ 성향 */
section('③ 성향(pref)');
ok(findStaff('김가을').pref === 'D', '김가을 pref=D (실제 ' + findStaff('김가을').pref + ')');
ok(findStaff('박초롱').pref === 'E', '박초롱 pref=E (실제 ' + findStaff('박초롱').pref + ')');

/* ④ 규칙 */
section('④ analyze 규칙');
const RN = an.rulesByGroup.RN;
ok(RN.wd.N[0] === 1 && RN.wd.N[1] === 1, 'RN 평일 N=[1,1] (실제 [' + RN.wd.N + '])');
ok(RN.hd.N[0] === 1 && RN.hd.N[1] === 1, 'RN 주말 N=[1,1] (실제 [' + RN.hd.N + '])');
ok(RN.wd.D[0] >= 2, 'RN 평일 D 하한>=2 (실제 ' + RN.wd.D[0] + ')');
/* 주말 관찰값 — 실표 §9: 주말 RN D2+E2, NA D1 */
ok(RN.hd.D[0] === 2 && RN.hd.D[1] === 2, 'RN 주말 D=[2,2] (실제 [' + RN.hd.D + '])');
ok(RN.hd.E[0] === 2 && RN.hd.E[1] === 2, 'RN 주말 E=[2,2] (실제 [' + RN.hd.E + '])');
const NA = an.rulesByGroup.NA;
ok(NA.hd.D[0] === 1 && NA.hd.D[1] === 1, 'NA 주말 D=[1,1] (실제 [' + NA.hd.D + '])');
/* 주간 전원이 주말 근무를 가지므로 평일 상근(day) 오탐이 없어야 한다 */
const dayTyped = an.staff.filter(s => s.type === 'day');
ok(dayTyped.length === 0, '상근(day) 오탐 0명 (실제 ' + dayTyped.map(s => s.name).join(',') + ')');
const nonNightN = res.rows.filter(r =>
  !['이달빛', '김새벽', '차분희', '김선율'].includes(r.name) && nCount(r) > 0);
ok(nonNightN.length === 0, '전담 외 N 0 (실제 위반 ' + nonNightN.length + '명)');

/* ⑤ 미인식 코드 0건 */
section('⑤ 미인식 코드');
ok(res.unknownCodes.length === 0, '미인식 0 (실제 ' + JSON.stringify(res.unknownCodes) + ')');

/* ⑥ 5/3 대휴 → CO */
section('⑥ 대휴 매핑');
ok(findRow('정하늘').codes[9] === 'CO', '정하늘 10일 = CO (실제 ' + findRow('정하늘').codes[9] + ')');
ok(Importer._normCode('5/3 대휴', []) === 'CO', 'normCode("5/3 대휴")=CO');
ok(Importer._normCode('교', []) === 'EDU', 'normCode("교")=EDU');
ok(Importer._normCode('휴', []) === 'V', 'normCode("휴")=V');
ok(Importer._normCode('OFF', []) === 'O', 'normCode("OFF")=O');

/* ⑦ 전역 규칙 범위 타당 */
section('⑦ 전역 규칙');
ok(an.global.maxN >= 1 && an.global.maxN <= 4, 'maxN 1~4 (실제 ' + an.global.maxN + ')');
ok(an.global.offAfterN >= 1, 'offAfterN>=1 (실제 ' + an.global.offAfterN + ')');
ok(an.global.maxWork >= 3 && an.global.maxWork <= 7, 'maxWork 3~7 (실제 ' + an.global.maxWork + ')');

console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
