# Walmart · Guía para activar la seguridad y crear accesos

Esta guía tiene **2 partes**:
1. **Activar la seguridad del backend** (desplegar las reglas) — se hace **una sola vez**.
2. **Crear el acceso de cada manager o chofer** — se repite por cada persona.

> Nota: tú (el dueño, `gabriele.brandonisio.o@gmail.com`) **siempre** tienes acceso
> total. Nada de esto te quita permisos ni cambia tu forma de entrar.

---

## PARTE 1 · Activar la seguridad (una sola vez)

Mientras no hagas esto, la app **ya oculta** lo que cada quien no debe ver, pero
el **bloqueo duro en el servidor** aún no está encendido. Para encenderlo:

### Paso 1 — Abrir Cloud Shell
1. Entra a **https://console.firebase.google.com** con tu cuenta de Google.
2. Elige tu proyecto **MilePay**.
3. Arriba a la derecha, haz clic en el ícono de **consola `>_`** (Cloud Shell),
   o abre **https://shell.cloud.google.com**. Espera a que cargue la terminal negra.

### Paso 2 — Ir a la carpeta del proyecto y desplegar
Escribe (o pega) estas líneas **una por una** y dale Enter:

```bash
cd ~/BAA-FINANCIAL-        # si no existe, primero: git clone <tu repo> && cd BAA-FINANCIAL-
git pull                    # trae los últimos cambios
firebase deploy --only firestore:rules
```

### Paso 3 — Confirmar
- Si pide elegir proyecto, elige **MilePay**.
- Al terminar verás: **`✔ Deploy complete!`**. Eso es todo: la seguridad quedó activa.

> ¿Error “command not found: firebase”? Ejecuta una vez:
> `npm install -g firebase-tools` y luego `firebase login` (sigue el enlace), y repite el Paso 2.

---

## PARTE 2 · Dar acceso a una persona

Cada persona necesita **2 cosas**:
- **A.** Una cuenta de inicio de sesión (correo + contraseña).
- **B.** Su rol y permisos dentro de Walmart.

### A. Crear la cuenta de inicio de sesión
1. En **Firebase Console** → menú izquierdo → **Authentication** → pestaña **Users**.
2. Botón **Add user** (Agregar usuario).
3. Escribe el **correo** de la persona y una **contraseña temporal**. **Add user**.
4. Dile a la persona esa contraseña (ella puede cambiarla luego con “¿Olvidaste tu contraseña?”).

### B. Asignar rol y permisos en Walmart
1. Entra a **https://www.milepay.io/walmart** con **tu** cuenta de dueño.
2. Menú lateral → **Usuarios y permisos** → **Agregar usuario**.
3. Escribe el **mismo correo** del paso A.
4. Elige el **Rol**:
   - **Manager de almacén** → opera rutas/drivers de **sus** almacenes (sin finanzas por defecto).
   - **Administrador de Walmart** → acceso configurable (NO es acceso total automático).
   - **Driver (chofer)** → solo su portal.
5. **Almacenes asignados**: marca los almacenes que puede ver. (Ninguno = todos.)
6. **Permisos**: marca las casillas que quieres darle (puedes dejar la plantilla del rol).
   - Las dependencias se encienden solas (p. ej. “Crear rutas” necesita “Ver rutas”).
7. Si es **Driver**, elige su **Perfil de chofer** (para que vea solo sus rutas/pagos).
8. **Revisar y guardar** → verás el resumen → **Confirmar y guardar**.

### C. Compartir el acceso
Envía a la persona este enlace:

> **https://www.milepay.io/walmart**

Ahí inicia sesión con su correo y contraseña. Según su rol entra directo:
- **Chofer** → su portal (sus rutas, pagos, recibos, documentos, contratos).
- **Manager/Admin** → la operación de sus almacenes y funciones permitidas.

---

## Probar que todo funciona
1. En una ventana **de incógnito**, abre `https://www.milepay.io/walmart`.
2. Inicia sesión con la cuenta de prueba (manager o chofer).
3. Verifica:
   - Un **manager** solo ve **sus** almacenes y lo que le marcaste.
   - Un **chofer** solo ve **su** información; no ve datos de otros.
   - Si **quitas** un permiso desde tu panel, al instante deja de verlo (sin cerrar sesión).

---

## Preguntas frecuentes
- **“Entré y dice ‘Sin acceso a Walmart’.”** → Falta el paso B (asignarle rol en
  *Usuarios y permisos*) o quedó **Inactivo**. Revísalo en tu panel.
- **“El chofer no ve sus rutas.”** → En su usuario, falta elegir el **Perfil de chofer**
  (paso B.7), o aún no has desplegado las reglas (Parte 1).
- **“Quiero quitarle el acceso a alguien.”** → En *Usuarios y permisos*, edítalo y
  desmarca **Usuario activo** (o quítale los permisos). Aplica de inmediato.
- **Importante:** esto es **solo de Walmart**. No cambia accesos de Gofo, Speedex,
  Freight ni Warehouse.
