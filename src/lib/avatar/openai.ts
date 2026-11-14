// OpenAI 호출(얇은 운반층). 키는 부르는 쪽(서버)이 넘긴다. 다른 로컬 파일을 가져오지 않아서
// 서버 코드와 점검용 node 스크립트가 같은 함수를 쓴다. 새 npm 의존성 없이 fetch만 쓴다.

const API = 'https://api.openai.com/v1';
// 운영 일꾼(worker/avatar)은 baseUrl로 그 맥의 구독 프록시(localhost)를 가리킨다. 없으면 공식 주소.

export class OpenAIError extends Error {
  status: number;
  code: string | null;
  /** 내용 검사에 걸려 막힌 경우(같은 사진으로 다시 시도하지 않는다) */
  blocked: boolean;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'OpenAIError';
    this.status = status;
    this.code = code;
    this.blocked = code === 'moderation_blocked' || /moderation|safety/i.test(code ?? '');
  }
}

export type VisionResult = {
  /** 모델이 낸 JSON 글자(없거나 거절이면 null) */
  text: string | null;
  refused: boolean;
  usage: Record<string, unknown> | null;
};

/** 사진 한 장을 비전 모델에 보여 주고 정해진 JSON 모양으로 답을 받는다(Responses API) */
export async function visionCheck(opts: {
  apiKey: string;
  model: string;
  image: Uint8Array;
  mime: string;
  instructions: string;
  schema: Record<string, unknown>;
  /** 스키마에 붙이는 이름(기록에서 어떤 물음인지 가린다). 없으면 사진 살피기 */
  schemaName?: string;
  safetyId?: string;
  timeoutMs?: number;
  baseUrl?: string;
}): Promise<VisionResult> {
  const dataUrl = `data:${opts.mime};base64,${toBase64(opts.image)}`;
  const body = {
    model: opts.model,
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 2000,
    ...(opts.safetyId ? { safety_identifier: opts.safetyId } : {}),
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: opts.instructions },
          { type: 'input_image', image_url: dataUrl, detail: 'high' },
        ],
      },
    ],
    text: { format: { type: 'json_schema', name: opts.schemaName ?? 'photo_check', strict: true, schema: opts.schema } },
  };
  const res = await fetch(`${opts.baseUrl ?? API}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) throw toError(res.status, json);
  let text: string | null = null;
  let refused = false;
  for (const item of asArray(json.output)) {
    if (!item || typeof item !== 'object' || (item as { type?: unknown }).type !== 'message') continue;
    for (const part of asArray((item as { content?: unknown }).content)) {
      const p = part as { type?: unknown; text?: unknown };
      if (p.type === 'output_text' && typeof p.text === 'string') text = (text ?? '') + p.text;
      if (p.type === 'refusal') refused = true;
    }
  }
  return { text, refused, usage: asRecord(json.usage) };
}

export type EditResult = {
  png: Uint8Array;
  usage: Record<string, unknown> | null;
  /** 실제로 적용된 값(응답에 있으면) */
  background: string | null;
  size: string | null;
};

/** 사진을 참고해 새 그림을 그린다(Image API edits, multipart) */
export async function editImage(opts: {
  apiKey: string;
  model: string;
  image: Uint8Array;
  mime: string;
  prompt: string;
  size: string;
  quality: string;
  complexity?: string;
  background?: 'transparent' | 'opaque' | 'auto';
  safetyId?: string;
  timeoutMs?: number;
  baseUrl?: string;
}): Promise<EditResult> {
  const form = new FormData();
  form.append('model', opts.model);
  form.append('prompt', opts.prompt);
  form.append('image', new Blob([copyBytes(opts.image)], { type: opts.mime }), fileName(opts.mime));
  form.append('size', opts.size);
  form.append('quality', opts.quality);
  if (opts.complexity) form.append('complexity', opts.complexity);
  form.append('background', opts.background ?? 'transparent');
  form.append('output_format', 'png');
  form.append('n', '1');
  if (opts.safetyId) form.append('safety_identifier', opts.safetyId);
  const res = await fetch(`${opts.baseUrl ?? API}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 100_000),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) throw toError(res.status, json);
  const first = asArray(json.data)[0] as { b64_json?: unknown } | undefined;
  if (!first || typeof first.b64_json !== 'string') throw new OpenAIError('no image in response', 502, 'no_image');
  const png = fromBase64(first.b64_json);
  if (!(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47)) {
    throw new OpenAIError('response is not a PNG', 502, 'not_png');
  }
  return {
    png,
    usage: asRecord(json.usage),
    background: typeof json.background === 'string' ? json.background : null,
    size: typeof json.size === 'string' ? json.size : null,
  };
}

function toError(status: number, json: Record<string, unknown> | null): OpenAIError {
  const err = asRecord(json?.error);
  const code = typeof err?.code === 'string' ? err.code : typeof err?.type === 'string' ? err.type : null;
  const message = typeof err?.message === 'string' ? err.message : `OpenAI request failed (${status})`;
  return new OpenAIError(message.slice(0, 300), status || 502, code);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function fileName(mime: string): string {
  return mime === 'image/png' ? 'photo.png' : mime === 'image/webp' ? 'photo.webp' : 'photo.jpg';
}
function copyBytes(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(b.byteLength);
  out.set(b);
  return out;
}
function toBase64(b: Uint8Array): string {
  return Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('base64');
}
function fromBase64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}
