/* ===== 엄만달 — 기존 근무표(엑셀) 불러오기 =====
 * 전역 객체 Importer. XLSX(SheetJS, vendor/xlsx.full.min.js)를 전제로 한다.
 * parse(arrayBuffer) → {days, header, rows, unknownCodes}
 * analyze(rows, days, ym) → {staff, rulesByGroup, global, meta}
 * 브라우저에선 window.Importer, node 테스트에선 module.exports.
 */
(function (root) {
  'use strict';

  /* ---- 도우미 ---- */
  /* 순수 정수 셀만 값(그 외 null) — 날짜 머리행 탐지용 */
  function intCell(v) {
    var s = String(v == null ? '' : v).trim();
    if (!/^\d+$/.test(s)) return null;
    return parseInt(s, 10);
  }
  /* 한글 이름(2~5자) 셀인지 — RN/NA 접두는 떼고 판정 */
  function isKorName(v) {
    var s = String(v == null ? '' : v).trim().replace(/^(RN|NA)\s+/i, '').trim();
    return /^[가-힣]{2,5}$/.test(s);
  }
  /* 직군 토큰 — RN/NA/간호사/조무사 */
  function groupToken(v) {
    var s = String(v == null ? '' : v).trim().toUpperCase();
    if (s === 'RN' || s === '간호사') return 'RN';
    if (s === 'NA' || s === '조무사') return 'NA';
    return null;
  }
  /* 근무 코드 → 패밀리 (D계열=D+MD, E계열=E+E2, N) */
  function famOf(c) {
    if (c === 'D' || c === 'MD') return 'D';
    if (c === 'E' || c === 'E2') return 'E';
    if (c === 'N') return 'N';
    return null;
  }
  function isRestCode(c) { return c === 'O' || c === 'V' || c === 'CO' || c === 'EDU'; }

  /* 코드 정규화 — 대소문자 무시, 앞뒤 공백·★ 제거. 미인식은 unknown에 원문 수집 */
  function normCode(raw, unknown) {
    var s = String(raw == null ? '' : raw).replace(/★/g, '').trim();
    if (s === '') return '';
    var u = s.toUpperCase();
    if (s.indexOf('대휴') >= 0) return 'CO';               // "5/3 대휴" 등
    if (u === 'D') return 'D';
    if (u === 'MD') return 'MD';
    if (u === 'E') return 'E';
    if (u === 'E2') return 'E2';
    if (u === 'N') return 'N';
    if (u === 'OFF' || s === '오프' || u === 'O' || s === '－' || s === '-' || u === 'X') return 'O';
    if (s === '휴' || s === '연차' || u === 'V') return 'V';
    if (s === '대') return 'CO';
    if (s === '교' || s === '교육') return 'EDU';
    /* 미인식 — 원문(정리본) 수집, 중복 제거, 최대 10개 */
    if (unknown.length < 10 && unknown.indexOf(s) < 0) unknown.push(s);
    return '';
  }

  /* ================= 1. parse ================= */
  function parse(arrayBuffer) {
    var wb = XLSX.read(arrayBuffer, { type: 'array' });
    var sheet = wb.Sheets[wb.SheetNames[0]];
    var aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

    /* --- 날짜 머리행 탐지: 한 행에서 1,2,3… 이 20개 이상 연속 증가 --- */
    var headerRow = -1, dayCols = null;
    for (var r = 0; r < aoa.length && headerRow < 0; r++) {
      var row = aoa[r] || [];
      for (var c = 0; c < row.length; c++) {
        if (intCell(row[c]) !== 1) continue;
        var cols = [c], expect = 2, cc = c + 1;
        while (cc < row.length && intCell(row[cc]) === expect) { cols.push(cc); expect++; cc++; }
        if (cols.length >= 20) { headerRow = r; dayCols = cols; break; }
      }
    }
    if (headerRow < 0) return { error: '날짜 줄(1,2,3…)을 찾지 못했어요' };
    var days = dayCols.length;
    var dayStart = dayCols[0];

    /* --- 이름 열 탐지: 날짜 시작열 왼쪽에서 한글 이름이 가장 많은 열 --- */
    var nameCol = 0, bestCount = -1;
    for (var col = 0; col < dayStart; col++) {
      var cnt = 0;
      for (var rr = headerRow + 1; rr < aoa.length; rr++) {
        if (isKorName((aoa[rr] || [])[col])) cnt++;
      }
      if (cnt > bestCount) { bestCount = cnt; nameCol = col; }
    }

    /* --- 데이터 행 수집 --- */
    var rows = [], unknown = [], currentGroup = null;
    for (var d2 = headerRow + 1; d2 < aoa.length; d2++) {
      var drow = aoa[d2] || [];
      var rawName = String(drow[nameCol] == null ? '' : drow[nameCol]).trim();

      /* 하단 범례에서 중단: 이름칸이 범례어 / 날짜칸에 시각패턴(07:00 등) */
      if (/근무시간|합계|시간|서명|결재/.test(rawName)) break;
      var hasTime = false;
      for (var t = 0; t < dayCols.length; t++) {
        if (/\d{1,2}:\d{2}/.test(String(drow[dayCols[t]] || ''))) { hasTime = true; break; }
      }
      if (hasTime) break;

      /* 직군 구분행: 이름칸이 직군 토큰이고 날짜칸이 전부 빔 → 이후 행에 적용 */
      var nameTok = groupToken(rawName);
      if (nameTok) {
        var filled = 0;
        for (var f = 0; f < dayCols.length; f++) if (String(drow[dayCols[f]] || '').trim() !== '') filled++;
        if (filled === 0) { currentGroup = nameTok; continue; }
      }

      /* 이름이 없는 행(요일줄 등) → 그룹 토큰만 있으면 구분행 처리, 아니면 건너뜀 */
      if (!isKorName(rawName)) {
        for (var g2 = 0; g2 < drow.length; g2++) {
          var gt = groupToken(drow[g2]);
          if (gt) { currentGroup = gt; break; }
        }
        continue;
      }

      /* 데이터 행 확정 — 직군 3경로 */
      var name = rawName, rowGroup = null;
      var pm = name.match(/^(RN|NA)\s+/i);
      if (pm) { rowGroup = pm[1].toUpperCase(); name = name.replace(/^(RN|NA)\s+/i, '').trim(); }  // ①접두
      if (!rowGroup) {                                                                              // ②별도 열
        for (var g3 = 0; g3 < drow.length; g3++) {
          if (g3 === nameCol || dayCols.indexOf(g3) >= 0) continue;
          var gt3 = groupToken(drow[g3]);
          if (gt3) { rowGroup = gt3; break; }
        }
      }
      if (!rowGroup) rowGroup = currentGroup || 'RN';                                               // ③구분행/기본

      var codes = [];
      for (var k = 0; k < dayCols.length; k++) codes.push(normCode(drow[dayCols[k]], unknown));
      rows.push({ name: name, group: rowGroup, codes: codes });
    }

    var header = [];
    for (var h = 1; h <= days; h++) header.push(h);
    return { days: days, header: header, rows: rows, unknownCodes: unknown };
  }

  /* ================= 2. analyze ================= */
  function analyze(rows, days, ym) {
    var a = String(ym).split('-');
    var y = +a[0], mo = +a[1];
    var fw = new Date(y, mo - 1, 1).getDay();
    function isWeekendDay(dayNum) { var wd = (fw + dayNum - 1) % 7; return wd === 0 || wd === 6; }

    /* --- 인당 staff --- */
    var staff = rows.map(function (row) {
      var famD = 0, famE = 0, nCnt = 0, work = 0, weekendWork = 0;
      row.codes.forEach(function (c, i) {
        var f = famOf(c);
        if (f === 'D') famD++; else if (f === 'E') famE++; else if (f === 'N') nCnt++;
        if (f) { work++; if (isWeekendDay(i + 1)) weekendWork++; }
      });
      var type, note = '';
      if (work === 0) { type = 'three'; note = '근무 없음'; }
      else if (nCnt > 0 && famD + famE === 0) type = 'night';
      else if (famD > 0 && famE === 0 && nCnt === 0 && weekendWork === 0) type = 'day';
      else type = 'three';
      var pref = '';
      if (famD >= famE * 2 && famE <= 3) pref = 'D';
      else if (famE >= famD * 2 && famD <= 3) pref = 'E';
      return {
        name: row.name, group: (row.group === 'NA' ? 'NA' : 'RN'),
        type: type, pref: pref, note: note, workDays: work,
        famD: famD, famE: famE, nCnt: nCnt
      };
    });

    /* --- 그룹별 일자 집계 --- */
    var byDay = {};
    rows.forEach(function (row) {
      var g = row.group === 'NA' ? 'NA' : 'RN';
      if (!byDay[g]) { byDay[g] = []; for (var d = 0; d < days; d++) byDay[g].push({ D: 0, E: 0, N: 0 }); }
      row.codes.forEach(function (c, i) { var f = famOf(c); if (f) byDay[g][i][f]++; });
    });

    var rulesByGroup = {};
    Object.keys(byDay).forEach(function (g) {
      var arr = byDay[g];
      function range(weekendWanted, fam) {
        var mn = Infinity, mx = -Infinity, any = false;
        for (var d = 0; d < days; d++) {
          if (isWeekendDay(d + 1) !== weekendWanted) continue;
          any = true;
          var v = arr[d][fam];
          if (v < mn) mn = v; if (v > mx) mx = v;
        }
        return any ? [mn, mx] : [0, 0];
      }
      /* 상한이 하한+4 초과면 눌러 담기(이상치 완충). N은 관찰값 그대로 */
      function soft(rg) { if (rg[1] > rg[0] + 4) rg[1] = rg[0] + 4; return rg; }
      rulesByGroup[g] = {
        wd: { D: soft(range(false, 'D')), E: soft(range(false, 'E')), N: range(false, 'N') },
        hd: { D: soft(range(true, 'D')), E: soft(range(true, 'E')), N: range(true, 'N') }
      };
    });

    /* --- 전역 규칙 --- */
    var maxWork = 0, maxN = 0, offMins = [], backAllowed = false;
    rows.forEach(function (row) {
      var run = 0, nrun = 0;
      for (var d = 0; d < days; d++) {
        var c = row.codes[d];
        if (famOf(c)) { run++; if (run > maxWork) maxWork = run; } else run = 0;
        if (c === 'N') { nrun++; if (nrun > maxN) maxN = nrun; }
        else {
          if (nrun > 0) {   // N 블록 종료 → 직후 연속 휴식 개수
            var rest = 0;
            for (var e = d; e < days; e++) { if (isRestCode(row.codes[e])) rest++; else break; }
            offMins.push(rest);
          }
          nrun = 0;
        }
      }
      for (var b = 0; b < days - 1; b++) {
        if (famOf(row.codes[b]) === 'E' && famOf(row.codes[b + 1]) === 'D') backAllowed = true;
      }
    });
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    var offAfterN = offMins.length ? Math.min.apply(null, offMins) : 0;
    var global = {
      maxWork: clamp(maxWork, 3, 7),
      maxN: clamp(maxN, 1, 5),
      offAfterN: clamp(offAfterN, 0, 3),
      backward: backAllowed ? 0 : 1
    };

    /* --- meta --- */
    var byGroup = { RN: 0, NA: 0 };
    staff.forEach(function (s) { byGroup[s.group]++; });
    var meta = {
      count: staff.length, byGroup: byGroup,
      nightNames: staff.filter(function (s) { return s.type === 'night'; }).map(function (s) { return s.name; }),
      excluded: staff.filter(function (s) { return s.workDays === 0; }).map(function (s) { return s.name; })
    };

    return { staff: staff, rulesByGroup: rulesByGroup, global: global, meta: meta };
  }

  var Importer = { parse: parse, analyze: analyze, _normCode: normCode };
  root.Importer = Importer;
  if (typeof module !== 'undefined' && module.exports) module.exports = Importer;
})(typeof self !== 'undefined' ? self : this);
