import { handleAiRequest } from './_ai.js';

declare const process: { env: Record<string, string | undefined> };

/** Vercel Function: POST /api/ai {query} — see api/_ai.ts. */
export function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, {
    groqKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
    dailyLimit: parseInt(process.env.AI_DAILY_LIMIT ?? '', 10) || undefined,
  });
}

/** Browsers and the deployment check can probe with GET; only POST does anything. */
export function GET(request: Request): Promise<Response> {
  return handleAiRequest(request, {});
}
