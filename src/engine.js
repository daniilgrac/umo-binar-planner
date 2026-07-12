'use strict';
/* ============ РАСЧЁТНОЕ ЯДРО (чистые функции, без DOM) ============ */

const MONTH_COLS = ['Июль', 'Август', 'Сентябрь', 'Октябрь'];

const DEFAULT_SCENARIO = {
  meta: { name: 'Базовый сценарий', version: 1, app: 'umo-binar-planner' },
  calendar: {
    simStart: '2026-09-01', // фиксирован: под него зашит график поставок машин
    deadline: '2026-11-15',
    holidays: ['2026-11-04']
  },
  cities: [
    { id: 'msk',   name: 'Москва',           hub: true,  transitDays: 0, demand: [150, 50, 150, 50] },
    { id: 'spb',   name: 'Санкт-Петербург',  hub: true,  transitDays: 0, demand: [450, 200, 100, 200] },
    { id: 'nn',    name: 'Нижний Новгород',  hub: false, transitDays: 2, demand: [0, 70, 90, 90] },
    { id: 'ekb',   name: 'Екатеринбург',     hub: false, transitDays: 3, demand: [10, 30, 100, 20] },
    { id: 'ufa',   name: 'Уфа',              hub: false, transitDays: 3, demand: [20, 10, 30, 30] },
    { id: 'perm',  name: 'Пермь',            hub: false, transitDays: 3, demand: [10, 30, 20, 20] },
    { id: 'vrn',   name: 'Воронеж',          hub: false, transitDays: 2, demand: [10, 30, 30, 10] },
    { id: 'krd',   name: 'Краснодар',        hub: false, transitDays: 3, demand: [15, 15, 20, 10] },
    { id: 'nsk',   name: 'Новосибирск',      hub: false, transitDays: 5, demand: [15, 15, 15, 15] },
    { id: 'kzn',   name: 'Казань',           hub: false, transitDays: 2, demand: [0, 10, 10, 10] },
    { id: 'tmb',   name: 'Тамбов',           hub: false, transitDays: 2, demand: [0, 10, 10, 10] },
    { id: 'rnd',   name: 'Ростов-на-Дону',   hub: false, transitDays: 3, demand: [0, 0, 10, 10] },
    { id: 'sochi', name: 'Сочи',             hub: false, transitDays: 4, demand: [0, 0, 10, 10] },
    { id: 'krsk',  name: 'Красноярск',       hub: false, transitDays: 6, demand: [0, 20, 0, 0] }
  ],
  process: {
    ops: [
      { id: 'removal', name: 'Снятие бампера',                          wallMin: 60,  mechanics: 1, needsPost: false, needsLift: false },
      { id: 't1',      name: 'Такт 1 · салон, жгуты, Бинар, экран',     wallMin: 155, mechanics: 2, needsPost: true,  needsLift: false },
      { id: 't2',      name: 'Такт 2 · бак, магистраль, бампер, лючок', wallMin: 170, mechanics: 2, needsPost: true,  needsLift: true },
      { id: 't3',      name: 'Такт 3 · прошивка, жидкости, прокачка',   wallMin: 40,  mechanics: 1, needsPost: false, needsLift: false }
    ],
    efficiency: 85,
    learnFirstN: 10,
    learnFactor: 1.5
  },
  bumpers: {
    prepManHours: 2,
    scrapPct: 10,
    initialPool: 50,
    hubPosts: 10,
    hubWorkDays: 6,
    hubShiftHours: 8
  },
  services: []
};

(function seedServices(sc) {
  const plan = { msk: 3, spb: 7, nn: 2, ekb: 2 };
  let n = 0;
  for (const c of sc.cities) {
    const k = plan[c.id] || 1;
    for (let i = 1; i <= k; i++) {
      n++;
      sc.services.push({
        id: 's' + n, cityId: c.id, name: 'Сервис ' + i,
        status: 'active', // active = работает | talks = в переговорах | search = надо найти
        posts: 2, lifts: 1, mechanics: 5,
        daysPerWeek: 5, shiftHours: 8,
        readyDate: '2026-09-01'
      });
    }
  }
})(DEFAULT_SCENARIO);

/* ---------- даты ---------- */
function parseD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function d2s(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
function dow(d) { return (d.getUTCDay() + 6) % 7; } // 0=Пн … 6=Вс
function mondayOf(d) { return addDays(d, -dow(d)); }
function fmtDM(d) { const p = n => String(n).padStart(2, '0'); return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1); }

/* ---------- требования на 1 машину ---------- */
function perCarReq(sc) {
  let mh = 0, lift = 0, post = 0;
  for (const op of sc.process.ops) {
    const w = op.wallMin / 60;
    mh += w * op.mechanics;
    if (op.needsLift) lift += w;
    if (op.needsPost) post += w;
  }
  return { mh, lift, post };
}

/* ---------- мощность сервиса, машин/день ----------
   Выработка (efficiency) растягивает и человеко-часы, и занятость
   подъемников/постов: работа медленнее нормы занимает ресурс дольше. */
const YARD = 10;        // мест ожидания машин без бампера в городах с хабом
const SIM_TAIL_DAYS = 42; // горизонт симуляции: дедлайн + 6 недель

function capacityOf(sc, s, lf) {
  lf = lf || 1;
  const r = perCarReq(sc);
  const eff = sc.process.efficiency / 100;
  const H = s.shiftHours;
  const manCap = r.mh > 0 ? (s.mechanics * H * eff) / (r.mh * lf) : Infinity;
  const liftCap = r.lift > 0 ? (s.lifts * H * eff) / (r.lift * lf) : Infinity;
  const postCap = r.post > 0 ? (s.posts * H * eff) / (r.post * lf) : Infinity;
  const cap = Math.min(manCap, liftCap, postCap);
  let binding = 'механики';
  if (Math.abs(cap - liftCap) < 1e-9) binding = 'подъемники';
  else if (Math.abs(cap - postCap) < 1e-9) binding = 'посты';
  return { cap: isFinite(cap) ? cap : 0, manCap, liftCap, postCap, binding, req: r };
}

function isServiceWorkday(s, date, ds, holidays) {
  if (ds < s.readyDate) return false;
  if (holidays.has(ds)) return false;
  return dow(date) < s.daysPerWeek;
}
function isHubWorkday(sc, date, ds, holidays) {
  if (holidays.has(ds)) return false;
  return dow(date) < sc.bumpers.hubWorkDays;
}

const svcStatus = s => s.status || 'active';

/* ---------- симуляция (потоковая модель, тик = день) ----------
   opts.include — Set статусов партнёров, участвующих в прогоне
   (по умолчанию все: факт + переговоры + поиск). */
function runSim(sc, opts) {
  opts = opts || {};
  const included = opts.include
    ? sc.services.filter(s => opts.include.has(svcStatus(s)))
    : sc.services;
  const day0 = parseD(sc.calendar.simStart);
  const monday0 = mondayOf(day0);
  const deadline = parseD(sc.calendar.deadline);
  const endD = addDays(deadline, SIM_TAIL_DAYS);
  const idx = d => Math.round((d - monday0) / 86400000);
  const nDays = idx(endD) + 1;
  const holidays = new Set(sc.calendar.holidays || []);
  const cities = sc.cities;
  const cityById = {}; cities.forEach(c => cityById[c.id] = c);
  const nonHub = cities.filter(c => !c.hub);
  const totalByCity = {}; cities.forEach(c => totalByCity[c.id] = (c.demand || []).reduce((a, b) => a + (+b || 0), 0));
  const totalDemand = cities.reduce((a, c) => a + totalByCity[c.id], 0);

  /* --- поступление машин --- */
  const arr = {}; cities.forEach(c => arr[c.id] = new Float64Array(nDays));
  const i0 = idx(day0);
  const y0 = day0.getUTCFullYear();
  cities.forEach(c => {
    arr[c.id][i0] += (+c.demand[0] || 0) + (+c.demand[1] || 0); // июль+август — накоплены к старту
    [[2, 9], [3, 10]].forEach(([di, m]) => {
      const qty = +c.demand[di] || 0; if (!qty) return;
      const mondays = [];
      for (let dd = new Date(Date.UTC(y0, m - 1, 1)); dd.getUTCMonth() === m - 1; dd = addDays(dd, 1)) {
        if (dow(dd) === 0) mondays.push(new Date(dd));
      }
      mondays.forEach(md => {
        const i = Math.max(i0, idx(md));
        if (i < nDays) arr[c.id][i] += qty / mondays.length;
      });
    });
  });

  /* --- состояние --- */
  const queue = {}, stock = {}, done = {};
  cities.forEach(c => { queue[c.id] = 0; stock[c.id] = 0; done[c.id] = 0; });
  const nhTotal = nonHub.reduce((a, c) => a + totalByCity[c.id], 0) || 1;
  nonHub.forEach(c => stock[c.id] = (+sc.bumpers.initialPool || 0) * totalByCity[c.id] / nhTotal);

  const svc = included.map(s => ({
    ref: s, id: s.id, cityId: s.cityId,
    done: 0, ready: 0, pendingArr: new Float64Array(nDays + 60)
  }));

  let toHub = [];    // {arrive, qty} — снятые бампера из регионов едут в хаб
  let returns = [];  // {arrive, qty, dest} — подготовленные бампера едут в города
  let hubStock = 0;  // подготовленные бампера, ждущие отправки на хабе
  let hubQueue = 0;  // региональные бампера, ждущие подготовки на хабе
  // мощность хабов: посты × смена ÷ норма подготовки, бамперов/день
  const bp = sc.bumpers;
  const hubCapDay = (+bp.prepManHours > 0)
    ? (+bp.hubPosts || 0) * (+bp.hubShiftHours || 0) / +bp.prepManHours
    : Infinity;
  const hubLoad = new Float64Array(nDays);
  const hubQueueSeries = new Float64Array(nDays);
  const starvedDays = {}; nonHub.forEach(c => starvedDays[c.id] = 0);

  const weeksN = Math.ceil(nDays / 7);
  const psw = {}, pcw = {};
  svc.forEach(s => psw[s.id] = new Float64Array(weeksN));
  cities.forEach(c => pcw[c.id] = new Float64Array(weeksN));
  const doneCum = new Float64Array(nDays);
  const stockSeries = {}; nonHub.forEach(c => stockSeries[c.id] = new Float64Array(nDays));
  const queueSeries = {}; cities.forEach(c => queueSeries[c.id] = new Float64Array(nDays));
  const doneSeries = {}; cities.forEach(c => doneSeries[c.id] = new Float64Array(nDays));
  const starvedSeries = {}; nonHub.forEach(c => starvedSeries[c.id] = new Uint8Array(nDays));

  const deadlineIdx = idx(deadline);
  let totDone = 0, finishIdx = -1;
  let doneAtDeadline = null;

  for (let i = 0; i < nDays; i++) {
    const date = addDays(monday0, i);
    const ds = d2s(date);
    const w = Math.floor(i / 7);
    // остаток мощности хабов на сегодня; свои города режут в приоритете
    let hubCapLeft = isHubWorkday(sc, date, ds, holidays) ? hubCapDay : 0;

    cities.forEach(c => { queue[c.id] += arr[c.id][i]; });

    // прибытие подготовленных бамперов в города
    returns = returns.filter(ev => {
      if (ev.arrive <= i) { stock[ev.dest] += ev.qty; return false; }
      return true;
    });

    for (const s of svc) {
      const p = s.ref;
      const c = cityById[p.cityId];
      if (!c) continue;
      s.ready += s.pendingArr[i]; // машины, бампер которых вернулся из местного хаба
      if (!isServiceWorkday(p, date, ds, holidays)) continue;
      const lf = s.done < sc.process.learnFirstN ? sc.process.learnFactor : 1;
      const cap = capacityOf(sc, p, lf).cap;
      let inst = 0;
      if (c.hub) {
        inst = Math.min(cap, s.ready);
        s.ready -= inst;
        const yardFree = Math.max(0, YARD - s.ready);
        const rem = Math.min(queue[c.id], cap, yardFree, hubCapLeft);
        queue[c.id] -= rem;
        s.pendingArr[i + 1] += rem;      // монтаж — на следующий день
        hubCapLeft -= rem;               // местный хаб режет в тот же день
        hubLoad[i] += rem;
      } else {
        const wantable = Math.min(cap, queue[c.id]);
        inst = Math.min(wantable, stock[c.id]);
        if (inst < wantable - 1e-9) { starvedDays[c.id]++; starvedSeries[c.id][i] = 1; }
        queue[c.id] -= inst;
        stock[c.id] -= inst;
        if (inst > 0) toHub.push({ arrive: i + (+c.transitDays || 0), qty: inst });
      }
      if (inst > 0) {
        s.done += inst; done[c.id] += inst; totDone += inst;
        psw[s.id][w] += inst; pcw[c.id][w] += inst;
      }
    }

    // хаб: региональные бампера копятся в очереди и готовятся в остаток мощности
    toHub = toHub.filter(ev => { if (ev.arrive <= i) { hubQueue += ev.qty; return false; } return true; });
    if (hubQueue > 1e-9 && hubCapLeft > 1e-9) {
      const prepped = Math.min(hubQueue, hubCapLeft);
      hubQueue -= prepped;
      hubCapLeft -= prepped;
      hubLoad[i] += prepped;
      hubStock += prepped * (1 - (+sc.bumpers.scrapPct || 0) / 100);
    }
    // отправка подготовленных туда, где нужнее
    if (isHubWorkday(sc, date, ds, holidays)) {
      if (hubStock > 1e-9) {
        const incoming = {}; nonHub.forEach(c => incoming[c.id] = 0);
        returns.forEach(ev => { incoming[ev.dest] += ev.qty; });
        const needs = [];
        let totNeed = 0;
        nonHub.forEach(c => {
          const need = totalByCity[c.id] - done[c.id] - stock[c.id] - incoming[c.id];
          if (need > 1e-9) { needs.push({ c, need }); totNeed += need; }
        });
        if (totNeed > 0) {
          const shipped = hubStock;
          needs.forEach(({ c, need }) => {
            const q = Math.min(shipped * need / totNeed, need);
            if (q > 1e-9) {
              returns.push({ arrive: i + (+c.transitDays || 0), qty: q, dest: c.id });
              hubStock -= q;
            }
          });
        }
      }
    }

    doneCum[i] = totDone;
    hubQueueSeries[i] = hubQueue;
    nonHub.forEach(c => stockSeries[c.id][i] = stock[c.id]);
    cities.forEach(c => { queueSeries[c.id][i] = queue[c.id]; doneSeries[c.id][i] = done[c.id]; });
    if (finishIdx < 0 && totalDemand > 0 && totDone >= totalDemand - 1e-6) finishIdx = i;
    if (i === deadlineIdx) doneAtDeadline = Object.assign({}, done);
  }

  /* --- недели кампании --- */
  const campaignWeeks = [];
  for (let w = Math.floor(i0 / 7); w * 7 <= deadlineIdx; w++) {
    const ws = addDays(monday0, w * 7), we = addDays(monday0, w * 7 + 6);
    campaignWeeks.push({ w, label: fmtDM(ws) + '–' + fmtDM(we), start: ws, end: we });
  }

  /* --- сводки --- */
  const weeksToDeadline = (deadlineIdx - i0 + 1) / 7;
  const capBySvc = {}; sc.services.forEach(s => {
    const c0 = capacityOf(sc, s, 1);
    capBySvc[s.id] = { perDay: c0.cap, perWeek: c0.cap * s.daysPerWeek, binding: c0.binding, detail: c0 };
  });
  const capByCity = {}; cities.forEach(c => capByCity[c.id] = 0);
  included.forEach(s => { if (capByCity[s.cityId] != null) capByCity[s.cityId] += capBySvc[s.id].perWeek; });

  // референсная линия для рекомендаций: 2 поста / 1 подъемник / 5 механиков / 5 дн / 8 ч
  const refLine = capacityOf(sc, { posts: 2, lifts: 1, mechanics: 5, shiftHours: 8 }, 1).cap * 5;

  const cityStats = {};
  cities.forEach(c => {
    const dem = totalByCity[c.id];
    const dd = doneAtDeadline ? (doneAtDeadline[c.id] || 0) : 0;
    cityStats[c.id] = {
      demand: dem,
      doneByDeadline: dd,
      leftAtDeadline: Math.max(0, dem - dd),
      capWeekly: capByCity[c.id],
      needWeekly: dem / weeksToDeadline,
      starvedDays: starvedDays[c.id] || 0,
      queueEnd: queue[c.id]
    };
  });

  let hubPeak = 0, hubSum = 0, hubDaysCnt = 0, hubQueuePeak = 0;
  for (let i = 0; i <= deadlineIdx && i < nDays; i++) {
    if (hubLoad[i] > 0) { hubSum += hubLoad[i]; hubDaysCnt++; }
    if (hubLoad[i] > hubPeak) hubPeak = hubLoad[i];
    if (hubQueueSeries[i] > hubQueuePeak) hubQueuePeak = hubQueueSeries[i];
  }

  return {
    monday0, i0, deadlineIdx, nDays, weeksN,
    totalDemand, simEndDate: endD,
    doneByDeadline: doneCum[Math.min(deadlineIdx, nDays - 1)] || 0,
    finishDate: finishIdx >= 0 ? addDays(monday0, finishIdx) : null,
    doneCum, psw, pcw, campaignWeeks, weeksToDeadline,
    capBySvc, capByCity, cityStats, totalByCity, refLine,
    hubCapDay, hubPeak, hubAvg: hubDaysCnt ? hubSum / hubDaysCnt : 0,
    hubQueuePeak, hubQueueEnd: hubQueue, hubQueueSeries, hubLoadSeries: hubLoad,
    stockSeries, queueSeries, doneSeries, starvedSeries, starvedDays
  };
}

/* ---------- критические события прогона ---------- */
function analyzeEvents(sc, res) {
  const ev = [];
  const dstr = i => fmtDM(addDays(res.monday0, i));
  // голодание регионов: эпизоды простоя (разрывы ≤ 3 дн склеиваются, эпизод от 3 дн)
  sc.cities.filter(c => !c.hub).forEach(c => {
    const s = res.starvedSeries[c.id]; if (!s) return;
    let ep = [];
    const flush = () => {
      if (ep.length >= 3) ev.push({ day: ep[0], sev: 'crit', kind: 'starve', cityId: c.id,
        text: `${c.name}: встал без бамперов — ${ep.length} дн простоя с ${dstr(ep[0])}` });
      ep = [];
    };
    for (let i = 0; i < res.nDays; i++) {
      if (!s[i]) continue;
      if (ep.length && i - ep[ep.length - 1] > 3) flush();
      ep.push(i);
    }
    flush();
  });
  // очередь хабов выше дневной мощности
  if (isFinite(res.hubCapDay)) {
    let over = false;
    for (let i = 0; i <= res.deadlineIdx && i < res.nDays; i++) {
      if (!over && res.hubQueueSeries[i] > res.hubCapDay) {
        over = true;
        ev.push({ day: i, sev: 'crit', kind: 'hub',
          text: `Хабы захлебнулись: очередь ${Math.round(res.hubQueueSeries[i])} бамперов при мощности ${Math.round(res.hubCapDay)}/день` });
      }
      if (over && res.hubQueueSeries[i] <= res.hubCapDay / 2) over = false;
    }
  }
  // города, укомплектованные полностью
  sc.cities.forEach(c => {
    const dem = res.totalByCity[c.id]; if (dem <= 0) return;
    const s = res.doneSeries[c.id];
    for (let i = 0; i < res.nDays; i++) {
      if (s[i] >= dem - 1e-6) {
        ev.push({ day: i, sev: i <= res.deadlineIdx ? 'good' : 'warn', kind: 'done', cityId: c.id,
          text: `${c.name}: парк оснащён полностью${i > res.deadlineIdx ? ' — но после дедлайна' : ''}` });
        break;
      }
    }
  });
  // дедлайн и финиш
  const pct = res.totalDemand ? res.doneByDeadline / res.totalDemand : 0;
  ev.push({ day: res.deadlineIdx, sev: pct >= 1 - 1e-9 ? 'good' : pct >= 0.9 ? 'warn' : 'crit', kind: 'deadline',
    text: `Дедлайн: оснащено ${Math.round(res.doneByDeadline)} из ${Math.round(res.totalDemand)} (${Math.round(pct * 100)}%)` });
  if (!res.finishDate) {
    ev.push({ day: res.nDays - 1, sev: 'crit', kind: 'finish',
      text: `Даже к горизонту симуляции остаётся ${Math.round(res.totalDemand - res.doneCum[res.nDays - 1])} машин` });
  }
  ev.sort((a, b) => a.day - b.day || (a.sev === 'crit' ? -1 : 1));
  ev.forEach(e => e.date = dstr(e.day));
  return ev;
}

/* ---------- последний допустимый старт партнёра ----------
   Пробные прогоны по понедельникам: до какой даты слот svcId может стартовать,
   чтобы его город всё же успел к дедлайну. null — город не успевает даже
   при старте с первого дня. */
function latestStart(sc, svcId, include) {
  const s0 = sc.services.find(x => x.id === svcId);
  if (!s0) return null;
  const trial = JSON.parse(JSON.stringify(sc));
  const ts = trial.services.find(x => x.id === svcId);
  const day0 = parseD(sc.calendar.simStart);
  const deadline = parseD(sc.calendar.deadline);
  const cands = [day0];
  for (let m = addDays(mondayOf(day0), 7); m <= deadline; m = addDays(m, 7)) cands.push(m);
  let best = null;
  for (const d of cands) {
    ts.readyDate = d2s(d);
    const r = runSim(trial, include ? { include } : undefined);
    if (r.cityStats[s0.cityId].leftAtDeadline < 0.5) best = d;
    else break; // позже — только хуже
  }
  return best;
}

/* экспорт для node-теста */
if (typeof module !== 'undefined') {
  module.exports = { DEFAULT_SCENARIO, runSim, capacityOf, perCarReq, analyzeEvents, latestStart, svcStatus, parseD, d2s, addDays, mondayOf, fmtDM, MONTH_COLS };
}

