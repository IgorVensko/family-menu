const MEAL_TYPES = [
  { key: "breakfast", label: "Завтрак", icon: "🌅" },
  { key: "lunch", label: "Обед", icon: "🍲" },
  { key: "dinner", label: "Ужин", icon: "🌙" },
  { key: "snack", label: "Перекус", icon: "🍎" }
];

const STORAGE_SELECTIONS = "familyMenu:selections";
const STORAGE_CHECKED = "familyMenu:shoppingChecked";

let menuData = null;
let selections = loadSelections();
let checkedItems = loadChecked();
let activeDayIndex = 0;

function loadSelections() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_SELECTIONS)) || {};
  } catch (e) {
    return {};
  }
}

function saveSelections() {
  localStorage.setItem(STORAGE_SELECTIONS, JSON.stringify(selections));
}

function loadChecked() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_CHECKED)) || {};
  } catch (e) {
    return {};
  }
}

function saveChecked() {
  localStorage.setItem(STORAGE_CHECKED, JSON.stringify(checkedItems));
}

async function init() {
  const res = await fetch("menu.json");
  menuData = await res.json();

  document.getElementById("weekLabel").textContent = menuData.week || "";

  renderDayTabs();
  renderDay(activeDayIndex);

  document.getElementById("shoppingListBtn").addEventListener("click", openShoppingList);
  document.getElementById("closeShoppingBtn").addEventListener("click", closeShoppingList);
  document.getElementById("shoppingOverlay").addEventListener("click", (e) => {
    if (e.target.id === "shoppingOverlay") closeShoppingList();
  });
  document.getElementById("resetBtn").addEventListener("click", resetWeek);
}

function renderDayTabs() {
  const nav = document.getElementById("dayTabs");
  nav.innerHTML = "";
  menuData.days.forEach((day, index) => {
    const btn = document.createElement("button");
    btn.className = "day-tab" + (index === activeDayIndex ? " active" : "");
    btn.textContent = day.day;
    btn.addEventListener("click", () => {
      activeDayIndex = index;
      renderDayTabs();
      renderDay(activeDayIndex);
    });
    nav.appendChild(btn);
  });
}

function renderDay(index) {
  const day = menuData.days[index];
  const container = document.getElementById("dayContent");
  container.innerHTML = "";

  MEAL_TYPES.forEach((mealType) => {
    const variants = day.meals[mealType.key];
    if (!variants) return;

    const section = document.createElement("section");
    section.className = "meal-section";

    const title = document.createElement("h2");
    title.className = "meal-title";
    title.textContent = `${mealType.icon} ${mealType.label}`;
    section.appendChild(title);

    const cardsWrap = document.createElement("div");
    cardsWrap.className = "meal-cards";

    variants.forEach((variant, variantIndex) => {
      const selectedIndex = selections[day.day] && selections[day.day][mealType.key];
      const isSelected = selectedIndex === variantIndex;

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

      const bju = document.createElement("div");
      bju.className = "meal-card-bju";
      bju.textContent = `Б${variant.bju.protein_g} / Ж${variant.bju.fat_g} / У${variant.bju.carbs_g} · ${variant.bju.kcal} ккал`;
      card.appendChild(bju);

      const ingredients = document.createElement("div");
      ingredients.className = "meal-card-ingredients";
      ingredients.textContent = variant.ingredients.map(i => `${i.name} (${i.amount})`).join(", ");
      card.appendChild(ingredients);

      card.addEventListener("click", () => {
        if (!selections[day.day]) selections[day.day] = {};
        selections[day.day][mealType.key] = variantIndex;
        saveSelections();
        renderDay(activeDayIndex);
      });

      cardsWrap.appendChild(card);
    });

    section.appendChild(cardsWrap);
    container.appendChild(section);
  });
}

function resetWeek() {
  const ok = confirm("Очистить весь выбор блюд на неделю и список покупок?");
  if (!ok) return;
  selections = {};
  checkedItems = {};
  saveSelections();
  saveChecked();
  renderDay(activeDayIndex);
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

function buildShoppingList() {
  const groups = {};

  menuData.days.forEach((day) => {
    const daySel = selections[day.day];
    if (!daySel) return;

    MEAL_TYPES.forEach((mealType) => {
      const variantIndex = daySel[mealType.key];
      if (variantIndex === undefined || variantIndex === null) return;
      const variant = day.meals[mealType.key] && day.meals[mealType.key][variantIndex];
      if (!variant) return;

      variant.ingredients.forEach((ing) => {
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
    });
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
