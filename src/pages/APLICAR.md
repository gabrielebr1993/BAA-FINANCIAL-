# APLICAR — Verificación POD, modo real + filtro de fechas + multiselección

**NO se hizo push, merge ni deploy.** Esto es código listo para aplicar en una rama nueva
(p. ej. `verificacion-real`), revisar y después desplegar solo con aprobación aparte.
Base verificada: `main` de `gabrielebr1993/BAA-FINANCIAL-` tras el merge `b219150`
(PR #4, pantalla solo-UI en producción en `https://milepay.io/verificacion`).

## 1. Qué cambia (diff mínimo)

| Archivo | Cambio |
|---|---|
| `src/pages/VerificacionPod.jsx` | **REEMPLAZAR completo** por `VerificacionPod.jsx` de esta carpeta. Es el único cambio de código de la app. |
| `src/App.jsx` | **Ninguno.** La ruta `/verificacion` ya existe. |
| `src/constants.js` | **Ninguno.** El menú `Verificación` (después de Reclamos a Gofo, `verFinanzas`, `soloCarrier: 'gofo'`) ya existe. |
| Cualquier otra pantalla, ruta, menú, pago, reclamo, factura o lógica de choferes | **Ninguno.** |

Nuevos imports en la pantalla (todos verificados contra el repo real):
`firebase/firestore` (`collection, doc, getDocs, query, updateDoc, where, writeBatch`),
`../firebase` (`db`, existe), `../AuthContext` (`useAuth`, expone `companyId` y `user`),
`../components/ui` (`Card, PageTitle, EstadoVacio`, ya usados por la pantalla),
`../carriers/CarrierContext` (`useCarrier`, ya usado), `lucide-react` (iconos ya usados).
No hay dependencias nuevas.

## 2. Regla de Firestore — desplegar ANTES de probar el modo real

Sin esta regla, la lectura falla con permiso denegado y la pantalla muestra un aviso
y sigue en ejemplos (no se rompe). Añadir este bloque a `firestore.rules`, dentro de
`match /databases/{database}/documents {`, junto a las demás colecciones de empresa,
y desplegar con `firebase deploy --only firestore:rules`:

```js
// Verificación POD (Gofo): solo staff de la empresa. Un chofer NO la lee ni
// la escribe (la pantalla ya exige permiso verFinanzas y carrier Gofo).
// No contiene datos sensibles: solo nombre de chofer, guía, sitio, fecha,
// fotos POD, estado y revisión humana. Nunca SSN, banco, teléfono ni ID.
match /podVerifications/{id} {
  allow read: if isStaff(resource.data.companyId);
  allow create: if isStaff(request.resource.data.companyId);
  allow update, delete: if isStaff(resource.data.companyId);
}
```

Nota: `isStaff` ya existe en las reglas actuales (súper-admin por correo o flag,
o staff no-chofer con `users/{uid}.companyId == cid`). No se cambió ninguna regla existente.

## 3. Esquema Firestore — colección `podVerifications`

Un documento por entrega. ID recomendado: `<companyId>__<waybill>` (sustituir `/` por `-`
si la guía lo trae; así la importación es idempotente y no duplica).

| Campo | Tipo | Notas |
|---|---|---|
| `companyId` | string | **Obligatorio.** El de la empresa activa (el mismo de `users/{uid}.companyId`). La pantalla consulta solo por este campo. |
| `carrier` | string | `'gofo'`. Documentos sin este campo cuentan como Gofo (regla histórica del repo). |
| `site` | string | Sitio Gofo, p. ej. `'DFW-BAA'`. También se acepta `sitio` como alias de lectura. |
| `waybill` | string | Guía. Se muestra y se busca por ella. |
| `courier` | string | **Solo nombre del chofer.** Nunca teléfono, SSN, banco, dirección personal ni documento. También se aceptan `chofer` / `driver` como alias de lectura. |
| `tipo` | string | Casa, Apartamento / Condo, En persona, Comercial, Locker, PUDO, etc. |
| `fechaEntrega` | string `YYYY-MM-DD` | Fecha de entrega, en hora local. Es lo que filtra Desde/Hasta. Se guarda como texto a propósito: así el rango se filtra en cliente sin exigir un índice compuesto de Firestore. |
| `origen` | string | `'portal-gofo'` o `'milepay'`. Se muestra en la tarjeta. |
| `fotos` | array de 3 objetos | Cada uno: `rol` (`'etiqueta'`, `'en_sitio'`, `'numero'` — el orden del array manda), `titulo`, `estado` (`'rojo'` \| `'amarillo'` \| `'verde'`), `motivo`, `criterio`, `url` (URL de Storage o del portal; `null` = marcador descriptivo, no foto inventada). Si un documento trae menos de 3 fotos, la tarjeta lo avisa (`Fotos registradas: n/3`) y NO inventa la que falta. |
| `revision` | string \| null | `'confirmado'` \| `'revision'` \| null (pendiente). La escribe la pantalla. |
| `revisionPor` | string \| null | `uid` del usuario que revisó (no correo ni nombre, por privacidad). |
| `revisionEn` | string \| null | Fecha/hora ISO de la revisión. |

El estado general **no se guarda**: se calcula en cliente como el peor estado de
sus fotos (rojo > amarillo > verde), igual que en la versión solo-UI. Así no puede
quedar desincronizado con las fotos.

**Escala (piloto):** la consulta es `where('companyId', '==', companyId)` y el resto
(carrier, sitio, fecha) se filtra en cliente. Es correcto para el piloto DFW-BAA
(cientos de entregas). Si una empresa supera ~1.000 documentos, hay que pasar
sitio/fecha a consulta de servidor con su índice compuesto — no hacerlo antes,
para no exigir índices que hoy no existen.

## 4. Sembrar una entrega real de prueba en DFW-BAA

En Firebase Console → Firestore → colección `podVerifications` → Añadir documento,
con ID `<companyId>__TEST-DFW-0001` (sustituir `<companyId>` por el `companyId`
real de la empresa Gofo; no inventar uno):

```json
{
  "companyId": "<companyId>",
  "carrier": "gofo",
  "site": "DFW-BAA",
  "waybill": "TEST-DFW-0001",
  "courier": "Chofer de prueba",
  "tipo": "Casa",
  "fechaEntrega": "2026-10-29",
  "origen": "milepay",
  "revision": null,
  "fotos": [
    { "rol": "etiqueta", "titulo": "Foto 1 · Etiqueta", "estado": "verde", "motivo": "Código de barras y número legibles.", "criterio": "Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.", "url": null },
    { "rol": "en_sitio", "titulo": "Foto 2 · Paquete en puerta", "estado": "amarillo", "motivo": "Paquete visible, pero la puerta sale cortada.", "criterio": "Casa: paquete en la puerta de la casa, puerta completa visible.", "url": null },
    { "rol": "numero", "titulo": "Foto 3 · Número de casa", "estado": "verde", "motivo": "Número claro y enfocado.", "criterio": "Casa: número de casa claro; si no hay número, captura de Google Maps o panorámica.", "url": null }
  ]
}
```

Para borrar la prueba: borrar ese documento en Firestore. Borrarlo vuelve la pantalla
a ejemplos automáticamente (si no queda ningún documento real para esa empresa).

## 5. Cómo probar

### Modo real
1. Desplegar la regla del punto 2.
2. Sembrar el documento del punto 4 (con la fecha de hoy o dentro de los últimos 7 días).
3. Abrir `/verificacion` con la empresa Gofo: el distintivo debe cambiar de
   `EJEMPLO · Sin conexión a Gofo` a `REAL · Firestore`, y la lista debe mostrar
   SOLO `TEST-DFW-0001` (nunca mezclada con EJ-0201…EJ-0210).
4. Confirmar veredicto en esa entrega: recargar la página debe mantener
   `Revisión guardada en Firestore: veredicto confirmado`.
5. Borrar el documento de prueba: la pantalla vuelve a los 10 ejemplos marcados.

### Filtro por rango de fechas
1. Con datos reales, el rango por defecto es **últimos 7 días (hoy incluido)**.
2. Poner Desde = fecha de la entrega de prueba y Hasta = misma fecha: la entrega
   aparece y los contadores del semáforo (Todas / Urgentes / Intermedias /
   Verificadas) se recalculan solo con ese rango.
3. Poner un rango que NO incluya esa fecha: la lista queda vacía y los contadores
   en 0 (la entrega real sigue existiendo, solo está fuera del rango).
4. Pulsar **Volver a últimos 7 días**: el rango vuelve al de por defecto.
5. Si Desde > Hasta, el otro extremo se ajusta solo (no hay rango invertido).
6. Combinado: rango + semáforo + ciudad/sitio + búsqueda (guía o chofer) se
   aplican juntos; los contadores ignoran semáforo y búsqueda, pero sí aplican
   sitio y rango, igual que antes aplicaban sitio.
7. En modo ejemplo el rango no oculta ejemplos (no tienen fecha real) y la
   pantalla lo dice explícitamente.

### Multiselección y acciones en lote
1. Cada tarjeta tiene un checkbox. El checkbox del encabezado selecciona **solo
   las filtradas y visibles** (no toda la base).
2. El contador muestra `N seleccionadas de M filtradas`.
3. Sin selección, los dos botones de lote están **deshabilitados**.
4. Con selección, `Confirmar veredicto de las seleccionadas` y
   `Marcar para revisión las seleccionadas`:
   - En modo real: escriben `revision` (+ `revisionPor`, `revisionEn`) en cada
     documento, en bloques de 500 (límite de Firestore por lote).
   - En modo ejemplo: solo cambian en pantalla (se indica en el mensaje).
5. Al terminar con éxito, la selección se limpia y aparece
   `Se procesaron N entregas: …`. Si Firestore falla, el mensaje lo dice y
   la selección **se mantiene** para reintentar.
6. Al cambiar cualquier filtro, la selección se recorta sola a las entregas
   que siguen visibles: nunca se actúa sobre entregas ocultas.

### Qué NO debe cambiar
- Ninguna otra pantalla, ruta, menú, pago, reclamo, factura ni dato de chofer.
- El veredicto no descuenta, no cobra ni penaliza automáticamente a ningún chofer.
- Los ejemplos nunca aparecen mezclados con reales.

## 6. Verificación hecha en esta entrega

- Código leído de `main` vía conector GitHub (solo lectura): `VerificacionPod.jsx`
  (329 líneas, SHA `182412b…`), `firebase.js` (exporta `db`), `AuthContext.jsx`
  (expone `companyId`, `user`), `CarrierContext.jsx`, `components/ui.jsx` y
  `firestore.rules` (función `isStaff` reutilizada en la regla nueva).
- Sintaxis: `esbuild` sobre el archivo nuevo (JSX automático, igual que el
  original, que tampoco importa `React`) y bundle de prueba con stubs locales
  de `../firebase`, `../AuthContext`, `../components/ui` y
  `../carriers/CarrierContext`, con `firebase/firestore`, `lucide-react` y
  `react` como externos: **sin errores**. El bundle de prueba falló primero
  solo por falta de `node_modules` en `/tmp` (no por el código) y pasó al
  marcar `react` como externo.
- Hooks: todos (`useState`, `useEffect`, `useMemo`) van antes del retorno
  condicional de carrier, como exige React. La pantalla original ya hacía esto
  y se mantuvo.
- NO se hizo push, merge, deploy ni escritura en Firestore o en el portal Gofo.

## 7. Qué queda pendiente (decisiones / bloqueos, sin inventar nada)

1. **Conexión automática al portal Gofo: NO implementada.** No existe una API
   pública de Gofo. El portal (`dms.gofoexpress.com`) se consulta con sesión de
   navegador y la cuenta vista tiene rol `Driver`, que puede no dar acceso
   completo a reportes DSP ni a exportación de fotos. Una importación automática
   necesitaría: una cuenta/rol con acceso confirmado a la vista de entregas y
   a las 3 fotos POD por guía, una sesión persistente segura (nunca credenciales
   en código ni en chat), y una función/servicio fuera de la app web (no hay
   cron ni importador de portal en `api/` hoy) que escriba en `podVerifications`
   con el esquema del punto 3. Hasta entonces, las entregas reales entran
   sembradas o importadas a mano, y la pantalla ya está lista para leerlas.
2. **Subida directa en MilePay (choferes):** no incluida en este diff. Sería
   una pantalla/flujo aparte (portal del chofer + Storage) y cambiaría la
   rutina de los choferes; no se mezcló con este cambio para no tocar el
   portal del chofer sin aprobación.
3. **Criterio automático (modelo):** no incluido. Los estados por foto los pone
   quien siembra/importa la entrega (humano o proceso futuro); esta pantalla
   solo los muestra, ordena y guarda la revisión humana. No hay puntuación
   automática ni penalización.
4. **Fotos con URL real:** el campo `url` acepta URLs de Storage o del portal,
   pero esta entrega no inventa ninguna. Con `url: null` se muestra el
   marcador descriptivo de siempre.
5. **Mapa sitio → ciudad de MilePay:** el filtro usa los 11 sitios Gofo del
   portal tal cual; la correspondencia con las ciudades configuradas en
   `settings/{companyId}` no está confirmada y no se asumió.
6. **Firma / coordenadas:** la pantalla actual en `main` no trae ese campo y
   no se añadió para no inventar un criterio nuevo; si se quiere, es un campo
   opcional más en `fotos` o en la entrega, sin cambiar el esquema base.
