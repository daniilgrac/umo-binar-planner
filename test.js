'use strict';
/* Численная валидация расчётного ядра на контрольных сценариях.
   Ориентиры — раздел «Известные результаты симуляции» в CLAUDE.md.
   Запуск: node test.js */

const E = require('./src/engine.js');

let failed = 0;
function check(name, cond, actual) {
  const mark = cond ? 'OK  ' : 'FAIL';
  if (!cond) failed++;
  console.log(`${mark} ${name}${actual !== undefined ? ' — факт: ' + actual : ''}`);
}
const clone = o => JSON.parse(JSON.stringify(o));

/* контрольный сценарий: исторический сид из 24 работающих линий */
function seeded() {
  const sc = clone(E.DEFAULT_SCENARIO);
  const plan = { msk: 3, spb: 7, nn: 2, ekb: 2 };
  let n = 0;
  for (const c of sc.cities) {
    const k = plan[c.id] || 1;
    for (let i = 1; i <= k; i++) sc.services.push({
      id: 's' + (++n), cityId: c.id, name: 'Сервис ' + i, status: 'active',
      posts: 2, lifts: 1, mechanics: 5, daysPerWeek: 5, shiftHours: 8, readyDate: '2026-09-01'
    });
  }
  return sc;
}

/* ---------- 1. Требования на машину и мощности ---------- */
const sc = seeded();
const req = E.perCarReq(sc);
check('Нормо-часы на машину ≈ 12,5', Math.abs(req.mh - 12.5) < 0.01, req.mh.toFixed(2));
check('Подъемное время ≈ 2,83 ч', Math.abs(req.lift - 170 / 60) < 0.01, req.lift.toFixed(3));

const refLine = { posts: 2, lifts: 1, mechanics: 5, shiftHours: 8 };
const cap = E.capacityOf(sc, refLine, 1);
check('Референсная линия ≈ 2,4 маш/день', Math.abs(cap.cap - 2.4) < 0.01, cap.cap.toFixed(3));
check('Узкое место референсной линии — подъемники', cap.binding === 'подъемники', cap.binding);
const capL = E.capacityOf(sc, refLine, sc.process.learnFactor);
check('Обучение ×1,5 → мощность ÷1,5', Math.abs(capL.cap - cap.cap / 1.5) < 1e-9, capL.cap.toFixed(3));

const avg = E.capacityOf(sc, sc.avgService, 1);
check('Средний сервис ≈ 2,2 маш/день, 10,9 маш/нед (узкое — механики)',
  Math.abs(avg.cap - 2.18) < 0.05 && avg.binding === 'механики' && sc.avgService.daysPerWeek === 5,
  avg.cap.toFixed(2) + ' · ' + avg.binding);

/* ---------- 2. Контрольный прогон (24 линии, бампера не ограничивают) ---------- */
const r = E.runSim(sc);
check('Парк = 2250', r.totalDemand === 2250, r.totalDemand);
check('К дедлайну ~92% парка', Math.abs(100 * r.doneByDeadline / r.totalDemand - 92.3) < 1,
  (100 * r.doneByDeadline / r.totalDemand).toFixed(1) + '%');
check('СПб впритык: мощность ≈ 84 при потребности ≈ 87,5',
  Math.abs(r.cityStats.spb.capWeekly - 84) < 1 && Math.abs(r.cityStats.spb.needWeekly - 87.5) < 1,
  r.cityStats.spb.capWeekly.toFixed(1) + ' / ' + r.cityStats.spb.needWeekly.toFixed(1));
check('Мск впритык: 36 при потребности 36,8',
  r.cityStats.msk.capWeekly < r.cityStats.msk.needWeekly, r.cityStats.msk.capWeekly.toFixed(1));

/* ---------- 3. Задание хабам ---------- */
check('Пик подготовки ≈ 47 бамп/день', Math.abs(r.hubPeak - 47.4) < 2, r.hubPeak.toFixed(1));
check('Постов под пик ≈ 12', Math.abs(r.hubPostsNeed - 12) <= 1, r.hubPostsNeed);
check('Оборотный фонд ≈ 148 шт', Math.abs(r.requiredPool - 148) < 10, r.requiredPool.toFixed(0));
check('Брак 10% на ~900 региональных ≈ 90 шт закупки', Math.abs(r.scrapLoss - 90) < 5, r.scrapLoss.toFixed(0));
const taskSum = sc.cities.reduce((a, c) => a + (r.taskCW[c.id] || []).reduce((x, y) => x + y, 0), 0);
check('Недельное задание покрывает все установки кампании', taskSum >= r.doneByDeadline - 1,
  taskSum.toFixed(0) + ' ≥ ' + r.doneByDeadline.toFixed(0));

/* ---------- 4. Статусы и два сценария ---------- */
const scS = seeded();
scS.services.filter(s => s.cityId === 'spb').forEach(s => s.status = 'search');
const rFact = E.runSim(scS, { include: new Set(['active']) });
check('Факт-сценарий: позиции поиска исключены (СПб = 0)', rFact.capByCity.spb === 0, rFact.capByCity.spb);
const rPlan = E.runSim(scS);
check('План-сценарий: позиции поиска включены (СПб ≈ 84)', Math.abs(rPlan.capByCity.spb - 84) < 1, rPlan.capByCity.spb.toFixed(1));
check('Факт хуже плана', rFact.doneByDeadline < rPlan.doneByDeadline - 100,
  rFact.doneByDeadline.toFixed(0) + ' < ' + rPlan.doneByDeadline.toFixed(0));

/* ---------- 5. Автоплан от пустого реестра ---------- */
const scA = clone(E.DEFAULT_SCENARIO);
E.planServices(scA);
const rA = E.runSim(scA);
check('Автоплан: ~28 позиций поиска', Math.abs(scA.services.length - 28) <= 3, scA.services.length);
check('Автоплан: все позиции — search', scA.services.every(s => E.svcStatus(s) === 'search'));
check('Автоплан закрывает парк к дедлайну', rA.doneByDeadline >= rA.totalDemand - 0.5,
  rA.doneByDeadline.toFixed(0) + ' / ' + rA.totalDemand);
check('Автоплан: СПб ≈ 9 позиций', Math.abs(scA.services.filter(s => s.cityId === 'spb').length - 9) <= 1,
  scA.services.filter(s => s.cityId === 'spb').length);

// повторный план не трогает работающих
const scK = seeded();
scK.services.forEach((s, i) => { if (i % 2) s.status = 'search'; });
const activeIds = scK.services.filter(s => E.svcStatus(s) === 'active').map(s => s.id);
E.planServices(scK);
check('Переплан: работающие партнёры не тронуты',
  activeIds.every(id => scK.services.some(s => s.id === id)), activeIds.length + ' сохранены');

/* ---------- 6. События и «старт не позже» ---------- */
const evs = E.analyzeEvents(sc, r);
check('События: дедлайн и пик хабов в ленте',
  evs.some(e => e.kind === 'deadline') && evs.some(e => e.kind === 'hubpeak'), evs.length + ' событий');
check('События отсортированы по дням', evs.every((e, i) => !i || e.day >= evs[i - 1].day));
const scB = seeded();
scB.services = scB.services.filter(s => s.cityId !== 'krsk');
const evB = E.analyzeEvents(scB, E.runSim(scB));
check('Событие-затор для города без партнёров', evB.some(e => e.kind === 'backlog' && e.cityId === 'krsk'));

const ls = E.latestStart(seeded(), 's20'); // Казань: одна линия с запасом
check('«Старт не позже» для города с запасом — позже старта', ls && E.d2s(ls) > sc.calendar.simStart,
  ls ? E.d2s(ls) : 'null');
const lsSpb = E.latestStart(seeded(), 's4'); // СПб впритык
check('«Старт не позже» для города впритык — null', lsSpb === null, lsSpb ? E.d2s(lsSpb) : 'null');

/* ---------- итог ---------- */
console.log(failed ? `\n${failed} проверок провалено — регрессия ядра!` : '\nВсе проверки пройдены.');
process.exit(failed ? 1 : 0);
