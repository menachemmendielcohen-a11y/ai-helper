# AI Site Editor Pro - Fixed

עורך אתרים עם React + Node + OpenRouter.

## הפעלה

```bash
npm install
```

צור קובץ `.env` בתיקייה הראשית לפי `.env.example`:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_MODEL=openai/gpt-4o-mini
PORT=3001
```

להפעלה:

```bash
npm run dev:all
```

פתח בדפדפן את הכתובת ש-Vite מציג, בדרך כלל:

```txt
http://localhost:5173
```

אם 5173 תפוס, Vite יפתח 5174 וזה בסדר.

## בדיקה שהשרת עובד

פתח:

```txt
http://localhost:3001/api/health
```

צריך לראות JSON עם:

```json
"openRouterKeyLoaded": true
```

## פתיחה זמנית לחבר

```bash
npx localtunnel --port 5173
```

אם Vite נפתח על 5174:

```bash
npx localtunnel --port 5174
```

כדי לסגור: Ctrl+C.
