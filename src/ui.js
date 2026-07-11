'use strict';
/* ============ UI-СЛОЙ ============ */

let SCENARIO = JSON.parse(JSON.stringify(DEFAULT_SCENARIO));
let SIM = null;

const $ = s => document.querySelector(s);
const fmtI = n => Math.round(n).toLocaleString('ru-RU');
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt2 = n => (Math.round(n * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const RU_D = d => { const p = n => String(n).padStart(2, '0'); return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + '.' + String(d.getUTCFullYear()).slice(2); };

function setPath(obj, path, val) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = val;
}

/* ---------- рендер форм ---------- */
function renderCalendar() {
  const c = SCENARIO.calendar;
  $('#calBox').innerHTML = `
    <div class="frow">
      <div class="f"><label>Старт кампании</label><div class="fixed">01.09.2026 · зафиксирован</div></div>
      <div class="f"><label>Дедлайн — успеть к дате</label><input type="date" data-bind="calendar.deadline" value="${c.deadline}"></div>
    </div>
    <div class="note">Старт зашит: под него свёрстан график поставок машин. Единственный рычаг здесь — дедлайн. Горизонт симуляции — дедлайн + 6 недель, праздник 4 ноября учтён автоматически.</div>`;
}

function renderDemand() {
  const rows = SCENARIO.cities.map(c => {
    const tot = c.demand.reduce((a, b) => a + (+b || 0), 0);
    return `<tr>
      <td class="t">${esc(c.name)}</td>
      <td style="text-align:center"><input type="checkbox" data-city="${c.id}" data-cf="hub" ${c.hub ? 'checked' : ''} title="В городе есть центр нарезки бамперов"></td>
      <td><input type="number" min="0" data-city="${c.id}" data-cf="transitDays" value="${c.transitDays}" style="width:52px" ${c.hub ? 'disabled' : ''}></td>
      ${[0, 1, 2, 3].map(i => `<td><input type="number" min="0" data-city="${c.id}" data-cf="demand${i}" value="${c.demand[i] || 0}"></td>`).join('')}
      <td class="sum" data-citytotal="${c.id}">${fmtI(tot)}</td>
    </tr>`;
  }).join('');
  $('#demandBox').innerHTML = `<table>
    <thead><tr><th>Город</th><th>Хаб</th><th>Логистика, дн</th>${MONTH_COLS.map(m => `<th>${m}</th>`).join('')}<th>Σ</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td class="t" style="color:var(--text2)">Итого</td><td></td><td></td>
      ${[0, 1, 2, 3].map(i => `<td class="sum" data-monthtotal="${i}"></td>`).join('')}
      <td class="sum" data-grandtotal></td></tr></tfoot>
  </table>`;
}

function renderProcess() {
  const p = SCENARIO.process;
  const rows = p.ops.map(op => `<tr>
    <td class="t">${esc(op.name)}</td>
    <td><input type="number" min="0" data-op="${op.id}" data-of="wallMin" value="${op.wallMin}"></td>
    <td><input type="number" min="0" data-op="${op.id}" data-of="mechanics" value="${op.mechanics}" style="width:52px"></td>
    <td style="text-align:center"><input type="checkbox" data-op="${op.id}" data-of="needsPost" ${op.needsPost ? 'checked' : ''}></td>
    <td style="text-align:center"><input type="checkbox" data-op="${op.id}" data-of="needsLift" ${op.needsLift ? 'checked' : ''}></td>
    <td data-opmh="${op.id}">${fmt2(op.wallMin / 60 * op.mechanics)}</td>
  </tr>`).join('');
  $('#procBox').innerHTML = `
    <div class="tblwrap"><table>
      <thead><tr><th>Операция</th><th>Длительность, мин</th><th>Механиков</th><th>Занимает пост</th><th>Занимает подъемник</th><th>Чел-часы</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="t" style="color:var(--text2)">Итого на машину</td><td></td><td></td><td></td><td></td><td class="sum" id="procTotal"></td></tr></tfoot>
    </table></div>
    <div class="note">Выработка сервисов и кривая обучения — в «Тонких настройках» ниже.</div>`;
}

function renderFine() {
  const p = SCENARIO.process;
  $('#fineBox').innerHTML = `
    <div class="frow">
      <div class="f"><label>Выработка сервисов, %</label><input type="number" min="10" max="120" data-bind="process.efficiency" value="${p.efficiency}"></div>
      <div class="f"><label>Кривая обучения: первые N машин</label><input type="number" min="0" data-bind="process.learnFirstN" value="${p.learnFirstN}"></div>
      <div class="f"><label>Коэффициент обучения, ×</label><input type="number" min="1" step="0.1" data-bind="process.learnFactor" value="${p.learnFactor}"></div>
    </div>
    <div class="note">Выработка растягивает и человеко-часы, и занятость постов/подъемников: работа медленнее нормы держит ресурс дольше. Первые N машин каждый сервис работает в K раз медленнее — разгон команды.</div>`;
}

function renderBumpers() {
  const b = SCENARIO.bumpers;
  $('#bumpBox').innerHTML = `
    <div class="frow">
      <div class="f"><label>Стартовый обменный фонд, шт</label><input type="number" min="0" data-bind="bumpers.initialPool" value="${b.initialPool}"></div>
      <div class="f"><label>Постов на хабах Мск+СПб, шт</label><input type="number" min="0" data-bind="bumpers.hubPosts" value="${b.hubPosts}"></div>
      <div class="f"><label>Подготовка бампера, нч</label><input type="number" min="0" step="0.5" data-bind="bumpers.prepManHours" value="${b.prepManHours}"></div>
      <div class="f"><label>Отбраковка б/у бамперов, %</label><input type="number" min="0" max="100" data-bind="bumpers.scrapPct" value="${b.scrapPct}"></div>
      <div class="f"><label>Рабочих дней хаба в неделю</label><input type="number" min="1" max="7" data-bind="bumpers.hubWorkDays" value="${b.hubWorkDays}"></div>
      <div class="f"><label>Смена хаба, ч</label><input type="number" min="1" data-bind="bumpers.hubShiftHours" value="${b.hubShiftHours}"></div>
    </div>
    <div class="note" id="bumpHint" style="font-family:var(--mono)"></div>
    <div class="note" style="margin-top:6px">Схема: в городах с хабом бампер снимается, режется в тот же день (в приоритете), монтаж — на следующий рабочий день. В остальных городах машина сразу получает подготовленный бампер из обменного фонда, а её родной уезжает в хаб, готовится в остаток мощности постов и пополняет фонд. Стартовый фонд распределяется по городам пропорционально парку. Лючок вырезается из самого бампера — цветоподбор не требуется.</div>`;
}

function svcRow(s) {
  return `<tr data-svcrow="${s.id}">
    <td class="t"><input type="text" class="sname" data-sid="${s.id}" data-sf="name" value="${esc(s.name)}"></td>
    <td><input type="number" min="0" data-sid="${s.id}" data-sf="posts" value="${s.posts}" style="width:50px"></td>
    <td><input type="number" min="0" data-sid="${s.id}" data-sf="lifts" value="${s.lifts}" style="width:50px"></td>
    <td><input type="number" min="0" data-sid="${s.id}" data-sf="mechanics" value="${s.mechanics}" style="width:50px"></td>
    <td><input type="number" min="1" max="7" data-sid="${s.id}" data-sf="daysPerWeek" value="${s.daysPerWeek}" style="width:50px"></td>
    <td><input type="number" min="1" max="24" data-sid="${s.id}" data-sf="shiftHours" value="${s.shiftHours}" style="width:50px" title="Рабочих часов в день; вторая смена = 16"></td>
    <td><input type="date" data-sid="${s.id}" data-sf="readyDate" value="${s.readyDate}"></td>
    <td class="svc-cap" data-svccap="${s.id}">—</td>
    <td><button class="del" data-del="${s.id}" title="Удалить сервис">×</button></td>
  </tr>`;
}

function renderServices() {
  const byCity = {};
  SCENARIO.services.forEach(s => { (byCity[s.cityId] = byCity[s.cityId] || []).push(s); });
  $('#svcBox').innerHTML = SCENARIO.cities.map(c => {
    const list = byCity[c.id] || [];
    return `<div class="city-block">
      <div class="city-head">
        <span class="dot fail" data-citydot="${c.id}"></span>
        <span class="city-name">${esc(c.name)}</span>
        ${c.hub ? '<span class="hub-tag">ХАБ</span>' : ''}
        <span class="city-meta" data-citymeta="${c.id}"></span>
        <button class="btn mini" data-add="${c.id}" style="margin-left:auto">+ сервис</button>
      </div>
      ${list.length ? `<div class="tblwrap"><table style="width:100%">
        <thead><tr><th>Название</th><th>Посты</th><th>Подъемн.</th><th>Механики</th><th>Дн/нед</th><th>Часов/день</th><th>Готов с</th><th>Мощность — расчёт</th><th></th></tr></thead>
        <tbody>${list.map(svcRow).join('')}</tbody>
      </table></div>` : '<div class="note" style="padding:10px 14px">Сервисов нет — машины этого города копятся в очереди.</div>'}
    </div>`;
  }).join('');
}

function renderVerifySelect() {
  const sel = $('#verifySel');
  const cur = sel.value;
  sel.innerHTML = SCENARIO.services.map(s => {
    const c = SCENARIO.cities.find(x => x.id === s.cityId);
    return `<option value="${s.id}">${esc((c ? c.name : '?') + ' — ' + s.name)}</option>`;
  }).join('');
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

/* ---------- обновление расчётных значений ---------- */
function updateHeader() {
  const total = SIM.totalDemand;
  const dbd = SIM.doneByDeadline;
  const pct = total > 0 ? dbd / total : 0;
  const dl = parseD(SCENARIO.calendar.deadline);
  $('#kpiTotal').textContent = fmtI(total);
  $('#kpiDoneL').textContent = 'Оснащено к ' + RU_D(dl).slice(0, 5);
  $('#kpiDone').innerHTML = `${fmtI(dbd)} <small>· ${Math.round(pct * 100)}%</small>`;
  $('#kpiFinish').textContent = SIM.finishDate ? RU_D(SIM.finishDate) : 'после ' + RU_D(SIM.simEndDate);
  const needW = total / SIM.weeksToDeadline;
  const haveW = Object.values(SIM.capBySvc).reduce((a, x) => a + x.perWeek, 0);
  $('#kpiRate').innerHTML = `${fmtI(needW)} / <span style="color:${haveW >= needW ? 'var(--warm)' : 'var(--action)'}">${fmtI(haveW)}</span>`;
  $('#kpiHub').innerHTML = `${fmt1(SIM.hubPeak)} <small>/ ${fmt1(SIM.hubCapDay)}${SIM.hubQueuePeak > SIM.hubCapDay ? ' · <span style="color:var(--action)">очередь ' + fmtI(SIM.hubQueuePeak) + '</span>' : ''}</small>`;
  $('#heatFill').style.width = (pct * 100).toFixed(1) + '%';
  $('#heatLabel').innerHTML = `Оснащено к ${RU_D(dl)}: <b>${fmtI(dbd)}</b> из ${fmtI(total)}`;
  $('#heatPct').textContent = Math.round(pct * 100) + '%';
  const chip = $('#statusChip');
  const okFinish = SIM.finishDate && SIM.finishDate.getTime() <= dl.getTime();
  let cls, txt;
  if (okFinish) { cls = 'ok'; txt = 'Успеваем к ' + RU_D(dl).slice(0, 5); }
  else if (pct >= 0.9) { cls = 'risk'; txt = 'На грани · ' + Math.round(pct * 100) + '% к дедлайну'; }
  else { cls = 'fail'; txt = 'Не успеваем · ' + Math.round(pct * 100) + '% к дедлайну'; }
  chip.className = 'chip ' + cls;
  chip.innerHTML = '<span>' + txt + '</span>';
  $('#hintCal').textContent = SIM.weeksToDeadline.toFixed(1).replace('.', ',') + ' нед кампании';
  $('#hintDemand').textContent = fmtI(total) + ' машин';
  $('#hintSvc').textContent = SCENARIO.services.length + ' линий · ' + fmtI(haveW) + ' маш/нед';
  $('#hintBump').textContent = 'фонд ' + fmtI(SCENARIO.bumpers.initialPool) + ' шт · ' + fmt1(SIM.hubCapDay) + ' бамп/день';
  const req = perCarReq(SCENARIO);
  $('#hintProc').textContent = fmt1(req.mh) + ' нч/машину';
  $('#hintFine').textContent = SCENARIO.process.efficiency + '% · обучение ×' + SCENARIO.process.learnFactor;
}

function updateDemandTotals() {
  const mt = [0, 0, 0, 0];
  let g = 0;
  SCENARIO.cities.forEach(c => {
    const t = c.demand.reduce((a, b) => a + (+b || 0), 0);
    const cell = document.querySelector(`[data-citytotal="${c.id}"]`);
    if (cell) cell.textContent = fmtI(t);
    c.demand.forEach((v, i) => mt[i] += (+v || 0));
    g += t;
  });
  mt.forEach((v, i) => { const cell = document.querySelector(`[data-monthtotal="${i}"]`); if (cell) cell.textContent = fmtI(v); });
  const gc = document.querySelector('[data-grandtotal]'); if (gc) gc.textContent = fmtI(g);
}

function updateProcessTotals() {
  const req = perCarReq(SCENARIO);
  SCENARIO.process.ops.forEach(op => {
    const cell = document.querySelector(`[data-opmh="${op.id}"]`);
    if (cell) cell.textContent = fmt2(op.wallMin / 60 * op.mechanics);
  });
  const t = $('#procTotal'); if (t) t.textContent = fmt2(req.mh) + ' нч';
}

function cityStatusClass(cs) {
  if (cs.demand <= 0) return 'ok';
  if (cs.leftAtDeadline <= 0.5) return 'ok';
  if (cs.doneByDeadline / cs.demand >= 0.9) return 'risk';
  return 'fail';
}

function updateServiceCaps() {
  SCENARIO.services.forEach(s => {
    const cap = SIM.capBySvc[s.id];
    const cell = document.querySelector(`[data-svccap="${s.id}"]`);
    if (cell) cell.innerHTML = `<b>${fmt2(cap.perDay)}</b>/дн · <b>${fmt1(cap.perWeek)}</b>/нед · узкое: ${cap.binding}`;
  });
  SCENARIO.cities.forEach(c => {
    const cs = SIM.cityStats[c.id];
    const meta = document.querySelector(`[data-citymeta="${c.id}"]`);
    if (meta) meta.textContent = `парк ${fmtI(cs.demand)} · надо ${fmt1(cs.needWeekly)}/нед · мощность ${fmt1(cs.capWeekly)}/нед · к дедлайну ${fmtI(cs.doneByDeadline)}`;
    const dot = document.querySelector(`[data-citydot="${c.id}"]`);
    if (dot) dot.className = 'dot ' + cityStatusClass(cs);
  });
}

function updateBumperHints() {
  const backlog = SIM.hubQueuePeak > SIM.hubCapDay
    ? ` Пиковая очередь на подготовку: <span style="color:var(--action)">${fmtI(SIM.hubQueuePeak)}</span> бамперов — постов не хватает.`
    : ` Пиковая очередь на подготовку ${fmtI(SIM.hubQueuePeak)} шт — в пределах дневной мощности, постов хватает.`;
  $('#bumpHint').innerHTML =
    `Мощность хабов: <span style="color:var(--warm)">${fmt1(SIM.hubCapDay)}</span> бамперов/день (посты × смена ÷ норма). ` +
    `Фактический пик по прогону: <span style="color:var(--warm)">${fmt1(SIM.hubPeak)}</span>/день, средняя ${fmt1(SIM.hubAvg)}.` + backlog;
}

function updateVerify() {
  const sid = $('#verifySel').value;
  const s = SCENARIO.services.find(x => x.id === sid);
  if (!s) { $('#verifyBox').innerHTML = '<span class="mut">Добавьте хотя бы один сервис.</span>'; return; }
  const c = SCENARIO.cities.find(x => x.id === s.cityId);
  const d = capacityOf(SCENARIO, s, 1);
  const dl = capacityOf(SCENARIO, s, SCENARIO.process.learnFactor);
  const eff = SCENARIO.process.efficiency / 100;
  const H = s.shiftHours;
  const p = SCENARIO.process;
  const opsLine = p.ops.map(op => `${esc(op.name.split('·')[0].trim())} ${fmt2(op.wallMin / 60 * op.mechanics)}`).join(' + ');
  const mark = k => d.binding === k ? ' <span class="bind">← узкое место</span>' : '';
  $('#verifyBox').innerHTML =
    `<div class="mut">${esc((c ? c.name : '') + ' — ' + s.name)}</div>` +
    `Нормо-часы на машину: <span class="hl">${fmt2(d.req.mh)}</span> нч <span class="mut">(${opsLine})</span><br>` +
    `Механики: ${s.mechanics} × ${H} ч × ${p.efficiency}% = ${fmt1(s.mechanics * H * eff)} ч → <span class="hl">${fmt2(d.manCap)}</span> маш/день${mark('механики')}<br>` +
    `Подъемники: ${s.lifts} × ${H} ч × ${p.efficiency}% = ${fmt1(s.lifts * H * eff)} ч ÷ ${fmt2(d.req.lift)} ч/маш → <span class="hl">${fmt2(d.liftCap)}</span> маш/день${mark('подъемники')}<br>` +
    `Посты: ${s.posts} × ${H} ч × ${p.efficiency}% = ${fmt1(s.posts * H * eff)} ч ÷ ${fmt2(d.req.post)} ч/маш → <span class="hl">${fmt2(d.postCap)}</span> маш/день${mark('посты')}<br>` +
    `Мощность: <span class="hl">${fmt2(d.cap)}</span> маш/день → <span class="hl">${fmt1(d.cap * s.daysPerWeek)}</span> маш/нед (${s.daysPerWeek} дн)<br>` +
    `<span class="mut">Первые ${p.learnFirstN} машин — обучение ×${p.learnFactor}: ${fmt2(dl.cap)} маш/день</span>`;
}

/* ---------- вкладка План ---------- */
function renderRecs() {
  const recs = [];
  const refW = SIM.refLine;
  SCENARIO.cities.forEach(c => {
    const cs = SIM.cityStats[c.id];
    if (cs.demand <= 0) return;
    const services = SCENARIO.services.filter(s => s.cityId === c.id).length;
    if (!services) {
      recs.push({ cls: 'crit', html: `<b>${esc(c.name)}</b>: нет ни одного сервиса — ${fmtI(cs.demand)} машин без плана. Нужно ~${Math.max(1, Math.ceil(cs.needWeekly / refW))} линий.` });
      return;
    }
    if (cs.capWeekly < cs.needWeekly - 0.5) {
      const add = Math.ceil((cs.needWeekly - cs.capWeekly) / refW);
      recs.push({ cls: 'crit', html: `<b>${esc(c.name)}</b>: мощность ${fmt1(cs.capWeekly)} маш/нед при потребности ${fmt1(cs.needWeekly)} — добавьте ~${add} лин. (реф. линия ≈ ${fmt1(refW)} маш/нед) или вторую смену / подъемник.` });
    } else if (cs.leftAtDeadline > 0.5 && cs.starvedDays <= 5) {
      recs.push({ cls: 'warn', html: `<b>${esc(c.name)}</b>: мощности хватает, но к дедлайну остаётся ${fmtI(cs.leftAtDeadline)} маш — съедают кривая обучения и разгон. Раньше дата готовности сервисов или запас мощности.` });
    }
    if (cs.starvedDays > 5) {
      recs.push({ cls: 'crit', html: `<b>${esc(c.name)}</b>: ${cs.starvedDays} дн простоя из-за отсутствия подготовленных бамперов — увеличьте стартовый фонд или ускорьте логистику (${c.transitDays} дн в одну сторону).` });
    }
  });
  if (SIM.hubQueuePeak > SIM.hubCapDay) {
    recs.push({ cls: 'crit', html: `<b>Хабы Мск/СПб</b>: не успевают готовить бампера — пиковая очередь ${fmtI(SIM.hubQueuePeak)} шт при мощности ${fmt1(SIM.hubCapDay)}/день. Добавьте посты оснастки (сейчас ${SCENARIO.bumpers.hubPosts}) или удлините смену хаба.` });
  }
  const scrap = +SCENARIO.bumpers.scrapPct || 0;
  const nonHubDemand = SCENARIO.cities.filter(c => !c.hub).reduce((a, c) => a + c.demand.reduce((x, y) => x + (+y || 0), 0), 0);
  if (scrap > 0 && nonHubDemand > 0) {
    recs.push({ cls: 'warn', html: `Обменный фонд вымывается браком: при ${scrap}% отбраковки на ${fmtI(nonHubDemand)} региональных машин теряется ~${fmtI(nonHubDemand * scrap / 100)} бамперов. Заложите закупку новых бамперов на компенсацию.` });
  }
  if (!recs.length) recs.push({ cls: 'good', html: 'Мощности, фонд бамперов и логистика сбалансированы — кампания завершается в срок.' });
  $('#recsBox').innerHTML = recs.map(r => `<div class="rec ${r.cls}"><div>${r.html}</div></div>`).join('');
}

function renderQuotas() {
  const weeks = SIM.campaignWeeks;
  const dlW = weeks.length ? weeks[weeks.length - 1].w : 0;
  const tail = arr => { let t = 0; for (let w = dlW + 1; w < arr.length; w++) t += arr[w]; return t; };
  const head = `<tr><th>Сервис</th>${weeks.map(w => `<th>${w.label}</th>`).join('')}<th>Σ кампания</th><th>Хвост</th></tr>`;
  let body = '';
  SCENARIO.cities.forEach(c => {
    const list = SCENARIO.services.filter(s => s.cityId === c.id);
    if (!list.length && SIM.cityStats[c.id].demand <= 0) return;
    const cw = SIM.pcw[c.id] || new Float64Array(0);
    const csum = weeks.reduce((a, w) => a + (cw[w.w] || 0), 0);
    body += `<tr class="cityrow"><td>${esc(c.name)}</td>${weeks.map(w => `<td>${Math.round(cw[w.w] || 0) || ''}</td>`).join('')}<td>${fmtI(csum)}</td><td>${Math.round(tail(cw)) || ''}</td></tr>`;
    list.forEach(s => {
      const sw = SIM.psw[s.id] || new Float64Array(0);
      const ssum = weeks.reduce((a, w) => a + (sw[w.w] || 0), 0);
      body += `<tr><td class="t" style="padding-left:22px">${esc(s.name)}</td>` +
        weeks.map(w => { const v = Math.round(sw[w.w] || 0); return `<td class="${v ? 'qv' : 'q0'}">${v || '·'}</td>`; }).join('') +
        `<td class="sum">${fmtI(ssum)}</td><td>${Math.round(tail(sw)) || ''}</td></tr>`;
    });
  });
  $('#quotaBox').innerHTML = `<table>${head}${body}</table>`;
}

/* ---------- вкладка Симуляция ---------- */
// стилизованные позиции городов (не картография: европейская часть растянута ради читаемости)
const SIM_XY = {
  spb: [268, 148], msk: [300, 252], nn: [382, 238], kzn: [446, 258],
  perm: [502, 196], ekb: [548, 228], ufa: [508, 302],
  vrn: [298, 332], tmb: [348, 318], rnd: [278, 402], krd: [252, 448], sochi: [292, 490],
  nsk: [700, 302], krsk: [792, 258]
};
const RU_PATH = 'M232,178 L246,120 L330,92 L420,70 L540,56 L680,62 L830,54 L930,84 L944,190 L900,300 L820,360 L700,352 L560,356 L470,362 L410,380 L352,432 L318,508 L268,472 L256,420 L232,352 L214,262 Z';

let simDay = null, simTimer = null;
const SIM_GEOM = {};

function pentPts(cx, cy, s) {
  return [[0, -20], [22, -8], [16, 20], [-16, 20], [-22, -8]]
    .map(([x, y]) => (cx + x * s).toFixed(1) + ',' + (cy + y * s).toFixed(1)).join(' ');
}
function lerpColor(a, b, t) {
  const pa = [1, 3, 5].map(k => parseInt(a.slice(k, k + 2), 16));
  const pb = [1, 3, 5].map(k => parseInt(b.slice(k, k + 2), 16));
  return '#' + pa.map((v, k) => Math.round(v + (pb[k] - v) * t).toString(16).padStart(2, '0')).join('');
}
const heatStroke = t => t < 0.5 ? lerpColor('#7C8DA0', '#FF8A00', t * 2) : lerpColor('#FF8A00', '#FFC93D', (t - 0.5) * 2);

function buildSimScene() {
  const cities = SCENARIO.cities.filter(c => SIM_XY[c.id]);
  const hubs = cities.filter(c => c.hub);
  const HEAT_STOPS = '<stop offset="0" stop-color="#FF2E1A"/><stop offset="0.55" stop-color="#FF8A00"/><stop offset="1" stop-color="#FFC93D"/>';
  let defs = `<linearGradient id="heatV" x1="0" y1="1" x2="0" y2="0">${HEAT_STOPS}</linearGradient>` +
    `<linearGradient id="heatH" x1="0" y1="0" x2="1" y2="0">${HEAT_STOPS}</linearGradient>`;
  let routes = '', nodes = '';
  for (const c of cities) {
    const [cx, cy] = SIM_XY[c.id];
    const dem = SIM.totalByCity[c.id] || 0;
    const s = Math.max(c.hub ? 1.25 : 0.7, 0.55 + Math.sqrt(dem) / 26);
    SIM_GEOM[c.id] = { cx, cy, s };
    const pts = pentPts(cx, cy, s);
    if (!c.hub && hubs.length) {
      const near = hubs.reduce((best, h) => {
        const [hx, hy] = SIM_XY[h.id];
        const d = (hx - cx) ** 2 + (hy - cy) ** 2;
        return !best || d < best.d ? { h, d } : best;
      }, null).h;
      const [hx, hy] = SIM_XY[near.id];
      const mx = (cx + hx) / 2 + (hy - cy) * 0.12, my = (cy + hy) / 2 + (cx - hx) * 0.12;
      routes += `<path class="route" data-route="${c.id}" d="M${cx},${cy} Q${mx.toFixed(0)},${my.toFixed(0)} ${hx},${hy}"/>`;
    }
    let ly;
    if (c.hub) {
      ly = cy + 20 * s + 20;
      nodes += `<polygon points="${pts}" fill="#FC3F1D" opacity="0.92"/>` +
        `<text x="${cx}" y="${cy + 3.5 * s}" text-anchor="middle" fill="#fff" font-size="${(9 * s).toFixed(1)}" font-weight="700" font-family="Inter,sans-serif" letter-spacing="1">ХАБ</text>` +
        `<rect x="${cx - 20}" y="${(cy + 20 * s + 6).toFixed(1)}" width="40" height="4" rx="2" fill="#1A1D21"/>` +
        `<rect data-hubbar="${c.id}" x="${cx - 20}" y="${(cy + 20 * s + 6).toFixed(1)}" width="0" height="4" rx="2" fill="url(#heatH)"/>`;
    } else {
      ly = cy + 20 * s + 13;
      defs += `<clipPath id="clip-${c.id}"><polygon points="${pts}"/></clipPath>`;
      nodes += `<polygon points="${pts}" fill="#1E2126"/>` +
        `<rect data-fill="${c.id}" x="${(cx - 22 * s).toFixed(1)}" y="${(cy + 20 * s).toFixed(1)}" width="${(44 * s).toFixed(1)}" height="0" clip-path="url(#clip-${c.id})" fill="url(#heatV)" opacity="0.9"/>` +
        `<polygon points="${pts}" fill="none" class="node-shape" data-nodestroke="${c.id}" stroke="#7C8DA0"/>`;
    }
    nodes += `<polygon points="${pentPts(cx, cy, s * 1.22)}" class="pulse-ring" data-pulse="${c.id}"/>` +
      `<text x="${cx}" y="${ly}" text-anchor="middle" class="node-label">${esc(c.name)}</text>` +
      `<text x="${cx}" y="${ly + 12}" text-anchor="middle" class="node-count" data-count="${c.id}"></text>`;
  }
  $('#simSvg').innerHTML = `<defs>${defs}</defs><path class="ru-contour" d="${RU_PATH}"/>${routes}${nodes}`;
}

function updateSimFrame(i) {
  if (!SIM) return;
  const hubAlert = SIM.hubQueueSeries[i] > SIM.hubCapDay;
  let pool = 0;
  Object.values(SIM.stockSeries).forEach(a => { pool += a[i]; });
  for (const c of SCENARIO.cities) {
    const g = SIM_GEOM[c.id];
    if (!g) continue;
    const dem = SIM.totalByCity[c.id] || 0;
    const ds = SIM.doneSeries[c.id];
    const done = ds ? ds[i] : 0;
    const pct = dem > 0 ? done / dem : 0;
    const cnt = document.querySelector(`[data-count="${c.id}"]`);
    if (cnt) cnt.textContent = fmtI(done) + ' / ' + fmtI(dem);
    if (c.hub) {
      const bar = document.querySelector(`[data-hubbar="${c.id}"]`);
      if (bar) bar.setAttribute('width', (40 * pct).toFixed(1));
    } else {
      const f = document.querySelector(`[data-fill="${c.id}"]`);
      if (f) {
        const h = 40 * g.s * pct;
        f.setAttribute('height', h.toFixed(1));
        f.setAttribute('y', (g.cy + 20 * g.s - h).toFixed(1));
      }
      const st = document.querySelector(`[data-nodestroke="${c.id}"]`);
      if (st) st.setAttribute('stroke', heatStroke(pct));
      const rt = document.querySelector(`[data-route="${c.id}"]`);
      if (rt) rt.classList.toggle('active', done - (i > 0 && ds ? ds[i - 1] : 0) > 1e-6);
    }
    const pulse = document.querySelector(`[data-pulse="${c.id}"]`);
    if (pulse) pulse.classList.toggle('on', c.hub ? hubAlert : !!(SIM.starvedSeries[c.id] && SIM.starvedSeries[c.id][i]));
  }
  const date = addDays(SIM.monday0, i);
  const week = Math.floor((i - SIM.i0) / 7) + 1;
  $('#simDate').textContent = RU_D(date) + ' · неделя ' + week;
  const pctT = SIM.totalDemand > 0 ? SIM.doneCum[i] / SIM.totalDemand : 0;
  $('#simReadout').innerHTML =
    `<span>оснащено <b>${fmtI(SIM.doneCum[i])}</b> / ${fmtI(SIM.totalDemand)} · ${Math.round(pctT * 100)}%</span>` +
    `<span>фонд регионов <b>${fmtI(pool)}</b> бамп.</span>` +
    `<span${hubAlert ? ' class="alert"' : ''}>очередь хаба ${fmtI(SIM.hubQueueSeries[i])}</span>` +
    (i > SIM.deadlineIdx ? '<span class="alert">после дедлайна</span>' : '');
}

function simStop() {
  clearInterval(simTimer);
  simTimer = null;
  const b = $('#simPlay');
  if (b) b.textContent = '▶ Play';
}

function renderSimulation() {
  buildSimScene();
  const scrub = $('#simScrub');
  scrub.min = SIM.i0;
  scrub.max = SIM.nDays - 1;
  if (simDay == null || simDay < SIM.i0 || simDay > SIM.nDays - 1) simDay = SIM.i0;
  scrub.value = simDay;
  updateSimFrame(simDay);
}

/* ---------- вкладка Дашборд ---------- */
const MONO_F = 'font-family="ui-monospace,monospace" font-size="10"';

function svgTimeChart(opts) {
  const W = 960, H = opts.h || 190, L = 46, R = 10, T = 12, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const i0 = SIM.i0, n = SIM.nDays;
  let yMax = opts.yCap || 0;
  opts.series.forEach(s => { for (let i = i0; i < n; i++) if (s.data[i] > yMax) yMax = s.data[i]; });
  yMax = Math.max(1, yMax * 1.12);
  const x = i => L + (i - i0) / (n - 1 - i0) * iw;
  const y = v => T + ih - v / yMax * ih;
  let g = '';
  SIM.campaignWeeks.forEach((wk, k) => {
    const i = wk.w * 7;
    if (i < i0) return;
    g += `<line x1="${x(i).toFixed(1)}" y1="${T}" x2="${x(i).toFixed(1)}" y2="${T + ih}" stroke="#1C1F24"/>`;
    if (k % 2 === 0) g += `<text x="${x(i).toFixed(1)}" y="${H - 8}" fill="#6A7078" ${MONO_F} text-anchor="middle">${wk.label.split('–')[0]}</text>`;
  });
  [0, yMax / 2, yMax].forEach(v => {
    g += `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="#1C1F24"/>` +
      `<text x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" fill="#6A7078" ${MONO_F} text-anchor="end">${Math.round(v)}</text>`;
  });
  const dx = x(Math.min(SIM.deadlineIdx, n - 1)).toFixed(1);
  g += `<line x1="${dx}" y1="${T}" x2="${dx}" y2="${T + ih}" stroke="#3A3F46" stroke-dasharray="2 3"/>` +
    `<text x="${+dx + 4}" y="${T + 10}" fill="#8A9099" ${MONO_F}>дедлайн</text>`;
  if (opts.yCap) {
    g += `<line x1="${L}" y1="${y(opts.yCap).toFixed(1)}" x2="${W - R}" y2="${y(opts.yCap).toFixed(1)}" stroke="#3A3F46" stroke-dasharray="5 4"/>`;
    if (opts.yCapLabel) g += `<text x="${W - R}" y="${(y(opts.yCap) - 5).toFixed(1)}" fill="#8A9099" ${MONO_F} text-anchor="end">${opts.yCapLabel}</text>`;
  }
  for (const s of opts.series) {
    let pts = '';
    for (let i = i0; i < n; i++) pts += (pts ? ' ' : '') + x(i).toFixed(1) + ',' + y(s.data[i]).toFixed(1);
    if (s.fill) g += `<polygon points="${x(i0).toFixed(1)},${y(0).toFixed(1)} ${pts} ${x(n - 1).toFixed(1)},${y(0).toFixed(1)}" fill="${s.fill}"/>`;
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.6"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}

function renderDashCities() {
  $('#dashCities').innerHTML = SCENARIO.cities.map(c => {
    const cs = SIM.cityStats[c.id];
    if (cs.demand <= 0) return '';
    const pct = cs.doneByDeadline / cs.demand;
    return `<div class="citycard">
      <div class="cc-head"><span class="dot ${cityStatusClass(cs)}"></span><b>${esc(c.name)}</b>${c.hub ? '<span class="hub-tag">ХАБ</span>' : ''}<span class="cc-pct">${Math.round(pct * 100)}%</span></div>
      <div class="heat mini"><div class="heat-fill" style="width:${(pct * 100).toFixed(1)}%"></div></div>
      <div class="cc-meta">${fmtI(cs.doneByDeadline)} из ${fmtI(cs.demand)} к дедлайну${cs.starvedDays > 5 ? ` · <span style="color:var(--action)">${cs.starvedDays} дн без бамперов</span>` : ''}</div>
    </div>`;
  }).join('');
}

function renderDashPace() {
  const cities = SCENARIO.cities.filter(c => SIM.cityStats[c.id].demand > 0);
  const m = Math.max(1, ...cities.map(c => Math.max(SIM.cityStats[c.id].needWeekly, SIM.cityStats[c.id].capWeekly)));
  $('#dashPace').innerHTML = cities.map(c => {
    const cs = SIM.cityStats[c.id];
    const def = cs.capWeekly < cs.needWeekly - 0.5;
    return `<div class="pace-row">
      <span class="pace-name">${esc(c.name)}</span>
      <div class="pace-bars">
        <div class="pace-bar need" style="width:${(cs.needWeekly / m * 100).toFixed(1)}%"></div>
        <div class="pace-bar cap${def ? ' def' : ''}" style="width:${(cs.capWeekly / m * 100).toFixed(1)}%"></div>
      </div>
      <span class="pace-vals">надо ${fmt1(cs.needWeekly)} · есть ${fmt1(cs.capWeekly)}</span>
    </div>`;
  }).join('');
}

function renderDashGantt() {
  const weeks = SIM.campaignWeeks;
  const head = `<thead><tr><th>Сервис</th>${weeks.map(w => `<th>${w.label}</th>`).join('')}</tr></thead>`;
  let body = '';
  SCENARIO.cities.forEach(c => {
    const list = SCENARIO.services.filter(s => s.cityId === c.id);
    if (!list.length) return;
    body += `<tr class="cityrow"><td colspan="${weeks.length + 1}">${esc(c.name)}</td></tr>`;
    list.forEach(s => {
      const sw = SIM.psw[s.id] || [];
      const wcap = SIM.capBySvc[s.id].perWeek || 1;
      body += `<tr><td class="t" style="padding-left:22px">${esc(s.name)}</td>` + weeks.map(wk => {
        const v = sw[wk.w] || 0;
        const u = Math.min(1, v / wcap);
        const bg = v > 0.5 ? ` style="background:rgba(255,138,0,${(0.10 + 0.5 * u).toFixed(2)})"` : '';
        return `<td${bg}>${Math.round(v) || '·'}</td>`;
      }).join('') + '</tr>';
    });
  });
  $('#dashGantt').innerHTML = `<table class="gantt">${head}<tbody>${body}</tbody></table>`;
}

function renderDashboard() {
  renderDashCities();
  renderDashPace();
  renderDashGantt();
  const capOk = isFinite(SIM.hubCapDay);
  $('#dashHub').innerHTML = svgTimeChart({
    yCap: capOk ? SIM.hubCapDay : 0,
    yCapLabel: capOk ? 'мощность ' + fmt1(SIM.hubCapDay) : '',
    series: [
      { data: SIM.hubLoadSeries, color: 'var(--mid)', fill: 'rgba(255,138,0,.16)' },
      { data: SIM.hubQueueSeries, color: 'var(--action)' }
    ]
  });
  const pool = new Float64Array(SIM.nDays);
  Object.values(SIM.stockSeries).forEach(a => { for (let i = 0; i < SIM.nDays; i++) pool[i] += a[i]; });
  $('#dashPool').innerHTML = svgTimeChart({
    series: [{ data: pool, color: 'var(--cold)', fill: 'rgba(124,141,160,.14)' }]
  });
}

/* ---------- пересчёт ---------- */
let recalcTimer = null;
function recalc() {
  SIM = runSim(SCENARIO);
  updateHeader();
  updateDemandTotals();
  updateProcessTotals();
  updateServiceCaps();
  updateBumperHints();
  updateVerify();
  renderRecs();
  renderQuotas();
  renderDashboard();
  renderSimulation();
}
function recalcSoon() { clearTimeout(recalcTimer); recalcTimer = setTimeout(recalc, 150); }

/* ---------- биндинг ---------- */
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.bind) {
    const v = t.type === 'number' ? (+t.value || 0) : t.value;
    setPath(SCENARIO, t.dataset.bind, v);
    recalcSoon();
  } else if (t.dataset.city) {
    const c = SCENARIO.cities.find(x => x.id === t.dataset.city);
    if (!c) return;
    const f = t.dataset.cf;
    if (f === 'hub') {
      c.hub = t.checked;
      const inp = document.querySelector(`input[data-city="${c.id}"][data-cf="transitDays"]`);
      if (inp) inp.disabled = c.hub;
    }
    else if (f === 'transitDays') c.transitDays = Math.max(0, +t.value || 0);
    else if (f.startsWith('demand')) c.demand[+f.slice(6)] = Math.max(0, +t.value || 0);
    recalcSoon();
  } else if (t.dataset.op) {
    const op = SCENARIO.process.ops.find(x => x.id === t.dataset.op);
    if (!op) return;
    const f = t.dataset.of;
    if (f === 'needsPost' || f === 'needsLift') op[f] = t.checked;
    else op[f] = Math.max(0, +t.value || 0);
    recalcSoon();
  } else if (t.dataset.sid) {
    const s = SCENARIO.services.find(x => x.id === t.dataset.sid);
    if (!s) return;
    const f = t.dataset.sf;
    if (f === 'name' || f === 'readyDate') s[f] = t.value;
    else s[f] = Math.max(0, +t.value || 0);
    recalcSoon();
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'verifySel') updateVerify();
});

document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) {
    const cityId = add.dataset.add;
    const n = SCENARIO.services.filter(s => s.cityId === cityId).length + 1;
    SCENARIO.services.push({
      id: 's' + Date.now() + Math.floor(Math.random() * 1000),
      cityId, name: 'Сервис ' + n,
      posts: 2, lifts: 1, mechanics: 5, daysPerWeek: 5, shiftHours: 8,
      readyDate: SCENARIO.calendar.simStart
    });
    renderServices(); renderVerifySelect(); recalc();
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    SCENARIO.services = SCENARIO.services.filter(s => s.id !== del.dataset.del);
    renderServices(); renderVerifySelect(); recalc();
    return;
  }
  const tab = e.target.closest('.tab');
  if (tab) {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === tab));
    document.querySelectorAll('.tabpane').forEach(x => x.classList.toggle('active', x.id === 'tab-' + tab.dataset.tab));
  }
});

/* ---------- плеер симуляции ---------- */
$('#simPlay').addEventListener('click', () => {
  if (simTimer) { simStop(); return; }
  if (simDay >= SIM.nDays - 1) simDay = SIM.i0;
  $('#simPlay').textContent = '❚❚ Пауза';
  simTimer = setInterval(() => {
    if (!SIM || simDay >= SIM.nDays - 1) { simStop(); return; }
    simDay++;
    $('#simScrub').value = simDay;
    updateSimFrame(simDay);
  }, 110);
});
$('#simScrub').addEventListener('input', e => {
  simStop();
  simDay = +e.target.value;
  updateSimFrame(simDay);
});

/* ---------- экспорт / импорт / сброс ---------- */
$('#btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(SCENARIO, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'umo-binar-scenario.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
$('#btnImport').addEventListener('click', () => $('#fileImport').click());
$('#fileImport').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const sc = JSON.parse(r.result);
      if (!sc.cities || !sc.services || !sc.process) throw new Error('нет обязательных блоков');
      SCENARIO = sc;
      renderAll();
    } catch (err) {
      alert('Не удалось прочитать сценарий: ' + err.message);
    }
    e.target.value = '';
  };
  r.readAsText(f);
});
$('#btnReset').addEventListener('click', () => {
  if (!confirm('Сбросить все параметры к базовому сценарию?')) return;
  SCENARIO = JSON.parse(JSON.stringify(DEFAULT_SCENARIO));
  renderAll();
});

/* ---------- старт ---------- */
function renderAll() {
  renderCalendar();
  renderDemand();
  renderProcess();
  renderFine();
  renderBumpers();
  renderServices();
  renderVerifySelect();
  recalc();
}
renderAll();

