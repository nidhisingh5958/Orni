"""Thin relay between the Android app and the Gemini models.

Holds the real Gemini API key server-side; the Android app never talks to
Google's API directly. Phase 0: both endpoints are stubs that echo their
input so the Android<->relay networking path can be proven before any AI
call is wired in.
"""

import base64
import io
import os
import time
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from PIL import Image, ImageDraw
from pydantic import BaseModel

app = FastAPI(title="Orni Relay")


class GenerateGarmentRequest(BaseModel):
    description: str


class GenerateGarmentResponse(BaseModel):
    garmentImageBase64: str


class ApplyGarmentRequest(BaseModel):
    photoBase64: str
    garmentImageBase64: str
    sessionId: Optional[str] = None
    instruction: Optional[str] = None


class ApplyGarmentResponse(BaseModel):
    resultImageBase64: str
    sessionId: str


def _placeholder_garment_png(description: str) -> str:
    image = Image.new("RGBA", (512, 512), (235, 226, 250, 255))
    draw = ImageDraw.Draw(image)
    draw.multiline_text((24, 24), f"NB2 Lite stub\n\n{description}", fill=(50, 30, 80, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate-garment", response_model=GenerateGarmentResponse)
def generate_garment(request: GenerateGarmentRequest) -> GenerateGarmentResponse:
    # TODO(Phase 1): call NB2 Lite (gemini-3.1-flash-lite-image) via google-genai here.
    return GenerateGarmentResponse(garmentImageBase64=_placeholder_garment_png(request.description))


@app.post("/apply-garment", response_model=ApplyGarmentResponse)
def apply_garment(request: ApplyGarmentRequest) -> ApplyGarmentResponse:
    # TODO(Phase 1): open/reuse an Omni Flash Interactions API session keyed on
    # sessionId and composite request.garmentImageBase64 onto request.photoBase64.
    session_id = request.sessionId or str(uuid.uuid4())
    return ApplyGarmentResponse(resultImageBase64=request.photoBase64, sessionId=session_id)


# ---------------------------------------------------------------------------
# Ad Canvas — ephemeral token endpoint
# ---------------------------------------------------------------------------
# The Android app calls this once per AudioAdCanvasScreen session. The relay
# mints a short-lived token that the app uses to open a direct WebSocket to
# Gemini Live. The relay is NEVER in the audio path — it only issues the token.
# ---------------------------------------------------------------------------

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
_EPHEMERAL_TOKEN_TTL_SECONDS = 60 * 10  # 10 minutes — enough for one demo session


class EphemeralTokenResponse(BaseModel):
    token: str
    expiresAt: int  # Unix epoch seconds
    websocketUrl: str


@app.post("/ad/ephemeral-token", response_model=EphemeralTokenResponse)
def mint_ephemeral_token() -> EphemeralTokenResponse:
    """Mint a short-lived token the Android app uses to connect directly to
    Gemini Live over WebSocket. The relay never proxies audio.

    TODO(Phase 1): Replace the stub token with a real Google-issued ephemeral
    credential once the hackathon Gemini Live API docs confirm the minting
    endpoint (likely POST https://generativelanguage.googleapis.com/v1beta/
    ephemeralTokens or similar). Until then the stub lets the Android WebSocket
    path be proven end-to-end against a local echo server.
    """
    if not GEMINI_API_KEY:
        # During Phase 0 we allow a missing key so the Android stub path works.
        stub_token = f"stub-{uuid.uuid4()}"
        return EphemeralTokenResponse(
            token=stub_token,
            expiresAt=int(time.time()) + _EPHEMERAL_TOKEN_TTL_SECONDS,
            # Phase 0: point at a local echo WS server (e.g. `wscat --listen 8765`)
            # Phase 1: replace with wss://generativelanguage.googleapis.com/...
            websocketUrl="ws://10.0.2.2:8765",
        )
    # TODO(Phase 1): call Google's ephemeral-token minting API here using
    # GEMINI_API_KEY and return the real token + wss URL.
    raise HTTPException(status_code=501, detail="Real token minting not yet implemented")


# ---------------------------------------------------------------------------
# Ad Canvas — generate ad frame via NB2 Lite
# ---------------------------------------------------------------------------

class GenerateAdRequest(BaseModel):
    product: str
    background: Optional[str] = None
    copyText: Optional[str] = None
    style: Optional[str] = None


class GenerateAdResponse(BaseModel):
    imageBase64: str


@app.post("/ad/generate", response_model=GenerateAdResponse)
def generate_ad(request: GenerateAdRequest) -> GenerateAdResponse:
    """Generate a 1K ad frame via NB2 Lite (gemini-3.1-flash-lite-image).

    TODO(Phase 1): Replace stub with real NB2 Lite call. Confirm model alias
    `gemini-3.1-flash-lite-image` against hackathon docs before integrating.
    """
    image = Image.new("RGB", (1024, 1024), (30, 30, 40))
    draw = ImageDraw.Draw(image)
    lines = [
        "NB2 Lite stub",
        f"Product: {request.product}",
        f"BG: {request.background or '—'}",
        f"Copy: {request.copyText or '—'}",
        f"Style: {request.style or '—'}",
    ]
    draw.multiline_text((40, 40), "\n".join(lines), fill=(220, 210, 200, 255), spacing=12)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return GenerateAdResponse(imageBase64=base64.b64encode(buffer.getvalue()).decode("ascii"))
