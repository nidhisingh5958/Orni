# Backend

Thin FastAPI relay that holds the Gemini API key server-side. The Android app never talks to Google's API directly.

## Running locally

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export GEMINI_API_KEY=...
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Without `GEMINI_API_KEY` the image endpoints raise HTTP 503 and the token endpoint returns a stub pointing at `ws://10.0.2.2:8765` (emulator loopback only).

## Model aliases

Defined at the top of `backend/app/main.py`. Confirm against hackathon docs before demo day.

| alias constant | current value | used by |
|---|---|---|
| `_NB2_LITE_MODEL` | `gemini-2.0-flash-preview-image-generation` | `/generate-garment`, `/ad/generate` |
| `_OMNI_FLASH_MODEL` | `gemini-2.0-flash-preview-image-generation` | `/apply-garment` |
| `_LIVE_MODEL` | `gemini-2.0-flash-live-001` | referenced in Android only |

## Endpoints

### `GET /health`
Liveness probe. Returns `{"status": "ok"}`.

---

### `POST /generate-garment`
Generates a transparent-background garment PNG via NB2 Lite.

Request:
```json
{ "description": "blue corduroy jacket" }
```
Response:
```json
{ "garmentImageBase64": "<png base64>" }
```

Prompt instructs the model to return a front-facing, studio-lit garment with no person and a transparent background.

---

### `POST /apply-garment`
Composites the garment onto the photo using Omni Flash. Reuses a server-side session so follow-up edits are incremental turns.

Request:
```json
{
  "photoBase64": "<jpeg base64>",
  "garmentImageBase64": "<png base64>",
  "sessionId": "<uuid or null>",
  "instruction": "<optional override>"
}
```
Response:
```json
{ "resultImageBase64": "<jpeg base64>", "sessionId": "<uuid>" }
```

Session history is stored in `_omni_sessions` (in-process dict). A new `sessionId` is created when `sessionId` is null. The client passes the returned `sessionId` back on subsequent calls to continue the same session.

---

### `POST /ad/ephemeral-token`
Mints credentials for the Android app to open a direct Gemini Live WebSocket. The relay is never in the audio path.

Response:
```json
{
  "token": "<api key or stub>",
  "expiresAt": 1234567890,
  "websocketUrl": "wss://generativelanguage.googleapis.com/ws/..."
}
```

The app appends `?key=<token>` to `websocketUrl`. Shared by both voice features (Ad Canvas and Voice Wardrobe).

---

### `POST /ad/generate`
Generates a 1024×1024 ad frame via NB2 Lite.

Request:
```json
{
  "product": "running shoes",
  "background": "mountain trail",
  "copyText": "Run further.",
  "style": "minimalist"
}
```
Response:
```json
{ "imageBase64": "<png base64>" }
```

## Session store

`_omni_sessions: dict[str, list[Content]]` — in-process, lost on restart. Replace with Redis for production. Each entry is the full turn history for one Omni Flash session; the relay appends both the user turn and the model response so the next call is a true incremental edit.

## Known issues

- The deployed EC2 instance runs the old Phase-0 stub code. Redeploy `backend/app/main.py` with `GEMINI_API_KEY` set.
- `apply-garment` always labels the photo `image/jpeg` regardless of actual format — PNG/WebP photos will be mislabelled.
- No request size limit; full-resolution photos produce ~6 MB+ bodies and risk the 60 s read timeout on slow connections.
- Session store is in-process; a relay restart loses all Omni Flash session histories.
