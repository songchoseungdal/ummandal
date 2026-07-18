/* ===== 엄만달 배정 엔진 + 검증기 (자동 테스트 30종 통과본 — 수정 금지) ===== */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.UmmandalEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function isWeekend(day, firstWeekday) {
    var wd = (firstWeekday + day - 1) % 7;
    return wd === 0 || wd === 6;
  }
  function typeAllows(type, code) {
    if (code === 'O') return true;
    if (type === 'night') return code === 'N';
    if (type === 'day') return code === 'D';
    return true;
  }
  function validate(schedule, staff, config) {
    var v = [];
    var days = config.days;
    var req = config.required;
    for (var d = 1; d <= days; d++) {
      var need = isWeekend(d, config.firstWeekday) ? req.weekend : req.weekday;
      var cnt = { D: 0, E: 0, N: 0 };
      staff.forEach(function (p) {
        var c = schedule[p.id][d - 1];
        if (cnt[c] !== undefined) cnt[c]++;
      });
      ['D', 'E', 'N'].forEach(function (s) {
        if (cnt[s] !== need[s])
          v.push({ day: d, pid: null, rule: '인원', msg: d + '일 ' + s + ' 근무 ' + cnt[s] + '명 (필요 ' + need[s] + '명)' });
      });
    }
    staff.forEach(function (p) {
      var hist = (config.history && config.history[p.id]) || {};
      var prev = hist.lastCodes || [];
      var seq = prev.concat(schedule[p.id]);
      var off0 = prev.length;
      for (var i = off0; i < seq.length; i++) {
        var day = i - off0 + 1, c = seq[i];
        if (!typeAllows(p.type, c))
          v.push({ day: day, pid: p.id, rule: '유형', msg: p.name + ' ' + day + '일 — 이 사람은 ' + c + ' 근무를 설 수 없어요' });
        if (p.type === 'day' && isWeekend(day, config.firstWeekday) && c !== 'O')
          v.push({ day: day, pid: p.id, rule: '유형', msg: p.name + ' ' + day + '일 — 상근은 주말에 쉬어야 해요' });
      }
      for (var i = 1; i < seq.length; i++) {
        var a = seq[i - 1], b = seq[i];
        var day = i - off0 + 1;
        if (day < 1) continue;
        if (a === 'N' && (b === 'D' || b === 'E'))
          v.push({ day: day, pid: p.id, rule: '전환', msg: p.name + ' ' + day + '일 — 나이트 다음날 ' + b + ' 근무는 안 돼요' });
        if (config.forbidBackward && a === 'E' && b === 'D')
          v.push({ day: day, pid: p.id, rule: '전환', msg: p.name + ' ' + day + '일 — 이브닝 다음날 데이는 안 돼요' });
      }
      var run = 0, nrun = 0;
      for (var i = 0; i < seq.length; i++) {
        var c = seq[i], day = i - off0 + 1;
        run = c !== 'O' ? run + 1 : 0;
        nrun = c === 'N' ? nrun + 1 : 0;
        if (day >= 1 && run > config.maxConsecWork)
          v.push({ day: day, pid: p.id, rule: '연속', msg: p.name + ' ' + day + '일 — 연속 근무가 ' + run + '일이에요 (최대 ' + config.maxConsecWork + '일)' });
        if (day >= 1 && nrun > config.maxConsecN)
          v.push({ day: day, pid: p.id, rule: '연속', msg: p.name + ' ' + day + '일 — 나이트가 ' + nrun + '개 연속이에요 (최대 ' + config.maxConsecN + '개)' });
      }
      var k = config.offAfterNights || 0;
      if (k > 0) {
        for (var i = 1; i < seq.length; i++) {
          if (seq[i - 1] === 'N' && seq[i] !== 'N') {
            for (var j = 0; j < k && i + j < seq.length; j++) {
              var day = i + j - off0 + 1;
              if (day < 1) continue;
              if (seq[i + j] !== 'O') {
                v.push({ day: day, pid: p.id, rule: '나이트휴식', msg: p.name + ' ' + day + '일 — 나이트 후 ' + k + '일은 쉬어야 해요' });
                break;
              }
            }
          }
        }
      }
      var wish = (config.wishOffs && config.wishOffs[p.id]) || [];
      wish.forEach(function (d) {
        if (schedule[p.id][d - 1] !== 'O')
          v.push({ day: d, pid: p.id, rule: '희망오프', msg: p.name + ' ' + d + '일 — 희망 오프가 반영되지 않았어요' });
      });
    });
    return v;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function generate(staff, config, seed) {
    var maxAttempts = config.maxAttempts || 1500;
    var best = null;
    for (var att = 0; att < maxAttempts; att++) {
      var rnd = mulberry32((seed || 1) * 7919 + att * 104729);
      var temp = 8 + Math.floor(att / 10) * 30;
      var res = tryOnce(staff, config, rnd, temp);
      if (res) {
        var viol = validate(res, staff, config);
        if (viol.length === 0) return { schedule: res, attempts: att + 1, violations: [] };
        if (!best || viol.length < best.violations.length) best = { schedule: res, attempts: att + 1, violations: viol };
      }
    }
    return best;
  }
  function tryOnce(staff, config, rnd, temp) {
    var days = config.days;
    var locked = config.locked || {};
    function isLk(id) { return Object.prototype.hasOwnProperty.call(locked, id); }
    var unlocked = staff.filter(function (p) { return !isLk(p.id); });
    var sched = {}; staff.forEach(function (p) { sched[p.id] = []; });
    var state = {};
    staff.forEach(function (p) {
      var hist = (config.history && config.history[p.id]) || {};
      var last = hist.lastCodes || [];
      var run = 0, nrun = 0;
      for (var i = last.length - 1; i >= 0; i--) { if (last[i] !== 'O') run++; else break; }
      for (var i = last.length - 1; i >= 0; i--) { if (last[i] === 'N') nrun++; else break; }
      var pendingOff = 0;
      var k = config.offAfterNights || 0;
      if (k > 0 && last.length) {
        var offs = 0;
        for (var i = last.length - 1; i >= 0 && last[i] === 'O'; i--) offs++;
        if (offs > 0 && offs < k && last.length - offs - 1 >= 0 && last[last.length - offs - 1] === 'N')
          pendingOff = k - offs;
      }
      state[p.id] = {
        run: run, nrun: nrun, pendingOff: pendingOff,
        cnt: { D: 0, E: 0, N: 0, O: 0 },
        histN: hist.n || 0, histWk: hist.weekend || 0, wkWork: 0, prev: last.length ? last[last.length - 1] : 'O'
      };
    });
    var wishSet = {};
    staff.forEach(function (p) {
      wishSet[p.id] = {};
      (((config.wishOffs || {})[p.id]) || []).forEach(function (d) { wishSet[p.id][d] = true; });
    });
    for (var d = 1; d <= days; d++) {
      var wk = isWeekend(d, config.firstWeekday);
      var need = wk ? config.required.weekend : config.required.weekday;
      var assigned = {};
      var slotCnt = { N: 0, D: 0, E: 0 };
      staff.forEach(function (p) {
        if (isLk(p.id)) {
          var lc = locked[p.id][d - 1] || 'O';
          assigned[p.id] = lc;
          if (slotCnt[lc] !== undefined) slotCnt[lc]++;
        }
      });
      unlocked.forEach(function (p) {
        var st = state[p.id];
        var prev = sched[p.id][d - 2] || lastOfHistory(p, config);
        if (wishSet[p.id][d]) { assigned[p.id] = 'O'; return; }
        if (st.pendingOff > 0) { assigned[p.id] = 'O'; return; }
        if (p.type === 'day' && wk) { assigned[p.id] = 'O'; return; }
        if (prev === 'N' && st.nrun >= config.maxConsecN) { assigned[p.id] = 'O'; }
      });
      var codesArr = ['N', 'D', 'E'];
      var cand = {};
      codesArr.forEach(function (code) {
        cand[code] = unlocked.filter(function (p) { return !(p.id in assigned) && canAssign(p, code, d, sched, state, config); })
          .sort(function (a, b) { return score(a, code, wk, state, rnd, temp) - score(b, code, wk, state, rnd, temp); });
      });
      codesArr.sort(function (a, b) { return (cand[a].length - (need[a] - slotCnt[a])) - (cand[b].length - (need[b] - slotCnt[b])); });
      codesArr.forEach(function (code) {
        for (var i = 0; i < cand[code].length && slotCnt[code] < need[code]; i++) {
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
          delete assigned[p.id]; slotCnt[cur]--;
          if (augment(cur, visited)) { assigned[p.id] = code; slotCnt[code]++; return true; }
          assigned[p.id] = cur; slotCnt[cur]++;
        }
        return false;
      }
      var dayOk = true;
      for (var ci = 0; ci < codesArr.length && dayOk; ci++) {
        var code = codesArr[ci];
        while (slotCnt[code] < need[code]) {
          if (!augment(code, {})) { dayOk = false; break; }
        }
      }
      if (!dayOk) return null;
      unlocked.forEach(function (p) { if (!(p.id in assigned)) assigned[p.id] = 'O'; });
      staff.forEach(function (p) {
        var c = assigned[p.id];
        if (!isLk(p.id)) {
          var st = state[p.id];
          var prev = sched[p.id][d - 2] || lastOfHistory(p, config);
          if (st.pendingOff > 0 && c === 'O') st.pendingOff--;
          if (prev === 'N' && c !== 'N') st.pendingOff = Math.max(st.pendingOff, (config.offAfterNights || 0) - 1);
          st.prev = c;
          st.run = c !== 'O' ? st.run + 1 : 0;
          st.nrun = c === 'N' ? st.nrun + 1 : 0;
          st.cnt[c]++;
          if (wk && c !== 'O') st.wkWork++;
        }
        sched[p.id].push(c);
      });
    }
    return sched;
  }
  function attempt(staff, config, seed, att) {
    var rnd = mulberry32((seed || 1) * 7919 + att * 104729);
    var temp = 8 + Math.floor(att / 10) * 30;
    var res = tryOnce(staff, config, rnd, temp);
    if (!res) return null;
    return { schedule: res, violations: validate(res, staff, config) };
  }
  function lastOfHistory(p, config) {
    var hist = (config.history && config.history[p.id]) || {};
    var last = hist.lastCodes || [];
    return last.length ? last[last.length - 1] : 'O';
  }
  function canAssign(p, code, d, sched, state, config) {
    if (!typeAllows(p.type, code)) return false;
    var st = state[p.id];
    var prev = sched[p.id][d - 2] || lastOfHistory(p, config);
    if (prev === 'N' && code !== 'N') return false;
    if (config.forbidBackward && prev === 'E' && code === 'D') return false;
    if (code === 'N' && st.nrun >= config.maxConsecN) return false;
    if (st.run >= config.maxConsecWork) return false;
    if (p.type === 'day' && isWeekend(d, config.firstWeekday)) return false;
    return true;
  }
  function score(p, code, wk, state, rnd, temp) {
    var st = state[p.id];
    var s = 0;
    if (code === 'N') {
      if (p.type === 'night') s -= 100;
      if (st.prev === 'N') s -= 200;
      else s += (st.cnt.N + st.histN * 0.5) * 70;
    } else {
      if (p.type === 'day' && code === 'D') s -= 100;
      s += st.cnt[code] * 4;
    }
    if (wk) s += (st.wkWork + st.histWk * 0.5) * 6;
    s += st.run * st.run * 3;
    s -= st.cnt.O * 3;
    s += rnd() * (temp || 8);
    return s;
  }
  function report(schedule, staff, config) {
    return staff.map(function (p) {
      var hist = (config.history && config.history[p.id]) || {};
      var cnt = { D: 0, E: 0, N: 0, O: 0 }, wkWork = 0;
      schedule[p.id].forEach(function (c, i) {
        cnt[c]++;
        if (isWeekend(i + 1, config.firstWeekday) && c !== 'O') wkWork++;
      });
      return {
        id: p.id, name: p.name, type: p.type,
        D: cnt.D, E: cnt.E, N: cnt.N, O: cnt.O,
        weekend: wkWork, totalN: cnt.N + (hist.n || 0), totalWeekend: wkWork + (hist.weekend || 0)
      };
    });
  }
  return { generate: generate, attempt: attempt, validate: validate, report: report, isWeekend: isWeekend };
});
