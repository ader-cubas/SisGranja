const runtime = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
}).Deno;

type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
type GeminiPart = { text: string } | { inline_data: { mime_type: ImageMimeType; data: string } };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

const RESULT_FIELDS = ['enfermedad_probable', 'diagnostico_situacion', 'causa_principal', 'accion_inmediata', 'tratamiento_manejo', 'prevencion_diaria'] as const;
// Los alias *-latest siguen al modelo vigente, así no fallan cuando Google retira versiones.
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
const RETRYABLE_STATUS = [404, 429, 500, 503, 504];
const ATTEMPT_TIMEOUT_MS = 25_000;
const MAX_REQUESTS_PER_MINUTE = 8;
const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_BASE64_LENGTH = 120_000;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const requestCounts = new Map<string, { count: number; startedAt: number }>();

const SUMMARY_FIELDS = ['enfermedad', 'farmaco_dosis', 'dias', 'accion', 'prevencion'] as const;

const schemaFor = (fields: readonly string[]) => ({
  type: 'OBJECT',
  properties: Object.fromEntries(fields.map(field => [field, { type: 'STRING' }])),
  required: [...fields],
});

const summaryPrompt = `Eres Dr. Cuy IA, asistente veterinario de cuyes (Cavia porcellus). Analiza la imagen y responde solo con JSON de 5 campos de texto muy breves (máximo 1 línea cada uno): {"enfermedad":"enfermedad más probable","farmaco_dosis":"fármaco principal exacto y su dosis (mg/kg o ml/kg y vía), ej. Enrofloxacina 5% 0.1 ml/kg SC","dias":"días de duración del tratamiento","accion":"acción inmediata en la poza (aislamiento o desinfección)","prevencion":"prevención clave"}. Sin explicaciones, sin Markdown. Español.`;

const systemPrompt = `Actúa como un asistente veterinario experto en sanidad, manejo y bioseguridad de cuyes (Cavia porcellus) en granjas de crianza; no afirmes ser el veterinario tratante. Analiza la imagen (animal vivo, cadáver o necropsia) y responde exclusivamente con JSON válido, sin Markdown, con exactamente estos seis campos de texto: {"enfermedad_probable":"...","diagnostico_situacion":"...","causa_principal":"...","accion_inmediata":"...","tratamiento_manejo":"...","prevencion_diaria":"..."}.
- enfermedad_probable: indica una enfermedad solo si la imagen aporta evidencia suficiente y expresa el nivel de certeza. Si no permite identificarla, describe el hallazgo y la incertidumbre, por ejemplo: "Lesiones hepáticas multifocales, causa indeterminada". No inventes un diagnóstico para completar el campo.
- Especie objetivo: cuy (Cavia porcellus), no conejo. No extrapoles enfermedades o agentes propios de conejos: Eimeria stiedae se asocia clásicamente a coccidiosis hepática en conejos. No atribuyas esa especie a un cuy ni identifiques una especie de parásito solo por una fotografía macroscópica.
- diagnostico_situacion: describe lo que se observa, separándolo de cualquier interpretación. Presenta diferenciales solo como posibilidades, nunca como confirmación por imagen.
- causa_principal: no atribuyas una causa de granja sin evidencia; si no se puede inferir de la foto, indícalo y menciona qué muestra o prueba ayudaría a diferenciar las causas.
- accion_inmediata: de 3 a 5 pasos numerados y concretos de bioseguridad en campo: aislar animales afectados, retirar alimento sospechoso y cama húmeda, agua limpia, desinfectar según la etiqueta y dejar secar antes de reingresar animales, manejo seguro de cadáveres (guantes, eliminación o entierro) y avisar al veterinario.
- tratamiento_manejo: si la causa no está confirmada, no recomiendes fármacos ni un tratamiento específico; limita la respuesta a medidas de soporte seguras y señala qué confirmación hace falta antes de tratar. No indiques dosis, concentraciones, vías ni duración.
- prevencion_diaria: pautas claras y frecuencia práctica (limpieza de comederos y bebederos a diario, cama seca, forraje fresco, vacío sanitario, control de densidad, cuarentena de animales nuevos, registro de bajas).
No afirmes con certeza enfermedades internas a partir de una foto: indica el nivel de certeza y que el diagnóstico definitivo requiere necropsia o laboratorio. Responde siempre en español, de forma breve y práctica.`;

function allowedOrigins(): string[] {
  return (runtime.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string | null): boolean {
  const allowed = allowedOrigins();
  return Boolean(origin && (allowed.includes('*') || allowed.includes(origin)));
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = allowedOrigins();
  return {
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? (allowed.includes('*') ? '*' : origin) : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  for (const [ip, window] of requestCounts) {
    if (now - window.startedAt >= 60_000) requestCounts.delete(ip);
  }
  const window = requestCounts.get(clientIp);
  if (window && window.count >= MAX_REQUESTS_PER_MINUTE) return true;
  requestCounts.set(clientIp, window ? { ...window, count: window.count + 1 } : { count: 1, startedAt: now });
  return false;
}

// Comprueba la firma binaria para que el tipo declarado coincida con la imagen real.
function matchesImageSignature(base64: string, mimeType: ImageMimeType): boolean {
  let header: string;
  try {
    header = atob(base64.slice(0, 24));
  } catch {
    return false;
  }
  if (mimeType === 'image/jpeg') return header.startsWith('\xFF\xD8\xFF');
  if (mimeType === 'image/png') return header.startsWith('\x89PNG\r\n\x1A\n');
  return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
}

function cleanImageInput(body: Record<string, unknown>): { mimeType: ImageMimeType; base64: string } | null {
  const image = body.image ?? body.img;
  const imageObject = image && typeof image === 'object' ? image as Record<string, unknown> : null;
  const imageValue = typeof image === 'string' ? image : imageObject?.data ?? imageObject?.base64;
  if (typeof imageValue !== 'string') return null;

  const dataUrl = imageValue.match(/^data:(image\/[a-z0-9.+-]+);base64,/i);
  const declaredMime = String(body.mime_type ?? body.mimeType ?? imageObject?.mime_type ?? dataUrl?.[1] ?? 'image/jpeg').toLowerCase();
  const mimeType = (declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime) as ImageMimeType;
  const base64 = imageValue.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim();

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return null;
  if (!base64 || base64.length > MAX_BASE64_LENGTH || !BASE64_PATTERN.test(base64)) return null;
  if (!matchesImageSignature(base64, mimeType)) return null;
  return { mimeType, base64 };
}

function parseGeminiResult(text: string, fields: readonly string[] = RESULT_FIELDS): Record<string, string> | null {
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (fields.some(field => typeof record[field] !== 'string' || !(record[field] as string).trim())) return null;
  return Object.fromEntries(fields.map(field => [field, (record[field] as string).trim().slice(0, 1600)]));
}

async function callGemini(apiKey: string, parts: GeminiPart[], schema: unknown): Promise<Response> {
  let response!: Response;
  for (let attempt = 0; attempt < GEMINI_MODELS.length; attempt++) {
    const model = GEMINI_MODELS[attempt];
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: schema,
              temperature: 0.3,
              maxOutputTokens: 1400,
            },
          }),
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        },
      );
    } catch (error) {
      if (attempt === GEMINI_MODELS.length - 1) throw error;
      continue;
    }
    if (!RETRYABLE_STATUS.includes(response.status)) break;
    console.error('veterinario-virtual: modelo', model, 'respondió', response.status);
  }
  return response;
}

runtime.serve(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405, origin);
  if (!isAllowedOrigin(origin)) return jsonResponse({ error: 'Origen no autorizado.' }, 403, origin);

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(clientIp)) {
    return jsonResponse({ error: 'Límite temporal alcanzado. Intenta de nuevo en un minuto.' }, 429, origin);
  }

  const apiKey = runtime.env.get('GEMINI_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'El servicio veterinario aún no está configurado.' }, 503, origin);

  try {
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: 'La imagen supera el tamaño permitido.' }, 413, origin);
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: 'La imagen supera el tamaño permitido.' }, 413, origin);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'El cuerpo JSON no es válido.' }, 400, origin);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'El cuerpo JSON no es válido.' }, 400, origin);
    }

    const image = cleanImageInput(body as Record<string, unknown>);
    if (!image) return jsonResponse({ error: 'Envía una imagen JPEG, PNG o WebP válida en Base64.' }, 400, origin);

    const summary = (body as Record<string, unknown>).formato === 'resumido';
    const parts: GeminiPart[] = [
      { text: summary ? summaryPrompt : systemPrompt },
      { inline_data: { mime_type: image.mimeType, data: image.base64 } },
    ];

    const geminiResponse = await callGemini(apiKey, parts, schemaFor(summary ? SUMMARY_FIELDS : RESULT_FIELDS));
    if (!geminiResponse.ok) {
      const upstream = await geminiResponse.clone().json().catch(() => ({})) as { error?: { message?: string } };
      const detail = String(upstream.error?.message || '').slice(0, 160);
      console.error('veterinario-virtual: Gemini respondió', geminiResponse.status, detail);
      if (/quota|resource_exhausted|free tier/i.test(detail)) {
        return jsonResponse({ error: 'Se alcanzó la cuota de uso de Gemini para el servicio veterinario. Revisa el límite y la facturación de la cuenta configurada, o inténtalo cuando la cuota se restablezca.' }, 502, origin);
      }
      if ([429, 503].includes(geminiResponse.status)) {
        return jsonResponse({ error: 'El servicio de análisis está saturado. Espera un minuto e inténtalo de nuevo.' }, 503, origin);
      }
      return jsonResponse({ error: `No se pudo completar el análisis con el servicio de IA (código ${geminiResponse.status}${detail ? `: ${detail}` : ''}).` }, 502, origin);
    }

    const geminiData = await geminiResponse.json().catch(() => ({})) as GeminiResponse;
    const resultText = geminiData.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    if (!resultText) return jsonResponse({ error: 'Gemini no devolvió una respuesta JSON legible.' }, 502, origin);

    const result = parseGeminiResult(resultText, summary ? SUMMARY_FIELDS : RESULT_FIELDS);
    if (!result) return jsonResponse({ error: 'Gemini devolvió un JSON incompleto o inválido.' }, 502, origin);
    return jsonResponse({ result }, 200, origin);
  } catch (error: unknown) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error('veterinario-virtual:', error);
    return jsonResponse(
      { error: timedOut ? 'El análisis tardó demasiado. Inténtalo de nuevo.' : 'Error interno al analizar la imagen.' },
      timedOut ? 504 : 500,
      origin,
    );
  }
});
