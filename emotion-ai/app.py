import base64
import binascii
import os
from io import BytesIO
from pathlib import Path
from typing import Optional

import torch
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError
from transformers import AutoImageProcessor, AutoModelForImageClassification


MODEL_DIR = Path(os.getenv("EMOTION_MODEL_DIR", "Luminar_balanced_emotion_model"))
ALLOWED_EMOTIONS = {
    "happy": "Happy",
    "neutral": "Neutral",
    "stress": "Stress",
    "sad": "Sad",
    "angry": "Angry",
    "fear": "Fear",
    "surprise": "Surprise",
    "disgust": "Disgust",
    "drowsiness": "Drowsiness",
}

app = FastAPI(title="Lumora Emotion AI", version="1.0.0")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
processor = AutoImageProcessor.from_pretrained(MODEL_DIR)
model = AutoModelForImageClassification.from_pretrained(MODEL_DIR)
model.to(device)
model.eval()


def decode_base64_image(value: str) -> bytes:
    image_value = (value or "").strip()

    if not image_value:
        raise HTTPException(status_code=400, detail="Image payload is required.")

    if "," in image_value and image_value.lower().startswith("data:image/"):
        image_value = image_value.split(",", 1)[1]

    try:
        return base64.b64decode(image_value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload.") from error


def load_image(image_bytes: bytes) -> Image.Image:
    try:
        return Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as error:
        raise HTTPException(status_code=400, detail="Invalid image file.") from error


def normalize_emotion(label: str) -> str:
    normalized = str(label or "").strip().lower().replace("-", "_").replace(" ", "_")
    return ALLOWED_EMOTIONS.get(normalized, "Neutral")


def classify_image(image: Image.Image) -> dict:
    inputs = processor(images=image, return_tensors="pt")
    inputs = {key: value.to(device) for key, value in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)
        probabilities = torch.softmax(outputs.logits, dim=-1)[0]
        confidence, predicted_id = torch.max(probabilities, dim=0)

    raw_label = model.config.id2label.get(int(predicted_id), str(int(predicted_id)))

    return {
        "emotion": normalize_emotion(raw_label),
        "confidence": round(float(confidence.item()), 4),
        "rawLabel": str(raw_label).strip().lower(),
    }


async def read_request_image(
    request: Request,
    image: Optional[UploadFile],
    image_base64: Optional[str],
) -> bytes:
    if image is not None:
        return await image.read()

    if image_base64:
        return decode_base64_image(image_base64)

    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        payload = await request.json()
        return decode_base64_image(
            payload.get("imageBase64") or payload.get("image_base64") or payload.get("base64")
        )

    raise HTTPException(status_code=400, detail="Send image file or imageBase64.")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "modelDir": str(MODEL_DIR),
        "device": str(device),
    }


@app.post("/predict-emotion")
async def predict_emotion(
    request: Request,
    image: Optional[UploadFile] = File(None),
    imageBase64: Optional[str] = Form(None),
) -> dict:
    image_bytes = await read_request_image(request, image, imageBase64)
    pil_image = load_image(image_bytes)
    return classify_image(pil_image)
