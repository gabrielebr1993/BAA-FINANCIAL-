# Módulo Bulk — Plataforma de fletes de materiales

Producto **independiente** dentro de My Pay. No comparte login, datos ni lógica con
Package. Se entra desde el selector inicial (`/elegir`) → `/bulk`.

## Arquitectura
- **Front:** React + Vite + React Router. Rutas propias en `BulkApp.jsx`.
- **Datos:** Firestore en **namespace `bulk_`** (aislado de Package), multi-tenant por
  `tenantId`. Toda la E/S pasa por `data/repo.js` → migrable a otro servicio sin tocar UI.
- **Auth propia:** `BulkAuthContext.jsx` (usuarios en `bulk_users`, sesión aparte).
  ⚠️ La verificación de contraseña es client-side (SHA-256) para arrancar sin backend;
  en producción moverla a un backend/Cloud Function o proyecto Auth separado.
- **Dominio puro** (testeable, sin UI ni Firestore) en `domain/`:
  - `ordenes.js` — división ≤25 t/viaje, compatibilidad de equipo.
  - `pagos.js` — niveles de pago y visibilidad por rol.
  - `flujo.js` — máquina de estados de la orden + hitos.
  - `geo.js` — Haversine, geocercas, métricas de viaje, desvío.
  - `tarifas.js` — motor de tarifas configurable.
  - `facturacion.js` — armado de facturas y vencimientos.
  - `asignacion.js` — recomendación de transportista por reglas (lista para IA).

## Roles
super_admin, admin, dispatcher, cliente, transportista, chofer, supervisor_planta.
Cada rol entra a su superficie (staff → panel; chofer/cliente/transportista/supervisor →
su portal). Visibilidad financiera por rol en `domain/pagos.js`.

## Colecciones (`bulk_*`)
users, clients, plants, jobs, orders, carriers, materials, equipment, geofences,
trackpoints, messages, tariffs, invoices, incidents, documents, notificaciones, audit.

## Integraciones (`integraciones/`)
- `alertasLocales.js` — sonido + Notification del navegador (app abierta). ✅ activo.
- `ocr.js` — OCR de tickets con Tesseract.js en el navegador. ✅ activo (con confirmación).
- `notificaciones.js` — SMS/Push externos. Enchufa un backend en `VITE_BULK_NOTIFY_URL`;
  sin él, las intenciones quedan en `bulk_notificaciones` para que un worker las procese.
- **Mapa:** Leaflet + OpenStreetMap (sin key) en `components/MapaLeaflet.jsx`. Para
  Google/Apple Maps: cambiar la capa de tiles y poner su API key.

## Pendiente de backend / cuentas (no se puede completar solo en el front)
1. **SMS** — Twilio (cuenta + saldo + números). Endpoint que consuma `bulk_notificaciones`.
2. **Push a apps cerradas** — FCM (VAPID + service worker) + backend que envíe con
   firebase-admin. La app ya registra la intención.
3. **IA de asignación** — modelo (OpenAI/Anthropic/propio) tras un backend que proteja la
   key. Sustituir `domain/asignacion.js#recomendarTransportistas` por la llamada al modelo
   (mismo input/output; la UI no cambia).
4. **OCR de alta precisión** — Google Vision / AWS Textract desde backend (mismo contrato
   que `ocr.js`).
5. **Mapas Google/Apple** — API key.
6. **APIs REST/GraphQL para ERPs** — backend desplegado (auth, rate-limit, webhooks).

## Reglas de Firestore (recordatorio)
Las colecciones `bulk_*` deben protegerse por `tenantId` y rol en las reglas de seguridad
de Firestore antes de producción.
