# Backend Bulk (Cloud Functions) + Reglas de Firestore

## Qué incluye
- **`crearUsuarioBulk`** (callable) — crea usuarios Bulk en Firebase Auth y les pone los
  *custom claims* (`bulkTenant`, `bulkRole`, `bulkClienteId`, `bulkCarrierId`). Solo
  super_admin/admin.
- **`bootstrapMasterBulk`** (callable) — crea el primer super administrador (idempotente).
- **`procesarNotificacion`** (trigger en `bulk_notificaciones`) — envía SMS (Twilio) o
  Push (FCM) y marca `enviado`.
- **`recomendarAsignacionIA`** (callable) — hook opcional de IA; sin key usa el motor de
  reglas del front.
- **`../firestore.rules`** — bloque `bulk_*` que aísla por `tenantId` y rol usando los
  custom claims. (El bloque de Package quedó intacto.)

## Requisitos
- Plan **Blaze** (Cloud Functions lo exige).
- Firebase CLI: `npm i -g firebase-tools` y `firebase login`.
- `firebase use <tu-project-id>` (o crea `.firebaserc`).

## Configuración (secrets / env)
```
firebase functions:secrets:set TWILIO_SID
firebase functions:secrets:set TWILIO_TOKEN
firebase functions:secrets:set TWILIO_FROM      # ej. +1XXXXXXXXXX
# IA (opcional):
firebase functions:secrets:set MODEL_API_KEY
firebase functions:secrets:set MODEL_URL
```
(FCM/Push funciona con las credenciales del propio proyecto, sin secret extra.)

## Desplegar
```
cd functions && npm install
firebase deploy --only functions
firebase deploy --only firestore:rules
```

## ⚠️ Paso de activación en el CLIENTE (importante)
Las reglas `bulk_*` exigen **Firebase Auth con custom claims**. Hoy el login de Bulk es
client-side (SHA-256 en `bulk_users`). Para activar la seguridad hay que migrar el cliente:

1. **Login** → `signInWithEmailAndPassword` (Firebase Auth) en `BulkAuthContext`.
2. **Alta de usuarios** → llamar a `crearUsuarioBulk` (callable) en vez de escribir
   `bulk_users` directo.
3. **Primer arranque** → llamar a `bootstrapMasterBulk`.
4. Leer rol/tenant desde `getIdTokenResult().claims` en vez del doc plano.

> No despliegues las reglas `bulk_*` **antes** de migrar el cliente, o Bulk perderá acceso.
> Puedo hacer esa migración del cliente cuando el backend esté desplegado — es un cambio
> acotado a `BulkAuthContext`, `BulkLogin` y `BulkUsuarios`.

## Notas de producción
- Resolver `push` cuando `destino` sea una referencia (`carrier:<id>`): buscar los tokens
  FCM de los dispositivos del transportista/chofer (guárdalos al registrar el dispositivo).
- Añadir índices de Firestore si alguna consulta los pide (la consola te da el enlace).
