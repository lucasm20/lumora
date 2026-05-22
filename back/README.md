# Delegado Back

API Express para autenticacion con Firebase Authentication y Firestore.

Usuario configurado:

- Empresa: `Nintendo`
- Usuario: `gon`
- Password: `1234`
- Rol: `hr`

## Setup

1. Copia `.env.example` a `.env`.
2. Configura `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` y `FIREBASE_STORAGE_BUCKET` con valores vigentes.
3. Configura el microservicio local de emociones en `.env`:

```bash
EMOTION_SERVICE_URL=http://localhost:8000
```

Este servicio vive en `../emotion-ai` y es el motor principal de `Process Images`.

4. Configura Azure AI Vision / Computer Vision en `.env` como fallback:

```bash
AZURE_VISION_ENDPOINT=https://your-vision-resource.cognitiveservices.azure.com
AZURE_VISION_KEY=your_azure_vision_key
AZURE_VISION_API_VERSION=2024-02-01
```

`AZURE_VISION_ENDPOINT` debe ser el endpoint del recurso Azure AI Vision / Computer Vision,
no un endpoint de Azure OpenAI como `*.openai.azure.com`.
Tampoco debe ser un recurso Face API; el recurso debe soportar Image Analysis 4.0.

## Railway Variables

Configura esta variable en el servicio backend de Railway para apuntar al servicio Python:

```bash
EMOTION_SERVICE_URL=https://your-emotion-ai-service.up.railway.app
```

Configura estas variables de Azure Vision en el servicio backend si quieres fallback cuando
`emotion-ai` falle:

```bash
AZURE_VISION_ENDPOINT=https://your-vision-resource.cognitiveservices.azure.com
AZURE_VISION_KEY=your_azure_vision_key
AZURE_VISION_API_VERSION=2024-02-01
```

El backend usa `AZURE_VISION_KEY` como header `Ocp-Apim-Subscription-Key` contra
`/computervision/imageanalysis:analyze`. No usa `AZURE_OPENAI_API_KEY` para procesar imagenes.
Si Railway devuelve `404 Resource not found`, revisa que la key y el endpoint sean del mismo
recurso Azure AI Vision / Computer Vision y que no sean de Face API.

## Emotion AI Local

En otra terminal:

```bash
cd ../emotion-ai
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Emotion AI Railway

Despliega `emotion-ai` como un servicio separado en Railway.

Start command:

```bash
uvicorn app:app --host 0.0.0.0 --port $PORT
```

Luego configura `EMOTION_SERVICE_URL` en el backend con la URL publica de ese servicio.

5. Instala dependencias:

```bash
npm install
```

6. Ejecuta la API:

```bash
npm run dev
```

La API queda en `http://localhost:4000`.

Para crear/actualizar el usuario HR en Firestore:

```bash
npm run seed:hr
```

## Endpoints

- `GET /api/companies`
- `POST /api/auth/register` crea/actualiza solo el usuario HR fijo
- `POST /api/auth/login`
- `GET /api/auth/session`
- `GET /api/employees`

## Firestore

Estructura esperada:

- `companies/{companyId}`: `companyName`
- `users/gon`: `username`, `companyName`, `role`, `password`

Las reglas estan en `firestore.rules` y se despliegan con:

```bash
firebase deploy --only firestore:rules
```
