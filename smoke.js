'use strict';
/* Smoke-тест собранного umo-binar-planner.html через jsdom:
   рендер вкладок и KPI, живой пересчёт на input-событиях,
   добавление/удаление сервиса.
   Запуск: node smoke.js 2>&1 | grep -v "Could not parse CSS" */

const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/umo-binar-planner.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously' });
const { window } = dom;
const { document } = window;

let failed = 0;
function check(name, cond, actual) {
  if (!cond) failed++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${actual !== undefined ? ' — ' + actual : ''}`);
}
const $ = s => document.querySelector(s);
const txt = s => ($(s) ? $(s).textContent.trim() : '(нет элемента)');
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

/* debounce пересчёта — 150 мс, поэтому шаги через setTimeout */
const steps = [];
function step(fn) { steps.push(fn); }
function run(i) {
  if (i >= steps.length) {
    console.log(failed ? `\n${failed} проверок провалено!` : '\nSmoke-тест пройден.');
    process.exit(failed ? 1 : 0);
  }
  steps[i]();
  setTimeout(() => run(i + 1), 250);
}

/* ---------- 1. стартовый рендер ---------- */
step(() => {
  check('4 вкладки', document.querySelectorAll('.tab').length === 4);
  check('KPI «Парк кампании» заполнен', txt('#kpiTotal') !== '—' && txt('#kpiTotal') !== '', txt('#kpiTotal'));
  check('Парк = 2 250', txt('#kpiTotal').replace(/ |\s/g, '') === '2250', txt('#kpiTotal'));
  check('Светофоры «Факт» и «С поиском» рассчитаны',
    !txt('#chipFact').includes('—') && !txt('#chipPlan').includes('—'),
    txt('#chipFact') + ' | ' + txt('#chipPlan'));
  check('Тепловая полоса заполнена', $('#heatFill').style.width !== '0' && $('#heatFill').style.width !== '', $('#heatFill').style.width);
  check('Таблица парка отрендерена', document.querySelectorAll('#demandBox input[type=number]').length > 0);
  check('Сервисы отрендерены (24 линии)', document.querySelectorAll('[data-svcrow]').length === 24,
    document.querySelectorAll('[data-svcrow]').length);
  check('Рекомендации на «Плане» есть', document.querySelectorAll('#recsBox .rec').length > 0);
  check('Квоты по неделям есть', document.querySelectorAll('#quotaBox td').length > 0);
  check('Проверка расчёта заполнена', txt('#verifyBox').includes('маш/день'));
  check('Календарь: редактируем только дедлайн', !!document.querySelector('input[data-bind="calendar.deadline"]') &&
    document.querySelectorAll('#calBox input').length === 1);
  check('Поле «постов на хабах» есть', !!document.querySelector('input[data-bind="bumpers.hubPosts"]'));
  check('Выработка — в «Тонких настройках»', !!document.querySelector('#fineBox input[data-bind="process.efficiency"]'));
  check('Таблицы китов больше нет', !document.getElementById('kitsBox'));
  check('Легенда «вводные/расчёт» есть', !!document.querySelector('.io-legend'));
  check('Дашборд: карточки городов', document.querySelectorAll('#dashCities .citycard').length === 14,
    document.querySelectorAll('#dashCities .citycard').length);
  check('Дашборд: темп vs мощность', document.querySelectorAll('#dashPace .pace-row').length === 14);
  check('Дашборд: Gantt сервисов', document.querySelectorAll('#dashGantt td').length > 100);
  check('Дашборд: графики хабов и фонда (SVG)', !!document.querySelector('#dashHub svg') && !!document.querySelector('#dashPool svg'));
  check('Симуляция: карта с узлами городов', document.querySelectorAll('#simSvg [data-count]').length === 14,
    document.querySelectorAll('#simSvg [data-count]').length);
  check('Симуляция: маршруты к хабам', document.querySelectorAll('#simSvg .route').length === 12);
  check('Симуляция: readout заполнен', txt('#simReadout').includes('оснащено'));
  check('Реестр: у каждого партнёра есть статус', document.querySelectorAll('select.status-sel').length === 24);
  check('Лента событий заполнена', document.querySelectorAll('#evList .ev').length > 3,
    document.querySelectorAll('#evList .ev').length);
  check('Кнопка выгрузки .xlsx есть', !!$('#btnXlsx'));
  check('Переключатель сценария есть', document.querySelectorAll('#viewSeg button').length === 2);
});

/* ---------- статусы и сценарии ---------- */
step(() => {
  // переводим один СПб-сервис в «найти» — факт должен просесть
  const sel = document.querySelector('select.status-sel');
  sel.value = 'search';
  fire(sel, 'input');
});
step(() => {
  const factTxt = txt('#chipFact'), planTxt = txt('#chipPlan');
  check('Статус «найти»: факт и план разошлись', factTxt !== planTxt.replace('С поиском', 'Факт'), factTxt + ' | ' + planTxt);
  check('«Старт не позже» посчитан для позиции поиска',
    document.querySelectorAll('[data-latest]')[0].textContent.length > 0,
    document.querySelectorAll('[data-latest]')[0].textContent);
  // переключение сценария меняет KPI
  const doneBefore = txt('#kpiDone');
  document.querySelector('#viewSeg [data-view="fact"]').click();
  check('Сценарий «Факт»: KPI пересчитался', txt('#kpiDone') !== doneBefore, doneBefore + ' → ' + txt('#kpiDone'));
  document.querySelector('#viewSeg [data-view="plan"]').click();
  const sel = document.querySelector('select.status-sel');
  sel.value = 'active';
  fire(sel, 'input');
});

/* ---------- xlsx ---------- */
step(() => {
  window.URL.createObjectURL = () => 'blob:test';
  window.URL.revokeObjectURL = () => {};
  let ok = true, err = '';
  try { window.exportXlsx(); } catch (e) { ok = false; err = e.message; }
  check('exportXlsx отрабатывает без ошибок', ok, err);
  const blob = window.zipStore([{ name: 'test.xml', data: '<a/>' }]);
  check('zipStore возвращает Blob', blob && blob.size > 60, blob && blob.size);
  check('sheetXML строит валидную строку', window.sheetXML([['а', 1]]).includes('<row r="1">'));
});

/* ---------- скраббер симуляции ---------- */
step(() => {
  const scrub = $('#simScrub');
  scrub.value = String(+scrub.max);
  fire(scrub, 'input');
  const doneTxt = txt('#simReadout');
  check('Скраббер: перемотка в конец меняет кадр', doneTxt.includes('%') && !doneTxt.startsWith('оснащено 0'), doneTxt.slice(0, 60));
  const mskCnt = document.querySelector('[data-count="msk"]').textContent;
  check('Скраббер: счётчик Москвы в конце > 0', /^[1-9]/.test(mskCnt), mskCnt);
});

/* ---------- 2. живой пересчёт: правим парк Москвы ---------- */
let kpiBefore;
step(() => {
  kpiBefore = txt('#kpiTotal');
  const inp = document.querySelector('input[data-city="msk"][data-cf="demand0"]');
  inp.value = String(+inp.value + 100);
  fire(inp, 'input');
});
step(() => {
  check('Пересчёт на input: парк вырос на 100',
    txt('#kpiTotal').replace(/ |\s/g, '') === '2350', kpiBefore + ' → ' + txt('#kpiTotal'));
});

/* ---------- 3. живой пересчёт: параметр по data-bind ---------- */
step(() => {
  const inp = document.querySelector('input[data-bind="bumpers.initialPool"]');
  inp.value = '350';
  fire(inp, 'input');
});
step(() => {
  check('Пересчёт фонда: подсказка обновилась', txt('#hintBump').includes('350'), txt('#hintBump'));
});

/* ---------- 4. добавление и удаление сервиса ---------- */
let svcCount;
step(() => {
  svcCount = document.querySelectorAll('[data-svcrow]').length;
  document.querySelector('[data-add="krsk"]').click();
});
step(() => {
  check('Добавление сервиса: строк стало больше',
    document.querySelectorAll('[data-svcrow]').length === svcCount + 1,
    svcCount + ' → ' + document.querySelectorAll('[data-svcrow]').length);
  const delBtns = document.querySelectorAll('[data-del]');
  delBtns[delBtns.length - 1].click();
});
step(() => {
  check('Удаление сервиса: строк снова исходно',
    document.querySelectorAll('[data-svcrow]').length === svcCount,
    document.querySelectorAll('[data-svcrow]').length);
});

/* ---------- 5. переключение вкладок ---------- */
step(() => {
  document.querySelector('[data-tab="partners"]').click();
  check('Вкладка «Партнёры и план» активна', $('#tab-partners').classList.contains('active'));
  check('Вкладка «Вводные» скрыта', !$('#tab-inputs').classList.contains('active'));
});

run(0);
