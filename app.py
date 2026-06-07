from __future__ import annotations

import csv
import json
import os
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS


app = Flask(__name__)
CORS(app)

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
CSV_PATH = Path(os.environ.get("CSV_PATH", DATA_DIR / "resident_tips.csv"))


def make_tip_id(validated_tip: dict) -> str:
    region = validated_tip.get("region", "unknown")
    now = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"{region}_{now}"


def flatten_tip(tip_id: str, tip: dict) -> dict:
    mission_dna = tip.get("mission_dna") or {}
    contributor_profile = tip.get("contributor_profile") or {}
    intake_metadata = tip.get("intake_metadata") or {}

    return {
        "ID": tip_id,
        "region": tip.get("region"),
        "place_hint": tip.get("place_hint"),
        "linked_content_id": tip.get("linked_content_id"),
        "area_code": tip.get("area_code"),
        "sigungu_code": tip.get("sigungu_code"),
        "canonical_place": tip.get("canonical_place"),
        "anchor_confidence": tip.get("anchor_confidence"),
        "quality_score": tip.get("quality_score"),
        "validation_status": tip.get("validation_status"),
        "source": tip.get("source"),
        "sensibility": json.dumps(tip.get("sensibility", []), ensure_ascii=False),
        "companion": json.dumps(tip.get("companion", []), ensure_ascii=False),
        "local_observation": tip.get("local_observation"),
        "best_time": tip.get("best_time"),
        "mission_seed": tip.get("mission_seed"),
        "caution": tip.get("caution"),
        "plan_b": tip.get("plan_b"),
        "mission_action": mission_dna.get("mission_action"),
        "clear_condition_seed": mission_dna.get("clear_condition_seed"),
        "time_modifier": mission_dna.get("time_modifier"),
        "difficulty_hint": mission_dna.get("difficulty_hint"),
        "companion_fit": json.dumps(
            mission_dna.get("companion_fit", []), ensure_ascii=False
        ),
        "plan_b_seed": mission_dna.get("plan_b_seed"),
        "etiquette_rule": mission_dna.get("etiquette_rule"),
        "local_power_score": mission_dna.get("local_power_score"),
        "influence_scope": mission_dna.get("influence_scope"),
        "contributor_profile": json.dumps(contributor_profile, ensure_ascii=False),
        "intake_metadata": json.dumps(intake_metadata, ensure_ascii=False),
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }


def write_csv(row: dict) -> None:
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    file_exists = CSV_PATH.exists() and CSV_PATH.stat().st_size > 0

    with CSV_PATH.open("a", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=list(row.keys()))

        if not file_exists:
            writer.writeheader()

        writer.writerow(row)


@app.get("/")
def root():
    return jsonify(
        {
            "ok": True,
            "service": "OffMap Resident Mission DNA API",
            "endpoints": ["/health", "/tips"],
        }
    )


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/tips")
def save_tip():
    try:
        payload = request.get_json(silent=True)

        if payload is None:
            return jsonify(
                {
                    "ok": False,
                    "error": "INVALID_JSON",
                    "reason": "요청 본문이 JSON이 아닙니다.",
                }
            ), 400

        if not isinstance(payload, dict):
            return jsonify(
                {
                    "ok": False,
                    "error": "INVALID_JSON_OBJECT",
                    "reason": "요청 본문은 JSON 객체여야 합니다.",
                }
            ), 400

        validated_tip = payload.get("validated_tip")

        # 엔노이아가 validated_tip을 문자열 JSON으로 보낸 경우 처리
        if isinstance(validated_tip, str):
            try:
                validated_tip = json.loads(validated_tip)
            except json.JSONDecodeError:
                return jsonify(
                    {
                        "ok": False,
                        "error": "INVALID_VALIDATED_TIP_STRING",
                        "reason": "validated_tip 문자열을 JSON 객체로 파싱할 수 없습니다.",
                    }
                ), 400

        if not isinstance(validated_tip, dict):
            return jsonify(
                {
                    "ok": False,
                    "error": "VALIDATED_TIP_NOT_OBJECT",
                    "reason": "validated_tip은 JSON 객체여야 합니다.",
                }
            ), 400

        validation_status = validated_tip.get("validation_status")
        source = validated_tip.get("source")
        mission_dna = validated_tip.get("mission_dna") or {}

        if not isinstance(mission_dna, dict):
            mission_dna = {}

        if validation_status != "pass":
            return jsonify(
                {
                    "ok": False,
                    "error": "VALIDATION_NOT_PASS",
                    "reason": "validation_status가 pass가 아니므로 저장하지 않습니다.",
                }
            ), 400

        if source != "resident_contribution":
            return jsonify(
                {
                    "ok": False,
                    "error": "INVALID_SOURCE",
                    "reason": "source가 resident_contribution이 아닙니다.",
                }
            ), 400

        if not mission_dna.get("mission_action"):
            return jsonify(
                {
                    "ok": False,
                    "error": "MISSING_MISSION_ACTION",
                    "reason": "mission_dna.mission_action이 없습니다.",
                }
            ), 400

        if not mission_dna.get("clear_condition_seed"):
            return jsonify(
                {
                    "ok": False,
                    "error": "MISSING_CLEAR_CONDITION",
                    "reason": "mission_dna.clear_condition_seed가 없습니다.",
                }
            ), 400

        tip_id = make_tip_id(validated_tip)
        row = flatten_tip(tip_id, validated_tip)
        write_csv(row)

        return jsonify({"ok": True, "tip_id": tip_id, "stored": True}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": "SERVER_ERROR", "reason": str(e)}), 500


@app.get("/tips")
def list_tips():
    if not CSV_PATH.exists():
        return jsonify({"ok": True, "count": 0, "items": []})

    with CSV_PATH.open("r", newline="", encoding="utf-8-sig") as file:
        rows = list(csv.DictReader(file))

    return jsonify({"ok": True, "count": len(rows), "items": rows[-20:]})


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("DEBUG", "true").lower() in {"1", "true", "yes", "on"}
    app.run(host=host, port=port, debug=debug)
