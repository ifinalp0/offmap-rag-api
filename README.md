# OffMap Resident Tip API

`validated_tip`을 저장하는 API입니다.

로컬 Flask 서버는 CSV에 저장하고, Supabase Edge Function은 `resident_tips`
테이블에 저장합니다.

## Local

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

기본 주소는 `http://127.0.0.1:5000`입니다.

## Endpoints

- `GET /health`: 상태 확인
- `POST /tips`: 검증된 제보 저장
- `GET /tips`: 최근 20개 저장 데이터 조회

`POST /tips` 요청:

```json
{
  "validated_tip": {
    "region": "부산",
    "place_hint": "부산역 근처",
    "local_observation": "로컬 관찰 내용",
    "mission_dna": {
      "mission_action": "현장에서 비교해보기",
      "clear_condition_seed": "선택한 이유 남기기"
    },
    "validation_status": "pass",
    "source": "resident_contribution"
  }
}
```

`validated_tip`은 JSON 객체 또는 JSON 문자열을 받을 수 있습니다.
일부 커넥터 미리보기처럼 `{ "value": ... }`로 감싸져 들어오는 요청도 같은
방식으로 처리합니다.

## Supabase

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
supabase functions deploy resident-tip-save --no-verify-jwt
```

배포 엔드포인트:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/resident-tip-save
```

현재 배포된 `OffMap_RAG` 엔드포인트:

```text
https://mwyahmbntsheysnnennr.supabase.co/functions/v1/resident-tip-save
```

엔노이아 `resident_tip_save` 커넥터 설정:

- Method: `POST`
- URL: `https://mwyahmbntsheysnnennr.supabase.co/functions/v1/resident-tip-save`
- Header: `Content-Type: application/json`
- Body: `{ "validated_tip": ${last_payload} }`

Supabase Edge Function은 `validated_tip`에 전체 OffMap Envelope가 들어오면
`payload.resident.validated_tip`을 찾아 저장합니다. 기존처럼 검증된 팁 객체를
직접 보내는 방식도 계속 허용합니다.

엔노이아가 객체 삽입을 못 하고 문자열 JSON으로 보내는 경우도 허용합니다.

```json
{
  "validated_tip": "${last_payload}"
}
```

저장 조건:

- `payload.resident.validation_status == "pass"` 또는 직접 팁의 `validation_status == "pass"`
- `mission_dna.mission_action`, top-level `mission_action`, `mission_dna.clear_condition_seed`,
  top-level `clear_condition_seed` 중 하나 이상 존재
- `resident_reject`, `reject`, `soft_close` 라우트는 저장하지 않음

성공 응답:

```json
{
  "ok": true,
  "tip_id": "busan_001"
}
```

한 에이전트에서 API 커넥터와 Function Calling을 동시에 활성화하지 않습니다.

선택적으로 API 키를 설정할 수 있지만, 이 경우 커넥터에도 `x-api-key` 헤더를
추가해야 합니다. `Content-Type`만 쓰는 현재 커넥터 구성에서는 설정하지 않는
것이 가장 단순합니다.

```bash
supabase secrets set RESIDENT_TIP_API_KEY="<API_KEY>"
```

## Render

`render.yaml` Blueprint를 사용하거나 Web Service를 직접 만들 수 있습니다.

- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`
- Health Check Path: `/health`

CSV 저장을 유지하려면 디스크를 붙이고 `DATA_DIR`를 영구 디스크 경로로
설정합니다.
