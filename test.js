'use strict';
/* Численная валидация расчётного ядра на контрольном (базовом) сценарии.
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

/* ---------- 1. Требования на машину ---------- */
const sc = clone(E.DEFAULT_SCENARIO);
const req = E.perCarReq(sc);
check('Нормо-часы на машину ≈ 12,5', Math.abs(req.mh - 12.5) < 0.01, req.mh.toFixed(2));
check('Подъемное время ≈ 2,83 ч', Math.abs(req.lift - 170 / 60) < 0.01, req.lift.toFixed(3));

/* ---------- 2. Референсная линия ---------- */
const refLine = { posts: 2, lifts: 1, mechanics: 5, shiftHours: 8 };
const cap = E.capacityOf(sc, refLine, 1);
check('Референсная линия ≈ 2,4 маш/день', Math.abs(cap.cap - 2.4) < 0.01, cap.cap.toFixed(3));
check('Узкое место референсной линии — подъемники', cap.binding === 'подъемники', cap.binding);

/* Кривая обучения ×1,5 режет мощность в 1,5 раза */
const capL = E.capacityOf(sc, refLine, sc.process.learnFactor);
check('Обучение ×1,5 → мощность ÷1,5', Math.abs(capL.cap - cap.cap / 1.5) < 1e-9, capL.cap.toFixed(3));

/* ---------- 3. Прогон: фонд 50 (базовый) ---------- */
const r50 = E.runSim(sc);
const pct50 = r50.doneByDeadline / r50.totalDemand;
check('Парк базового сценария = 2250', r50.totalDemand === 2250, r50.totalDemand);
check('Фонд 50: к дедлайну заметно меньше парка (< 80%)', pct50 < 0.80, (pct50 * 100).toFixed(1) + '%');

const nonHub = sc.cities.filter(c => !c.hub);
const starvedCities50 = nonHub.filter(c => r50.starvedDays[c.id] > 30).length;
check('Фонд 50: голодание во всех регионах (> 30 дн простоя)', starvedCities50 === nonHub.length,
  starvedCities50 + ' из ' + nonHub.length);

/* Темп региона к концу кампании падает сильно ниже мощности (2–5 маш/нед вместо 12 на линию) */
const weeks = r50.campaignWeeks;
const lastW = weeks[weeks.length - 1].w;
const nnLate50 = (r50.pcw['nn'][lastW - 1] + r50.pcw['nn'][lastW]) / 2; // 2 линии × 12 маш/нед = 24
check('Фонд 50: НН в конце кампании < 8 маш/нед на линию', nnLate50 / 2 < 8, (nnLate50 / 2).toFixed(1) + ' маш/нед·линию');

/* ---------- 4. Прогон: фонд 350 ---------- */
const sc350 = clone(E.DEFAULT_SCENARIO);
sc350.bumpers.initialPool = 350;
const r350 = E.runSim(sc350);
const pct350 = r350.doneByDeadline / r350.totalDemand;
check('Фонд 350: к дедлайну ~92% парка (90–95%)', pct350 > 0.90 && pct350 < 0.95, (pct350 * 100).toFixed(1) + '%');

const starvedTot50 = Object.values(r50.starvedDays).reduce((a, b) => a + b, 0);
const starvedTot350 = Object.values(r350.starvedDays).reduce((a, b) => a + b, 0);
check('Фонд 350: голодание практически нулевое (< 5% от фонда 50)', starvedTot350 < starvedTot50 * 0.05,
  starvedTot350 + ' дн против ' + starvedTot50 + ' дн');

/* При фонде 350 регионы работают на полную мощность в середине кампании */
const midW = weeks[Math.floor(weeks.length / 2)].w;
check('Фонд 350: НН в середине кампании на полной мощности (≈24/нед)', Math.abs(r350.pcw['nn'][midW] - 24) < 0.5,
  r350.pcw['nn'][midW].toFixed(1));

/* ---------- 5. Брак вымывает фонд ---------- */
const nonHubDemand = nonHub.reduce((a, c) => a + c.demand.reduce((x, y) => x + y, 0), 0);
const scrapLoss = nonHubDemand * sc.bumpers.scrapPct / 100;
check('Региональный парк ≈ 900 машин', Math.abs(nonHubDemand - 900) < 50, nonHubDemand);
check('Брак 10% съедает ~90 бамперов (больше фонда 50)', scrapLoss > sc.bumpers.initialPool,
  scrapLoss.toFixed(0) + ' шт при фонде ' + sc.bumpers.initialPool);

/* ---------- 6. Мощность хабов — реальное ограничение ---------- */
check('Хабы по умолчанию: 10 постов → 40 бамп/день', Math.abs(r50.hubCapDay - 40) < 0.01, r50.hubCapDay.toFixed(1));
check('Дефолтных постов хватает: пик очереди хаба мал', r350.hubQueuePeak < 30, r350.hubQueuePeak.toFixed(0) + ' шт');

const scHub = clone(E.DEFAULT_SCENARIO);
scHub.bumpers.initialPool = 350;
scHub.bumpers.hubPosts = 6;
const rHub = E.runSim(scHub);
const pctHub = rHub.doneByDeadline / rHub.totalDemand;
check('6 постов при фонде 350: хаб душит кампанию (< 85%)', pctHub < 0.85, (pctHub * 100).toFixed(1) + '%');
check('6 постов: большая очередь бамперов на хабе (> 200)', rHub.hubQueuePeak > 200, rHub.hubQueuePeak.toFixed(0) + ' шт');

/* ---------- 7. Мск и СПб впритык ---------- */
const spb = r50.cityStats['spb'];
check('СПб: мощность ≈ 84 маш/нед', Math.abs(spb.capWeekly - 84) < 1, spb.capWeekly.toFixed(1));
check('СПб: потребность ≈ 87,5 маш/нед', Math.abs(spb.needWeekly - 87.5) < 1, spb.needWeekly.toFixed(1));
const msk = r50.cityStats['msk'];
check('Мск: мощность ниже потребности (впритык)', msk.capWeekly < msk.needWeekly && (msk.needWeekly - msk.capWeekly) / msk.needWeekly < 0.10,
  msk.capWeekly.toFixed(1) + ' < ' + msk.needWeekly.toFixed(1) + ' маш/нед');

/* ---------- 8. Статусы партнёров и два сценария ---------- */
const scS = clone(E.DEFAULT_SCENARIO);
scS.services.filter(s => s.cityId === 'spb').forEach(s => s.status = 'search');
const rFact = E.runSim(scS, { include: new Set(['active']) });
check('Факт-сценарий: позиции поиска исключены (СПб = 0 маш/нед)', rFact.capByCity['spb'] === 0, rFact.capByCity['spb']);
const rPlan = E.runSim(scS);
check('План-сценарий: позиции поиска включены (СПб ≈ 84)', Math.abs(rPlan.capByCity['spb'] - 84) < 1, rPlan.capByCity['spb'].toFixed(1));
check('Факт хуже плана', rFact.doneByDeadline < rPlan.doneByDeadline - 100,
  rFact.doneByDeadline.toFixed(0) + ' < ' + rPlan.doneByDeadline.toFixed(0));

/* ---------- 9. События и «старт не позже» ---------- */
const evs = E.analyzeEvents(sc, r50);
check('События: дедлайн, голодание и перегруз в ленте',
  evs.some(e => e.kind === 'deadline') && evs.some(e => e.kind === 'starve'), evs.length + ' событий');
check('События отсортированы по дням', evs.every((e, i) => !i || e.day >= evs[i - 1].day));

const scL = clone(E.DEFAULT_SCENARIO);
scL.bumpers.initialPool = 350;
const lsSmall = E.latestStart(scL, 's20'); // Казань: одна линия, запас мощности
check('«Старт не позже» для города с запасом — позже старта кампании',
  lsSmall && E.d2s(lsSmall) > scL.calendar.simStart, lsSmall ? E.d2s(lsSmall) : 'null');
const lsSpb = E.latestStart(clone(E.DEFAULT_SCENARIO), 's4'); // СПб впритык
check('«Старт не позже» для города впритык — null (не успевает)', lsSpb === null, lsSpb ? E.d2s(lsSpb) : 'null');

/* ---------- итог ---------- */
console.log(failed ? `\n${failed} проверок провалено — регрессия ядра!` : '\nВсе проверки пройдены.');
process.exit(failed ? 1 : 0);
