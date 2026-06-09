import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;
type SupabaseClientLike = ReturnType<typeof createClient>;

type TipReadResult = {
  tip: JsonRecord;
  envelope: JsonRecord | null;
  resident: JsonRecord | null;
};

const REGION_SLUG: Record<string, string> = {
  부산: "busan",
  서울: "seoul",
  전주: "jeonju",
  안동: "andong",
  제주: "jeju",
  경주: "gyeongju",
};

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripJsonStringWrapper(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonRecord(value: unknown, fieldName: string): JsonRecord {
  let current = value;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (isRecord(current)) return current;

    if (typeof current !== "string") break;

    try {
      current = JSON.parse(stripJsonStringWrapper(current));
    } catch {
      throw new Error(`${fieldName} 문자열을 JSON 객체로 파싱할 수 없습니다.`);
    }
  }

  throw new Error(`${fieldName}은 JSON 객체여야 합니다.`);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function looksLikeValidatedTip(value: JsonRecord): boolean {
  return Boolean(
    value.region ||
      value.place_hint ||
      value.local_observation ||
      value.mission_dna ||
      value.validation_status ||
      value.source
  );
}

function readEnvelopeResidentTip(envelope: JsonRecord): TipReadResult | null {
  const payload = asRecord(envelope.payload);
  const resident = asRecord(payload.resident);

  if (!Object.keys(payload).length || !Object.keys(resident).length) {
    return null;
  }

  if (resident.validated_tip !== undefined && resident.validated_tip !== null) {
    const tip = parseJsonRecord(
      resident.validated_tip,
      "payload.resident.validated_tip"
    );
    return { tip, envelope, resident };
  }

  if (looksLikeValidatedTip(resident)) {
    return { tip: resident, envelope, resident };
  }

  return null;
}

function readValidatedTip(body: JsonRecord, depth = 0): TipReadResult {
  if (depth > 4) {
    throw new Error("validated_tip 래퍼가 너무 깊습니다.");
  }

  const envelopeTip = readEnvelopeResidentTip(body);
  if (envelopeTip) return envelopeTip;

  if (body.validated_tip !== undefined && body.validated_tip !== null) {
    const validatedTip = parseJsonRecord(body.validated_tip, "validated_tip");
    return looksLikeValidatedTip(validatedTip)
      ? { tip: validatedTip, envelope: null, resident: null }
      : readValidatedTip(validatedTip, depth + 1);
  }

  if (body.tip !== undefined && body.tip !== null) {
    const tip = parseJsonRecord(body.tip, "tip");
    return looksLikeValidatedTip(tip)
      ? { tip, envelope: null, resident: null }
      : readValidatedTip(tip, depth + 1);
  }

  if (body.value !== undefined && body.value !== null) {
    const value = parseJsonRecord(body.value, "value");
    return looksLikeValidatedTip(value)
      ? { tip: value, envelope: null, resident: null }
      : readValidatedTip(value, depth + 1);
  }

  if (looksLikeValidatedTip(body)) {
    return { tip: body, envelope: null, resident: null };
  }

  const keys = Object.keys(body);
  throw new Error(
    `validated_tip을 찾을 수 없습니다. 요청 body 키: ${keys.length ? keys.join(", ") : "(없음)"}`
  );
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function regionSlug(region: unknown): string {
  const rawRegion = asString(region)?.trim() || "";
  const exactSlug = REGION_SLUG[rawRegion];

  if (exactSlug) return exactSlug;

  for (const [regionName, slug] of Object.entries(REGION_SLUG)) {
    if (rawRegion.includes(regionName)) return slug;
  }

  const asciiSlug = rawRegion
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return asciiSlug || "tip";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sequenceFromTipId(tipId: unknown, slug: string): number {
  const match = asString(tipId)?.match(new RegExp(`^${escapeRegExp(slug)}_(\\d+)$`));
  return match ? Number(match[1]) : 0;
}

async function nextTipId(supabase: SupabaseClientLike, tip: JsonRecord): Promise<string> {
  const explicitTipId = asString(tip.tip_id)?.trim();

  if (explicitTipId) return explicitTipId;

  const slug = regionSlug(tip.region);
  const { data, error } = await supabase
    .from("resident_tips")
    .select("id")
    .like("id", `${slug}_%`)
    .limit(1000);

  if (error) {
    throw new Error(`기존 tip_id 조회 실패: ${error.message}`);
  }

  const rows = (data || []) as Array<{ id?: unknown }>;
  const maxSequence = rows.reduce((max: number, row) => {
    return Math.max(max, sequenceFromTipId(row.id, slug));
  }, 0);

  return `${slug}_${String(maxSequence + 1).padStart(3, "0")}`;
}

function missionValue(tip: JsonRecord, missionDna: JsonRecord, key: string): unknown {
  return missionDna[key] ?? tip[key];
}

function validationStatus(tip: JsonRecord, resident: JsonRecord | null): string | null {
  return asString(resident?.validation_status) ?? asString(tip.validation_status);
}

function blockedRouteReason(envelope: JsonRecord | null): string | null {
  if (!envelope) return null;

  const routeHint = asString(envelope.route_hint)?.trim();
  const stage = asString(envelope.stage)?.trim();
  const blocked = new Set(["resident_reject", "reject", "soft_close"]);

  if (routeHint && blocked.has(routeHint)) {
    return `route_hint가 ${routeHint}이므로 저장하지 않습니다.`;
  }

  if (stage && blocked.has(stage)) {
    return `stage가 ${stage}이므로 저장하지 않습니다.`;
  }

  return null;
}

function buildRow(
  tipId: string,
  tip: JsonRecord,
  rawJson: JsonRecord = tip,
  effectiveValidationStatus: string | null = asString(tip.validation_status)
): JsonRecord {
  const missionDna = asRecord(tip.mission_dna);

  return {
    id: tipId,
    region: asString(tip.region),
    place_hint: asString(tip.place_hint),
    linked_content_id: asString(tip.linked_content_id),
    area_code: asString(tip.area_code),
    sigungu_code: asString(tip.sigungu_code),
    canonical_place: asString(tip.canonical_place),
    anchor_confidence: asNumber(tip.anchor_confidence),
    quality_score: asNumber(tip.quality_score),
    validation_status: effectiveValidationStatus,
    source: asString(tip.source) ?? "resident_contribution",
    sensibility: asArray(tip.sensibility),
    companion: asArray(tip.companion),
    local_observation: asString(tip.local_observation),
    best_time: asString(tip.best_time),
    mission_seed: asString(tip.mission_seed),
    caution: asString(tip.caution),
    plan_b: asString(tip.plan_b),
    mission_action: asString(missionValue(tip, missionDna, "mission_action")),
    clear_condition_seed: asString(missionValue(tip, missionDna, "clear_condition_seed")),
    time_modifier: asString(missionValue(tip, missionDna, "time_modifier")),
    difficulty_hint: asString(missionValue(tip, missionDna, "difficulty_hint")),
    companion_fit: asArray(missionValue(tip, missionDna, "companion_fit")),
    plan_b_seed: asString(missionValue(tip, missionDna, "plan_b_seed")),
    etiquette_rule: asString(missionValue(tip, missionDna, "etiquette_rule")),
    local_power_score: asNumber(missionValue(tip, missionDna, "local_power_score")),
    influence_scope: asString(missionValue(tip, missionDna, "influence_scope")),
    contributor_profile: asRecord(tip.contributor_profile),
    intake_metadata: asRecord(tip.intake_metadata),
    raw_json: rawJson,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (request.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "OffMap Resident Mission DNA API",
        endpoints: ["/functions/v1/resident-tip-save"],
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    }

    const expectedApiKey = Deno.env.get("RESIDENT_TIP_API_KEY");
    if (expectedApiKey && request.headers.get("x-api-key") !== expectedApiKey) {
      return jsonResponse({ ok: false, error: "UNAUTHORIZED" }, 401);
    }

    const payload = await request.json();
    const body = parseJsonRecord(payload, "요청 본문");
    const { tip, envelope, resident } = readValidatedTip(body);
    const missionDna = asRecord(tip.mission_dna);
    const missionAction = asString(missionValue(tip, missionDna, "mission_action"))?.trim();
    const clearConditionSeed = asString(
      missionValue(tip, missionDna, "clear_condition_seed")
    )?.trim();
    const blockedReason = blockedRouteReason(envelope);
    const effectiveValidationStatus = validationStatus(tip, resident)?.trim() ?? null;

    if (blockedReason) {
      return jsonResponse({
        ok: false,
        error: "SAVE_BLOCKED",
        reason: blockedReason,
      }, 400);
    }

    if (effectiveValidationStatus !== "pass") {
      return jsonResponse({
        ok: false,
        error: "VALIDATION_NOT_PASS",
        reason: "validation_status가 pass가 아니므로 저장하지 않습니다.",
      }, 400);
    }

    if (!missionAction && !clearConditionSeed) {
      return jsonResponse({
        ok: false,
        error: "MISSING_MISSION_SEED",
        reason: "mission_action 또는 clear_condition_seed가 없습니다.",
      }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "MISSING_SUPABASE_ENV" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const tipId = await nextTipId(supabase, tip);
    const row = buildRow(tipId, tip, envelope ?? tip, effectiveValidationStatus);

    const { error } = await supabase.from("resident_tips").insert(row);

    if (error) {
      return jsonResponse({
        ok: false,
        error: "DATABASE_INSERT_FAILED",
        reason: error.message,
      }, 500);
    }

    return jsonResponse({ ok: true, tip_id: tipId });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "BAD_REQUEST",
      reason: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
