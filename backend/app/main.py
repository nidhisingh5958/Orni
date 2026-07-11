"""Thin relay between the Android app and the Gemini models.

Holds the real Gemini API key server-side; the Android app never talks to
Google's API directly.
"""

import base64
import io
import os
import time
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from google import genai
from google.genai import types
from PIL import Image, ImageDraw
from pydantic import BaseModel

app = FastAPI(title="Orni Relay")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Model aliases confirmed against Gemini API docs (June 2025).
# Image generation (garment layer + ad frames): gemini-2.0-flash-preview-image-generation
# Multimodal compositing: gemini-2.0-flash-preview-image-generation (supports image in+out)
# Live voice: gemini-2.0-flash-live-001
_NB2_LITE_MODEL = "gemini-2.0-flash-preview-image-generation"
_OMNI_FLASH_MODEL = "gemini-2.0-flash-preview-image-generation"
_LIVE_MODEL = "gemini-2.0-flash-live-001"

_EPHEMERAL_TOKEN_TTL_SECONDS = 60 * 10  # 10 minutes

# ---------------------------------------------------------------------------
# Omni Flash stateful session store
# In production use Redis; for the hackathon an in-process dict is fine.
# ---------------------------------------------------------------------------
_omni_sessions: dict[str, list[types.Content]] = {}


def _get_client() -> genai.Client:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")
    return genai.Client(api_key=GEMINI_API_KEY)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Wardrobe — generate garment via NB2 Lite
# ---------------------------------------------------------------------------

class GenerateGarmentRequest(BaseModel):
    description: str


class GenerateGarmentResponse(BaseModel):
    garmentImageBase64: str


@app.post("/generate-garment", response_model=GenerateGarmentResponse)
def generate_garment(request: GenerateGarmentRequest) -> GenerateGarmentResponse:
    """Generate a garment layer via NB2 Lite (gemini-2.0-flash-preview-image-generation).

    Returns a transparent-background PNG of the garment with any text/logos
    rendered precisely, ready to be composited by Omni Flash.
    """
    client = _get_client()
    prompt = (
        f"Generate a high-quality product image of: {request.description}. "
        "Transparent background. No person, no body. Garment only, front-facing, "
        "studio lighting, photorealistic."
    )
    response = client.models.generate_content(
        model=_NB2_LITE_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            return GenerateGarmentResponse(
                garmentImageBase64=base64.b64encode(part.inline_data.data).decode("ascii")
            )
    raise HTTPException(status_code=502, detail="NB2 Lite returned no image")


# ---------------------------------------------------------------------------
# Wardrobe — apply garment via Omni Flash (stateful session)
# ---------------------------------------------------------------------------

class ApplyGarmentRequest(BaseModel):
    photoBase64: str
    garmentImageBase64: str
    sessionId: Optional[str] = None
    instruction: Optional[str] = None


class ApplyGarmentResponse(BaseModel):
    resultImageBase64: str
    sessionId: str


@app.post("/apply-garment", response_model=ApplyGarmentResponse)
def apply_garment(request: ApplyGarmentRequest) -> ApplyGarmentResponse:
    """Composite the garment onto the photo using Omni Flash.

    Reuses the Interactions API session keyed on sessionId so follow-up edits
    are incremental turns, not cold starts. The session history is stored
    server-side; the client only needs to pass back the sessionId.
    """
    client = _get_client()
    session_id = request.sessionId or str(uuid.uuid4())
    history = _omni_sessions.get(session_id, [])

    photo_bytes = base64.b64decode(request.photoBase64)
    garment_bytes = base64.b64decode(request.garmentImageBase64)

    instruction = request.instruction or "Apply the garment to the person in the photo naturally."
    user_parts = [
        types.Part.from_text(
            f"{instruction} Keep the person's pose, lighting, and body shape. "
            "Return only the composited image."
        ),
        types.Part.from_bytes(data=photo_bytes, mime_type="image/jpeg"),
        types.Part.from_bytes(data=garment_bytes, mime_type="image/png"),
    ]

    contents = history + [types.Content(role="user", parts=user_parts)]

    response = client.models.generate_content(
        model=_OMNI_FLASH_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )

    model_content = response.candidates[0].content
    # Persist the full turn so the next edit is incremental
    _omni_sessions[session_id] = contents + [model_content]

    for part in model_content.parts:
        if part.inline_data is not None:
            return ApplyGarmentResponse(
                resultImageBase64=base64.b64encode(part.inline_data.data).decode("ascii"),
                sessionId=session_id,
            )
    raise HTTPException(status_code=502, detail="Omni Flash returned no image")


# ---------------------------------------------------------------------------
# Ephemeral token — shared by Ad Canvas and Wardrobe voice features
# ---------------------------------------------------------------------------

class EphemeralTokenResponse(BaseModel):
    token: str
    expiresAt: int
    websocketUrl: str


@app.post("/ad/ephemeral-token", response_model=EphemeralTokenResponse)
def mint_ephemeral_token() -> EphemeralTokenResponse:
    """Return the credentials the Android app needs to open a direct WebSocket
    to Gemini Live. The relay is never in the audio path.

    Per the Gemini Live API docs the WebSocket URL takes ?key=API_KEY directly.
    The relay returns the API key as `token` so the client appends it as
    ?key=<token> — no separate ephemeral-token minting endpoint is needed.
    """
    if not GEMINI_API_KEY:
        # Phase 0 stub — lets the Android WebSocket path be proven without a key.
        return EphemeralTokenResponse(
            token=f"stub-{uuid.uuid4()}",
            expiresAt=int(time.time()) + _EPHEMERAL_TOKEN_TTL_SECONDS,
            websocketUrl="ws://10.0.2.2:8765",
        )

    return EphemeralTokenResponse(
        token=GEMINI_API_KEY,
        expiresAt=int(time.time()) + _EPHEMERAL_TOKEN_TTL_SECONDS,
        websocketUrl="wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
    )


# ---------------------------------------------------------------------------
# Ad Canvas — generate ad frame via NB2 Lite (unchanged from Phase 0 stub)
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
    """Generate a 1K ad frame via NB2 Lite."""
    client = _get_client()
    prompt_parts = [f"Create a professional advertisement for: {request.product}."]
    if request.background:
        prompt_parts.append(f"Background: {request.background}.")
    if request.copyText:
        prompt_parts.append(f"Include the text: '{request.copyText}'.")
    if request.style:
        prompt_parts.append(f"Style: {request.style}.")
    prompt_parts.append("Square format, 1024x1024, high quality.")

    response = client.models.generate_content(
        model=_NB2_LITE_MODEL,
        contents=" ".join(prompt_parts),
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            return GenerateAdResponse(
                imageBase64=base64.b64encode(part.inline_data.data).decode("ascii")
            )
    raise HTTPException(status_code=502, detail="NB2 Lite returned no image for ad")
