const MEAL_TYPES = [
  { key: "breakfast", label: "Завтрак", icon: "🌅" },
  { key: "lunch", label: "Обед", icon: "🍲" },
  { key: "dinner", label: "Ужин", icon: "🌙" },
  { key: "snack", label: "Перекус", icon: "🍎" }
];

const WEEKEND_MEAL_LABELS = [
  { key: "breakfast", label: "Завтрак", icon: "🌅" },
  { key: "lunch", label: "Обед", icon: "🍲" },
  { key: "dinner", label: "Ужин", icon: "🌙" }
];

let menuData = null;
let allTabs = [];
let selections = { byDay: {}, byGroup: {} };
let checkedItems = {};
let activeTabIndex = 0;
let storageKeySelections = "familyMenu:selections:default";
let storageKeyChecked = "familyMenu:shoppingChecked:default";

function weekStorageKey(prefix) {
  const week = (menuData && menuData.week) || "default";
  return `${prefix}:${week}`;
}

function loadJSON(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    return raw || fallback;
  } catch (e) {
    return fallback;
  }
}

function saveSelections() {
  localStorage.setItem(storageKeySelections, JSON.stringify(selections));
}

function saveChecked() {
  localStorage.setItem(storageKeyChecked, JSON.stringify(checkedItems));
}

function getBju(variant) {
  return variant.bju || variant.bju_per_portion || null;
}

function findGroup(groupId) {
  return (menuData.lunchGroups || []).find((g) => g.id === groupId);
}

function resolveMealSlot(day, mealKey) {
  if (mealKey === "lunch" && day.lunchGroupRef) {
    const group = findGroup(day.lunchGroupRef);
    if (group) return { kind: "group", group };
  }
  const raw = day.meals ? day.meals[mealKey] : undefined;
  if (!raw) return null;
  if (Array.isArray(raw)) return { kind: "variants", variants: raw };
  if (typeof raw === "object") return { kind: "info", info: raw };
  return null;
}

async function init() {
  const res = await fetch("menu.json");
  menuData = await res.json();

  storageKeySelections = weekStorageKey("familyMenu:selections");
  storageKeyChecked = weekStorageKey("familyMenu:shoppingChecked");
  selections = loadJSON(storageKeySelections, { byDay: {}, byGroup: {} });
  checkedItems = loadJSON(storageKeyChecked, {});

  document.getElementById("weekLabel").textContent = menuData.week || "";
  renderMenuInfo();

  allTabs = menuData.days.map((day) => ({ kind: "day", day }));
  if (menuData.weekend) {
    Object.keys(menuData.weekend).forEach((name) => {
      allTabs.push({ kind: "weekend", name, data: menuData.weekend[name] });
    });
  }

  renderTabs();
  renderActiveTab();

  document.getElementById("shoppingListBtn").addEventListener("click", openShoppingList);
  document.getElementById("closeShoppingBtn").addEventListener("click", closeShoppingList);
  document.getElementById("shoppingOverlay").addEventListener("click", (e) => {
    if (e.target.id === "shoppingOverlay") closeShoppingList();
  });
  document.getElementById("resetBtn").addEventListener("click", resetWeek);
}

function renderMenuInfo() {
  const el = document.getElementById("menuInfo");
  el.innerHTML = "";
  const parts = [];
  if (menuData.servingsBase) parts.push(menuData.servingsBase);
  if (Array.isArray(menuData.notes)) parts.push(...menuData.notes);
  if (parts.length === 0) return;

  const list = document.createElement("ul");
  list.className = "menu-info-list";
  parts.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  });
  el.appendChild(list);
}

function renderTabs() {
  const nav = document.getElementById("dayTabs");
  nav.innerHTML = "";
  allTabs.forEach((tab, index) => {
    const btn = document.createElement("button");
    btn.className = "day-tab" + (index === activeTabIndex ? " active" : "") + (tab.kind === "weekend" ? " weekend" : "");
    btn.textContent = tab.kind === "day" ? tab.day.day : tab.name;
    btn.addEventListener("click", () => {
      activeTabIndex = index;
      renderTabs();
      renderActiveTab();
    });
    nav.appendChild(btn);
  });
}

function renderActiveTab() {
  const tab = allTabs[activeTabIndex];
  const container = document.getElementById("dayContent");
  container.innerHTML = "";
  if (tab.kind === "day") {
    renderDay(container, tab.day);
  } else {
    renderWeekendDay(container, tab.name, tab.data);
  }
}

function renderDay(container, day) {
  MEAL_TYPES.forEach((mealType) => {
    const slot = resolveMealSlot(day, mealType.key);
    if (!slot) return;

    const section = document.createElement("section");
    section.className = "meal-section";

    const title = document.createElement("h2");
    title.className = "meal-title";
    title.textContent = `${mealType.icon} ${mealType.label}`;
    section.appendChild(title);

    if (slot.kind === "group") {
      const badge = document.createElement("div");
      badge.className = "group-badge";
      badge.textContent = `Общий выбор: ${slot.group.days.join(" + ")} — готовится один раз`;
      section.appendChild(badge);
      section.appendChild(renderVariantCards(slot.group.options, (idx) => selections.byGroup[slot.group.id] === idx, (idx) => {
        selections.byGroup[slot.group.id] = idx;
        saveSelections();
        renderActiveTab();
      }));
    } else if (slot.kind === "variants") {
      section.appendChild(renderVariantCards(slot.variants, (idx) => {
        const daySel = selections.byDay[day.day];
        return !!daySel && daySel[mealType.key] === idx;
      }, (idx) => {
        if (!selections.byDay[day.day]) selections.byDay[day.day] = {};
        selections.byDay[day.day][mealType.key] = idx;
        saveSelections();
        renderActiveTab();
      }));
    } else if (slot.kind === "info") {
      section.appendChild(renderInfoCard(slot.info));
    }

    container.appendChild(section);
  });
}

function renderVariantCards(variants, isSelectedFn, onSelect) {
  const cardsWrap = document.createElement("div");
  cardsWrap.className = "meal-cards";

  variants.forEach((variant, variantIndex) => {
    const isSelected = isSelectedFn(variantIndex);

    const card = document.createElement("div");
    card.className = "meal-card" + (isSelected ? " selected" : "");

    const top = document.createElement("div");
    top.className = "meal-card-top";

    const radio = document.createElement("div");
    radio.className = "meal-card-radio";

    const name = document.createElement("div");
    name.className = "meal-card-name";
    name.textContent = variant.name;

    top.appendChild(radio);
    top.appendChild(name);
    card.appendChild(top);

    const bju = getBju(variant);
    if (bju) {
      const bjuEl = document.createElement("div");
      bjuEl.className = "meal-card-bju";
      bjuEl.textContent = `Б${bju.protein_g} / Ж${bju.fat_g} / У${bju.carbs_g} · ${bju.kcal} ккал`;
      card.appendChild(bjuEl);
    }

    const ingredients = document.createElement("div");
    ingredients.className = "meal-card-ingredients";
    ingredients.textContent = variant.ingredients.map((i) => `${i.name} (${i.amount})`).join(", ");
    card.appendChild(ingredients);

    card.addEventListener("click", () => onSelect(variantIndex));

    cardsWrap.appendChild(card);
  });

  return cardsWrap;
}

function renderInfoCard(info) {
  const card = document.createElement("div");
  card.className = "info-card";
  const title = document.createElement("div");
  title.className = "info-card-title";
  title.textContent = info.type === "order_in" ? "🛵 Заказываем еду" : "ℹ️ Без готовки";
  card.appendChild(title);
  if (info.note) {
    const note = document.createElement("div");
    note.className = "info-card-note";
    note.textContent = info.note;
    card.appendChild(note);
  }
  return card;
}

function renderWeekendDay(container, name, data) {
  const section = document.createElement("section");
  section.className = "meal-section";

  WEEKEND_MEAL_LABELS.forEach((mealType) => {
    const text = data[mealType.key];
    if (!text) return;
    const row = document.createElement("div");
    row.className = "weekend-row";
    const label = document.createElement("div");
    label.className = "weekend-row-label";
    label.textContent = `${mealType.icon} ${mealType.label}`;
    const value = document.createElement("div");
    value.className = "weekend-row-value";
    value.textContent = text;
    row.appendChild(label);
    row.appendChild(value);
    section.appendChild(row);
  });

  container.appendChild(section);

  if (data.prep) {
    const tip = document.createElement("div");
    tip.className = "info-card";
    const title = document.createElement("div");
    title.className = "info-card-title";
    title.textContent = "📝 Заготовка заранее";
    tip.appendChild(title);
    const note = document.createElement("div");
    note.className = "info-card-note";
    note.textContent = data.prep;
    tip.appendChild(note);
    container.appendChild(tip);
  }
}

function resetWeek() {
  const ok = confirm("Очистить весь выбор блюд на неделю и список покупок?");
  if (!ok) return;
  selections = { byDay: {}, byGroup: {} };
  checkedItems = {};
  saveSelections();
  saveChecked();
  renderActiveTab();
}

// --- Shopping list ---

function normalizeUnit(unitRaw) {
  const u = unitRaw.trim().toLowerCase();
  if (/^ломт/.test(u)) return "ломтик";
  if (/^шт/.test(u)) return "шт";
  if (/^банк/.test(u)) return "банка";
  if (/^пач/.test(u)) return "пачка";
  if (/^зубч/.test(u)) return "зубчик";
  if (/^доль/.test(u)) return "долька";
  if (/^стак/.test(u)) return "стакан";
  if (/^бутыл/.test(u)) return "бутылка";
  if (/^ст\.?\s*л/.test(u)) return "ст.л.";
  if (/^ч\.?\s*л/.test(u)) return "ч.л.";
  return u;
}

function parseAmount(amountStr) {
  const match = amountStr.trim().match(/^([\d]+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return { numeric: false, text: amountStr.trim() };
  const value = parseFloat(match[1].replace(",", "."));
  const unit = normalizeUnit(match[2] || "");
  return { numeric: true, value, unit };
}

function formatNumber(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function addIngredientsToGroups(groups, ingredients) {
  ingredients.forEach((ing) => {
    const parsed = parseAmount(ing.amount);
    if (parsed.numeric) {
      const key = `${ing.name}__${parsed.unit}`;
      if (!groups[key]) {
        groups[key] = { name: ing.name, numeric: true, value: 0, unit: parsed.unit };
      }
      groups[key].value += parsed.value;
    } else {
      const key = `${ing.name}__text__${parsed.text}`;
      if (!groups[key]) {
        groups[key] = { name: ing.name, numeric: false, text: parsed.text, count: 0 };
      }
      groups[key].count += 1;
    }
  });
}

function buildShoppingList() {
  const groups = {};

  menuData.days.forEach((day) => {
    MEAL_TYPES.forEach((mealType) => {
      const slot = resolveMealSlot(day, mealType.key);
      if (!slot || slot.kind !== "variants") return;
      const daySel = selections.byDay[day.day];
      const idx = daySel ? daySel[mealType.key] : undefined;
      if (idx === undefined || idx === null) return;
      const variant = slot.variants[idx];
      if (!variant) return;
      addIngredientsToGroups(groups, variant.ingredients);
    });
  });

  (menuData.lunchGroups || []).forEach((group) => {
    const idx = selections.byGroup[group.id];
    if (idx === undefined || idx === null) return;
    const variant = group.options[idx];
    if (!variant) return;
    addIngredientsToGroups(groups, variant.ingredients);
  });

  return Object.keys(groups)
    .map((key) => ({ key, ...groups[key] }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function openShoppingList() {
  const items = buildShoppingList();
  const body = document.getElementById("shoppingListBody");
  body.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "shopping-empty";
    empty.textContent = "Пока не выбрано ни одного блюда. Отметьте варианты на неделю, и список появится здесь.";
    body.appendChild(empty);
  } else {
    items.forEach((item) => {
      const row = document.createElement("label");
      const isChecked = !!checkedItems[item.key];
      row.className = "shopping-item" + (isChecked ? " checked" : "");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = isChecked;
      checkbox.addEventListener("change", () => {
        checkedItems[item.key] = checkbox.checked;
        saveChecked();
        row.classList.toggle("checked", checkbox.checked);
      });

      const text = document.createElement("span");
      text.className = "shopping-item-text";
      text.textContent = item.name;

      const amount = document.createElement("span");
      amount.className = "shopping-item-amount";
      amount.textContent = item.numeric
        ? `${formatNumber(item.value)} ${item.unit}`
        : (item.count > 1 ? `${item.text} (x${item.count})` : item.text);

      row.appendChild(checkbox);
      row.appendChild(text);
      row.appendChild(amount);
      body.appendChild(row);
    });
  }

  document.getElementById("shoppingOverlay").classList.remove("hidden");
}

function closeShoppingList() {
  document.getElementById("shoppingOverlay").classList.add("hidden");
}

init();
