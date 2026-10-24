const FORM_ID = "262964116654059";
const FIELD_NAME = "2";
const FIELD_HOUSE = "3";
const FIELD_PHOTO = "4";
const VOTING_START_UTC = Date.UTC(2026, 9, 24, 22, 0, 0); // 19:00 em Brasília
const VOTING_END_UTC = Date.UTC(2026, 9, 25, 0, 0, 0); // 21:00 em Brasília

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function textAnswer(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(textAnswer).filter(Boolean).join(" ").trim();
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.prettyFormat === "string") return obj.prettyFormat.trim();
    const parts = [obj.first, obj.middle, obj.last, obj.suffix].map(textAnswer).filter(Boolean);
    if (parts.length) return parts.join(" ");
    return Object.values(obj).map(textAnswer).filter(Boolean).join(" ").trim();
  }
  return "";
}

function uploadUrl(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== value) return uploadUrl(parsed);
    } catch { /* Jotform may return one URL as plain text. */ }
    const match = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    return match ? match[0].replace(/[),.;]+$/, "") : "";
  }
  if (Array.isArray(value)) {
    for (const item of value) { const found = uploadUrl(item); if (found) return found; }
    return "";
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = uploadUrl(item);
      if (found) return found;
    }
  }
  return "";
}

async function fetchEntries() {
  const apiKey = Deno.env.get("JOTFORM_API_KEY");
  if (!apiKey) throw new Error("JOTFORM_API_KEY não configurada nos secrets da função.");

  const url = new URL(`https://api.jotform.com/form/${FORM_ID}/submissions`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("limit", "1000");
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Jotform respondeu HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.responseCode !== 200 || !Array.isArray(payload.content)) {
    throw new Error("Resposta inesperada da API do Jotform.");
  }

  return payload.content.flatMap((submission: Record<string, unknown>) => {
    const answers = (submission.answers || {}) as Record<string, Record<string, unknown>>;
    const nameAnswer = answers[FIELD_NAME] || {};
    const houseAnswer = answers[FIELD_HOUSE] || {};
    const photoAnswer = answers[FIELD_PHOTO] || {};
    const photoUrl = uploadUrl(photoAnswer.answer);
    if (!photoUrl) return [];
    return [{
      id: String(submission.id || ""),
      name: textAnswer(nameAnswer.answer) || textAnswer(nameAnswer.prettyFormat) || "Fantasia",
      houseNumber: textAnswer(houseAnswer.answer) || textAnswer(houseAnswer.prettyFormat),
      photoUrl,
    }];
  }).filter((entry: { id: string }) => entry.id);
}

function supabaseHeaders(serviceKey: string, extra: Record<string, string> = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function getAdminKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const keys = JSON.parse(secretKeys) as Record<string, string>;
      if (keys.default) return keys.default;
    } catch { /* Fall back to the legacy injected variable below. */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

async function fetchScores(projectUrl: string, serviceKey: string) {
  const response = await fetch(`${projectUrl}/rest/v1/halloween_votes?select=entry_id,stars&limit=10000`, {
    headers: supabaseHeaders(serviceKey),
  });
  if (!response.ok) throw new Error("Não foi possível ler as avaliações no Supabase.");
  const votes = await response.json() as Array<{ entry_id: string; stars: number }>;
  const scores = new Map<string, { totalStars: number; ratingCount: number }>();
  for (const vote of votes) {
    const current = scores.get(vote.entry_id) || { totalStars: 0, ratingCount: 0 };
    current.totalStars += Number(vote.stars);
    current.ratingCount += 1;
    scores.set(vote.entry_id, current);
  }
  return scores;
}

function isVotingOpen(now = Date.now()) {
  return now >= VOTING_START_UTC && now < VOTING_END_UTC;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getAdminKey();
  if (!projectUrl || !serviceKey) return json({ error: "Configuração do Supabase incompleta." }, 503);

  try {
    if (request.method === "GET") {
      const [entries, scores] = await Promise.all([fetchEntries(), fetchScores(projectUrl, serviceKey)]);
      const ranked = entries.map((entry) => ({
        ...entry,
        ...(scores.get(entry.id) || { totalStars: 0, ratingCount: 0 }),
      })).sort((a, b) => b.totalStars - a.totalStars || a.name.localeCompare(b.name, "pt-BR"));
      const final = Date.now() >= VOTING_END_UTC;
      return json({ entries: final ? ranked.slice(0, 5) : ranked, final });
    }

    if (!isVotingOpen()) return json({ error: "A votação está fechada." }, 403);
    const body = await request.json();
    const entryId = String(body.entryId || "");
    const stars = Number(body.stars);
    const voterId = String(body.voterId || "");
    if (!/^\d+$/.test(entryId)) return json({ error: "Fantasia inválida." }, 400);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return json({ error: "A nota deve ser de 1 a 5 estrelas." }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(voterId)) {
      return json({ error: "Identificador do dispositivo inválido." }, 400);
    }

    const entries = await fetchEntries();
    if (!entries.some((entry) => entry.id === entryId)) return json({ error: "Fantasia não encontrada." }, 404);

    const response = await fetch(`${projectUrl}/rest/v1/halloween_votes`, {
      method: "POST",
      headers: supabaseHeaders(serviceKey, { Prefer: "return=minimal" }),
      body: JSON.stringify({ entry_id: entryId, voter_id: voterId, stars }),
    });
    if (response.status === 409) return json({ error: "Este dispositivo já avaliou esta fantasia." }, 409);
    if (!response.ok) return json({ error: "Não foi possível gravar a avaliação." }, 500);
    return json({ ok: true, entryId, stars }, 201);
  } catch (error) {
    console.error("halloween-vote failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Não foi possível carregar a galeria ou o placar." }, 502);
  }
});
