import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

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

function parseJsonRecord(value: unknown, fieldName: string): JsonRecord {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      throw new Error(`${fieldName} 문자열을 JSON 객체로 파싱할 수 없습니다.`);
    }
  }

  if (!isRecord(value)) {
    throw new Error(`${fieldName}은 JSON 객체여야 합니다.`);
  }

  return value;
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
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

function makeTipId(tip: JsonRecord): string {
  const region = asString(tip.region)?.replace(/\s+/g, "_") || "unknown";
  const now = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return `${region}_${now}_${random}`;
}

function buildRow(tipId: string, tip: JsonRecord): JsonRecord {
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
    validation_status: asString(tip.validation_status),
    source: asString(tip.source),
    sensibility: asArray(tip.sensibility),
    companion: asArray(tip.companion),
    local_observation: asString(tip.local_observation),
    best_time: asString(tip.best_time),
    mission_seed: asString(tip.mission_seed),
    caution: asString(tip.caution),
    plan_b: asString(tip.plan_b),
    mission_action: asString(missionDna.mission_action),
    clear_condition_seed: asString(missionDna.clear_condition_seed),
    time_modifier: asString(missionDna.time_modifier),
    difficulty_hint: asString(missionDna.difficulty_hint),
    companion_fit: asArray(missionDna.companion_fit),
    plan_b_seed: asString(missionDna.plan_b_seed),
    etiquette_rule: asString(missionDna.etiquette_rule),
    local_power_score: asNumber(missionDna.local_power_score),
    influence_scope: asString(missionDna.influence_scope),
    contributor_profile: asRecord(tip.contributor_profile),
    intake_metadata: asRecord(tip.intake_metadata),
    raw_json: tip,
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
    const tip = parseJsonRecord(body.validated_tip, "validated_tip");
    const missionDna = asRecord(tip.mission_dna);

    if (tip.validation_status !== "pass") {
      return jsonResponse({
        ok: false,
        error: "VALIDATION_NOT_PASS",
        reason: "validation_status가 pass가 아니므로 저장하지 않습니다.",
      }, 400);
    }

    if (tip.source !== "resident_contribution") {
      return jsonResponse({
        ok: false,
        error: "INVALID_SOURCE",
        reason: "source가 resident_contribution이 아닙니다.",
      }, 400);
    }

    if (!missionDna.mission_action) {
      return jsonResponse({
        ok: false,
        error: "MISSING_MISSION_ACTION",
        reason: "mission_dna.mission_action이 없습니다.",
      }, 400);
    }

    if (!missionDna.clear_condition_seed) {
      return jsonResponse({
        ok: false,
        error: "MISSING_CLEAR_CONDITION",
        reason: "mission_dna.clear_condition_seed가 없습니다.",
      }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "MISSING_SUPABASE_ENV" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const tipId = makeTipId(tip);
    const row = buildRow(tipId, tip);

    const { error } = await supabase.from("resident_tips").insert(row);

    if (error) {
      return jsonResponse({
        ok: false,
        error: "DATABASE_INSERT_FAILED",
        reason: error.message,
      }, 500);
    }

    return jsonResponse({ ok: true, stored: true, tip_id: tipId });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "BAD_REQUEST",
      reason: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
