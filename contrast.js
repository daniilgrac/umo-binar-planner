'use strict';
/* WCAG-аудит контраста ключевых пар «текст × фон» интерфейса.
   Правило: обычный текст ≥ 4.5:1 (AA), крупный/жирный и UI-компоненты ≥ 3:1.
   Плюс потолок: основной текст ≤ 10:1 — контраст осознанно смягчён,
   чтобы тёмная тема не «выжигала глаза» (просьба пользователя: диапазон ~5–8).
   Запуск: node contrast.js */

function lum(hex) {
  const c = hex.replace('#', '');
  const ch = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
// rgba-заливка поверх базового фона → итоговый hex
function over(rgba, alpha, baseHex) {
  const base = [1, 3, 5].map(i => parseInt(baseHex.slice(i, i + 2), 16));
  const mix = rgba.map((v, i) => Math.round(v * alpha + base[i] * (1 - alpha)));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
}

const BG = '#0A0B0D', PANEL = '#14161A', PANEL2 = '#191C21', INPUT = '#0E141B';
const TEXT = '#A6ACB4', TEXT2 = '#8A9099', WARM = '#D9AC3B', MID = '#FF8A00',
  ACTION = '#FC3F1D', ACTION_BG = '#CE3212', FAILTXT = '#FF6B4D', COLDL = '#9FB0C2';

const pairs = [
  // [название, fg, bg, минимум, максимум?]
  ['Основной текст на фоне', TEXT, BG, 4.5, 10],
  ['Основной текст на панели', TEXT, PANEL, 4.5, 10],
  ['Основной текст на карточке', TEXT, PANEL2, 4.5, 10],
  ['Основной текст в полях ввода', TEXT, INPUT, 4.5, 10],
  ['Вторичный текст на панели', TEXT2, PANEL, 4.5],
  ['Вторичный текст на фоне', TEXT2, BG, 4.5],
  ['Подписи полей (холодные)', COLDL, PANEL, 4.5],
  ['Тёплый акцентный текст', WARM, PANEL, 4.5],
  ['Тёплый текст на строке города', WARM, '#181B20', 4.5],
  ['Оранжевый текст (--mid)', MID, PANEL, 4.5],
  ['Красный текст (--action)', ACTION, PANEL, 4.5],
  ['Красный текст дефицита', FAILTXT, PANEL2, 4.5],
  ['Белый на залитой красной плашке', '#FFFFFF', ACTION_BG, 4.5],
  ['Приглушённые ячейки таблиц', '#868C94', BG, 4.5],
  ['Точки пустых квот', '#7E848C', PANEL2, 3],
  ['Подписи осей графиков', TEXT2, PANEL, 4.5],
  ['Подписи узлов карты', TEXT2, PANEL, 4.5],
  ['Счётчики узлов карты', '#D9AC3B', PANEL, 4.5],
  ['Чип «успеваем»', WARM, over([255, 201, 61], 0.08, '#0D0F12'), 4.5],
  ['Чип «на грани»', MID, over([255, 138, 0], 0.07, '#0D0F12'), 4.5],
  ['Чип «не успеваем»', FAILTXT, over([252, 63, 29], 0.08, '#0D0F12'), 4.5],
  ['Gantt: текст в самой горячей ячейке', '#CDD2D9', over([255, 138, 0], 0.35, PANEL2), 4.5],
  ['Статус «найти» в селекте', FAILTXT, INPUT, 4.5],
  ['Кнопки на панели', TEXT, PANEL2, 4.5],
  ['Фокус-рамка (UI ≥3)', MID, BG, 3],
  ['Границы полей ввода (UI ≥3)', '#354554', INPUT, 1.2] // декоративная граница при холодном фоне поля
];

let failed = 0;
for (const [name, fg, bg, min, max] of pairs) {
  const r = ratio(fg, bg);
  const okMin = r >= min - 0.05;
  const okMax = !max || r <= max + 0.05;
  if (!okMin || !okMax) failed++;
  console.log(`${okMin && okMax ? 'OK  ' : 'FAIL'} ${name}: ${r.toFixed(2)}:1 (мин ${min}${max ? ', макс ' + max : ''})`);
}
console.log(failed ? `\n${failed} пар вне нормы!` : '\nКонтраст: WCAG AA соблюдён, потолок «мягкой» темы не превышен.');
process.exit(failed ? 1 : 0);
