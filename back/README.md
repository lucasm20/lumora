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
3. Configura Azure AI Vision / Computer Vision en `.env`:

```bash
AZURE_VISION_ENDPOINT=https://your-vision-resource.cognitiveservices.azure.com
AZURE_VISION_KEY=your_azure_vision_key
AZURE_VISION_API_VERSION=2024-02-01
```

`AZURE_VISION_ENDPOINT` debe ser el endpoint del recurso Azure AI Vision / Computer Vision,
no un endpoint de Azure OpenAI como `*.openai.azure.com`.
Tampoco debe ser un recurso Face API; el recurso debe soportar Image Analysis 4.0.

## Railway variables

Configura estas variables en el servicio backend de Railway:

```bash
AZURE_VISION_ENDPOINT=https://your-vision-resource.cognitiveservices.azure.com
AZURE_VISION_KEY=your_azure_vision_key
AZURE_VISION_API_VERSION=2024-02-01
```

El backend usa `AZURE_VISION_KEY` como header `Ocp-Apim-Subscription-Key` contra
`/computervision/imageanalysis:analyze`. No usa `AZURE_OPENAI_API_KEY` para procesar imagenes.
Si Railway devuelve `404 Resource not found`, revisa que la key y el endpoint sean del mismo
recurso Azure AI Vision / Computer Vision y que no sean de Face API.

4. Instala dependencias:

```bash
npm install
```

5. Ejecuta la API:

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
