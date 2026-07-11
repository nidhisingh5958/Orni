"""Thin relay between the Android app and the Gemini models.

Holds the real Gemini API key server-side; the Android app never talks to
Google's API directly. Phase 0: both endpoints are stubs that echo their
input so the Android<->relay networking path can be proven before any AI
call is wired in.
"""

import base64
import io
import uuid
from typing import Optional

from fastapi import FastAPI
from PIL import Image, ImageDraw
from pydantic import BaseModel

app = FastAPI(title="Orni Wardrobe Relay")


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
