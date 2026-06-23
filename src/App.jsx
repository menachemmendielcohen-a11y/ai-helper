import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";

const STORAGE_KEY = "ai-site-editor-fixed-v1";

const defaultSite = {
  meta: { title: "AI Site Editor", description: "אתר לדוגמה" },
  theme: {
    primary: "#6d5dfc",
    secondary: "#22c55e",
    background: "#f8fafc",
    text: "#172033",
    card: "#ffffff",
  },
  brand: { name: "AI Site", logo: "AI" },
  activePageId: "home",
  pages: [
    {
      id: "home",
      title: "דף הבית",
      slug: "home",
      sections: [
        {
          id: "hero",
          type: "hero",
          title: "בנה אתר עם AI",
          text: "כתוב רעיון, קבל אתר, ערוך עם עיפרון, ושנה הכול בלי קוד.",
          buttonText: "התחל עכשיו",
          buttonLink: "#contact",
          showButton: true,
          showImage: false,
          image: "",
          items: [],
        },
        {
          id: "section-1",
          type: "cards",
          title: "מה אפשר לעשות?",
          text: "המערכת יודעת לערוך, להוסיף ולמחוק אובייקטים.",
          showButton: false,
          showImage: false,
          items: [
            { id: "item-1", title: "עריכה ידנית", text: "עיפרון ליד כל אזור." },
            {
              id: "item-2",
              title: "עריכת AI",
              text: "כותבים בקשה והמערכת מציעה שינוי.",
            },
            {
              id: "item-3",
              title: "ייצוא אתר",
              text: "מורידים קבצי אתר מוכנים.",
            },
          ],
        },
        {
          id: "contact",
          type: "contact",
          title: "צור קשר",
          text: "כאן אפשר לשים טלפון, וואטסאפ או טופס.",
          buttonText: "וואטסאפ",
          buttonLink: "https://wa.me/972535820559",
          showButton: true,
          showImage: false,
          image: "",
          items: [],
        },
      ],
    },
  ],
};

const templates = [
  "אוטומטי",
  "עסק",
  "קורסים",
  "חנות",
  "תיק עבודות",
  "דף נחיתה",
  "מסעדה",
  "סריגה",
];

function uid(prefix = "section") {
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeSite(site) {
  const safe = site && typeof site === "object" ? site : defaultSite;
  const pages =
    Array.isArray(safe.pages) && safe.pages.length
      ? safe.pages
      : defaultSite.pages;
  return {
    meta: { ...defaultSite.meta, ...(safe.meta || {}) },
    theme: { ...defaultSite.theme, ...(safe.theme || {}) },
    brand: { ...defaultSite.brand, ...(safe.brand || {}) },
    activePageId: safe.activePageId || pages[0].id,
    pages: pages.map((p) => ({
      ...p,
      id: p.id || uid("page"),
      sections: Array.isArray(p.sections)
        ? p.sections.map(normalizeSection)
        : [],
    })),
  };
}

function normalizeSection(s) {
  return {
    id: s.id || uid("section"),
    type: s.type || "text",
    title: s.title || "",
    text: s.text || "",
    buttonText: s.buttonText || "",
    buttonLink: s.buttonLink || "",
    image: s.image || "",
    showButton: Boolean(s.showButton && s.buttonText),
    showImage: Boolean(s.showImage && s.image),
    bg: s.bg || "",
    color: s.color || "",
    hidden: Boolean(s.hidden),
    locked: Boolean(s.locked),
    items: Array.isArray(s.items)
      ? s.items.map((item, i) => ({
          id: item.id || `item-${i + 1}`,
          title: item.title || "",
          text: item.text || "",
          price: item.price || "",
          image: item.image || "",
          buttonText: item.buttonText || "",
          buttonLink: item.buttonLink || "",
          showImage: Boolean(item.showImage && item.image),
          showButton: Boolean(item.showButton && item.buttonText),
          hidden: Boolean(item.hidden),
          locked: Boolean(item.locked),
        }))
      : [],
  };
}

function getActivePage(site) {
  return site.pages.find((p) => p.id === site.activePageId) || site.pages[0];
}

function updateActivePage(site, updater) {
  const active = getActivePage(site);
  const nextPage = typeof updater === "function" ? updater(active) : updater;
  return {
    ...site,
    pages: site.pages.map((p) => (p.id === active.id ? nextPage : p)),
  };
}

function objectCatalog(page) {
  const list = [];
  for (const section of page.sections) {
    list.push({
      id: section.id,
      label: section.title || section.type,
      type: "section",
      locked: section.locked,
      hidden: section.hidden,
    });
    if (section.buttonText)
      list.push({
        id: `${section.id}.button`,
        label: section.buttonText,
        type: "button",
        locked: section.locked,
      });
    if (section.image)
      list.push({
        id: `${section.id}.image`,
        label: section.image,
        type: "image",
        locked: section.locked,
      });
    for (const item of section.items || []) {
      list.push({
        id: `${section.id}.${item.id}`,
        label: item.title || item.text || item.id,
        type: "item",
        locked: item.locked || section.locked,
        hidden: item.hidden,
      });
    }
  }
  return list;
}

function findTarget(page, id) {
  if (!id) return null;
  const [sectionId, itemId] = id.split(".");
  const sectionIndex = page.sections.findIndex((s) => s.id === sectionId);
  if (sectionIndex < 0) return null;
  if (!itemId || itemId === "button" || itemId === "image")
    return {
      kind: itemId || "section",
      sectionIndex,
      section: page.sections[sectionIndex],
    };
  const itemIndex = page.sections[sectionIndex].items.findIndex(
    (i) => i.id === itemId,
  );
  if (itemIndex < 0) return null;
  return {
    kind: "item",
    sectionIndex,
    itemIndex,
    section: page.sections[sectionIndex],
    item: page.sections[sectionIndex].items[itemIndex],
  };
}

function updateObject(page, objectId, changes) {
  const target = findTarget(page, objectId);
  if (!target || target.section.locked || target.item?.locked) return page;
  const sections = [...page.sections];
  if (target.kind === "item") {
    const section = { ...target.section, items: [...target.section.items] };
    section.items[target.itemIndex] = normalizeSection({
      ...section.items[target.itemIndex],
      ...changes,
      items: [],
    });
    section.items[target.itemIndex] = {
      ...section.items[target.itemIndex],
      ...changes,
      id: section.items[target.itemIndex].id,
    };
    sections[target.sectionIndex] = section;
  } else if (target.kind === "button") {
    sections[target.sectionIndex] = {
      ...target.section,
      buttonText:
        changes.buttonText ?? changes.text ?? target.section.buttonText,
      buttonLink:
        changes.buttonLink ?? changes.link ?? target.section.buttonLink,
      showButton: changes.showButton ?? true,
    };
  } else if (target.kind === "image") {
    sections[target.sectionIndex] = {
      ...target.section,
      image: changes.image ?? changes.url ?? target.section.image,
      showImage: changes.showImage ?? true,
    };
  } else {
    sections[target.sectionIndex] = normalizeSection({
      ...target.section,
      ...changes,
    });
  }
  return { ...page, sections };
}

function deleteObject(page, objectId) {
  const target = findTarget(page, objectId);
  if (!target || target.section.locked || target.item?.locked) return page;
  if (target.kind === "section")
    return {
      ...page,
      sections: page.sections.filter((_, i) => i !== target.sectionIndex),
    };
  if (target.kind === "item") {
    return {
      ...page,
      sections: page.sections.map((s, i) =>
        i === target.sectionIndex
          ? { ...s, items: s.items.filter((_, j) => j !== target.itemIndex) }
          : s,
      ),
    };
  }
  if (target.kind === "button")
    return updateObject(page, target.section.id, {
      showButton: false,
      buttonText: "",
    });
  if (target.kind === "image")
    return updateObject(page, target.section.id, {
      showImage: false,
      image: "",
    });
  return page;
}

function applyActionsToPage(page, actions) {
  let next = page;
  for (const action of actions || []) {
    if (action.type === "updateObject")
      next = updateObject(next, action.objectId, action.changes || {});
    if (action.type === "deleteObject")
      next = deleteObject(next, action.objectId);
    if (action.type === "addSection")
      next = {
        ...next,
        sections: [...next.sections, normalizeSection(action.section || {})],
      };
    if (action.type === "addItem") {
      const sectionId = action.sectionId || action.objectId;
      next = {
        ...next,
        sections: next.sections.map((s) =>
          s.id === sectionId && !s.locked
            ? {
                ...s,
                items: [
                  ...(s.items || []),
                  { id: uid("item"), ...(action.item || {}) },
                ],
              }
            : s,
        ),
      };
    }
    if (action.type === "hideObject")
      next = updateObject(next, action.objectId, { hidden: true });
    if (action.type === "showObject")
      next = updateObject(next, action.objectId, { hidden: false });
    if (action.type === "duplicateObject") {
      const target = findTarget(next, action.objectId);
      if (target?.kind === "section" && !target.section.locked) {
        next = {
          ...next,
          sections: [
            ...next.sections,
            {
              ...target.section,
              id: uid("section"),
              title: `${target.section.title} - עותק`,
            },
          ],
        };
      } else if (target?.kind === "item" && !target.item.locked) {
        next = {
          ...next,
          sections: next.sections.map((s, i) =>
            i === target.sectionIndex
              ? {
                  ...s,
                  items: [
                    ...s.items,
                    {
                      ...target.item,
                      id: uid("item"),
                      title: `${target.item.title} - עותק`,
                    },
                  ],
                }
              : s,
          ),
        };
      }
    }
  }
  return next;
}

function applySiteActions(site, actions) {
  const themeAction = (actions || []).find((a) => a.type === "changeTheme");
  const withTheme = themeAction
    ? { ...site, theme: { ...site.theme, ...(themeAction.changes || {}) } }
    : site;
  return updateActivePage(withTheme, (page) =>
    applyActionsToPage(page, actions),
  );
}

function renderSiteHtml(site) {
  const page = getActivePage(site);
  const t = site.theme;
  const secHtml = page.sections
    .filter((s) => !s.hidden)
    .map((s) => {
      const items = (s.items || [])
        .filter((i) => !i.hidden)
        .map(
          (i) =>
            `<article class="card">${i.image ? `<img src="${esc(i.image)}" alt="${esc(i.title)}">` : ""}<h3>${esc(i.title)}</h3><p>${esc(i.text)}</p>${i.price ? `<strong>${esc(i.price)}</strong>` : ""}</article>`,
        )
        .join("");
      return `<section class="section ${esc(s.type)}" id="${esc(s.id)}" style="${s.bg ? `background:${esc(s.bg)};` : ""}${s.color ? `color:${esc(s.color)};` : ""}">
      <div class="section-copy"><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p>${s.showButton && s.buttonText ? `<a class="btn" href="${esc(s.buttonLink || "#")}">${esc(s.buttonText)}</a>` : ""}</div>
      ${s.showImage && s.image ? `<img class="section-img" src="${esc(s.image)}" alt="${esc(s.title)}">` : ""}
      ${items ? `<div class="grid">${items}</div>` : ""}
    </section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(site.meta.title || site.brand.name)}</title><meta name="description" content="${esc(site.meta.description || "")}"><link rel="stylesheet" href="style.css"></head><body><nav><b>${esc(site.brand.name)}</b></nav>${secHtml}</body></html>`;
}

function exportCss(site) {
  const t = site.theme;
  return `*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:${t.background};color:${t.text};direction:rtl}nav{height:72px;display:flex;align-items:center;padding:0 7vw;background:#ffffffdd;border-bottom:1px solid #e5e7eb;position:sticky;top:0}nav b{color:${t.primary};font-size:22px}.section{padding:70px 7vw}.hero{display:grid;grid-template-columns:1fr 1fr;gap:50px;align-items:center;min-height:560px}.section h2{font-size:clamp(34px,5vw,68px);margin:0 0 18px}.section p{font-size:20px;line-height:1.75;max-width:720px}.btn{display:inline-flex;background:${t.primary};color:#fff;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:800;margin-top:16px}.section-img{width:100%;max-width:520px;border-radius:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-top:30px}.card{background:${t.card};border:1px solid #e5e7eb;border-radius:22px;padding:22px;box-shadow:0 12px 30px #0001}.card img{width:100%;border-radius:16px}@media(max-width:800px){.hero{grid-template-columns:1fr}.section{padding:48px 24px}.section h2{font-size:36px}}`;
}

function esc(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function downloadBlob(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [site, setSite] = useState(() => {
    try {
      return normalizeSite(
        JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
      );
    } catch {
      return defaultSite;
    }
  });
  const [screen, setScreen] = useState(() =>
    localStorage.getItem(STORAGE_KEY) ? "editor" : "home",
  );
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState("אוטומטי");
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(true);
  const [preview, setPreview] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [aiText, setAiText] = useState("");
  const [pending, setPending] = useState(null);
  const [toast, setToast] = useState("");
  const [health, setHealth] = useState({ ok: false, label: "בודק שרת..." });
  const [history, setHistory] = useState([site]);
  const [future, setFuture] = useState([]);
  const fileRef = useRef(null);
  const page = getActivePage(site);
  const catalog = useMemo(() => objectCatalog(page), [page]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) =>
        setHealth({
          ok: true,
          label:
            d.openRouterKeyLoaded || d.hasKey
              ? `AI מחובר: ${d.model}`
              : "שרת עובד - חסר API KEY",
        }),
      )
      .catch(() => setHealth({ ok: false, label: "השרת לא מחובר" }));
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(site));
  }, [site]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function commit(nextSite, label = "השינוי נשמר") {
    setHistory((h) => [...h.slice(-30), site]);
    setFuture([]);
    setSite(normalizeSite(nextSite));
    setToast(label);
  }

  function commitPage(updater, label) {
    commit(updateActivePage(site, updater), label);
  }

  async function generateSite() {
    if (!prompt.trim()) return setToast("כתוב קודם איזה אתר לבנות");
    setLoading(true);
    try {
      const res = await fetch("/api/generate-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, template }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "לא הצלחנו לבנות את האתר");
      commit(data.site, "האתר נוצר");
      setScreen("editor");
    } catch (e) {
      setToast(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function askAi() {
    if (!aiText.trim()) return;
    setLoading(true);
    setPending(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: aiText, site: page, objects: catalog }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "שגיאת AI");
      setPending(data);
    } catch (e) {
      setPending({ status: "error", message: e.message, actions: [] });
    } finally {
      setLoading(false);
    }
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [site, ...f]);
      setSite(prev);
      return h.slice(0, -1);
    });
  }
  function redo() {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setHistory((h) => [...h, site]);
      setSite(next);
      return f.slice(1);
    });
  }

  function addSection(type = "text") {
    const section = normalizeSection({
      id: uid("section"),
      type,
      title: type === "products" ? "מוצרים" : "אזור חדש",
      text: "טקסט חדש לעריכה.",
      showButton: false,
      showImage: false,
      items:
        type === "cards" || type === "products"
          ? [{ id: "item-1", title: "פריט חדש", text: "אפשר לערוך אותי." }]
          : [],
    });
    commitPage(
      (p) => ({ ...p, sections: [...p.sections, section] }),
      "נוסף אזור",
    );
  }

  function saveEdit(values) {
    commitPage((p) => updateObject(p, editingId, values), "האובייקט עודכן");
    setEditingId("");
  }

  async function exportZip() {
    const zip = new JSZip();
    zip.file("index.html", renderSiteHtml(site));
    zip.file("style.css", exportCss(site));
    zip.file("site.json", JSON.stringify(site, null, 2));
    zip.file("README.txt", "העלו את index.html ו-style.css לכל אחסון סטטי.");
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "exported-site.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        commit(JSON.parse(reader.result), "יובא JSON");
        setScreen("editor");
      } catch {
        setToast("קובץ JSON לא תקין");
      }
    };
    reader.readAsText(file);
  }

  if (screen === "home") {
    return (
      <main className="home">
        <div className="home-card">
          <div className="status-pill">{health.label}</div>
          <h1>מה תרצה לבנות?</h1>
          <p>כתוב רעיון לאתר, וה-AI יבנה לך דף ראשון שאפשר לערוך מיד.</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) generateSite();
            }}
            placeholder="לדוגמה: בנה לי אתר לעסק של סריגה עם גלריה, קורסים, המלצות ויצירת קשר"
          />
          <div className="template-row">
            {templates.map((t) => (
              <button
                key={t}
                className={template === t ? "active" : ""}
                onClick={() => setTemplate(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="home-actions">
            <button
              className="primary"
              onClick={generateSite}
              disabled={loading}
            >
              {loading ? "בונה לך את האתר..." : "צור אתר"}
            </button>
            <button onClick={() => setScreen("editor")}>
              המשך לעורך הקיים
            </button>
            <button onClick={() => fileRef.current?.click()}>ייבא JSON</button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              hidden
              onChange={importJson}
            />
          </div>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  return (
    <div className="app">
      <header className="toolbar">
        <strong>{site.brand.name}</strong>
        <span className={health.ok ? "ok" : "bad"}>{health.label}</span>
        <button
          onClick={() => setEditMode((v) => !v)}
          className={editMode ? "active" : ""}
        >
          מצב EDIT ✏️
        </button>
        <button onClick={() => setPreview((v) => !v)}>
          {preview ? "חזור לעריכה" : "Preview"}
        </button>
        <button onClick={undo} disabled={!history.length}>
          בטל
        </button>
        <button onClick={redo} disabled={!future.length}>
          החזר
        </button>
        <button
          onClick={() =>
            downloadBlob(
              "site.json",
              JSON.stringify(site, null, 2),
              "application/json",
            )
          }
        >
          ייצוא JSON
        </button>
        <button
          onClick={() =>
            downloadBlob("index.html", renderSiteHtml(site), "text/html")
          }
        >
          ייצוא HTML
        </button>
        <button onClick={exportZip} className="primary">
          הורד קבצי אתר ZIP
        </button>
        <button
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setScreen("home");
          }}
        >
          דף הבית
        </button>
      </header>

      <div className={preview ? "workspace preview-only" : "workspace"}>
        {!preview && (
          <aside className="sidebar">
            <section className="panel">
              <h2>AI</h2>
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder="לדוגמה: שנה את hero.button לטקסט קבל הצעת מחיר"
              />
              <button
                className="primary full"
                onClick={askAi}
                disabled={loading}
              >
                {loading ? "חושב..." : "שלח ל-AI"}
              </button>
              {pending && (
                <div
                  className={`ai-box ${pending.status === "error" ? "error" : ""}`}
                >
                  <p>{pending.message}</p>
                  {!!pending.actions?.length && (
                    <>
                      <small>
                        {pending.actions.length} פעולות מוכנות לאישור
                      </small>
                      <button
                        className="primary"
                        onClick={() => {
                          commit(
                            applySiteActions(site, pending.actions),
                            "שינויי AI אושרו",
                          );
                          setPending(null);
                        }}
                      >
                        אשר ושמור
                      </button>
                      <button onClick={() => setPending(null)}>בטל</button>
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="panel">
              <h2>הוסף אזור</h2>
              <div className="chips">
                {[
                  "text",
                  "cards",
                  "products",
                  "gallery",
                  "faq",
                  "testimonials",
                  "contact",
                  "form",
                ].map((t) => (
                  <button key={t} onClick={() => addSection(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>אובייקטים</h2>
              <input
                className="search"
                placeholder="חפש אובייקט..."
                onChange={(e) => setSelectedId(e.target.value)}
              />
              <div className="object-list">
                {catalog
                  .filter(
                    (o) =>
                      !selectedId ||
                      o.id.includes(selectedId) ||
                      o.label.includes(selectedId),
                  )
                  .map((o) => (
                    <div className="object-row" key={o.id}>
                      <button
                        onClick={() =>
                          document
                            .getElementById(`obj-${o.id.replaceAll(".", "-")}`)
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            })
                        }
                      >
                        <code>{o.id}</code>
                        <small>{o.label}</small>
                      </button>
                      <button
                        onClick={() => navigator.clipboard?.writeText(o.id)}
                      >
                        העתק
                      </button>
                    </div>
                  ))}
              </div>
            </section>

            <section className="panel">
              <h2>ייבוא</h2>
              <button onClick={() => fileRef.current?.click()}>
                ייבא JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                hidden
                onChange={importJson}
              />
            </section>
          </aside>
        )}

        <main className="canvas">
          <SiteView
            site={site}
            editMode={editMode && !preview}
            onEdit={setEditingId}
            onDelete={(id) =>
              commitPage((p) => deleteObject(p, id), "האובייקט נמחק")
            }
            onUpdate={(id, changes) =>
              commitPage((p) => updateObject(p, id, changes), "עודכן")
            }
          />
        </main>
      </div>

      {editingId && (
        <EditModal
          objectId={editingId}
          target={findTarget(page, editingId)}
          onClose={() => setEditingId("")}
          onSave={saveEdit}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SiteView({ site, editMode, onEdit, onDelete, onUpdate }) {
  const page = getActivePage(site);
  const t = site.theme;
  return (
    <div
      className="site"
      style={{
        "--primary": t.primary,
        "--secondary": t.secondary,
        "--bg": t.background,
        "--text": t.text,
        "--card": t.card,
      }}
    >
      <nav className="site-nav">
        <b>{site.brand.name}</b>
        <div>
          {page.sections
            .filter((s) => !s.hidden)
            .map((s) => (
              <a key={s.id} href={`#${s.id}`}>
                {s.title || s.id}
              </a>
            ))}
        </div>
      </nav>
      {page.sections
        .filter((s) => !s.hidden)
        .map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            className={`site-section ${section.type} ${editMode ? "editable" : ""}`}
            style={{ background: section.bg || "", color: section.color || "" }}
          >
            {editMode && (
              <EditBadge id={section.id} onEdit={onEdit} onDelete={onDelete} />
            )}
            <div className="section-copy" id={`obj-${section.id}`}>
              <span className="eyebrow">#{section.id}</span>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
              {section.showButton && section.buttonText && (
                <a className="site-btn" href={section.buttonLink || "#"}>
                  {section.buttonText}
                  {editMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onEdit(`${section.id}.button`);
                      }}
                    >
                      ✏️
                    </button>
                  )}
                </a>
              )}
            </div>
            {section.showImage && section.image && (
              <div className="media-wrap">
                {editMode && (
                  <button
                    className="mini-edit"
                    onClick={() => onEdit(`${section.id}.image`)}
                  >
                    ✏️
                  </button>
                )}
                <img src={section.image} alt={section.title} />
              </div>
            )}
            {!!section.items?.filter((i) => !i.hidden).length && (
              <div className="cards-grid">
                {section.items
                  .filter((i) => !i.hidden)
                  .map((item) => (
                    <article
                      key={item.id}
                      className="card"
                      id={`obj-${section.id}-${item.id}`}
                    >
                      {editMode && (
                        <EditBadge
                          id={`${section.id}.${item.id}`}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          small
                        />
                      )}
                      {item.image && <img src={item.image} alt={item.title} />}
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                      {item.price && (
                        <strong className="price">{item.price}</strong>
                      )}
                      {item.showButton && item.buttonText && (
                        <a
                          className="site-btn small"
                          href={item.buttonLink || "#"}
                        >
                          {item.buttonText}
                        </a>
                      )}
                    </article>
                  ))}
              </div>
            )}
          </section>
        ))}
    </div>
  );
}

function EditBadge({ id, onEdit, onDelete, small }) {
  return (
    <div className={`edit-badge ${small ? "small" : ""}`}>
      <code>{id}</code>
      <button onClick={() => onEdit(id)}>✏️</button>
      <button onClick={() => onDelete(id)}>🗑️</button>
    </div>
  );
}

function EditModal({ objectId, target, onClose, onSave }) {
  const data = target?.item || target?.section || {};
  const [values, setValues] = useState({
    title: data.title || "",
    text: data.text || "",
    buttonText: data.buttonText || "",
    buttonLink: data.buttonLink || "",
    image: data.image || "",
    price: data.price || "",
    bg: data.bg || "",
    color: data.color || "",
    showButton: Boolean(data.showButton),
    showImage: Boolean(data.showImage),
  });
  function set(key, value) {
    setValues((v) => ({ ...v, [key]: value }));
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>עריכת {objectId}</h2>
          <button onClick={onClose}>✕</button>
        </header>
        <label>
          כותרת
          <input
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label>
          טקסט
          <textarea
            value={values.text}
            onChange={(e) => set("text", e.target.value)}
          />
        </label>
        <label>
          מחיר
          <input
            value={values.price}
            onChange={(e) => set("price", e.target.value)}
          />
        </label>
        <label>
          טקסט כפתור
          <input
            value={values.buttonText}
            onChange={(e) => set("buttonText", e.target.value)}
          />
        </label>
        <label>
          קישור כפתור
          <input
            value={values.buttonLink}
            onChange={(e) => set("buttonLink", e.target.value)}
          />
        </label>
        <label>
          קישור תמונה
          <input
            value={values.image}
            onChange={(e) => set("image", e.target.value)}
          />
        </label>
        <div className="checks">
          <label>
            <input
              type="checkbox"
              checked={values.showButton}
              onChange={(e) => set("showButton", e.target.checked)}
            />{" "}
            הצג כפתור
          </label>
          <label>
            <input
              type="checkbox"
              checked={values.showImage}
              onChange={(e) => set("showImage", e.target.checked)}
            />{" "}
            הצג תמונה
          </label>
        </div>
        {target?.kind === "section" && (
          <div className="colors">
            <label>
              צבע רקע
              <input
                type="color"
                value={values.bg || "#ffffff"}
                onChange={(e) => set("bg", e.target.value)}
              />
            </label>
            <label>
              צבע טקסט
              <input
                type="color"
                value={values.color || "#172033"}
                onChange={(e) => set("color", e.target.value)}
              />
            </label>
          </div>
        )}
        <footer>
          <button onClick={onClose}>ביטול</button>
          <button className="primary" onClick={() => onSave(values)}>
            שמור
          </button>
        </footer>
      </div>
    </div>
  );
}
