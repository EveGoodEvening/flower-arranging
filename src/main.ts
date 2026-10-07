import "./style.css";
import { FLOWERS, VASES, PRESETS, cloneArrangement } from "./catalog";
import type { Arrangement, FlowerKind, Stem, VaseKind } from "./catalog";
import { FlowerStudio } from "./studio";

const DRAFT_KEY = "fleur-atelier:draft:v1";
const GALLERY_KEY = "fleur-atelier:gallery:v1";
const MAX_STEMS = 36;
const COLOR_NAMES: Record<FlowerKind, string[]> = {
  rose: ["奶油杏", "烟粉", "豆沙红", "象牙白"],
  tulip: ["蜜桃粉", "香草白", "莓果紫", "落日黄"],
  cosmos: ["蔷薇粉", "月光白", "酒红", "暖杏"],
  hydrangea: ["雾蓝", "青柠绿", "丁香紫", "奶油白"],
  chamomile: ["自然白", "蜂蜜黄", "樱花粉"],
  eucalyptus: ["灰绿", "森林绿", "鼠尾草"],
};
interface SavedWork {
  id: string;
  arrangement: Arrangement;
  image: string;
  savedAt: string;
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing interface element: ${selector}`);
  return found;
}

function isArrangement(value: unknown): value is Arrangement {
  if (!value || typeof value !== "object") return false;
  const item = value as Arrangement;
  if (
    typeof item.name !== "string" ||
    item.name.length > 30 ||
    !VASES.some((vase) => vase.id === item.vase) ||
    !/^#[0-9a-f]{6}$/i.test(item.vaseColor) ||
    !["linen", "sage", "rose"].includes(item.background) ||
    !Array.isArray(item.stems) ||
    item.stems.length > MAX_STEMS
  )
    return false;
  const ids = new Set<string>();
  return item.stems.every((stem) => {
    if (
      !stem ||
      typeof stem.id !== "string" ||
      ids.has(stem.id) ||
      !FLOWERS.some((flower) => flower.id === stem.kind) ||
      !/^#[0-9a-f]{6}$/i.test(stem.color)
    )
      return false;
    ids.add(stem.id);
    return (
      Number.isFinite(stem.seed) &&
      Number.isFinite(stem.x) &&
      Math.abs(stem.x) <= 0.2 &&
      Number.isFinite(stem.z) &&
      Math.abs(stem.z) <= 0.2 &&
      Number.isFinite(stem.height) &&
      stem.height >= 0.65 &&
      stem.height <= 1.35 &&
      Number.isFinite(stem.tilt) &&
      stem.tilt >= 0 &&
      stem.tilt <= 42 &&
      Number.isFinite(stem.rotation) &&
      stem.rotation >= 0 &&
      stem.rotation <= 360
    );
  });
}

let arrangement = cloneArrangement(PRESETS[0].arrangement);
let works: SavedWork[] = [];
try {
  const draft: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
  if (isArrangement(draft)) arrangement = draft;
  const stored: unknown = JSON.parse(localStorage.getItem(GALLERY_KEY) ?? "[]");
  if (Array.isArray(stored))
    works = stored
      .filter((work): work is SavedWork =>
        Boolean(
          work &&
            typeof work.id === "string" &&
            isArrangement(work.arrangement) &&
            typeof work.image === "string" &&
            work.image.startsWith("data:image/jpeg;") &&
            typeof work.savedAt === "string",
        ),
      )
      .slice(0, 12);
} catch {
  // A blocked or cleared browser store never prevents arranging flowers.
}
let selectedId: string | null =
  arrangement.stems.find((stem) => stem.kind === "rose")?.id ??
  arrangement.stems[0]?.id ??
  null;
let activeTab: "flowers" | "vases" = "flowers";
let category = "all";
let activePreset: string | null = null;
let studio: FlowerStudio;
let orbitEnabled = true;
let saveTimer = 0;
let toastTimer = 0;
let storageWarningShown = false;
let editingSlider: HTMLInputElement | null = null;
const past: Arrangement[] = [];
const future: Arrangement[] = [];
const stage = element("#stage");

function toast(message: string) {
  const node = element("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => node.classList.remove("is-visible"),
    3200,
  );
}
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(arrangement));
  } catch {
    if (!storageWarningShown) {
      toast("浏览器未允许保存草稿，你仍可以下载作品图片。");
      storageWarningShown = true;
    }
  }
}
function scheduleDraft() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveDraft, 250);
}
function remember() {
  past.push(cloneArrangement(arrangement));
  if (past.length > 60) past.shift();
  future.length = 0;
  activePreset = null;
}
function editArrangement(change: () => void, message?: string) {
  remember();
  change();
  refresh();
  scheduleDraft();
  if (message) toast(message);
}
function selectStem(id: string | null) {
  selectedId = id;
  refreshSelection();
  refreshCatalog();
}

function refreshSelection() {
  const stem = arrangement.stems.find((item) => item.id === selectedId);
  element("#selection-empty").hidden = Boolean(stem);
  element("#selection-controls").hidden = !stem;
  if (!stem) return;
  const flower = FLOWERS.find((item) => item.id === stem.kind)!;
  element("#selected-name").textContent = flower.name;
  element("#selected-latin").textContent = flower.latin;
  element("#selected-description").textContent = flower.description;
  const preview = element<HTMLImageElement>("#selected-preview");
  preview.src = studio.thumbnail(stem.kind, stem.color);
  preview.alt = flower.name;
  const swatches = element("#color-swatches");
  swatches.replaceChildren(
    ...flower.colors.map((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `color-swatch${stem.color === color ? " is-active" : ""}`;
      button.style.setProperty("--swatch", color);
      button.dataset.color = color;
      button.title = COLOR_NAMES[stem.kind][index];
      button.setAttribute(
        "aria-label",
        `${flower.name} · ${COLOR_NAMES[stem.kind][index]}`,
      );
      button.setAttribute("aria-pressed", String(stem.color === color));
      return button;
    }),
  );
  const controls: { name: "height" | "tilt" | "rotation"; text: string }[] = [
    { name: "height", text: `${Math.round(stem.height * 100)}%` },
    { name: "tilt", text: `${stem.tilt}°` },
    { name: "rotation", text: `${stem.rotation}°` },
  ];
  for (const control of controls) {
    const input = element<HTMLInputElement>(`#${control.name}-control`);
    input.value = String(stem[control.name]);
    const percent =
      ((Number(input.value) - Number(input.min)) /
        (Number(input.max) - Number(input.min))) *
      100;
    input.style.background = `linear-gradient(90deg, #899971 ${percent}%, #e3e7d9 ${percent}%)`;
    element(`#${control.name}-value`).textContent = control.text;
  }
}
function refreshCatalog() {
  const query = element<HTMLInputElement>("#catalog-search")
    .value.trim()
    .toLowerCase();
  const selected = arrangement.stems.find((stem) => stem.id === selectedId);
  for (const flower of FLOWERS) {
    const card = document.querySelector<HTMLButtonElement>(
      `.flower-card[data-kind="${flower.id}"]`,
    );
    if (!card) continue;
    card.hidden =
      (category !== "all" && flower.category !== category) ||
      !`${flower.name} ${flower.latin}`.toLowerCase().includes(query);
    card.classList.toggle("is-selected", selected?.kind === flower.id);
    const count = arrangement.stems.filter(
      (stem) => stem.kind === flower.id,
    ).length;
    card.querySelector(".card-count")!.textContent = count ? String(count) : "";
  }
  for (const vase of VASES) {
    const card = document.querySelector<HTMLButtonElement>(
      `.vase-card[data-vase="${vase.id}"]`,
    );
    if (!card) continue;
    card.hidden = !`${vase.name} ${vase.english}`.toLowerCase().includes(query);
    card.classList.toggle("is-selected", arrangement.vase === vase.id);
    card.setAttribute("aria-pressed", String(arrangement.vase === vase.id));
  }
  const grid = element(activeTab === "flowers" ? "#flower-grid" : "#vase-grid");
  let empty = grid.querySelector<HTMLElement>(".catalog-empty");
  const hasResults = Array.from(
    grid.querySelectorAll<HTMLButtonElement>("button"),
  ).some((card) => !card.hidden);
  if (!hasResults && !empty) {
    empty = document.createElement("p");
    empty.className = "catalog-empty";
    empty.textContent = "暂时没有找到，换个名字试试。";
    grid.append(empty);
  }
  if (empty) empty.hidden = hasResults;
}
function refresh() {
  if (!arrangement.stems.some((stem) => stem.id === selectedId))
    selectedId = arrangement.stems.at(-1)?.id ?? null;
  studio.setArrangement(arrangement);
  element("#stem-count").textContent = String(arrangement.stems.length);
  element<HTMLInputElement>("#artwork-name").value = arrangement.name;
  element<HTMLButtonElement>("#undo-button").disabled = past.length === 0;
  element<HTMLButtonElement>("#redo-button").disabled = future.length === 0;
  element<HTMLButtonElement>("#clear-button").disabled =
    arrangement.stems.length === 0;
  const vase = VASES.find((item) => item.id === arrangement.vase)!;
  element("#current-vase-name").textContent = vase.name;
  element<HTMLImageElement>("#current-vase-image").src = studio.thumbnail(
    vase.id,
    arrangement.vaseColor,
    true,
  );
  element<HTMLImageElement>("#current-vase-image").alt = vase.name;
  document
    .querySelectorAll<HTMLButtonElement>("[data-background]")
    .forEach((button) => {
      const active = button.dataset.background === arrangement.background;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-preset]")
    .forEach((button) =>
      button.classList.toggle(
        "is-active",
        button.dataset.preset === activePreset,
      ),
    );
  refreshSelection();
  refreshCatalog();
}

function addFlower(kind: FlowerKind) {
  if (arrangement.stems.length >= MAX_STEMS) {
    toast("这只花器最多容纳 36 枝，留一点空隙也很美。");
    return;
  }
  const definition = FLOWERS.find((flower) => flower.id === kind)!;
  const seed = Math.floor(Math.random() * 1000000);
  const newStem: Stem = {
    id: `stem-${Date.now()}-${seed}`,
    kind,
    color: definition.color,
    x: (Math.random() - 0.5) * 0.16,
    z: (Math.random() - 0.5) * 0.16,
    height: Math.round((0.83 + Math.random() * 0.34) * 100) / 100,
    tilt: Math.round(14 + Math.random() * 18),
    rotation: Math.round((arrangement.stems.length * 137.508) % 360),
    seed,
  };
  editArrangement(() => {
    arrangement.stems.push(newStem);
    selectedId = newStem.id;
  }, `添了一枝${definition.name}`);
}
function removeSelected() {
  if (!selectedId) return;
  editArrangement(() => {
    arrangement.stems = arrangement.stems.filter(
      (stem) => stem.id !== selectedId,
    );
  }, "花枝已移除，可以撤销找回。");
}
function undo() {
  const previous = past.pop();
  if (!previous) return;
  future.push(cloneArrangement(arrangement));
  arrangement = previous;
  activePreset = null;
  refresh();
  scheduleDraft();
}
function redo() {
  const next = future.pop();
  if (!next) return;
  past.push(cloneArrangement(arrangement));
  arrangement = next;
  activePreset = null;
  refresh();
  scheduleDraft();
}
function switchTab(tab: "flowers" | "vases") {
  activeTab = tab;
  document
    .querySelectorAll<HTMLButtonElement>("[data-tab]")
    .forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === tab);
      button.setAttribute("aria-pressed", String(button.dataset.tab === tab));
    });
  element("#flower-grid").hidden = tab !== "flowers";
  element("#vase-grid").hidden = tab !== "vases";
  element("#category-filters").hidden = tab !== "flowers";
  const search = element<HTMLInputElement>("#catalog-search");
  search.value = "";
  search.placeholder = tab === "flowers" ? "寻找一枝花…" : "寻找一只花器…";
  search.setAttribute(
    "aria-label",
    tab === "flowers" ? "搜索花材" : "搜索花器",
  );
  refreshCatalog();
}

function renderGallery() {
  const grid = element("#gallery-list");
  grid.replaceChildren();
  if (!works.length) {
    const empty = document.createElement("p");
    empty.textContent = "这里还很安静。完成第一束花，把它收藏在这里吧。";
    grid.append(empty);
    return;
  }
  for (const work of works) {
    const card = document.createElement("article");
    card.className = "saved-card";
    const image = document.createElement("img");
    image.src = work.image;
    image.alt = work.arrangement.name;
    const name = document.createElement("h3");
    name.textContent = work.arrangement.name;
    const detail = document.createElement("p");
    detail.textContent = `${work.arrangement.stems.length} 枝花材 · ${new Date(work.savedAt).toLocaleDateString("zh-CN")}`;
    const actions = document.createElement("div");
    actions.className = "saved-actions";
    for (const [action, label] of [
      ["load", "继续创作"],
      ["download", "下载"],
      ["delete", "删除"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.work = work.id;
      button.dataset.action = action;
      actions.append(button);
    }
    card.append(image, name, detail, actions);
    grid.append(card);
  }
}
function downloadImage(data: string, name: string, extension: string) {
  const link = document.createElement("a");
  link.href = data;
  link.download = `拾花-${name.replace(/[<>:"/\\|?*]/g, "").trim() || "我的花束"}.${extension}`;
  link.click();
}
function immersive(enabled: boolean) {
  stage.classList.toggle("is-immersive", enabled);
  element("#fullscreen-button").setAttribute("aria-pressed", String(enabled));
  element("#fullscreen-button").setAttribute(
    "title",
    enabled ? "退出沉浸模式（Esc）" : "沉浸模式",
  );
  document.body.style.overflow = enabled ? "hidden" : "";
}

function bindDialogs() {
  document
    .querySelectorAll<HTMLButtonElement>("[data-close-dialog]")
    .forEach((button) =>
      button.addEventListener("click", () => button.closest("dialog")!.close()),
    );
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    }),
  );
  let noticesRequested = false;
  element("#notices-button").addEventListener("click", async () => {
    element<HTMLDialogElement>("#notices-dialog").showModal();
    if (noticesRequested) return;
    noticesRequested = true;
    const content = element("#notices-content");
    content.textContent = "正在读取许可声明…";
    content.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(
        element<HTMLAnchorElement>("#notices-source").href,
      );
      if (!response.ok) throw new Error(`Notices request failed: ${response.status}`);
      content.textContent = await response.text();
    } catch {
      noticesRequested = false;
      content.textContent =
        "许可声明暂时无法加载，请关闭后重新打开，或点击上方「查看原文」。";
    } finally {
      content.setAttribute("aria-busy", "false");
    }
  });
}

function bindEvents() {
  element("#flower-grid").addEventListener("click", (event) => {
    const kind = (event.target as Element).closest<HTMLButtonElement>(
      "[data-kind]",
    )?.dataset.kind as FlowerKind | undefined;
    if (kind) addFlower(kind);
  });
  element("#vase-grid").addEventListener("click", (event) => {
    const kind = (event.target as Element).closest<HTMLButtonElement>(
      "[data-vase]",
    )?.dataset.vase as VaseKind | undefined;
    if (!kind || kind === arrangement.vase) return;
    const vase = VASES.find((item) => item.id === kind)!;
    editArrangement(() => {
      arrangement.vase = vase.id;
      arrangement.vaseColor = vase.color;
    }, `换上了${vase.name}`);
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-tab]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        switchTab(button.dataset.tab as "flowers" | "vases"),
      ),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-category]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        category = button.dataset.category!;
        document
          .querySelectorAll<HTMLButtonElement>("[data-category]")
          .forEach((item) => {
            item.classList.toggle("is-active", item === button);
            item.setAttribute("aria-pressed", String(item === button));
          });
        refreshCatalog();
      }),
    );
  element("#catalog-search").addEventListener("input", refreshCatalog);
  element("#change-vase").addEventListener("click", () => {
    switchTab("vases");
    if (window.innerWidth < 701)
      element(".catalog").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  });
  element("#color-swatches").addEventListener("click", (event) => {
    const color = (event.target as Element).closest<HTMLButtonElement>(
      "[data-color]",
    )?.dataset.color;
    const stem = arrangement.stems.find((item) => item.id === selectedId);
    if (stem && color && stem.color !== color)
      editArrangement(() => {
        stem.color = color;
      });
  });
  for (const field of ["height", "tilt", "rotation"] as const) {
    const input = element<HTMLInputElement>(`#${field}-control`);
    input.addEventListener("input", () => {
      const stem = arrangement.stems.find((item) => item.id === selectedId);
      if (!stem) return;
      if (editingSlider !== input) {
        remember();
        editingSlider = input;
      }
      stem[field] = Number(input.value);
      refresh();
      scheduleDraft();
    });
    input.addEventListener("change", () => {
      editingSlider = null;
    });
    input.addEventListener("blur", () => {
      editingSlider = null;
    });
  }
  const movements: Record<string, { field: "x" | "z"; distance: number }> = {
    left: { field: "x", distance: -0.025 },
    right: { field: "x", distance: 0.025 },
    forward: { field: "z", distance: 0.025 },
    back: { field: "z", distance: -0.025 },
  };
  for (const [direction, { field, distance }] of Object.entries(movements)) {
    element(`#move-${direction}`).addEventListener("click", () => {
      const stem = arrangement.stems.find((item) => item.id === selectedId);
      if (!stem) return;
      const position = Math.max(-0.17, Math.min(0.17, stem[field] + distance));
      if (position !== stem[field])
        editArrangement(() => {
          stem[field] = position;
        });
    });
  }
  element("#duplicate-button").addEventListener("click", () => {
    const stem = arrangement.stems.find((item) => item.id === selectedId);
    if (!stem) return;
    if (arrangement.stems.length >= MAX_STEMS) {
      toast("花器已容纳 36 枝，请先移除一枝。");
      return;
    }
    const copy = {
      ...stem,
      id: `stem-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      rotation: (stem.rotation + 32) % 360,
    };
    editArrangement(() => {
      arrangement.stems.push(copy);
      selectedId = copy.id;
    }, "把喜欢的花，再留一枝。");
  });
  element("#remove-button").addEventListener("click", removeSelected);
  element("#undo-button").addEventListener("click", undo);
  element("#redo-button").addEventListener("click", redo);
  element("#reset-camera").addEventListener("click", () => {
    studio.resetCamera();
    toast("回到最初的观赏角度");
  });
  element("#orbit-button").classList.add("is-active");
  element("#orbit-button").setAttribute("aria-pressed", "true");
  element("#orbit-button").addEventListener("click", () => {
    orbitEnabled = !orbitEnabled;
    studio.setOrbit(orbitEnabled);
    element("#orbit-button").classList.toggle("is-active", orbitEnabled);
    element("#orbit-button").setAttribute("aria-pressed", String(orbitEnabled));
    toast(
      orbitEnabled
        ? "视角已解锁，拖动空白处旋转。"
        : "视角已锁定，可以安心调整花枝。",
    );
  });
  element("#fullscreen-button").addEventListener("click", () =>
    immersive(!stage.classList.contains("is-immersive")),
  );
  element("#background-swatches").addEventListener("click", (event) => {
    const background = (event.target as Element).closest<HTMLButtonElement>(
      "[data-background]",
    )?.dataset.background as Arrangement["background"] | undefined;
    if (background && background !== arrangement.background)
      editArrangement(() => {
        arrangement.background = background;
      });
  });
  element<HTMLInputElement>("#artwork-name").addEventListener(
    "change",
    (event) => {
      const name =
        (event.target as HTMLInputElement).value.trim() || "我的小小花束";
      if (arrangement.name !== name)
        editArrangement(() => {
          arrangement.name = name;
        });
    },
  );
  element("#clear-button").addEventListener("click", () =>
    element<HTMLDialogElement>("#clear-dialog").showModal(),
  );
  element("#confirm-clear").addEventListener("click", () => {
    editArrangement(() => {
      arrangement.stems = [];
      selectedId = null;
    }, "花器空下来了，新的灵感正在路上。");
    element<HTMLDialogElement>("#clear-dialog").close();
  });
  element("#preset-list").addEventListener("click", (event) => {
    const id = (event.target as Element).closest<HTMLButtonElement>(
      "[data-preset]",
    )?.dataset.preset;
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    editArrangement(() => {
      arrangement = cloneArrangement(preset.arrangement);
      selectedId =
        arrangement.stems.find((stem) => stem.kind === "rose")?.id ??
        arrangement.stems[0]?.id ??
        null;
      activePreset = preset.id;
    }, `从「${preset.name}」开始，继续你的创作。`);
    studio.resetCamera();
  });
  element("#guide-button").addEventListener("click", () =>
    element<HTMLDialogElement>("#guide-dialog").showModal(),
  );
  element("#gallery-button").addEventListener("click", () => {
    renderGallery();
    element<HTMLDialogElement>("#gallery-dialog").showModal();
  });
  element("#studio-nav").addEventListener("click", () => {
    document
      .querySelectorAll("dialog[open]")
      .forEach((dialog) => (dialog as HTMLDialogElement).close());
    immersive(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  element("#save-button").addEventListener("click", () => {
    element<HTMLInputElement>("#save-name").value = arrangement.name;
    element<HTMLImageElement>("#save-preview").src = studio.capture(760);
    element<HTMLDialogElement>("#save-dialog").showModal();
  });
  element("#save-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = element<HTMLInputElement>("#save-name").value.trim();
    if (!name) {
      toast("给这束花起一个名字吧。");
      return;
    }
    if (works.length >= 12) {
      toast("作品集已收藏 12 束花，请先下载或移除一件旧作。");
      return;
    }
    const savedArrangement = cloneArrangement(arrangement);
    savedArrangement.name = name;
    const work: SavedWork = {
      id: `work-${Date.now()}`,
      arrangement: savedArrangement,
      image: studio.capture(600),
      savedAt: new Date().toISOString(),
    };
    const updated = [work, ...works];
    try {
      localStorage.setItem(GALLERY_KEY, JSON.stringify(updated));
      works = updated;
      if (arrangement.name !== name)
        editArrangement(() => {
          arrangement.name = name;
        });
      saveDraft();
      element<HTMLDialogElement>("#save-dialog").close();
      toast("已收藏到「我的作品」，把这一刻留住了。");
    } catch {
      toast("浏览器存储空间不足或未获允许，请下载图片保存。");
    }
  });
  element("#download-button").addEventListener("click", () => {
    const name =
      element<HTMLInputElement>("#save-name").value.trim() || arrangement.name;
    downloadImage(studio.capture(1800, "image/png"), name, "png");
    toast("已生成 1800 × 1800 高清图片");
  });
  element("#gallery-list").addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "[data-work]",
    );
    const work = works.find((item) => item.id === button?.dataset.work);
    if (!button || !work) return;
    if (button.dataset.action === "load") {
      editArrangement(() => {
        arrangement = cloneArrangement(work.arrangement);
        selectedId = arrangement.stems[0]?.id ?? null;
      }, "作品已回到工作台，继续慢慢创作。");
      element<HTMLDialogElement>("#gallery-dialog").close();
      studio.resetCamera();
    } else if (button.dataset.action === "download") {
      downloadImage(work.image, work.arrangement.name, "jpg");
      toast("已下载收藏图片；继续创作后可导出高清版本。");
    } else if (button.dataset.action === "delete") {
      if (button.dataset.confirm !== "true") {
        button.dataset.confirm = "true";
        button.textContent = "确认删除";
        return;
      }
      const updated = works.filter((item) => item.id !== work.id);
      try {
        localStorage.setItem(GALLERY_KEY, JSON.stringify(updated));
        works = updated;
        renderGallery();
        toast("已从作品集中移除");
      } catch {
        toast("未能更新本地作品集，请检查浏览器存储权限。");
      }
    }
  });
  element("#flower-grid").addEventListener("dragstart", (event) => {
    const kind = (event.target as Element).closest<HTMLButtonElement>(
      "[data-kind]",
    )?.dataset.kind;
    if (kind && event.dataTransfer) {
      event.dataTransfer.setData("application/x-fleur-flower", kind);
      event.dataTransfer.effectAllowed = "copy";
    }
  });
  stage.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("application/x-fleur-flower")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      stage.classList.add("is-drop-target");
    }
  });
  stage.addEventListener("dragleave", (event) => {
    if (!stage.contains(event.relatedTarget as Node | null))
      stage.classList.remove("is-drop-target");
  });
  stage.addEventListener("drop", (event) => {
    stage.classList.remove("is-drop-target");
    const kind = event.dataTransfer?.getData("application/x-fleur-flower");
    if (kind && FLOWERS.some((item) => item.id === kind)) {
      event.preventDefault();
      addFlower(kind as FlowerKind);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("dialog[open]"))
      immersive(false);
    if (
      document.querySelector("dialog[open]") ||
      (event.target instanceof HTMLElement &&
        (event.target.matches("input,textarea,select") ||
          event.target.isContentEditable))
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "y"
    ) {
      event.preventDefault();
      redo();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelected();
    }
  });
  stage.addEventListener("studio-context-lost", () =>
    toast("图形连接暂时中断，草稿已保留。若未自动恢复，请刷新页面。"),
  );
  window.addEventListener("pagehide", saveDraft);
}

async function start() {
  try {
    studio = new FlowerStudio(
      element("#scene-container"),
      selectStem,
      (id, patch, phase) => {
        if (phase === "start") {
          remember();
          return;
        }
        if (phase === "move") {
          const stem = arrangement.stems.find((item) => item.id === id);
          if (stem) Object.assign(stem, patch);
          refresh();
        }
        scheduleDraft();
      },
    );
    studio.setArrangement(arrangement);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const flowerGrid = element("#flower-grid");
    for (const flower of FLOWERS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "flower-card";
      button.dataset.kind = flower.id;
      button.draggable = true;
      button.setAttribute("aria-label", `添加${flower.name}`);
      button.innerHTML = `<span class="flower-image"><img alt="${flower.name}" draggable="false"></span><span class="card-copy"><span class="card-name">${flower.name}</span><span class="card-latin">${flower.latin}</span></span><span class="add-flower" aria-hidden="true">+</span><span class="card-count"></span>`;
      button.querySelector("img")!.src = studio.thumbnail(
        flower.id,
        flower.color,
      );
      flowerGrid.append(button);
    }
    for (const vase of VASES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vase-card";
      button.dataset.vase = vase.id;
      button.setAttribute("aria-label", `使用${vase.name}`);
      button.innerHTML = `<img alt="${vase.name}"><span class="card-copy"><span class="card-name">${vase.name}</span><span class="card-latin">${vase.english}</span></span>`;
      button.querySelector("img")!.src = studio.thumbnail(
        vase.id,
        vase.color,
        true,
      );
      element("#vase-grid").append(button);
    }
    refresh();
    bindEvents();
    stage.classList.add("is-loaded");
    for (const preset of PRESETS) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-card";
      button.dataset.preset = preset.id;
      button.setAttribute("aria-label", `以${preset.name}作为灵感开始创作`);
      button.innerHTML = `<img class="preset-image" alt="${preset.name}花束"><span class="preset-copy"><span class="preset-name">${preset.name}</span><span class="preset-english">${preset.english}</span><span class="preset-mood">${preset.mood}</span></span><svg aria-hidden="true"><use href="#icon-arrow"/></svg>`;
      button.querySelector("img")!.src = studio.presetThumbnail(
        preset.arrangement,
      );
      element("#preset-list").append(button);
    }
    saveDraft();
  } catch (error) {
    console.error("Flower atelier failed to initialize:", error);
    element("#loading").innerHTML =
      "<p>花艺工作台暂时无法开启。</p><p>请使用支持 WebGL 的现代浏览器，并开启硬件加速后刷新。</p>";
    stage.classList.remove("is-loaded");
  }
}
bindDialogs();
void start();
