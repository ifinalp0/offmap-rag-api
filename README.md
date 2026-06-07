# OffMap Resident Tip Flask API

엔노이아 `resident_tip_save` API 커넥터가 `POST /tips`로 보내는 `validated_tip`을 받아 `data/resident_tips.csv`에 저장하는 Flask 서버입니다.

## 설치

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 실행

```bash
python app.py
```

기본 포트는 `5000`입니다. 다른 포트를 쓰려면 `PORT` 환경변수를 지정합니다.

```bash
PORT=8000 python app.py
```

## 엔드포인트

- `GET /`: 서비스 정보
- `GET /health`: 상태 확인
- `POST /tips`: `validated_tip` 저장
- `GET /tips`: 최근 20개 저장 데이터 조회

## POST 요청 형식

```json
{
  "validated_tip": {
    "region": "부산",
    "place_hint": "부산역 근처 영동밀면&돼지국밥",
    "local_observation": "로컬 관찰 내용",
    "mission_dna": {
      "mission_action": "밀면과 돼지국밥을 비교해보기",
      "clear_condition_seed": "더 부산답다고 느낀 메뉴와 이유 남기기"
    },
    "validation_status": "pass",
    "source": "resident_contribution"
  }
}
```

`validated_tip`이 JSON 문자열로 들어와도 서버가 다시 파싱합니다.

## 로컬 테스트

```bash
curl http://127.0.0.1:5000/health
```

```bash
curl -X POST http://127.0.0.1:5000/tips \
  -H "Content-Type: application/json" \
  -d '{
    "validated_tip": {
      "region": "부산",
      "place_hint": "부산역 근처 영동밀면&돼지국밥",
      "local_observation": "관광객들이 밀면이나 돼지국밥 중 하나만 먹고 가는 경우가 많지만, 둘 다 비교해보면 부산식 조합을 더 잘 느낄 수 있음",
      "mission_dna": {
        "mission_action": "밀면과 돼지국밥을 둘 다 시켜서 부산식 조합을 비교해보기",
        "clear_condition_seed": "둘 중 더 부산답다고 느낀 메뉴를 고르고 이유 한 줄 남기기",
        "influence_scope": "candidate"
      },
      "validation_status": "pass",
      "source": "resident_contribution"
    }
  }'
```

엔노이아에서 호출하려면 `ngrok http 5000` 같은 공개 HTTPS 터널을 열고 커넥터 URL을 `https://.../tips`로 설정해야 합니다.

## 배포

### 빠른 시연용 공개 URL

로컬 서버를 실행한 뒤 별도 터미널에서 실행합니다.

```bash
ngrok http 5000
```

표시되는 HTTPS 주소 뒤에 `/tips`를 붙여 엔노이아 커넥터 URL로 사용합니다.

```text
https://example.ngrok-free.app/tips
```

### Render 배포

이 저장소를 GitHub에 올린 뒤 Render에서 Blueprint 또는 Web Service로 연결할 수 있습니다.

- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`
- Health Check Path: `/health`

CSV 저장을 유지하려면 Render Disk를 붙이고 `DATA_DIR=/var/data`로 설정해야 합니다.
