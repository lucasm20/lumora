import base64
import binascii
import logging
import os
import shutil
import sys
from io import BytesIO
from pathlib import Path
from typing import Optional

import torch
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError
from safetensors.torch import load_file
from transformers import AutoImageProcessor, AutoModelForImageClassification


MODEL_DIR = Path(os.getenv("EMOTION_MODEL_DIR", "Luminar_balanced_emotion_model"))
PYTORCH_FALLBACK_NAME = "pytorch_model.bin"
ALLOWED_EMOTIONS = {
    "happy": "Happy",
    "neutral": "Neutral",
    "stress": "Stress",
    "angry": "Angry",
    "fear": "Fear",
    "drowsiness": "Drowsiness",
}

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [emotion-ai] %(message)s",
)
logger = logging.getLogger("emotion-ai")

app = FastAPI(title="Lumora Emotion AI", version="1.0.0")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
processor = None
model = None


def validate_model_dir(model_dir: Path) -> None:
    logger.info("Python version: %s", sys.version.replace("\n", " "))
    logger.info("Torch version: %s", torch.__version__)
    logger.info("Loading model from: %s", model_dir.resolve())
    logger.info("Selected device: %s", device)

    if not model_dir.exists():
        raise RuntimeError(f"MODEL_DIR does not exist: {model_dir.resolve()}")

    required_files = ["config.json", "preprocessor_config.json"]
    missing_files = [name for name in required_files if not (model_dir / name).exists()]

    if missing_files:
        raise RuntimeError(f"MODEL_DIR is missing required files: {', '.join(missing_files)}")

    for weights_path in get_weight_candidates(model_dir):
        if weights_path.exists():
            logger.info("Found weights file: %s (%s bytes)", weights_path, weights_path.stat().st_size)
            if is_git_lfs_pointer(weights_path):
                raise RuntimeError(
                    f"{weights_path} is a Git LFS pointer, not the real model file. "
                    "Enable Git LFS for the Railway deploy or upload the actual weights."
                )


def get_weight_candidates(model_dir: Path) -> list[Path]:
    return [
        model_dir / "model.safetensors",
        model_dir / PYTORCH_FALLBACK_NAME,
        model_dir / "checkpoint-30345" / "model.safetensors",
        model_dir / "checkpoint-30345" / PYTORCH_FALLBACK_NAME,
    ]


def is_git_lfs_pointer(path: Path) -> bool:
    if not path.exists() or path.stat().st_size > 1024:
        return False

    try:
        return path.read_text(encoding="utf-8", errors="ignore").startswith(
            "version https://git-lfs.github.com/spec/v1"
        )
    except OSError:
        return False


def get_safetensors_candidates(model_dir: Path) -> list[Path]:
    return [
        model_dir / "model.safetensors",
        model_dir / "checkpoint-30345" / "model.safetensors",
    ]


def convert_safetensors_to_bin(model_dir: Path) -> Path:
    target_path = model_dir / PYTORCH_FALLBACK_NAME

    if target_path.exists() and target_path.stat().st_size > 0:
        logger.info("Using existing PyTorch fallback weights: %s", target_path)
        return target_path

    checkpoint_bin_path = model_dir / "checkpoint-30345" / PYTORCH_FALLBACK_NAME

    if checkpoint_bin_path.exists() and checkpoint_bin_path.stat().st_size > 0:
        logger.info("Copying checkpoint PyTorch fallback weights from: %s", checkpoint_bin_path)
        shutil.copyfile(checkpoint_bin_path, target_path)
        return target_path

    last_error = None

    for source_path in get_safetensors_candidates(model_dir):
        if not source_path.exists():
            logger.warning("Safetensors candidate not found: %s", source_path)
            continue

        if is_git_lfs_pointer(source_path):
            logger.error(
                "Safetensors candidate is a Git LFS pointer, not real weights: %s",
                source_path,
            )
            continue

        try:
            logger.info("Converting safetensors to PyTorch bin from: %s", source_path)
            state_dict = load_file(str(source_path), device="cpu")
            torch.save(state_dict, target_path)
            logger.info("Created PyTorch fallback weights: %s", target_path)
            return target_path
        except Exception as error:
            last_error = error
            logger.exception("Could not convert safetensors candidate: %s", source_path)

    raise RuntimeError("No compatible safetensors file could be converted.") from last_error


def hide_safetensors_for_fallback(model_dir: Path) -> Optional[Path]:
    safetensors_path = model_dir / "model.safetensors"

    if not safetensors_path.exists():
        return None

    disabled_path = model_dir / "model.safetensors.disabled"

    if disabled_path.exists():
        return None

    shutil.move(str(safetensors_path), str(disabled_path))
    logger.warning("Temporarily disabled incompatible safetensors file: %s", disabled_path)
    return disabled_path


def restore_safetensors(model_dir: Path, disabled_path: Optional[Path]) -> None:
    if not disabled_path or not disabled_path.exists():
        return

    original_path = model_dir / "model.safetensors"

    if not original_path.exists():
        shutil.move(str(disabled_path), str(original_path))
        logger.info("Restored safetensors file after fallback load attempt.")


def load_emotion_model() -> tuple[AutoImageProcessor, AutoModelForImageClassification]:
    validate_model_dir(MODEL_DIR)
    image_processor = AutoImageProcessor.from_pretrained(str(MODEL_DIR))

    try:
        logger.info("Trying primary model load from safetensors.")
        classifier = AutoModelForImageClassification.from_pretrained(
            str(MODEL_DIR),
            ignore_mismatched_sizes=True,
        )
        logger.info("Primary model load succeeded.")
    except Exception as error:
        logger.exception("Primary model load failed. Falling back to PyTorch .bin weights.")
        convert_safetensors_to_bin(MODEL_DIR)
        disabled_path = hide_safetensors_for_fallback(MODEL_DIR)

        try:
            classifier = AutoModelForImageClassification.from_pretrained(
                str(MODEL_DIR),
                ignore_mismatched_sizes=True,
                use_safetensors=False,
            )
            logger.info("PyTorch .bin fallback model load succeeded.")
        finally:
            restore_safetensors(MODEL_DIR, disabled_path)

    classifier.to(device)
    classifier.eval()
    return image_processor, classifier


processor, model = load_emotion_model()


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
    emotion = normalize_emotion(raw_label)

    return {
        "emotion": emotion,
        "confidence": round(float(confidence.item()), 4),
        "rawLabel": emotion.lower(),
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
