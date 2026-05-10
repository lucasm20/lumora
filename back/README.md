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
3. Configura Azure OpenAI con un modelo visual en `.env`:

```bash
AZURE_OPENAI_ENDPOINT=https://your-openai-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your_azure_openai_api_key
AZURE_OPENAI_DEPLOYMENT=your_gpt4o_or_gpt41_deployment
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

El deployment debe aceptar imagenes, por ejemplo GPT-4o o GPT-4.1.

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
