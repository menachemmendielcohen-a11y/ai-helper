import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, ".env");
dotenv.config({ path: envPath });

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const hasKey = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== "sk-or-v1-your-key-here");

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api", (req, res, next) => {
  const started = Date.now();
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  res.on("finish", () => console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`));
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    status: "running",
    openRouterKeyLoaded: hasKey,
    hasKey,
    model: MODEL,
    port: PORT,
    envPath
  });
});

app.post("/api/generate-site", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    const template = String(req.body?.template || "").trim();
    if (!prompt) return res.status(400).json({ status: "error", message: "כתוב איזה אתר תרצה לבנות." });

    const site = hasKey
      ? await openRouterGenerateSite(prompt, template)
      : fallbackSite(prompt, template);

    res.json({ status: "ready", message: "האתר נבנה ומוכן לעריכה.", site: normalizeSite(site), usedFallback: !hasKey });
  } catch (error) {
    console.error("[generate-site]", error);
    res.status(error.status || 500).json({
      status: "error",
      message: friendlyError(error, "לא הצלחנו לבנות את האתר כרגע. נסו שוב בעוד רגע."),
      details: error.message
    });
  }
});

app.post("/api/ai", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const site = req.body?.site;
    const objects = Array.isArray(req.body?.objects) ? req.body.objects : [];
    if (!message) return res.status(400).json({ status: "error", message: "לא התקבלה בקשה.", actions: [] });
    if (!site) return res.status(400).json({ status: "error", message: "מצב האתר חסר.", actions: [] });

    const payload = hasKey
      ? await openRouterEdit(message, site, objects)
      : fallbackActions(message, site, objects);

    res.json(validateActionPayload(payload));
  } catch (error) {
    console.error("[ai]", error);
    res.status(error.status || 500).json({
      status: "error",
      message: friendlyError(error, "לא הצלחנו להכין את השינוי כרגע."),
      actions: [],
      details: error.message
    });
  }
});

async function callOpenRouter(messages, temperature = 0.2, timeoutMs = 60000) {
  if (!hasKey) throw new Error("Missing OPENROUTER_API_KEY in .env");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:5173",
        "X-Title": "AI Site Editor Pro"
      },
      body: JSON.stringify({
        model: MODEL,
        temperature,
        response_format: { type: "json_object" },
        messages
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data?.error?.message || data?.message || `OpenRouter error ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned empty response");
    return JSON.parse(String(content).replace(/^```json\s*|\s*```$/g, ""));
  } finally {
    clearTimeout(timer);
  }
}

async function openRouterGenerateSite(prompt, template) {
  const system = `אתה מחולל אתרים בעברית. החזר JSON בלבד.
Schema:
{"site":{"meta":{"title":"","description":""},"theme":{"primary":"","secondary":"","background":"","text":"","card":""},"brand":{"name":"","logo":""},"pages":[{"id":"home","title":"דף הבית","slug":"home","sections":[{"id":"hero","type":"hero","title":"","text":"","buttonText":"","buttonLink":"","image":"","showButton":true,"showImage":false,"bg":"","color":"","items":[]}]}]}}
כל section יכול להיות: hero, text, cards, products, gallery, faq, testimonials, contact, form.
אל תכניס script או קוד מסוכן.`;
  const user = `תבנית: ${template || "אוטומטי"}\nבקשת המשתמש: ${prompt}`;
  const data = await callOpenRouter([{ role: "system", content: system }, { role: "user", content: user }], 0.35);
  return data.site || data;
}

async function openRouterEdit(message, site, objects) {
  const system = `אתה עורך אתר. החזר JSON בלבד.
Schema: {"status":"ready","message":"הסבר קצר בעברית","actions":[{"type":"updateObject|addSection|addItem|deleteObject|duplicateObject|hideObject|showObject|changeTheme","objectId":"","sectionId":"","changes":{},"section":{},"item":{}}]}
objects: ${JSON.stringify(objects).slice(0, 30000)}
אסור לשנות אובייקט locked. אם לא ברור, החזר status:"question".`;
  const data = await callOpenRouter([
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ message, site }).slice(0, 70000) }
  ], 0.12);
  return data;
}

function validateActionPayload(payload) {
  if (!payload || typeof payload !== "object") return { status: "error", message: "תשובת AI לא תקינה", actions: [] };
  const actions = Array.isArray(payload.actions) ? payload.actions.filter(a => a && typeof a === "object") : [];
  return { status: payload.status || "ready", message: payload.message || "הכנתי שינוי לאישור.", actions };
}

function fallbackActions(message, site) {
  const text = message.toLowerCase();
  if (text.includes("מחק")) {
    const id = extractId(message);
    return { status: "ready", message: `אמחק את ${id || "האובייקט שנבחר"}`, actions: id ? [{ type: "deleteObject", objectId: id }] : [] };
  }
  if (text.includes("צבע")) {
    return { status: "ready", message: "אשנה צבע ראשי באתר.", actions: [{ type: "changeTheme", changes: { primary: "#2563eb", secondary: "#10b981" } }] };
  }
  return {
    status: "ready",
    message: "אוסיף אזור טקסט חדש.",
    actions: [{ type: "addSection", section: { id: `section-${Date.now()}`, type: "text", title: message.slice(0, 45) || "אזור חדש", text: "אפשר לערוך את הטקסט הזה עם העיפרון.", showButton: false, showImage: false, items: [] } }]
  };
}

function fallbackSite(prompt, template) {
  const business = prompt.replace(/בנה לי|תיצור|אתר|דף נחיתה/g, "").trim().slice(0, 40) || "העסק שלי";
  return {
    meta: { title: business, description: prompt },
    theme: { primary: "#6d5dfc", secondary: "#22c55e", background: "#f8fafc", text: "#172033", card: "#ffffff" },
    brand: { name: business, logo: business[0] || "א" },
    pages: [{
      id: "home",
      title: "דף הבית",
      slug: "home",
      sections: [
        { id: "hero", type: "hero", title: `האתר של ${business}`, text: `אתר מקצועי שנבנה לפי הבקשה: ${prompt}`, buttonText: "צור קשר", buttonLink: "#contact", showButton: true, showImage: false, image: "", items: [] },
        { id: "section-services", type: "cards", title: "מה אנחנו מציעים", text: "שירותים מרכזיים בצורה ברורה.", showButton: false, showImage: false, items: [
          { id: "service-1", title: "שירות מהיר", text: "מענה ברור ומקצועי." },
          { id: "service-2", title: "איכות גבוהה", text: "עיצוב נקי וחוויה טובה." },
          { id: "service-3", title: "ליווי אישי", text: "התאמה מלאה לצורך שלך." }
        ]},
        { id: "contact", type: "contact", title: "דברו איתנו", text: "נשמח לשמוע ממך.", buttonText: "שלח הודעת וואטסאפ", buttonLink: "https://wa.me/972535820559", showButton: true, showImage: false, items: [] }
      ]
    }]
  };
}

function normalizeSite(site) {
  const safe = site && typeof site === "object" ? site : fallbackSite("אתר חדש", "");
  const theme = { primary: "#6d5dfc", secondary: "#22c55e", background: "#f8fafc", text: "#172033", card: "#ffffff", ...(safe.theme || {}) };
  const pages = Array.isArray(safe.pages) && safe.pages.length ? safe.pages : fallbackSite("אתר חדש", "").pages;
  return { meta: safe.meta || {}, theme, brand: safe.brand || { name: "AI Site", logo: "AI" }, activePageId: safe.activePageId || pages[0].id, pages };
}

function extractId(message) {
  const match = message.match(/(?:hero|section[-\w]*|[\w-]+\.item[-\w]*|item[-\w]*)/i);
  return match?.[0] || "";
}

function friendlyError(error, fallback) {
  if (error.name === "AbortError") return "הבקשה לקחה יותר מדי זמן. נסו שוב עם תיאור קצר יותר.";
  if (error.status === 401 || error.status === 403) return "יש בעיה ב־OpenRouter API Key. בדוק את קובץ .env.";
  if (error.status === 402 || error.status === 429) return "OpenRouter חסם את הבקשה בגלל קרדיט/מגבלה. בדוק את החשבון או נסה מודל אחר.";
  return fallback;
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Env file: ${envPath}`);
  console.log(`OpenRouter key loaded: ${hasKey ? "yes" : "no"}`);
  console.log(`OpenRouter model: ${MODEL}`);
  console.log(`AI Site Editor server: http://localhost:${PORT}`);
});

server.on("error", (error) => {
  console.error(`[SERVER] failed to listen on ${PORT}: ${error.message}`);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n[SERVER] closing...");
  server.close(() => process.exit(0));
});
