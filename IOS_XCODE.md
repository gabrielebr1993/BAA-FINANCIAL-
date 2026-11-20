# MilePay en iPhone con Xcode (Capacitor)

El proyecto de iOS ya está creado en la carpeta `ios/`. MilePay se envuelve con
**Capacitor**: reutiliza TODO el código web actual, no hay que reescribir nada.

> ⚠️ Esto SOLO se puede compilar en una **Mac con Xcode**. En la nube/Linux no.

## Qué necesitas en tu Mac (una vez)
1. **Xcode** (gratis, App Store de Mac). Ábrelo una vez y acepta las licencias.
2. **CocoaPods**: en Terminal → `sudo gem install cocoapods`
3. **Node.js** (si no lo tienes): https://nodejs.org (versión LTS)
4. Para probar en tu iPhone físico: una **cuenta de Apple** gratuita basta
   (para la App Store sí necesitas Apple Developer, $99/año).

## Pasos para abrir y correr (desde la carpeta del proyecto en tu Mac)
```bash
# 1. Instala dependencias (una vez)
npm install

# 2. Compila la web, sincroniza iOS y abre Xcode
npm run ios:run
```
Esto hace: `vite build` → copia la web al proyecto iOS → abre **Xcode**.

En Xcode:
1. Arriba, en **Signing & Capabilities**, elige tu **Team** (tu Apple ID).
2. Conecta tu iPhone por cable (o usa un simulador).
3. Dale al botón **▶ (Play)**. La app se instala y abre.

## Cuando cambies el código web
Cada vez que quieras llevar cambios nuevos a la app iOS:
```bash
npm run ios:sync    # vuelve a compilar la web y la mete en iOS
```
(Y en Xcode le das Play otra vez.)

## Datos y Firebase
- La app carga la web **empaquetada** (`webDir: dist`) y habla con **Firebase**
  igual que en el navegador. No necesitas servidor extra.
- Si prefieres que la app muestre **siempre la versión en vivo de milepay.io**
  (sin recompilar), edita `capacitor.config.json` y agrega:
  ```json
  "server": { "url": "https://www.milepay.io", "cleartext": false }
  ```
  (Útil para pruebas; para la App Store, Apple prefiere la web empaquetada.)

## Ícono y nombre
- Nombre: **MilePay** · Bundle ID: **io.milepay.app** (en `capacitor.config.json`).
- El ícono se cambia en Xcode: `App/App/Assets.xcassets/AppIcon`.

## Problemas comunes
- **"pod install" falla** → corre `sudo gem install cocoapods` y luego `npm run ios:sync`.
- **No aparece tu iPhone** → desbloquéalo y toca "Confiar" cuando lo conectes.
- **Error de firma (Signing)** → en Signing & Capabilities elige tu Team/Apple ID.

## Face ID y Touch ID
La app entra con **Face ID** (iPhone normales) o **Touch ID** (iPhone Duo y modelos
con botón). Es el mismo botón: iOS dice qué tiene cada teléfono.

- Se activa solo: la primera vez entras con correo y contraseña, con la casilla
  «Usar Face ID / Touch ID la próxima vez» marcada.
- Desde ahí, al abrir la app pide la cara o la huella sola. Si se cancela, sigue
  el formulario normal.
- Las credenciales se guardan en el **Llavero de iOS** (cifrado por Apple), nunca
  en el navegador ni en Firebase. Si cambias la contraseña, te pide entrar una vez
  con la nueva y se vuelve a activar.
- Para desactivarlo: entra con contraseña con la casilla desmarcada.
- Plugin: `@capgo/capacitor-native-biometric`. Después de `npm install`, corre
  `npm run ios:run` para que Xcode instale el plugin (CocoaPods).
- En el **simulador** de Xcode: menú Features → Face ID / Touch ID → Enrolled, y
  luego «Matching Face» o «Matching Touch» para simular el desbloqueo.
