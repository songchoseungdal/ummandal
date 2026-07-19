/* 엄만달 — 2병동 2026-06형 샘플 엑셀 생성기
 * 실행: node webapp/test/make_sample_xlsx.mjs
 * 출력: webapp/test/sample_2병동_202606.xlsx
 * 구조: 제목행 → 날짜행(1~30) → 요일행 → [간호사 구분행 → RN 10명] → [조무사 구분행 → NA 4명] → 범례행
 * 2026-06-01은 월요일(fw=1) → 주말 = {6,7,13,14,20,21,27,28}
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const XLSX = require('../js/vendor/xlsx.full.min.js');
const __dirname = dirname(fileURLToPath(import.meta.url));

const DAYS = 30;
const isWeekend = (d) => { const wd = (1 + d - 1) % 7; return wd === 0 || wd === 6; }; // fw=1

/* 30일 배열을 만드는 도우미 — weekday일 때 fn(d), weekend는 일단 'OFF'
 * (주말 근무는 아래 주말 로테이션에서 결정적으로 덮어쓴다 — 실표 §9: 주말 RN D2+E2, NA D1) */
function weekdayPattern(fn) {
  const a = [];
  for (let d = 1; d <= DAYS; d++) a.push(isWeekend(d) ? 'OFF' : fn(d));
  return a;
}
/* 나이트 전담 15/15 — A: 3연속 블록, 뒤에 3일 휴식 */
const A_NIGHTS = [1, 2, 3, 7, 8, 9, 13, 14, 15, 19, 20, 21, 25, 26, 27];
function nightRow(which) {
  const set = new Set(which === 'A' ? A_NIGHTS : Array.from({ length: DAYS }, (_, i) => i + 1).filter(d => !A_NIGHTS.includes(d)));
  const a = [];
  for (let d = 1; d <= DAYS; d++) a.push(set.has(d) ? 'N' : 'OFF');
  return a;
}

/* ---- RN 주간 8명 ---- */
const 김가을 = weekdayPattern(() => 'D');                       // D 위주 (전 평일 D → pref D 보장)
const 최다은 = weekdayPattern((d) => (d % 2 ? 'D' : 'MD'));      // D/MD (김가을과 함께 평일 D계열 ≥2 보장)
const 박초롱 = weekdayPattern(() => 'E');                       // E 위주 → pref E
const 정하늘 = weekdayPattern((d) => ['D', 'MD', 'E'][d % 3]);   // D/MD/E 혼합
const 이보람 = weekdayPattern((d) => ['D', 'E', 'MD'][d % 3]);
const 박솔미 = weekdayPattern((d) => ['MD', 'D', 'E2'][d % 3]);  // E2 포함
const 정믿음 = weekdayPattern((d) => ['D', 'MD', 'E'][d % 3]);
const 배소망 = weekdayPattern((d) => (d % 2 ? 'E' : 'MD'));      // E/MD

/* 특수 코드·연차 삽입 (김가을·최다은은 평일 D계열 유지 위해 건드리지 않음) */
정하늘[9] = '5/3 대휴';   // 10일 → CO 매핑 검증
박초롱[1] = '휴';         // 2일 → V
박초롱[2] = '휴';         // 3일 → V
이보람[8] = '휴';         // 9일
배소망[3] = 'E2';         // 4일 E2 하나 더

const 이달빛 = nightRow('A');   // RN 나이트 전담
const 김새벽 = nightRow('B');   // RN 나이트 전담

/* ---- NA 주간 2명 + 나이트 2명 ---- */
const 박들꽃 = weekdayPattern(() => 'D');                       // D 위주
const 조은비 = weekdayPattern((d) => (d % 2 ? 'D' : 'E'));      // D/E 혼합
조은비[4] = '교';          // 5일 → EDU
const 차분희 = nightRow('A');   // NA 나이트 전담
const 김선율 = nightRow('B');   // NA 나이트 전담

/* ---- 주말 로테이션 (결정적) — 실표 §9: 주말마다 RN D 2명 + E 2명, NA D 1명 ----
 * 주말일 8일을 짝수번째(A조)·홀수번째(B조)로 나눠 2개 조가 격주말 교대 → 주간 전원이
 * 주말 근무 4일씩 공평 분담. 김가을은 D만·박초롱은 E만 맡아 성향(pref) 판정을 보존한다.
 * (주간 전원이 주말 근무를 가지므로 '평일 상근(day)' 오탐도 0이 된다 — 의도) */
const WEEKENDS = [6, 7, 13, 14, 20, 21, 27, 28];
WEEKENDS.forEach((d, i) => {
  if (i % 2 === 0) {   // A조: RN 김가을·이보람=D, 박초롱·정믿음=E / NA 박들꽃=D
    김가을[d - 1] = 'D'; 이보람[d - 1] = 'D';
    박초롱[d - 1] = 'E'; 정믿음[d - 1] = 'E';
    박들꽃[d - 1] = 'D';
  } else {             // B조: RN 최다은·정하늘=D, 박솔미·배소망=E / NA 조은비=D
    최다은[d - 1] = 'D'; 정하늘[d - 1] = 'D';
    박솔미[d - 1] = 'E'; 배소망[d - 1] = 'E';
    조은비[d - 1] = 'D';
  }
});

/* ---- AOA 조립 ---- */
const dayNums = [];
for (let d = 1; d <= DAYS; d++) dayNums.push(d);
const wdNames = ['일', '월', '화', '수', '목', '금', '토'];
const dayOfWeekRow = [''];
for (let d = 1; d <= DAYS; d++) dayOfWeekRow.push(wdNames[(1 + d - 1) % 7]);

const rnBlock = [
  ['김가을', 김가을], ['최다은', 최다은], ['박초롱', 박초롱], ['정하늘', 정하늘],
  ['이보람', 이보람], ['박솔미', 박솔미], ['정믿음', 정믿음], ['배소망', 배소망],
  ['이달빛', 이달빛], ['김새벽', 김새벽]
];
const naBlock = [
  ['박들꽃', 박들꽃], ['조은비', 조은비], ['차분희', 차분희], ['김선율', 김선율]
];

const aoa = [];
aoa.push(['2026년 6월 2병동 근무표']);       // 제목행
aoa.push(['이름'].concat(dayNums));           // 날짜 머리행
aoa.push(dayOfWeekRow);                        // 요일행 (이름칸 빈칸 → 건너뜀)
aoa.push(['간호사']);                          // 직군 구분행 → RN
rnBlock.forEach(([n, arr]) => aoa.push([n].concat(arr)));
aoa.push(['조무사']);                          // 직군 구분행 → NA
naBlock.forEach(([n, arr]) => aoa.push([n].concat(arr)));
aoa.push(['근무시간 D 07:00~16:00 · E 13:30~22:30 · N 21:00~08:30']);  // 하단 범례 → 중단

const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '2026-06');
const out = join(__dirname, 'sample_2병동_202606.xlsx');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(out, buf);
console.log('생성 완료: ' + out + ' (' + aoa.length + '행)');
