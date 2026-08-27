/*
 * Логика приложения. Редактировать не нужно — все тексты в config.js.
 */

const STORAGE_KEY = "bg3quest_state_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* игнорируем повреждённое хранилище */ }
  return {
    screen: "intro",
    health: CONFIG.stats.healthStart,
    healthMax: CONFIG.stats.healthMax,
    gold: CONFIG.stats.goldStart,
    recruited: {},       // { companionId: totalApproval }
    dialogueStep: {},    // { companionId: индекс текущего шага диалога }
    dialogueApproval: {},// { companionId: накопленное одобрение в текущем прохождении }
    activeCompanionId: null,
    fightDone: false,
    // История изменений — показывается по тапу на плашку золота/здоровья на хабе
    goldLog: [],
    healthLog: [
      { delta: CONFIG.stats.healthStart - CONFIG.stats.healthMax, label: CONFIG.stats.fallLabel },
    ],
  };
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function goTo(screen) {
  state.screen = screen;
  saveState();
  render();
}

function addGold(amount, label) {
  state.gold += amount;
  state.goldLog.push({ delta: amount, label: label || "" });
  saveState();
}

function setHealth(value, label) {
  const clamped = Math.max(0, Math.min(state.healthMax, value));
  const delta = clamped - state.health;
  if (delta !== 0) {
    state.healthLog.push({ delta: delta, label: label || "" });
  }
  state.health = clamped;
  saveState();
}

// ---------------------------------------------------------------------
// Web NFC — работает только в Chrome/Android, внутри уже открытого сайта
// ---------------------------------------------------------------------
async function tryNfcScan(expectedCode, onSuccess, onError) {
  if (!("NDEFReader" in window)) {
    onError("На этом телефоне нет поддержки чтения меток в браузере. Впиши слово вручную.");
    return;
  }
  try {
    const reader = new NDEFReader();
    await reader.scan();
    onError("Поднеси телефон к метке...");
    reader.onreading = (event) => {
      let text = "";
      for (const record of event.message.records) {
        if (record.recordType === "text") {
          const decoder = new TextDecoder(record.encoding || "utf-8");
          text += decoder.decode(record.data);
        } else if (record.recordType === "url") {
          text += new TextDecoder().decode(record.data);
        }
      }
      if (text.trim() === expectedCode) {
        onSuccess();
      } else {
        onError("Метка не подходит для этого этапа.");
      }
    };
  } catch (e) {
    onError("Не удалось включить чтение меток (" + e.message + "). Впиши слово вручную.");
  }
}

function normalize(str) {
  return str.trim().toUpperCase();
}

// ---------------------------------------------------------------------
// Рендер экранов
// ---------------------------------------------------------------------
const app = document.getElementById("app");

function render() {
  app.innerHTML = "";
  const routes = {
    intro: renderIntro,
    breakfast: renderBreakfast,
    breakfastSuccess: renderBreakfastSuccess,
    plateClue: renderPlateClue,
    loot: renderLoot,
    train: renderTrain,
    hub: renderHub,
    roster: renderRoster,
    newspaper: renderNewspaper,
    goldHistory: renderGoldHistory,
    healthHistory: renderHealthHistory,
  };
  if (state.screen.startsWith("companionApproach:")) {
    renderCompanionApproach(state.screen.split(":")[1]);
  } else if (state.screen.startsWith("companionDialogue:")) {
    renderCompanionDialogue(state.screen.split(":")[1]);
  } else {
    (routes[state.screen] || renderIntro)();
  }
  updateHealthFooter();
}

// Экраны, где вдобавок к основному контенту всегда видна нижняя
// полоска здоровья (весь пролог — от падения до отправления электрички)
const PROLOGUE_SCREENS = ["intro", "breakfast", "breakfastSuccess", "plateClue", "loot", "train"];

function updateHealthFooter() {
  const footerEl = document.getElementById("health-footer");
  const show = PROLOGUE_SCREENS.includes(state.screen);
  app.classList.toggle("has-footer", show);
  if (!show) {
    footerEl.innerHTML = "";
    return;
  }
  const pct = Math.round((state.health / state.healthMax) * 100);
  footerEl.innerHTML = `
    <div class="health-footer">
      <div class="health-footer-inner">
        <span class="health-footer-label">Здоровье</span>
        <div class="health-bar-track"><div class="health-bar-fill" style="width:${pct}%"></div></div>
        <span class="health-footer-value">${state.health}/${state.healthMax}</span>
      </div>
    </div>
  `;
}

function banner(eyebrow, title) {
  const el = document.createElement("div");
  el.className = "chapter-banner";
  el.innerHTML = `<p class="chapter-eyebrow">${eyebrow}</p><h1 class="chapter-title">${title}</h1>`;
  return el;
}

function screenWrap(children) {
  const s = document.createElement("div");
  s.className = "screen";
  children.forEach((c) => c && s.appendChild(c));
  return s;
}

function btn(text, onClick, variant) {
  const b = document.createElement("button");
  b.className = "btn" + (variant ? " " + variant : "");
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function p(text, className) {
  const el = document.createElement("p");
  el.className = className || "lore-text";
  el.textContent = text;
  return el;
}

function statusMsg(text, kind) {
  const el = document.createElement("div");
  el.className = "status-msg " + kind;
  el.textContent = text;
  return el;
}

// ---------------------------------------------------------------------
// 1.1 — Пролог
// ---------------------------------------------------------------------
function renderIntro() {
  const c = CONFIG.intro;
  app.appendChild(banner(c.eyebrow, c.title));
  app.appendChild(screenWrap([
    p(c.text),
    btn(c.buttonText, () => goTo("breakfast"), "primary"),
  ]));
}

// ---------------------------------------------------------------------
// Завтрак — ввод слова
// ---------------------------------------------------------------------
function renderBreakfast() {
  const c = CONFIG.breakfast;
  app.appendChild(banner(c.eyebrow, c.title));

  const errorSlot = document.createElement("div");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = c.passwordPlaceholder;
  input.autocomplete = "off";

  const submit = btn("Проверить", () => {
    errorSlot.innerHTML = "";
    if (normalize(input.value) === normalize(c.password)) {
      setHealth(CONFIG.stats.healthAfterBreakfast, CONFIG.stats.breakfastLabel);
      goTo("breakfastSuccess");
    } else {
      errorSlot.appendChild(statusMsg(c.errorText, "error"));
    }
  }, "primary");

  app.appendChild(screenWrap([
    p(c.text),
    document.createElement("div"),
    (() => { const l = document.createElement("p"); l.className = "field-label"; l.textContent = "Слово-ключ"; return l; })(),
    input,
    submit,
    errorSlot,
  ]));
}

function renderBreakfastSuccess() {
  const c = CONFIG.breakfast;
  app.appendChild(banner(c.eyebrow, c.title));
  app.appendChild(screenWrap([
    statusMsg(c.successText, "ok"),
    btn(c.eatButtonText, () => goTo("plateClue"), "primary"),
  ]));
}

// ---------------------------------------------------------------------
// Знак на дне тарелки
// ---------------------------------------------------------------------
function renderPlateClue() {
  const c = CONFIG.plateClue;
  app.appendChild(banner(c.eyebrow, c.title));

  const statusSlot = document.createElement("div");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = c.passwordPlaceholder;
  input.autocomplete = "off";

  const onOk = () => goTo("loot");
  const onFail = (msg) => { statusSlot.innerHTML = ""; statusSlot.appendChild(statusMsg(msg, "error")); };

  const nfcBtn = btn(c.nfcButtonText, () => tryNfcScan(c.nfcCode, onOk, onFail), "primary");
  const submit = btn("Проверить слово", () => {
    if (normalize(input.value) === normalize(c.password)) onOk();
    else onFail(c.errorText);
  });

  app.appendChild(screenWrap([
    p(c.text),
    nfcBtn,
    (() => { const hr = document.createElement("p"); hr.className = "nfc-hint"; hr.textContent = "— или —"; return hr; })(),
    input,
    submit,
    statusSlot,
  ]));
}

// ---------------------------------------------------------------------
// Жёсткий лут + загадка + поле перед отбытием
// ---------------------------------------------------------------------
function noteCard(title, bodyHtml) {
  const el = document.createElement("div");
  el.className = "note-card";
  el.innerHTML = `
    <div class="note-corner tl"></div>
    <div class="note-corner tr"></div>
    <div class="note-corner bl"></div>
    <div class="note-corner br"></div>
    <div class="note-title">${title}</div>
    ${bodyHtml}
  `;
  return el;
}

function renderLoot() {
  const c = CONFIG.loot;
  app.appendChild(banner(c.eyebrow, c.title));

  const quote = document.createElement("p");
  quote.className = "quote-line";
  quote.textContent = c.quote;

  const firstNote = noteCard(c.firstNoteTitle, `<p>${c.riddle}</p>`);

  const departZone = document.createElement("div");
  departZone.style.display = "flex";
  departZone.style.flexDirection = "column";
  departZone.style.gap = "14px";

  const departBtn = btn(c.departButtonText, () => {
    departZone.innerHTML = "";

    const secondNote = noteCard(c.secondNoteTitle, `<p>${c.departPrompt}</p>`);
    const statusSlot = document.createElement("div");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = c.passwordPlaceholder;
    input.autocomplete = "off";

    const onOk = () => goTo("train");
    const onFail = (msg) => { statusSlot.innerHTML = ""; statusSlot.appendChild(statusMsg(msg, "error")); };

    const nfcBtn = btn(c.nfcButtonText, () => tryNfcScan(c.nfcCode, onOk, onFail), "primary");
    const submit = btn("Проверить слово", () => {
      if (normalize(input.value) === normalize(c.password)) onOk();
      else onFail(c.errorText);
    });

    [secondNote, nfcBtn, input, submit, statusSlot].forEach((el) => departZone.appendChild(el));
  }, "primary");

  departZone.appendChild(departBtn);

  app.appendChild(screenWrap([quote, firstNote, departZone]));
}

// ---------------------------------------------------------------------
// Расписание электрички
// ---------------------------------------------------------------------
function nextDepartures(list, count) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const withMinutes = list.map((t) => {
    const [h, m] = t.split(":").map(Number);
    return { label: t, minutes: h * 60 + m };
  });
  const upcoming = withMinutes.filter((t) => t.minutes >= nowMinutes);
  return upcoming.slice(0, count).map((t) => t.label);
}

function renderTrain() {
  const c = CONFIG.train;
  app.appendChild(banner(c.eyebrow, c.title));

  const list = document.createElement("div");
  list.className = "train-list";
  const upcoming = nextDepartures(c.departures, 3);

  if (upcoming.length === 0) {
    list.appendChild(statusMsg(c.noneLeftText, "error"));
  } else {
    upcoming.forEach((t) => {
      const row = document.createElement("div");
      row.className = "train-row";
      row.innerHTML = `<span class="train-time">${t}</span><span class="train-note">${c.direction}</span>`;
      list.appendChild(row);
    });
  }

  const portalGroup = document.createElement("div");
  portalGroup.className = "tight-group";
  const portalBtn = btn(c.portalButtonText, () => goTo("hub"), "primary");
  const hint = document.createElement("p");
  hint.className = "footer-note";
  hint.textContent = c.portalButtonHint;
  portalGroup.appendChild(portalBtn);
  portalGroup.appendChild(hint);

  app.appendChild(screenWrap([p(c.text), list, portalGroup]));
}

// ---------------------------------------------------------------------
// ХАБ
// ---------------------------------------------------------------------
function statBox(label, valueHtml, extraClass, onClick) {
  const box = document.createElement("div");
  box.className = "stat-box" + (extraClass ? " " + extraClass : "") + (onClick ? " clickable" : "");
  box.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${valueHtml}</span>`;
  if (onClick) box.addEventListener("click", onClick);
  return box;
}

function renderHub() {
  const c = CONFIG.hub;
  const recruitedCount = Object.keys(state.recruited).length;

  const title = document.createElement("h1");
  title.className = "hub-title";
  title.textContent = CONFIG.adventureTitle;

  const healthPct = Math.round((state.health / state.healthMax) * 100);
  const statRow = document.createElement("div");
  statRow.className = "stat-row";
  statRow.appendChild(statBox("Золото", state.gold, "", () => goTo("goldHistory")));
  statRow.appendChild(statBox(
    "Здоровье",
    `<span class="${state.health <= 6 ? "health-low" : ""}">${state.health}/${state.healthMax}</span>`,
    "",
    () => goTo("healthHistory")
  ));
  statRow.appendChild(statBox("Компаньоны", recruitedCount, "", () => goTo("roster")));

  const healthBar = document.createElement("div");
  healthBar.className = "health-bar-track";
  healthBar.innerHTML = `<div class="health-bar-fill" style="width:${healthPct}%"></div>`;

  const children = [title, statRow, healthBar];

  if (recruitedCount >= 1) {
    const mission = noteCard(c.firstMission.title, `<p>${c.firstMission.text}</p>`);
    mission.style.marginTop = "4px";
    children.push(mission);
  }

  const sectionLabel = document.createElement("p");
  sectionLabel.className = "field-label";
  sectionLabel.textContent = c.sectionLabel;

  const directionList = document.createElement("div");
  directionList.className = "direction-list";
  c.directions.forEach((d) => {
    const done = !!state.recruited[d.companionId];
    const b = document.createElement("button");
    b.className = "direction-btn" + (done ? " done" : "");
    b.innerHTML = `<span>${d.label}</span>${done ? '<span class="tick">✓ пройдено</span>' : ""}`;
    b.addEventListener("click", () => goTo("companionApproach:" + d.companionId));
    directionList.appendChild(b);
  });

  const secondary = document.createElement("div");
  secondary.className = "hub-secondary";
  secondary.appendChild(btn(c.newspaperButtonText, () => goTo("newspaper"), "ghost"));
  secondary.appendChild(btn(c.teamButtonText, () => goTo("roster"), "ghost"));

  children.push(sectionLabel, directionList, secondary);
  app.appendChild(screenWrap(children));
}

// ---------------------------------------------------------------------
// Компаньон — приближение
// ---------------------------------------------------------------------
function findCompanion(id) {
  return CONFIG.companions.find((c) => c.id === id);
}

function renderCompanionApproach(id) {
  const comp = findCompanion(id);
  if (!comp) { goTo("hub"); return; }

  app.appendChild(banner("Союзник", comp.name + "?"));

  const portrait = document.createElement("div");
  portrait.className = "vn-portrait-wrap";
  portrait.innerHTML = `<div class="vn-portrait-placeholder">Портрет появится здесь<br>(${comp.portrait})</div>`;

  app.appendChild(screenWrap([
    portrait,
    p(comp.approachText),
    btn(comp.approachButtonText, () => {
      state.activeCompanionId = id;
      if (state.dialogueStep[id] === undefined) state.dialogueStep[id] = 0;
      if (state.dialogueApproval[id] === undefined) state.dialogueApproval[id] = 0;
      saveState();
      goTo("companionDialogue:" + id);
    }, "primary"),
  ]));
}

// ---------------------------------------------------------------------
// Компаньон — диалог (визуальная новелла)
// ---------------------------------------------------------------------
function renderCompanionDialogue(id) {
  const comp = findCompanion(id);
  if (!comp) { goTo("hub"); return; }

  const step = state.dialogueStep[id] || 0;
  const approval = state.dialogueApproval[id] || 0;

  app.appendChild(banner("Союзник", comp.name));

  const portraitWrap = document.createElement("div");
  portraitWrap.className = "vn-portrait-wrap";
  const joined = step >= comp.dialogue.length;
  portraitWrap.innerHTML = `
    <div class="vn-portrait-placeholder">${joined ? "Портрет (улыбается)" : "Портрет"}<br>(${joined ? comp.portraitJoined : comp.portrait})</div>
    <div class="vn-approval">${comp.approvalIcon} ${approval}</div>
  `;

  if (joined) {
    const line = document.createElement("div");
    line.className = "vn-line";
    line.textContent = comp.joinedLine;

    const continueBtn = btn(comp.continueButtonText, () => {
      state.recruited[id] = approval;
      state.dialogueStep[id] = 0;
      state.dialogueApproval[id] = 0;
      addGold(CONFIG.goldRewards.companionRecruited, comp.name + " присоединился");
      state.activeCompanionId = null;
      saveState();
      goTo("hub");
    }, "primary");

    app.appendChild(screenWrap([portraitWrap, line, continueBtn]));
    return;
  }

  const currentLine = comp.dialogue[step];
  const line = document.createElement("div");
  line.className = "vn-line";
  line.textContent = currentLine.line;

  const options = document.createElement("div");
  options.className = "vn-options";
  currentLine.options.forEach((opt) => {
    const b = document.createElement("button");
    b.className = "vn-option";
    b.textContent = opt.text;
    b.addEventListener("click", () => {
      state.dialogueApproval[id] = (state.dialogueApproval[id] || 0) + opt.approval;
      state.dialogueStep[id] = step + 1;
      saveState();
      render();
    });
    options.appendChild(b);
  });

  app.appendChild(screenWrap([portraitWrap, line, options]));
}

// ---------------------------------------------------------------------
// Команда (ростер)
// ---------------------------------------------------------------------
function renderRoster() {
  app.appendChild(banner("Отряд", "Команда"));

  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "10px";

  const ids = Object.keys(state.recruited);
  if (ids.length === 0) {
    list.appendChild((() => { const el = document.createElement("div"); el.className = "roster-empty"; el.textContent = "Пока никто не присоединился."; return el; })());
  } else {
    ids.forEach((id) => {
      const comp = findCompanion(id);
      if (!comp) return;
      const row = document.createElement("div");
      row.className = "roster-item";
      row.innerHTML = `
        <span class="roster-left">
          <img class="roster-portrait" src="${comp.portraitJoined}" alt="${comp.name}">
          <span>${comp.name}</span>
        </span>
        <span>${comp.approvalIcon} ${state.recruited[id]}</span>
      `;
      list.appendChild(row);
    });
  }

  app.appendChild(screenWrap([list, btn("Назад", () => goTo("hub"), "ghost")]));
}

// ---------------------------------------------------------------------
// История золота / здоровья
// ---------------------------------------------------------------------
function renderLogScreen(eyebrow, title, log, unit) {
  app.appendChild(banner(eyebrow, title));

  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "8px";

  if (log.length === 0) {
    list.appendChild((() => { const el = document.createElement("div"); el.className = "roster-empty"; el.textContent = "Пока пусто."; return el; })());
  } else {
    log.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "log-row";
      const sign = entry.delta > 0 ? "+" : "";
      const cls = entry.delta >= 0 ? "positive" : "negative";
      row.innerHTML = `<span>${entry.label || "—"}</span><span class="log-delta ${cls}">${sign}${entry.delta} ${unit}</span>`;
      list.appendChild(row);
    });
  }

  app.appendChild(screenWrap([list, btn("Назад", () => goTo("hub"), "ghost")]));
}

function renderGoldHistory() {
  renderLogScreen("Хроника", "История золота", state.goldLog, "");
}

function renderHealthHistory() {
  renderLogScreen("Хроника", "История здоровья", state.healthLog, "");
}

// ---------------------------------------------------------------------
// Газета (заглушка)
// ---------------------------------------------------------------------
function renderNewspaper() {
  const c = CONFIG.newspaper;
  app.appendChild(banner("Пресса", c.title));
  app.appendChild(screenWrap([
    p(c.placeholderText),
    btn("Назад", () => goTo("hub"), "ghost"),
  ]));
}

// ---------------------------------------------------------------------
// Старт
// ---------------------------------------------------------------------
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
