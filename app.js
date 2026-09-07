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
    screen: "titleSplash",
    health: CONFIG.stats.healthStart,
    healthMax: CONFIG.stats.healthMax,
    gold: CONFIG.stats.goldStart,
    recruited: {},       // { companionId: totalApproval }
    dialogueStep: {},    // { companionId: индекс текущего шага диалога }
    dialogueApproval: {},// { companionId: накопленное одобрение в текущем прохождении }
    activeCompanionId: null,
    fightDone: false,
    chapter2Done: false,
    chapter2RewardClaimed: false,
    silhouetteIndex: 0,
    silhouetteHints: {},
    shopChoice: null,
    shopDone: false,
    restChoice: null,
    restDone: false,
    legendStage: 0,     // 0 нет сообщений, 1 "собери карту", 2 "жду тебя в 17:00"
    legendUnread: false,
    gearDone: false,
    gearBudgetExtra: 0,
    mapPieceCount: 0,
    seenAct2Splash: false,
    seenAct3Splash: false,
    // Динамически собранные выпуски газеты (фото + шаблон), кроме готовых
    newspaperIssues: [],
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
    titleSplash: renderTitleSplash,
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
    chapter2Intro: renderChapter2Intro,
    chapter2Silhouette: renderChapter2Silhouette,
    chapter2SilhouettePhoto: renderChapter2SilhouettePhoto,
    chapter2SilhouetteCompare: renderChapter2SilhouetteCompare,
    chapter2Code: renderChapter2Code,
    chapter2Photo: renderChapter2Photo,
    chapter2Submitted: renderChapter2Submitted,
    chapter2Praise: renderChapter2Praise,
    chapter2Reward: renderChapter2Reward,    shopChoice: renderShopChoice,
    shopRoute: renderShopRoute,
    shopSwear: renderShopSwear,
    restChoice: renderRestChoice,
    restRoute: renderRestRoute,
    restPhoto: renderRestPhoto,
    restSubmitted: renderRestSubmitted,
    legendLetter: renderLegendLetter,
    gearPuzzle: renderGearPuzzle,
    gearMap: renderGearMap,
    gearBudget: renderGearBudget,
    actSplash2: renderActSplash2,
    actSplash3: renderActSplash3,
  };
  if (state.screen.startsWith("companionApproach:")) {
    renderCompanionApproach(state.screen.split(":")[1]);
  } else if (state.screen.startsWith("companionDialogue:")) {
    renderCompanionDialogue(state.screen.split(":")[1]);
  } else if (state.screen.startsWith("mapPiece:")) {
    renderMapPiece(state.screen.split(":")[1]);
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
    btn(c.eatButtonText, () => {
      setHealth(CONFIG.stats.healthAfterBreakfast, CONFIG.stats.breakfastLabel);
      goTo("plateClue");
    }, "primary"),
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
function renderLoot() {
  const c = CONFIG.loot;
  app.appendChild(banner(c.eyebrow, c.title));

  const quote = document.createElement("p");
  quote.className = "quote-line";
  quote.textContent = c.quote;

  const riddleCard = document.createElement("div");
  riddleCard.className = "scroll-card";
  riddleCard.innerHTML = `<h3>${c.firstNoteTitle}</h3><p>${c.riddle}</p>`;

  const departZone = document.createElement("div");
  departZone.style.display = "flex";
  departZone.style.flexDirection = "column";
  departZone.style.gap = "14px";

  const departBtn = btn(c.departButtonText, () => {
    departZone.innerHTML = "";

    const heading = document.createElement("p");
    heading.className = "field-label";
    heading.textContent = c.secondNoteTitle;
    const promptText = p(c.departPrompt);

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

    [heading, promptText, nfcBtn, input, submit, statusSlot].forEach((el) => departZone.appendChild(el));
  }, "primary");

  departZone.appendChild(departBtn);

  app.appendChild(screenWrap([quote, riddleCard, departZone]));
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

function questDoneRow(title) {
  const row = document.createElement("div");
  row.className = "quest-done-row";
  row.innerHTML = `<span>${title}</span><span class="tick">✓</span>`;
  return row;
}

function renderHub() {
  const c = CONFIG.hub;
  const recruitedCount = Object.keys(state.recruited).length;
  const allRecruited = recruitedCount >= c.directions.length;

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

  // Лунные Башни появляются только когда весь отряд собран
  if (allRecruited) {
    if (state.chapter2Done) {
      children.push(questDoneRow(c.firstMission.title));
    } else {
      const mission = noteCard(c.firstMission.title, `<p>${c.firstMission.text}</p>`);
      mission.style.marginTop = "4px";
      children.push(mission, btn(CONFIG.chapter2.startButtonText, () => goTo("chapter2Intro"), "primary"));
    }
  }

  // Лавки в этот раз нет — сразу после награды за Башни идёт долгий отдых
  if (state.chapter2RewardClaimed) {
    if (state.restDone) {
      children.push(questDoneRow(CONFIG.chapter4.hubCardTitle));
    } else {
      const c4 = CONFIG.chapter4;
      const card = noteCard(c4.hubCardTitle, `<p>${c4.hubCardText}</p>`);
      card.style.marginTop = "4px";
      children.push(card, btn(c4.startButtonText, () => goTo("restChoice"), "primary"));
    }
  }

  // "Снарядиться в бой" открывается письмом от Легенды сразу после привала
  if (state.legendStage >= 1) {
    if (state.gearDone) {
      children.push(questDoneRow(CONFIG.chapter5.hubCardTitle));
    } else {
      const c5 = CONFIG.chapter5;
      const card = noteCard(c5.hubCardTitle, `<p>${c5.hubCardText}</p>`);
      card.style.marginTop = "4px";
      children.push(card, btn(c5.startButtonText, () => goTo("gearPuzzle"), "primary"));
    }
  }

  // Список направлений для поиска союзников — прячем целиком, как только
  // все трое найдены; посмотреть отряд можно через кнопку "Команда"
  if (!allRecruited) {
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
      if (done) {
        b.disabled = true;
      } else {
        b.addEventListener("click", () => goTo("companionApproach:" + d.companionId));
      }
      directionList.appendChild(b);
    });

    children.push(sectionLabel, directionList);
  }

  const secondary = document.createElement("div");
  secondary.className = "hub-secondary";
  secondary.appendChild(btn(c.newspaperButtonText, () => goTo("newspaper"), "ghost"));
  const teamBtn = btn(c.teamButtonText + (state.legendUnread ? " ●" : ""), () => goTo("roster"), "ghost");
  secondary.appendChild(teamBtn);

  children.push(secondary);
  app.appendChild(screenWrap(children));
}

// ---------------------------------------------------------------------
// Компаньон — приближение
// ---------------------------------------------------------------------
function findCompanion(id) {
  return CONFIG.companions.find((c) => c.id === id);
}

function portraitImg(src, alt) {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.onerror = function () {
    this.onerror = null;
    this.replaceWith(portraitFallback(src));
  };
  return img;
}

function portraitFallback(src) {
  const el = document.createElement("div");
  el.className = "vn-portrait-placeholder";
  el.innerHTML = `Портрет не найден<br><span style="opacity:.6">(${src})</span>`;
  return el;
}

function renderCompanionApproach(id) {
  const comp = findCompanion(id);
  if (!comp) { goTo("hub"); return; }

  app.appendChild(banner("Союзник", comp.name + "?"));

  const portrait = document.createElement("div");
  portrait.className = "vn-portrait-wrap";
  portrait.appendChild(portraitImg(comp.portrait, comp.name));

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
  portraitWrap.appendChild(portraitImg(joined ? comp.portraitJoined : comp.portrait, comp.name));
  const approvalBadge = document.createElement("div");
  approvalBadge.className = "vn-approval";
  approvalBadge.textContent = `${comp.approvalIcon} ${approval}`;
  portraitWrap.appendChild(approvalBadge);

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
      goTo("mapPiece:" + id);
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

  // Легенда — не физический союзник, а голос в переписке. Появляется в
  // команде только после первого сообщения (см. state.legendStage).
  if (state.legendStage >= 1) {
    const legend = CONFIG.legend;
    const row = document.createElement("button");
    row.className = "roster-item roster-item--clickable";
    row.innerHTML = `
      <span class="roster-left">
        <span class="roster-portrait roster-portrait--legend">${legend.icon}</span>
        <span>${legend.name}</span>
      </span>
      <span>${state.legendUnread ? '<span class="msg-badge">●</span> новое письмо' : "письмо прочитано"}</span>
    `;
    row.addEventListener("click", () => goTo("legendLetter"));
    list.appendChild(row);
  }

  app.appendChild(screenWrap([list, btn("Назад", () => goTo("hub"), "ghost")]));
}

// ---------------------------------------------------------------------
// Письмо от Легенды
// ---------------------------------------------------------------------
function renderLegendLetter() {
  const legend = CONFIG.legend;
  const msg = state.legendStage >= 2 ? legend.messages.stage2 : legend.messages.stage1;

  app.appendChild(banner("Письмо", legend.name));

  const letter = document.createElement("div");
  letter.className = "scroll-card";
  letter.innerHTML = `<p>${msg.text}</p>`;

  app.appendChild(screenWrap([
    letter,
    btn(msg.buttonText, () => {
      state.legendUnread = false;
      saveState();
      goTo("hub");
    }, "primary"),
  ]));
}

// ---------------------------------------------------------------------
// "Кусок карты" — лёгкий слайд-подтверждение после ключевых событий,
// без реального изображения карты, просто текст + эмодзи + кнопка.
// state.screen = "mapPiece:<id>", id — ключ в CONFIG.mapPieces.
// ---------------------------------------------------------------------
function renderMapPiece(id) {
  const piece = CONFIG.mapPieces[id];
  if (!piece) { goTo("hub"); return; }

  app.appendChild(banner("Находка", "Часть карты"));

  const emoji = document.createElement("p");
  emoji.style.fontSize = "48px";
  emoji.style.textAlign = "center";
  emoji.style.margin = "10px 0";
  emoji.textContent = piece.emoji;

  app.appendChild(screenWrap([
    p(piece.text),
    emoji,
    btn(CONFIG.mapPieceButtonText, () => {
      state.mapPieceCount = (state.mapPieceCount || 0) + 1;
      saveState();
      proceedAfterMapPiece(id);
    }, "primary"),
  ]));
}

// Что происходит после того, как игрок нажал "Собрать карту" — зависит от
// того, какое событие её выдало.
function proceedAfterMapPiece(id) {
  if (id === "towers") {
    goTo("chapter2Praise");
    return;
  }
  if (id === "rest") {
    if (!state.seenAct3Splash) {
      state.seenAct3Splash = true;
      saveState();
      goTo("actSplash3");
    } else {
      goTo("hub");
    }
    return;
  }
  // Иначе — id это компаньон: та же логика, что раньше была прямо в
  // обработчике вербовки (проверяем, не пора ли открыть 2 акт).
  const allRecruited = Object.keys(state.recruited).length >= CONFIG.hub.directions.length;
  if (allRecruited && !state.seenAct2Splash) {
    state.seenAct2Splash = true;
    saveState();
    goTo("actSplash2");
  } else {
    goTo("hub");
  }
}

function renderGoldHistory() {
  renderLogScreen("Хроника", "История золота", state.goldLog, "");
}

function renderHealthHistory() {
  renderLogScreen("Хроника", "История здоровья", state.healthLog, "");
}

// ---------------------------------------------------------------------
// Газета "Уста Балдура"
// ---------------------------------------------------------------------
// Одна картинка на выпуск: в свёрнутом виде контейнер обрезан по высоте
// (пропорционально настоящей ширине на экране), по тапу — плавно
// разворачивается до полной высоты той же картинки. Дублирования нет,
// потому что это ровно один <img>, а не две наложенные друг на друга.
function newspaperIssueBlock(issue) {
  const wrap = document.createElement("div");
  wrap.className = "newspaper-issue";

  const collapsible = document.createElement("button");
  collapsible.type = "button";
  collapsible.className = "newspaper-collapsible";
  collapsible.setAttribute("aria-expanded", "false");

  const img = document.createElement("img");
  img.src = issue.fullImage;
  img.alt = issue.title;
  collapsible.appendChild(img);

  let isOpen = false;

  function applyHeight() {
    if (!img.naturalWidth) return;
    const renderedWidth = collapsible.clientWidth;
    const scale = renderedWidth / img.naturalWidth;
    const collapsedPx = CONFIG.newspaper.foldHeight * scale;
    const fullPx = img.naturalHeight * scale;
    collapsible.style.maxHeight = (isOpen ? fullPx : collapsedPx) + "px";
  }

  if (img.complete) applyHeight();
  img.addEventListener("load", applyHeight);
  window.addEventListener("resize", applyHeight);

  collapsible.addEventListener("click", () => {
    isOpen = !isOpen;
    collapsible.setAttribute("aria-expanded", String(isOpen));
    applyHeight();
  });

  wrap.appendChild(collapsible);
  return wrap;
}

function renderNewspaper() {
  const c = CONFIG.newspaper;
  app.appendChild(banner("Пресса", c.title));

  const allIssues = [...state.newspaperIssues, ...c.issues];
  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "18px";

  if (allIssues.length === 0) {
    list.appendChild(statusMsg(c.emptyText, "error"));
  } else {
    allIssues.forEach((issue) => list.appendChild(newspaperIssueBlock(issue)));
  }

  app.appendChild(screenWrap([list, btn("Назад", () => goTo("hub"), "ghost")]));
}

// ---------------------------------------------------------------------
// Глава 2 — "В тени Лунных Башен"
// ---------------------------------------------------------------------
function renderChapter2Intro() {
  const c = CONFIG.chapter2;
  app.appendChild(banner(c.eyebrow, c.title));
  app.appendChild(screenWrap([
    p(c.intro.text),
    btn(c.intro.buttonText, () => goTo("chapter2Code"), "primary"),
  ]));
}

// ---------------------------------------------------------------------
// Охота за силуэтами — по очереди N зданий: карточка-силуэт (рваная
// бумага) → "Нашёл" → загрузка фото → сверка с тумблерами по деталям →
// либо дальше, либо подсказка и новая попытка того же здания.
// ---------------------------------------------------------------------
let silhouettePhotoDataUrl = null;

function currentBuilding() {
  return CONFIG.chapter2.silhouetteHunt.buildings[state.silhouetteIndex];
}

function renderChapter2Silhouette() {
  const hunt = CONFIG.chapter2.silhouetteHunt;
  const building = currentBuilding();
  if (!building) { goTo("chapter2Code"); return; }

  app.appendChild(banner(CONFIG.chapter2.eyebrow, hunt.title));

  const progress = document.createElement("p");
  progress.className = "field-label";
  progress.textContent = `Здание ${state.silhouetteIndex + 1} из ${hunt.buildings.length}`;

  const card = document.createElement("div");
  card.className = "scroll-card";
  const hintShown = !!state.silhouetteHints[building.id];
  card.innerHTML = `
    <h3>${hunt.cardTitle}</h3>
    <img src="${building.silhouette}" alt="Силуэт здания" style="display:block;width:100%;border-radius:2px;margin:8px 0;">
    <p>${building.captionHint}${hintShown ? " " + building.extraHint : ""}</p>
  `;

  app.appendChild(screenWrap([
    progress,
    card,
    btn(hunt.foundButtonText, () => goTo("chapter2SilhouettePhoto"), "primary"),
  ]));
}

function renderChapter2SilhouettePhoto() {
  const hunt = CONFIG.chapter2.silhouetteHunt;
  app.appendChild(banner(CONFIG.chapter2.eyebrow, hunt.title));

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "environment";

  const preview = document.createElement("div");

  const nextBtn = btn(hunt.nextButtonText, () => {
    if (!silhouettePhotoDataUrl) {
      preview.innerHTML = "";
      preview.appendChild(statusMsg("Сначала сделай фото.", "error"));
      return;
    }
    goTo("chapter2SilhouetteCompare");
  }, "primary");

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      silhouettePhotoDataUrl = reader.result;
      preview.innerHTML = `<img src="${silhouettePhotoDataUrl}" style="display:block;width:100%;border-radius:4px;margin-top:10px;">`;
    };
    reader.readAsDataURL(file);
  });

  app.appendChild(screenWrap([
    p(hunt.photoPrompt),
    input,
    preview,
    nextBtn,
  ]));
}

function renderChapter2SilhouetteCompare() {
  const hunt = CONFIG.chapter2.silhouetteHunt;
  const building = currentBuilding();
  app.appendChild(banner(CONFIG.chapter2.eyebrow, hunt.title));

  const compareRow = document.createElement("div");
  compareRow.className = "compare-row";
  compareRow.innerHTML = `
    <div class="compare-col">
      <span class="field-label">Твоё фото</span>
      <img src="${silhouettePhotoDataUrl || ""}" alt="Фото">
    </div>
    <div class="compare-col">
      <span class="field-label">Силуэт</span>
      <img src="${building.silhouette}" alt="Силуэт">
    </div>
  `;

  const toggleWrap = document.createElement("div");
  toggleWrap.className = "checklist";
  const featureState = building.features.map(() => false);

  building.features.forEach((feature, i) => {
    const row = document.createElement("div");
    row.className = "checklist-item";
    row.innerHTML = `<span class="checklist-icon">✕</span><span>${feature.label}</span>`;
    row.addEventListener("click", () => {
      featureState[i] = !featureState[i];
      row.classList.toggle("done", featureState[i]);
      row.querySelector(".checklist-icon").textContent = featureState[i] ? "✓" : "✕";
    });
    toggleWrap.appendChild(row);
  });

  const statusSlot = document.createElement("div");

  const confirmBtn = btn(hunt.confirmButtonText, () => {
    const allMatch = featureState.every(Boolean);
    silhouettePhotoDataUrl = null;

    if (allMatch) {
      state.silhouetteIndex += 1;
      saveState();
      if (state.silhouetteIndex >= hunt.buildings.length) {
        goTo("chapter2Code");
      } else {
        goTo("chapter2Silhouette");
      }
    } else {
      state.silhouetteHints[building.id] = true;
      saveState();
      statusSlot.innerHTML = "";
      statusSlot.appendChild(statusMsg(hunt.mismatchText, "error"));
      setTimeout(() => goTo("chapter2Silhouette"), 1400);
    }
  }, "primary");

  app.appendChild(screenWrap([compareRow, toggleWrap, confirmBtn, statusSlot]));
}

function renderChapter2Code() {
  const c = CONFIG.chapter2;
  const g = c.codeGate;
  app.appendChild(banner(c.eyebrow, c.title));

  const statusSlot = document.createElement("div");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = g.passwordPlaceholder;
  input.autocomplete = "off";

  const onOk = () => goTo("chapter2Photo");
  const onFail = (msg) => { statusSlot.innerHTML = ""; statusSlot.appendChild(statusMsg(msg, "error")); };

  const nfcBtn = btn(g.nfcButtonText, () => tryNfcScan(g.nfcCode, onOk, onFail), "primary");
  const submit = btn("Проверить слово", () => {
    if (normalize(input.value) === normalize(g.password)) onOk();
    else onFail(g.errorText);
  });

  app.appendChild(screenWrap([
    p(g.text),
    nfcBtn,
    (() => { const hr = document.createElement("p"); hr.className = "nfc-hint"; hr.textContent = "— или —"; return hr; })(),
    input,
    submit,
    statusSlot,
  ]));
}

function renderChapter2Photo() {
  const c = CONFIG.chapter2;
  app.appendChild(banner(c.eyebrow, c.title));

  const heading = document.createElement("h3");
  heading.style.margin = "0";
  heading.style.fontFamily = "var(--font-display)";
  heading.style.fontVariant = "small-caps";
  heading.textContent = c.photo.title;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.capture = "environment";
  fileInput.style.display = "none";

  const statusSlot = document.createElement("div");
  const uploadBtn = btn(c.photo.uploadButtonText, () => fileInput.click(), "primary");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    statusSlot.innerHTML = "";
    statusSlot.appendChild(statusMsg("Обрабатываю фото...", "ok"));
    composeNewspaperIssue(file, CONFIG.chapter2.newIssue)
      .then((issue) => {
        state.newspaperIssues.push(issue);
        state.chapter2Done = true;
        saveState();
        goTo("chapter2Submitted");
      })
      .catch((err) => {
        statusSlot.innerHTML = "";
        statusSlot.appendChild(statusMsg("Не получилось обработать фото: " + err.message, "error"));
      });
  });

  app.appendChild(screenWrap([heading, p(c.photo.text), uploadBtn, fileInput, statusSlot]));
}

function renderChapter2Submitted() {
  const c = CONFIG.chapter2;
  app.appendChild(banner(c.eyebrow, c.title));
  app.appendChild(screenWrap([
    statusMsg(c.submittedText, "ok"),
    btn(c.continueButtonText, () => goTo("mapPiece:towers"), "primary"),
  ]));
}

function renderChapter2Praise() {
  const c = CONFIG.chapter2.praise;
  app.appendChild(banner(c.eyebrow, c.title));
  app.appendChild(screenWrap([
    p(c.text),
    btn(c.buttonText, () => goTo("chapter2Reward"), "primary"),
  ]));
}

function renderChapter2Reward() {
  const c = CONFIG.chapter2.reward;

  if (!state.chapter2RewardClaimed) {
    addGold(c.amount, c.goldLogLabel);
    state.chapter2RewardClaimed = true;
    saveState();
  }

  app.appendChild(banner(c.eyebrow, c.title));

  const amountEl = document.createElement("p");
  amountEl.className = "hub-title";
  amountEl.style.margin = "0";
  amountEl.textContent = `+${c.amount} ${c.amountLabel}`;

  app.appendChild(screenWrap([
    amountEl,
    p(c.text),
    btn(c.walletButtonText, () => goTo("goldHistory"), "primary"),
  ]));
}

// Вклеивает присланное фото в шаблон газеты (canvas) и возвращает
// готовый "выпуск" — одну картинку (сворачивание/разворот делает
// newspaperIssueBlock на лету, отдельный файл-миниатюра не нужен).
// issueConfig — {title, templateImage, photoBox}, своя для каждого события.
function composeNewspaperIssue(file, issueConfig) {
  const c = issueConfig;

  return new Promise((resolve, reject) => {
    const templateImg = new Image();
    templateImg.onload = () => {
      const photoImg = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        photoImg.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = templateImg.width;
            canvas.height = templateImg.height;
            const ctx = canvas.getContext("2d");

            ctx.drawImage(templateImg, 0, 0);

            // Кадрируем фото "как cover" под размер квадрата в шаблоне
            const box = c.photoBox;
            const srcRatio = photoImg.width / photoImg.height;
            const boxRatio = box.width / box.height;
            let sx, sy, sw, sh;
            if (srcRatio > boxRatio) {
              sh = photoImg.height;
              sw = sh * boxRatio;
              sx = (photoImg.width - sw) / 2;
              sy = 0;
            } else {
              sw = photoImg.width;
              sh = sw / boxRatio;
              sx = 0;
              sy = (photoImg.height - sh) / 2;
            }

            ctx.save();
            ctx.filter = "grayscale(1) contrast(1.1) brightness(0.95)";
            ctx.drawImage(photoImg, sx, sy, sw, sh, box.x, box.y, box.width, box.height);
            ctx.restore();

            const fullDataUrl = canvas.toDataURL("image/jpeg", 0.85);

            resolve({
              id: "issue-" + Date.now(),
              title: c.title,
              fullImage: fullDataUrl,
            });
          } catch (e) {
            reject(e);
          }
        };
        photoImg.onerror = () => reject(new Error("не удалось прочитать фото"));
        photoImg.src = reader.result;
      };
      reader.onerror = () => reject(new Error("не удалось прочитать файл"));
      reader.readAsDataURL(file);
    };
    templateImg.onerror = () => reject(new Error("не удалось загрузить шаблон газеты"));
    templateImg.src = c.templateImage;
  });
}

// ---------------------------------------------------------------------
// Титульная заставка (самый первый экран)
// ---------------------------------------------------------------------
function renderTitleSplash() {
  const c = CONFIG.titleSplash;

  const wrap = document.createElement("div");
  wrap.className = "title-splash";
  wrap.style.backgroundImage = `url("${c.image}")`;

  const hint = document.createElement("p");
  hint.className = "title-splash-hint";
  hint.textContent = c.tapHint;
  wrap.appendChild(hint);

  wrap.addEventListener("click", () => goTo("intro"));
  app.appendChild(wrap);
}

// ---------------------------------------------------------------------
// Сплэши актов — во весь экран, между крупными частями квеста
// ---------------------------------------------------------------------
function renderActSplashGeneric(actConfig, nextScreen) {
  const wrap = document.createElement("div");
  wrap.className = "act-splash";
  wrap.innerHTML = `
    <span class="act-splash-number">Акт ${actConfig.number}</span>
    <span class="act-splash-title">${actConfig.title}</span>
    <span class="act-splash-hint">Нажмите в любом месте</span>
  `;
  wrap.addEventListener("click", () => goTo(nextScreen));
  app.appendChild(wrap);
}

function renderActSplash2() {
  renderActSplashGeneric(CONFIG.acts.act2, "hub");
}

function renderActSplash3() {
  renderActSplashGeneric(CONFIG.acts.act3, "hub");
}

// ---------------------------------------------------------------------
// Глава 3 — "Трофеи с поля боя" (лавка)
// ---------------------------------------------------------------------
function renderShopChoice() {
  const c = CONFIG.chapter3;
  app.appendChild(banner(c.eyebrow, c.title));

  const optionList = document.createElement("div");
  optionList.className = "direction-list";
  c.options.forEach((opt) => {
    const b = document.createElement("button");
    b.className = "direction-btn";
    b.innerHTML = `<span>${opt.name}</span>`;
    b.addEventListener("click", () => {
      state.shopChoice = opt.id;
      saveState();
      goTo("shopRoute");
    });
    optionList.appendChild(b);
  });

  app.appendChild(screenWrap([p(c.choiceText), optionList]));
}

function renderShopRoute() {
  const c = CONFIG.chapter3;
  const opt = c.options.find((o) => o.id === state.shopChoice) || c.options[0];
  app.appendChild(banner(c.eyebrow, opt.name));
  app.appendChild(screenWrap([
    p(opt.flavor),
    btn(c.routeButtonText, () => goTo("shopSwear"), "primary"),
  ]));
}

function renderShopSwear() {
  const c = CONFIG.chapter3;
  app.appendChild(banner(c.eyebrow, c.title));

  const quote = document.createElement("p");
  quote.className = "quote-line";
  quote.textContent = c.quote;

  app.appendChild(screenWrap([
    quote,
    btn(c.continueButtonText, () => {
      state.shopDone = true;
      saveState();
      goTo("hub");
    }, "primary"),
  ]));
}

// ---------------------------------------------------------------------
// Глава 4 — "Долгий привал"
// ---------------------------------------------------------------------
function renderRestChoice() {
  const c = CONFIG.chapter4;
  app.appendChild(banner(c.eyebrow, c.title));

  const optionList = document.createElement("div");
  optionList.className = "direction-list";
  c.options.forEach((opt) => {
    const b = document.createElement("button");
    b.className = "direction-btn";
    b.innerHTML = `<span>${opt.name}</span>`;
    b.addEventListener("click", () => {
      state.restChoice = opt.id;
      saveState();
      goTo("restRoute");
    });
    optionList.appendChild(b);
  });

  app.appendChild(screenWrap([p(c.choiceText), optionList]));
}

function renderRestRoute() {
  const c = CONFIG.chapter4;
  const opt = c.options.find((o) => o.id === state.restChoice) || c.options[0];
  app.appendChild(banner(c.eyebrow, opt.name));
  app.appendChild(screenWrap([
    p(opt.flavor),
    btn(c.startButtonText2, () => goTo("restPhoto"), "primary"),
  ]));
}

function renderRestPhoto() {
  const c = CONFIG.chapter4;
  app.appendChild(banner(c.eyebrow, c.photo.title));

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.capture = "environment";
  fileInput.style.display = "none";

  const statusSlot = document.createElement("div");
  const uploadBtn = btn(c.photo.uploadButtonText, () => fileInput.click(), "primary");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    statusSlot.innerHTML = "";
    statusSlot.appendChild(statusMsg("Обрабатываю фото...", "ok"));
    composeNewspaperIssue(file, c.newIssue)
      .then((issue) => {
        state.newspaperIssues.push(issue);
        saveState();
        goTo("restSubmitted");
      })
      .catch((err) => {
        statusSlot.innerHTML = "";
        statusSlot.appendChild(statusMsg("Не получилось обработать фото: " + err.message, "error"));
      });
  });

  app.appendChild(screenWrap([p(c.photo.text), uploadBtn, fileInput, statusSlot]));
}

function renderRestSubmitted() {
  const c = CONFIG.chapter4;
  app.appendChild(banner(c.eyebrow, c.title));
  app.appendChild(screenWrap([
    statusMsg(c.submittedText, "ok"),
    btn(c.finishButtonText, () => {
      state.restDone = true;
      state.legendStage = 1;
      state.legendUnread = true;
      saveState();
      goTo("mapPiece:rest");
    }, "primary"),
  ]));
}

// ---------------------------------------------------------------------
// Глава 5 — "Снарядиться в бой": тап-пазл карты → адрес → бюджет
// ---------------------------------------------------------------------
let gearPuzzleOrder = [];

function renderGearPuzzle() {
  const c = CONFIG.chapter5.puzzle;
  app.appendChild(banner(CONFIG.chapter5.eyebrow, c.title));

  gearPuzzleOrder = [];

  const grid = document.createElement("div");
  grid.className = "gear-puzzle-grid";

  const statusSlot = document.createElement("div");

  const shuffled = c.pieces.map((piece, i) => ({ piece, i })).sort(() => Math.random() - 0.5);

  shuffled.forEach(({ piece, i }) => {
    const tile = document.createElement("button");
    tile.className = "gear-puzzle-tile";
    tile.textContent = piece.label;
    tile.addEventListener("click", () => {
      if (tile.disabled) return;
      const expectedNext = gearPuzzleOrder.length;
      if (i === expectedNext) {
        tile.disabled = true;
        tile.classList.add("done");
        gearPuzzleOrder.push(i);
        if (gearPuzzleOrder.length === c.pieces.length) {
          setTimeout(() => goTo("gearMap"), 400);
        }
      } else {
        statusSlot.innerHTML = "";
        statusSlot.appendChild(statusMsg(c.mistakeText, "error"));
        gearPuzzleOrder = [];
        grid.querySelectorAll(".gear-puzzle-tile").forEach((t) => {
          t.disabled = false;
          t.classList.remove("done");
        });
      }
    });
    grid.appendChild(tile);
  });

  app.appendChild(screenWrap([p(c.instructions), grid, statusSlot]));
}

function renderGearMap() {
  const c = CONFIG.chapter5;
  app.appendChild(banner(c.eyebrow, "Карта собрана"));

  const card = document.createElement("div");
  card.className = "scroll-card";
  card.innerHTML = `<p class="quote-line" style="border:none;padding:0;">${c.mapAddress}</p>`;

  app.appendChild(screenWrap([
    card,
    btn(c.mapButtonText, () => goTo("gearBudget"), "primary"),
  ]));
}

function renderGearBudget() {
  const c = CONFIG.chapter5.budget;
  app.appendChild(banner(CONFIG.chapter5.eyebrow, "Закуп перед боем"));

  const totalEl = document.createElement("p");
  totalEl.className = "hub-title";
  totalEl.style.margin = "0";

  function renderTotal() {
    totalEl.textContent = `${c.amount + state.gearBudgetExtra} ₽`;
  }
  renderTotal();

  const input = document.createElement("input");
  input.type = "number";
  input.placeholder = c.addPlaceholder;
  input.min = "0";

  const addBtn = btn(c.addLabel, () => {
    const value = parseInt(input.value, 10);
    if (!isNaN(value) && value > 0) {
      state.gearBudgetExtra += value;
      saveState();
      renderTotal();
      input.value = "";
    }
  });

  app.appendChild(screenWrap([
    p(c.text),
    totalEl,
    input,
    addBtn,
    btn(c.readyButtonText, () => {
      state.gearDone = true;
      state.legendStage = 2;
      state.legendUnread = true;
      saveState();
      goTo("hub");
    }, "primary"),
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
