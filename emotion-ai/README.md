# Lumora Emotion AI

FastAPI microservice for Lumora facial emotion classification.

## Local Run

```bash
cd emotion-ai
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

Predict with base64 JSON:

```bash
curl -X POST http://localhost:8000/predict-emotion ^
  -H "Content-Type: application/json" ^
  -d "{\"imageBase64\":\"data:image/jpeg;base64,...\"}"
```

Predict with multipart:

```bash
curl -X POST http://localhost:8000/predict-emotion ^
  -F "image=@face.jpg"
```

The response is strict JSON:

```json
{
  "emotion": "Happy",
  "confidence": 0.92,
  "rawLabel": "happy"
}
```

## Model

The service loads the local model from:

```text
Luminar_balanced_emotion_model/
```

Override the path if needed:

```bash
EMOTION_MODEL_DIR=./Luminar_balanced_emotion_model
```

## Railway

Deploy `emotion-ai` as a separate Railway service.

Use:

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port $PORT
```

Then set the Node backend variable:

```env
EMOTION_SERVICE_URL=https://your-emotion-ai-service.up.railway.app
```

For local backend development:

```env
EMOTION_SERVICE_URL=http://localhost:8000
```
