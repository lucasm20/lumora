# Delegado

Proyecto separado en frontend y backend.

## Backend

```bash
cd back
copy .env.example .env
npm install
npm run dev
```

La API corre en `http://localhost:4000`.

## Frontend

```bash
cd front/my-hr-dashboard
copy .env.example .env
npm install
npm run dev
```

Vite corre en `http://localhost:5173` y redirige `/api` al backend.

## Firebase

- Configura Firebase Web en `front/my-hr-dashboard/.env`.
- Configura Firebase Admin en `back/.env`.
- Ejecuta `emotion-ai` y configura `EMOTION_SERVICE_URL` en `back/.env`.
- Azure Vision es fallback opcional con `AZURE_VISION_ENDPOINT`, `AZURE_VISION_KEY` y `AZURE_VISION_API_VERSION`.
- Las reglas de Firestore estan en `back/firestore.rules`.
- El usuario HR fijo se crea con `npm run seed:hr --prefix back`.

La clave privada compartida anteriormente debe rotarse antes de usarla.

Credenciales configuradas:

- Usuario: `gon`
- Password: `1234`
- Empresa: `Nintendo`
- Rol: `hr`
