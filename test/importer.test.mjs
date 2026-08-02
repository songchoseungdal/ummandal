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

/* ⑧ 빈 날(전원 미기재)이 있어도 인원 하한이 0으로 무너지지 않는다 (2026-07-25)
   실병동 재현: 사진에 안 채워진 날이 하루라도 있으면 관찰 최솟값이 0이 되어
   모든 하한이 [0,x]로 굳고, "아무도 근무 안 해도 규칙 통과"가 됐다. */
section('⑧ 빈 날 제외');
const rowsBlank = res.rows.map(r => ({ name: r.name, group: r.group, codes: r.codes.slice() }));
rowsBlank.forEach(r => { r.codes[28] = ''; r.codes[29] = ''; });   // 6/29(월)·6/30(화)을 통째로 비운다
const anBlank = Importer.analyze(rowsBlank, res.days, YM);
const RNb = anBlank.rulesByGroup.RN;
ok(RNb.wd.D[0] > 0, '빈 날 있어도 RN 평일 D 하한>0 (실제 ' + RNb.wd.D[0] + ')');
ok(RNb.wd.N[0] === RN.wd.N[0] && RNb.wd.N[1] === RN.wd.N[1],
  '빈 날 있어도 RN 평일 N 범위 유지 (실제 [' + RNb.wd.N + '] vs [' + RN.wd.N + '])');
ok(RNb.hd.D[0] === RN.hd.D[0] && RNb.hd.D[1] === RN.hd.D[1],
  '주말 D 범위 무영향 (실제 [' + RNb.hd.D + '])');
/* 대조군: 특정 직군이 이틀 이상 전원 쉬면 정당한 관찰(하한 0 유지) — 빈 날 판정은 전체 합계 기준,
   반복 관찰된 0은 2번째 최솟값 방식(⑨)에서도 살아남는다 */
const rowsNAoff = res.rows.map(r => ({ name: r.name, group: r.group, codes: r.codes.slice() }));
rowsNAoff.forEach(r => { if (r.group === 'NA') { r.codes[28] = 'O'; r.codes[29] = 'O'; } });
const anNAoff = Importer.analyze(rowsNAoff, res.days, YM);
ok(anNAoff.rulesByGroup.NA.wd.D[0] === 0, 'NA가 이틀 쉬면 정당한 0 관찰 (실제 ' + anNAoff.rulesByGroup.NA.wd.D[0] + ')');
/* 전부 빈 표는 [0,0]으로 조용히 수렴(크래시 없음) */
const rowsAll = res.rows.map(r => ({ name: r.name, group: r.group, codes: r.codes.map(() => '') }));
const anAll = Importer.analyze(rowsAll, res.days, YM);
ok(anAll.rulesByGroup.RN.wd.D[0] === 0 && anAll.rulesByGroup.RN.wd.D[1] === 0,
  '전부 빈 표 → [0,0] (실제 [' + anAll.rulesByGroup.RN.wd.D + '])');

/* ⑨ 하루짜리 특이일은 하한에서 무시 — 하한 = 관찰 2번째 최솟값 (2026-07-26)
   실사례(jyj6986 7월): 기준 달에 그 계열 0명인 날이 하루 있으면 하한이 0으로 저장돼
   "아무도 없어도 통과" + 사용자가 이유를 알 수 없었다. 하루뿐인 최솟값(오독·행사)은 버리고,
   이틀 이상 반복된 값만 진짜 최소로 존중한다. */
section('⑨ 특이일 무시(2번째 최솟값)');
const rowsOne = res.rows.map(r => ({ name: r.name, group: r.group, codes: r.codes.slice() }));
rowsOne.forEach(r => { if (r.group === 'NA') { r.codes[1] = 'O'; } });   // 6/2(화) 하루만 NA 전원 오프
const anOne = Importer.analyze(rowsOne, res.days, YM);
ok(anOne.rulesByGroup.NA.wd.D[0] > 0,
  '하루뿐인 NA 0명은 하한에 반영 안 됨 (실제 ' + anOne.rulesByGroup.NA.wd.D[0] + ')');
ok(anOne.rulesByGroup.RN.wd.D[0] === RN.wd.D[0] && anOne.rulesByGroup.RN.wd.D[1] === RN.wd.D[1],
  '다른 직군 범위는 무영향 (실제 [' + anOne.rulesByGroup.RN.wd.D + '])');
/* 상한은 그대로 관찰 최댓값(하한만 보수화) */
ok(anOne.rulesByGroup.NA.wd.D[1] === NA.wd.D[1],
  '상한은 관찰 최댓값 유지 (실제 ' + anOne.rulesByGroup.NA.wd.D[1] + ')');

/* ========== ⑩ 61병동 실표 어휘 (2026-07-31) ========== */
section('⑩ 61병동 어휘 — / · M · H · DE · 공가');
const NC = (s) => Importer._normCode(s, []);
ok(NC('/') === 'O', 'normCode("/")=O — 실제 병동 표의 오프 표기');
ok(NC('／') === 'O', 'normCode("／" 전각)=O');
ok(NC('M') === 'M', 'normCode("M")=M(미드)');
ok(NC('m') === 'M', 'normCode 소문자 m=M');
ok(NC('미드') === 'M', 'normCode("미드")=M');
ok(NC('H') === 'H', 'normCode("H")=H(하프)');
ok(NC('하프') === 'H', 'normCode("하프")=H');
ok(NC('DE') === 'DE', 'normCode("DE")=DE(16시간)');
ok(NC('D/E') === 'DE', 'normCode("D/E")=DE');
ok(NC('공가') === 'GO', 'normCode("공가")=GO');
ok(NC('D') === 'D' && NC('E') === 'E' && NC('N') === 'N', '기존 코드 불변');
const unk = [];
['/', 'M', 'H', 'DE', '공가', 'D', 'E', 'N', '연차'].forEach(c => Importer._normCode(c, unk));
ok(unk.length === 0, '표의 주요 기호가 미인식으로 새지 않음 (실제 [' + unk + '])');

{
  const days = 4;
  const rows = [
    { name: '가나다', group: 'RN', codes: ['DE', 'D', 'D', 'D'] },
    { name: '라마바', group: 'RN', codes: ['O', 'E', 'E', 'E'] },
    { name: '사아자', group: 'RN', codes: ['M', 'H', 'M', 'O'] },
  ];
  const a = Importer.analyze(rows, days, '2026-06');
  const RNr = a.rulesByGroup.RN;
  ok(RNr.wd.M && RNr.wd.M[1] >= 1, 'M 계열이 규칙으로 도출됨 (실제 [' + (RNr.wd.M || []) + '])');
  ok(RNr.wd.D[1] >= 1 && RNr.wd.E[1] >= 1, 'DE가 D·E 양쪽 관찰에 계상됨 (D[' + RNr.wd.D + '] E[' + RNr.wd.E + '])');
}

console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
