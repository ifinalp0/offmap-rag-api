from __future__ import annotations

import csv
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS


app = Flask(__name__)
CORS(app)

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
CSV_PATH = Path(os.environ.get("CSV_PATH", DATA_DIR / "resident_tips.csv"))

CSV_FIELDS = [
    "id",
    "created_at",
    "region",
    "place_hint",
    "linked_content_id",
    "area_code",
    "sigungu_code",
    "canonical_place",
    "anchor_confidence",
    "quality_score",
    "validation_status",
    "influence_scope",
    "mission_action",
    "clear_condition_seed",
    "time_modifier",
    "difficulty_hint",
    "companion_fit",
    "sensibility",
    "plan_b_seed",
    "etiquette_rule",
    "local_power_score",
    "local_observation",
    "best_time",
    "caution",
    "plan_b",
    "contributor_profile_json",
    "intake_metadata_json",
    "source",
    "raw_json",
]


def ensure_csv() -> None:
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not CSV_PATH.exists() or CSV_PATH.stat().st_size == 0:
        with CSV_PATH.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=CSV_FIELDS)
            writer.writeheader()


def as_json_string(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False) if value is not None else ""


def parse_validated_tip(payload: dict[str, Any]) -> dict[str, Any]:
    validated_tip = payload.get("validated_tip")

    if isinstance(validated_tip, str):
        try:
            validated_tip = json.loads(validated_tip)
        except json.JSONDecodeError as exc:
            raise ValueError("validated_tip 문자열이 유효한 JSON이 아닙니다.") from exc

    if not isinstance(validated_tip, dict):
        raise ValueError("validated_tip은 JSON 객체여야 합니다.")

    return validated_tip


def validate_required_fields(tip: dict[str, Any]) -> None:
    mission_dna = tip.get("mission_dna") or {}

    required_checks = {
        "region": tip.get("region"),
        "place_hint": tip.get("place_hint"),
        "local_observation": tip.get("local_observation"),
        "mission_action": mission_dna.get("mission_action"),
        "clear_condition_seed": mission_dna.get("clear_condition_seed"),
        "validation_status": tip.get("validation_status"),
        "source": tip.get("source"),
    }

    missing = [key for key, value in required_checks.items() if value in (None, "", [])]
    if missing:
        raise ValueError(f"필수 필드 누락: {', '.join(missing)}")

    if tip.get("validation_status") != "pass":
        raise ValueError("validation_status가 pass가 아니므로 저장할 수 없습니다.")

    if tip.get("source") != "resident_contribution":
        raise ValueError("source가 resident_contribution이 아닙니다.")


def build_row(tip: dict[str, Any]) -> dict[str, str]:
    mission_dna = tip.get("mission_dna") or {}

    return {
        "id": f"tip_{uuid.uuid4().hex[:12]}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "region": str(tip.get("region") or ""),
        "place_hint": str(tip.get("place_hint") or ""),
        "linked_content_id": str(tip.get("linked_content_id") or ""),
        "area_code": str(tip.get("area_code") or ""),
        "sigungu_code": str(tip.get("sigungu_code") or ""),
        "canonical_place": str(tip.get("canonical_place") or ""),
        "anchor_confidence": str(tip.get("anchor_confidence") or 0),
        "quality_score": str(tip.get("quality_score") or 0),
        "validation_status": str(tip.get("validation_status") or ""),
        "influence_scope": str(mission_dna.get("influence_scope") or ""),
        "mission_action": str(mission_dna.get("mission_action") or ""),
        "clear_condition_seed": str(mission_dna.get("clear_condition_seed") or ""),
        "time_modifier": str(mission_dna.get("time_modifier") or ""),
        "difficulty_hint": str(mission_dna.get("difficulty_hint") or ""),
        "companion_fit": as_json_string(mission_dna.get("companion_fit") or []),
        "sensibility": as_json_string(tip.get("sensibility") or []),
        "plan_b_seed": str(mission_dna.get("plan_b_seed") or ""),
        "etiquette_rule": str(mission_dna.get("etiquette_rule") or ""),
        "local_power_score": str(mission_dna.get("local_power_score") or 0),
        "local_observation": str(tip.get("local_observation") or ""),
        "best_time": str(tip.get("best_time") or ""),
        "caution": str(tip.get("caution") or ""),
        "plan_b": str(tip.get("plan_b") or ""),
        "contributor_profile_json": as_json_string(tip.get("contributor_profile") or {}),
        "intake_metadata_json": as_json_string(tip.get("intake_metadata") or {}),
        "source": str(tip.get("source") or ""),
        "raw_json": as_json_string(tip),
    }


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
        payload = request.get_json(force=True, silent=False)
        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "요청 body는 JSON 객체여야 합니다."}), 400

        tip = parse_validated_tip(payload)
        validate_required_fields(tip)

        ensure_csv()
        row = build_row(tip)

        with CSV_PATH.open("a", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=CSV_FIELDS)
            writer.writerow(row)

        return jsonify({"ok": True, "tip_id": row["id"], "stored": True})

    except ValueError as exc:
        return jsonify({"ok": False, "stored": False, "error": str(exc)}), 400
    except Exception as exc:
        return (
            jsonify(
                {
                    "ok": False,
                    "stored": False,
                    "error": "internal_server_error",
                    "detail": str(exc),
                }
            ),
            500,
        )


@app.get("/tips")
def list_tips():
    ensure_csv()

    with CSV_PATH.open("r", newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))

    return jsonify({"ok": True, "count": len(rows), "items": rows[-20:]})


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("DEBUG", "true").lower() in {"1", "true", "yes", "on"}
    app.run(host=host, port=port, debug=debug)
