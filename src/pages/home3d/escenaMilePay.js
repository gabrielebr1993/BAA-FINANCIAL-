// ============================================================================
// ESCENA 3D del home público de MilePay (three.js r128).
//
// Acabado "render profesional": atardecer dorado con sombras largas y suaves,
// tone mapping cinematográfico (ACES), cielo con degradado real, texturas
// procedurales generadas en canvas (asfalto, concreto, lámina corrugada,
// cartón, grava) — cero descargas externas. De noche (modo oscuro) es una
// escena nocturna: estrellas, faroles y ventanas encendidas.
//
// Contenido: almacén MilePay con portón que SE ABRE y cámara que entra por la
// puerta (interior amueblado: racks, banda, montacargas, personal), volteos de
// Freight con carga, camionetas de última milla, casas, árboles, zona de
// materiales a granel, lámparas de calle, conos, cruce peatonal.
//
// API: montarEscenaMilePay(contenedor, { oscuro, reduce, alCambiarModo })
//   → { zoomMas, zoomMenos, centrar, alternarAlmacen, destruir }
// ============================================================================
import * as THREE from 'three'

export function montarEscenaMilePay(cont, opciones = {}) {
  const oscuro = !!opciones.oscuro
  const reduce = !!opciones.reduce
  const alCambiarModo = opciones.alCambiarModo || (() => {})

  // ── Renderer con acabado de cine ──────────────────────────────────────────
  const escena = new THREE.Scene()
  const camara = new THREE.PerspectiveCamera(42, 980 / 660, 0.1, 700)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = oscuro ? 1.0 : 1.12
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  cont.insertBefore(renderer.domElement, cont.firstChild)
  function ajustar() {
    const w = cont.clientWidth, h = cont.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camara.aspect = w / h
    camara.updateProjectionMatrix()
  }
  window.addEventListener('resize', ajustar)

  escena.fog = new THREE.Fog(oscuro ? 0x0d1730 : 0xf2ddbe, 110, 260)

  // ── Texturas procedurales (canvas) ────────────────────────────────────────
  function lienzo(w, h, pintar) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    pintar(cv.getContext('2d'), w, h)
    const t = new THREE.CanvasTexture(cv)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    t.encoding = THREE.sRGBEncoding
    return t
  }
  function ruido(cx, w, h, base, puntos, alfa) {
    cx.fillStyle = base; cx.fillRect(0, 0, w, h)
    for (let i = 0; i < puntos; i++) {
      const g = Math.random() * 255 | 0
      cx.fillStyle = `rgba(${g},${g},${g},${alfa})`
      cx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2)
    }
  }
  const texCielo = lienzo(64, 512, (cx, w, h) => {
    const g = cx.createLinearGradient(0, 0, 0, h)
    if (oscuro) { g.addColorStop(0, '#060b1c'); g.addColorStop(0.55, '#0e1a36'); g.addColorStop(1, '#23355c') }
    else { g.addColorStop(0, '#6f9bd4'); g.addColorStop(0.5, '#a9c2e2'); g.addColorStop(0.8, '#f0cfa0'); g.addColorStop(1, '#f6ddb6') }
    cx.fillStyle = g; cx.fillRect(0, 0, w, h)
    if (oscuro) {
      cx.fillStyle = 'rgba(255,255,255,.9)'
      for (let i = 0; i < 90; i++) {
        const y = Math.random() * h * 0.6
        cx.globalAlpha = 0.25 + Math.random() * 0.7
        cx.fillRect(Math.random() * w, y, 1, 1)
      }
      cx.globalAlpha = 1
    }
  })
  texCielo.wrapS = THREE.ClampToEdgeWrapping; texCielo.wrapT = THREE.ClampToEdgeWrapping
  const texAsfalto = lienzo(256, 256, (cx, w, h) => {
    ruido(cx, w, h, oscuro ? '#1c2437' : '#3a4150', 2600, 0.07)
    cx.strokeStyle = 'rgba(0,0,0,.18)'
    for (let i = 0; i < 5; i++) { cx.beginPath(); cx.moveTo(Math.random() * w, 0); cx.lineTo(Math.random() * w, h); cx.stroke() }
  })
  texAsfalto.repeat.set(40, 3)
  const texConcreto = lienzo(256, 256, (cx, w, h) => {
    ruido(cx, w, h, oscuro ? '#20304e' : '#c9ccd4', 2000, 0.05)
    cx.strokeStyle = 'rgba(0,0,0,.12)'; cx.lineWidth = 2
    cx.strokeRect(0, 0, w, h)
    cx.beginPath(); cx.moveTo(w / 2, 0); cx.lineTo(w / 2, h); cx.moveTo(0, h / 2); cx.lineTo(w, h / 2); cx.stroke()
  })
  texConcreto.repeat.set(10, 9)
  const texGrama = lienzo(256, 256, (cx, w, h) => {
    ruido(cx, w, h, oscuro ? '#15243a' : '#8f9d6a', 3000, 0.08)
    cx.fillStyle = oscuro ? 'rgba(40,60,50,.4)' : 'rgba(110,125,80,.5)'
    for (let i = 0; i < 260; i++) cx.fillRect(Math.random() * w, Math.random() * h, 2, 3)
  })
  texGrama.repeat.set(36, 36)
  function texCorrugado(base, sombra, claro) {
    const t = lienzo(128, 128, (cx, w, h) => {
      cx.fillStyle = base; cx.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 10) {
        cx.fillStyle = sombra; cx.fillRect(x, 0, 3, h)
        cx.fillStyle = claro; cx.fillRect(x + 6, 0, 2, h)
      }
    })
    return t
  }
  const texMuro = texCorrugado('#182a49', 'rgba(0,0,0,.35)', 'rgba(140,170,220,.16)')
  texMuro.repeat.set(10, 1)
  const texRoller = lienzo(128, 128, (cx, w, h) => {
    cx.fillStyle = '#9aa3b2'; cx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 14) {
      cx.fillStyle = 'rgba(255,255,255,.25)'; cx.fillRect(0, y, w, 3)
      cx.fillStyle = 'rgba(0,0,0,.28)'; cx.fillRect(0, y + 11, w, 3)
    }
  })
  const texCarton = lienzo(128, 128, (cx, w, h) => {
    ruido(cx, w, h, '#c1915c', 500, 0.05)
    cx.fillStyle = 'rgba(122,82,42,.55)'; cx.fillRect(0, h / 2 - 7, w, 14)   // cinta
    cx.fillStyle = 'rgba(255,255,255,.85)'; cx.fillRect(8, 10, 34, 22)       // etiqueta
    cx.fillStyle = '#13233f'; cx.fillRect(12, 16, 26, 3); cx.fillRect(12, 23, 18, 3)
  })
  const texGrava = lienzo(128, 128, (cx, w, h) => { ruido(cx, w, h, '#7e8795', 2400, 0.16) })
  const texArena = lienzo(128, 128, (cx, w, h) => { ruido(cx, w, h, '#c2a06b', 2000, 0.10) })
  const texPiso = lienzo(256, 256, (cx, w, h) => {
    ruido(cx, w, h, oscuro ? '#243655' : '#cdd2db', 1400, 0.045)
  })
  texPiso.repeat.set(7, 5)

  // ── Luces ─────────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(
    oscuro ? 0x2c4370 : 0xffe9cd, oscuro ? 0x0a1020 : 0x9c8d72, oscuro ? 0.45 : 0.55
  )
  escena.add(hemi)
  const sol = new THREE.DirectionalLight(oscuro ? 0x93aede : 0xffcf9b, oscuro ? 0.32 : 1.35)
  sol.position.set(-58, 30, 40)
  sol.castShadow = true
  sol.shadow.mapSize.set(2048, 2048)
  sol.shadow.camera.left = -85; sol.shadow.camera.right = 85
  sol.shadow.camera.top = 85; sol.shadow.camera.bottom = -85
  sol.shadow.camera.far = 240
  sol.shadow.bias = -0.00035
  sol.shadow.radius = 5
  escena.add(sol)

  // ── Cielo + sol/estrellas + nubes ─────────────────────────────────────────
  const cielo = new THREE.Mesh(
    new THREE.SphereGeometry(330, 24, 16),
    new THREE.MeshBasicMaterial({ map: texCielo, side: THREE.BackSide, fog: false })
  )
  escena.add(cielo)
  function spriteSuave(color, interior) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128
    const cx = cv.getContext('2d')
    const g = cx.createRadialGradient(64, 64, 6, 64, 64, 62)
    g.addColorStop(0, interior); g.addColorStop(1, color)
    cx.fillStyle = g; cx.fillRect(0, 0, 128, 128)
    const t = new THREE.CanvasTexture(cv)
    return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })
  }
  if (!oscuro) {
    const solVisual = new THREE.Sprite(spriteSuave('rgba(255,200,130,0)', 'rgba(255,236,200,.95)'))
    solVisual.material.blending = THREE.AdditiveBlending
    solVisual.scale.set(90, 90, 1)
    solVisual.position.set(-220, 70, 150)
    escena.add(solVisual)
    const matNube = spriteSuave('rgba(255,255,255,0)', 'rgba(255,248,238,.85)')
    for (let nb = 0; nb < 7; nb++) {
      const sp = new THREE.Sprite(matNube)
      sp.scale.set(40 + nb * 7, 15 + (nb % 3) * 4, 1)
      sp.position.set(-120 + nb * 45, 46 + (nb % 3) * 7, -90 + (nb % 2) * 150)
      escena.add(sp)
    }
  } else {
    const luna = new THREE.Sprite(spriteSuave('rgba(200,215,255,0)', 'rgba(235,242,255,.95)'))
    luna.scale.set(26, 26, 1)
    luna.position.set(140, 110, -180)
    escena.add(luna)
  }

  // ── Materiales / helpers ──────────────────────────────────────────────────
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0.04 }, o || {}))
  const matVidrio = mat(0x9fc2e8, { roughness: 0.12, metalness: 0.65 })
  function caja(w, h, d, m) {
    const ms = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === 'number' ? mat(m) : m)
    ms.castShadow = true; ms.receiveShadow = true
    return ms
  }
  function en(obj, x, y, z, padre) { obj.position.set(x, y, z); (padre || escena).add(obj); return obj }
  const COL = { navy: 0x16263f, gold: 0xc9a24b, steel: 0x3d5a80, teal: 0x4a9c8c, rojo: 0xb9533f, blanco: 0xf1f2f4, osc: 0x161c28 }

  // ── Terreno: pasto + patio de concreto + vías de asfalto ──────────────────
  const pasto = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat(0xffffff, { map: texGrama, roughness: 1 }))
  pasto.rotation.x = -Math.PI / 2; pasto.receiveShadow = true
  escena.add(pasto)
  const patio = new THREE.Mesh(new THREE.PlaneGeometry(160, 130), mat(0xffffff, { map: texConcreto, roughness: 0.95 }))
  patio.rotation.x = -Math.PI / 2; patio.position.set(-12, 0.02, -2); patio.receiveShadow = true
  escena.add(patio)
  function viaMesh(largoX) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(largoX ? 460 : 10.5, largoX ? 10.5 : 460), mat(0xffffff, { map: texAsfalto, roughness: 0.98 }))
    v.rotation.x = -Math.PI / 2
    if (!largoX) v.material.map = texAsfalto.clone(), v.material.map.needsUpdate = true, v.material.map.rotation = 0
    v.position.y = 0.045
    v.receiveShadow = true
    escena.add(v)
    return v
  }
  viaMesh(true)
  const viaZ = viaMesh(false)
  viaZ.material.map.repeat.set(3, 40)
  // Rayas: centro dorado discontinuo + bordes blancos
  const matRaya = mat(0xd9b35e, { emissive: 0xd9b35e, emissiveIntensity: oscuro ? 0.5 : 0.1, roughness: 0.6 })
  const matBorde = mat(0xd8dce2, { roughness: 0.6, emissive: 0xd8dce2, emissiveIntensity: oscuro ? 0.12 : 0 })
  for (let r = -220; r < 220; r += 8) {
    const r1 = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.32), matRaya)
    r1.rotation.x = -Math.PI / 2; r1.position.set(r, 0.055, 0); escena.add(r1)
    const r2 = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 3.4), matRaya)
    r2.rotation.x = -Math.PI / 2; r2.position.set(0, 0.055, r + 4); escena.add(r2)
  }
  ;[-5.05, 5.05].forEach((off) => {
    const b1 = new THREE.Mesh(new THREE.PlaneGeometry(460, 0.22), matBorde)
    b1.rotation.x = -Math.PI / 2; b1.position.set(0, 0.052, off); escena.add(b1)
    const b2 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 460), matBorde)
    b2.rotation.x = -Math.PI / 2; b2.position.set(off, 0.052, 0); escena.add(b2)
  })
  // Cruce peatonal (cebra) en las 4 entradas del cruce
  const matCebra = mat(0xe8eaee, { roughness: 0.55 })
  for (let c = -3.9; c <= 3.9; c += 1.3) {
    const c1 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.2), matCebra)
    c1.rotation.x = -Math.PI / 2; c1.position.set(c, 0.06, 7.4); escena.add(c1)
    const c2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), matCebra)
    c2.rotation.x = -Math.PI / 2; c2.position.set(7.4, 0.06, c); escena.add(c2)
  }

  // ── ALMACÉN ───────────────────────────────────────────────────────────────
  const ALM = { x1: -44, x2: -8, z1: -34, z2: -8, alto: 13, puertaX: -22, puertaW: 8, puertaH: 8 }
  const cw = ALM.x2 - ALM.x1, cd = ALM.z2 - ALM.z1, cxm = (ALM.x1 + ALM.x2) / 2, czm = (ALM.z1 + ALM.z2) / 2
  const G = 0.55
  const matMuro = mat(0xffffff, { map: texMuro, roughness: 0.75, metalness: 0.15 })
  function muro(w, h, d, x, y, z, rotMapa) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matMuro.clone())
    if (rotMapa) { m.material.map = texMuro.clone(); m.material.map.repeat.set(Math.max(2, (rotMapa === 'z' ? d : w) / 3.5), 1); m.material.map.needsUpdate = true }
    m.castShadow = true; m.receiveShadow = true
    m.position.set(x, y, z); escena.add(m); return m
  }
  muro(cw, ALM.alto, G, cxm, ALM.alto / 2, ALM.z1, 'x')
  muro(G, ALM.alto, cd, ALM.x1, ALM.alto / 2, czm, 'z')
  muro(G, ALM.alto, cd, ALM.x2, ALM.alto / 2, czm, 'z')
  const izqW = (ALM.puertaX - ALM.puertaW / 2) - ALM.x1
  const derW = ALM.x2 - (ALM.puertaX + ALM.puertaW / 2)
  muro(izqW, ALM.alto, G, ALM.x1 + izqW / 2, ALM.alto / 2, ALM.z2, 'x')
  muro(derW, ALM.alto, G, ALM.x2 - derW / 2, ALM.alto / 2, ALM.z2, 'x')
  muro(ALM.puertaW, ALM.alto - ALM.puertaH, G, ALM.puertaX, ALM.puertaH + (ALM.alto - ALM.puertaH) / 2, ALM.z2, 'x')
  // Zócalo de concreto alrededor
  en(caja(cw + 0.3, 1.1, 0.35, mat(0x9aa0ab, { roughness: 1 })), cxm, 0.55, ALM.z2 + 0.18)
  // Techo con unidades de clima y tubería
  en(caja(cw + 1.4, 0.7, cd + 1.4, mat(0x44536b, { roughness: 0.6, metalness: 0.3 })), cxm, ALM.alto + 0.35, czm)
  ;[[-36, -26], [-24, -16], [-14, -28]].forEach((u, i) => {
    en(caja(3.2, 1.6, 2.4, mat(0x7d8798, { roughness: 0.5, metalness: 0.4 })), u[0], ALM.alto + 1.5, u[1])
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 10), mat(0x9aa3b2, { metalness: 0.5, roughness: 0.4 }))
    tubo.position.set(u[0] + 2, ALM.alto + 1.8, u[1] + (i % 2 ? 1.4 : -1.4)); tubo.castShadow = true
    escena.add(tubo)
  })
  // Banda blanca superior + letrero
  en(caja(cw + 0.2, 1.7, 0.2, mat(0xf4f5f7, { roughness: 0.4 })), cxm, ALM.alto - 1.1, ALM.z2 + 0.22)
  function texLetrero() {
    return lienzo(512, 96, (cx, w, h) => {
      cx.fillStyle = '#f4f5f7'; cx.fillRect(0, 0, w, h)
      cx.fillStyle = '#13233f'; cx.font = '800 64px -apple-system, Segoe UI, Roboto, sans-serif'
      cx.textAlign = 'center'; cx.textBaseline = 'middle'
      cx.fillText('MilePay', 236, 50)
      cx.fillStyle = '#c9a24b'; cx.beginPath(); cx.arc(380, 66, 9, 0, 7); cx.fill()
    })
  }
  const letrero = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.1), new THREE.MeshBasicMaterial({ map: texLetrero() }))
  letrero.position.set(ALM.puertaX + 10, ALM.alto - 1.1, ALM.z2 + 0.36)
  escena.add(letrero)
  // Marquesina dorada sobre el portón
  en(caja(ALM.puertaW + 1.6, 0.28, 2.2, mat(COL.gold, { roughness: 0.4, metalness: 0.5 })), ALM.puertaX, ALM.puertaH + 0.6, ALM.z2 + 1.1)
  // Portón principal (se desliza hacia arriba)
  const puerta = caja(ALM.puertaW - 0.3, ALM.puertaH, 0.3, mat(COL.gold, { map: texRoller.clone(), roughness: 0.45, metalness: 0.5, color: 0xc9a24b }))
  puerta.material.map.repeat.set(1, 2); puerta.material.map.needsUpdate = true
  en(puerta, ALM.puertaX, ALM.puertaH / 2, ALM.z2)
  const puertaCerradaY = ALM.puertaH / 2, puertaAbiertaY = ALM.puertaH * 1.42
  // Muelles de carga con cortinas metálicas y topes
  ;[[-37.5], [-12.5]].forEach((d) => {
    const dx = d[0]
    en(caja(6.5, 1.25, 3.4, mat(0x9aa0ab, { map: texConcreto, roughness: 1 })), dx, 0.62, ALM.z2 + 1.7)
    const cortina = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.6), mat(0xffffff, { map: texRoller, roughness: 0.5, metalness: 0.45 }))
    cortina.position.set(dx, 3.1, ALM.z2 + 0.29)
    escena.add(cortina)
    en(caja(0.5, 0.5, 0.35, mat(0x11151d, { roughness: 0.95 })), dx - 2, 1.3, ALM.z2 + 3.4)
    en(caja(0.5, 0.5, 0.35, mat(0x11151d, { roughness: 0.95 })), dx + 2, 1.3, ALM.z2 + 3.4)
  })
  // Bolardos dorados frente al portón
  ;[-27, -24.4, -19.6, -17].forEach((bx) => {
    const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.05, 10), mat(COL.gold, { roughness: 0.4, metalness: 0.4, emissive: COL.gold, emissiveIntensity: oscuro ? 0.25 : 0 }))
    bol.position.set(bx, 0.52, ALM.z2 + 4.2); bol.castShadow = true
    escena.add(bol)
  })
  // Ventanales altos (de noche encendidos)
  const matVentana = mat(0xbcd9f8, { emissive: 0xcfe2ff, emissiveIntensity: oscuro ? 1.1 : 0.12, roughness: 0.2, metalness: 0.4 })
  for (let vx = ALM.x1 + 4; vx < ALM.x2 - 3; vx += 5) {
    const marco = caja(3.5, 2.0, 0.12, mat(0x0e1626, { roughness: 0.6 }))
    en(marco, vx, ALM.alto - 2.6, ALM.z2 + 0.3)
    const vn = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.7), matVentana)
    vn.position.set(vx, ALM.alto - 2.6, ALM.z2 + 0.37)
    escena.add(vn)
  }

  // ── INTERIOR ──────────────────────────────────────────────────────────────
  const pisoInt = new THREE.Mesh(new THREE.PlaneGeometry(cw - 1, cd - 1), mat(0xffffff, { map: texPiso, roughness: 0.35, metalness: 0.08 }))
  pisoInt.rotation.x = -Math.PI / 2; pisoInt.position.set(cxm, 0.05, czm); pisoInt.receiveShadow = true
  escena.add(pisoInt)
  // Líneas de seguridad doradas en el piso
  const matLinea = mat(0xd9b35e, { roughness: 0.5, emissive: 0xd9b35e, emissiveIntensity: 0.12 })
  ;[-32, -20].forEach((lx) => {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.3, cd - 4), matLinea)
    ln.rotation.x = -Math.PI / 2; ln.position.set(lx, 0.06, czm)
    escena.add(ln)
  })
  // Vigas del techo + lámparas colgantes con halo
  const matGlow = spriteSuave('rgba(255,220,150,0)', 'rgba(255,230,170,.8)')
  matGlow.blending = THREE.AdditiveBlending
  for (let vz = -30; vz <= -12; vz += 6) {
    en(caja(cw - 2, 0.45, 0.45, mat(0x27354f, { roughness: 0.6 })), cxm, ALM.alto - 0.8, vz)
  }
  const focos = []
  ;[[-36, -26], [-26, -18], [-16, -26], [-26, -28]].forEach((f) => {
    const pl = new THREE.PointLight(0xffe3ae, oscuro ? 0.95 : 0.6, 42, 2)
    pl.position.set(f[0], ALM.alto - 3, f[1])
    escena.add(pl); focos.push(pl)
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), mat(0x0e1420))
    cable.position.set(f[0], ALM.alto - 1.6, f[1]); escena.add(cable)
    const campana = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 14, 1, true), mat(0x222c3f, { metalness: 0.5, roughness: 0.35 }))
    campana.position.set(f[0], ALM.alto - 2.5, f[1]); escena.add(campana)
    const bombilla = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0xffe9bd, { emissive: 0xffe3ae, emissiveIntensity: 1.6 }))
    bombilla.position.set(f[0], ALM.alto - 2.75, f[1]); escena.add(bombilla)
    const halo = new THREE.Sprite(matGlow)
    halo.scale.set(3.4, 3.4, 1); halo.position.set(f[0], ALM.alto - 2.8, f[1])
    escena.add(halo)
  })
  // Racks: postes acero, travesaños dorados, cajas de cartón
  const matCarton = mat(0xffffff, { map: texCarton, roughness: 0.85 })
  function rack(x, z, rotY) {
    const g = new THREE.Group()
    const L = 10, D = 2.4, H = 7
    ;[-L / 2, L / 2].forEach((px) => {
      ;[-D / 2, D / 2].forEach((pz) => {
        const p = caja(0.26, H, 0.26, mat(COL.steel, { roughness: 0.5, metalness: 0.35 })); p.position.set(px, H / 2, pz); g.add(p)
      })
    })
    ;[2.4, 4.8].forEach((ny) => {
      const sh = caja(L, 0.2, D, mat(COL.gold, { roughness: 0.45, metalness: 0.4 })); sh.position.set(0, ny, 0); g.add(sh)
    })
    for (let ni = 0; ni < 3; ni++) {
      for (let bi = 0; bi < 6; bi++) {
        if ((bi + ni) % 5 === 4) continue
        const alto = 0.9 + ((bi + ni) % 3) * 0.25
        const b = caja(1.3, alto, 1.7, matCarton)
        b.position.set(-L / 2 + 1 + bi * 1.65, (ni === 0 ? 0.06 : ni === 1 ? 2.56 : 4.96) + alto / 2, 0)
        b.rotation.y = ((bi * 13 + ni * 7) % 10 - 5) * 0.02
        g.add(b)
      }
    }
    g.position.set(x, 0, z); g.rotation.y = rotY || 0
    escena.add(g)
  }
  rack(-37.5, -27, Math.PI / 2)
  rack(-37.5, -14.5, Math.PI / 2)
  rack(-26, -31, 0)
  rack(-14.5, -21, Math.PI / 2)
  // Banda transportadora
  const banda = new THREE.Group()
  const cuerpoBanda = caja(16, 1.0, 2.1, mat(0x2b3850, { roughness: 0.6, metalness: 0.25 }))
  cuerpoBanda.position.set(0, 0.6, 0); banda.add(cuerpoBanda)
  const cinta = caja(16, 0.1, 1.7, mat(0x10141d, { roughness: 0.35, metalness: 0.2 })); cinta.position.set(0, 1.17, 0); banda.add(cinta)
  for (let pb = -7; pb <= 7; pb += 3.5) { const pata = caja(0.28, 1.1, 1.5, mat(0x47536b)); pata.position.set(pb, 0.55, 0); banda.add(pata) }
  banda.position.set(-26, 0, -12.5)
  escena.add(banda)
  const cajasBanda = []
  for (let cb = 0; cb < 4; cb++) {
    const bx = caja(1.05, 0.95, 1.05, matCarton)
    escena.add(bx); cajasBanda.push(bx)
  }
  // Montacargas con jaula
  const monta = new THREE.Group()
  const mcpo = caja(2.2, 1.35, 1.6, mat(COL.gold, { roughness: 0.4, metalness: 0.3 })); mcpo.position.set(0, 1.0, 0); monta.add(mcpo)
  ;[[-0.85, -0.7], [-0.85, 0.7], [0.75, -0.7], [0.75, 0.7]].forEach((p) => {
    const poste = caja(0.1, 1.5, 0.1, mat(0x2b3242)); poste.position.set(p[0], 2.4, p[1]); monta.add(poste)
  })
  const techoM = caja(1.9, 0.1, 1.6, mat(0x2b3242)); techoM.position.set(-0.05, 3.15, 0); monta.add(techoM)
  const asiento = caja(0.7, 0.5, 0.8, mat(0x1c2435)); asiento.position.set(-0.45, 1.9, 0); monta.add(asiento)
  const mastil = caja(0.22, 3.4, 1.35, mat(0x6d7786, { metalness: 0.4, roughness: 0.4 })); mastil.position.set(1.32, 1.75, 0); monta.add(mastil)
  ;[-0.4, 0.4].forEach((fz) => { const h = caja(1.15, 0.1, 0.28, mat(0x10141d)); h.position.set(1.95, 0.5, fz); monta.add(h) })
  const cargaM = caja(1.15, 1.0, 1.15, matCarton); cargaM.position.set(1.95, 1.1, 0); monta.add(cargaM)
  ;[[-0.7, 0.8], [0.7, 0.8], [-0.7, -0.8], [0.7, -0.8]].forEach((w) => {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), mat(0x14181f, { roughness: 0.5 }))
    tire.rotation.x = Math.PI / 2; tire.position.set(w[0], 0.42, w[1]); tire.castShadow = true; monta.add(tire)
    const rin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12), mat(0xb9c1cd, { metalness: 0.7, roughness: 0.3 }))
    rin.rotation.x = Math.PI / 2; rin.position.set(w[0], 0.42, w[1]); monta.add(rin)
  })
  escena.add(monta)
  // Personal con casco y chaleco
  function persona(x, z, rot) {
    const g = new THREE.Group()
    const piernas = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.8, 10), mat(0x25324b)); piernas.position.y = 0.4; g.add(piernas)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.38, 0.75, 10), mat(COL.navy)); torso.position.y = 1.15; torso.castShadow = true; g.add(torso)
    const chaleco = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.42, 0.55, 10), mat(COL.gold, { emissive: COL.gold, emissiveIntensity: 0.3 })); chaleco.position.y = 1.2; g.add(chaleco)
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat(0xd9a877)); cabeza.position.y = 1.85; cabeza.castShadow = true; g.add(cabeza)
    const casco = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, 1.25), mat(COL.gold, { roughness: 0.35 })); casco.position.y = 1.9; g.add(casco)
    g.position.set(x, 0, z); g.rotation.y = rot || 0
    escena.add(g); return g
  }
  persona(-31, -13.5, 0.6)
  const caminante = persona(-18, -24, -0.6)
  const letreroInt = new THREE.Mesh(new THREE.PlaneGeometry(11, 2), new THREE.MeshBasicMaterial({ map: texLetrero() }))
  letreroInt.position.set(cxm, ALM.alto - 3.2, ALM.z1 + G / 2 + 0.06)
  escena.add(letreroInt)
  // Pallets sueltos (madera + cajas)
  ;[[4.6 - 26, -5.6 - 14], [6.2 - 26, -4.3 - 14], [-16, -15.5]].forEach((pp, i) => {
    const pal = caja(1.3, 0.14, 1.3, mat(0x9a7648, { roughness: 1 })); en(pal, pp[0], 0.12, pp[1])
    const bx2 = caja(1.1, 0.95, 1.1, matCarton); en(bx2, pp[0], 0.7, pp[1])
    if (i % 2 === 0) { const bx3 = caja(0.9, 0.8, 0.9, matCarton); en(bx3, pp[0] + 0.05, 1.6, pp[1] - 0.04) }
  })

  // ── Zona FREIGHT: pilas de material, tolva, conos ─────────────────────────
  function pila(x, z, rad, h, tx) {
    const p = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 26, 1), mat(0xffffff, { map: tx, roughness: 1 }))
    p.position.set(x, h / 2, z); p.castShadow = true; p.receiveShadow = true
    escena.add(p)
  }
  pila(-30, 24, 5.4, 3.4, texGrava)
  pila(-20, 28, 4.2, 2.7, texArena)
  pila(-32, 32, 3.4, 2.2, texGrava)
  const tolva = new THREE.Group()
  const tv1 = caja(4.6, 4.4, 4.6, mat(COL.steel, { map: texCorrugado('#3d5a80', 'rgba(0,0,0,.3)', 'rgba(255,255,255,.12)'), roughness: 0.55, metalness: 0.35 })); tv1.position.set(0, 4.6, 0); tolva.add(tv1)
  const tv2 = new THREE.Mesh(new THREE.ConeGeometry(3.1, 2.6, 4), mat(0x2e4664, { roughness: 0.5, metalness: 0.4 }))
  tv2.rotation.y = Math.PI / 4; tv2.rotation.x = Math.PI; tv2.position.set(0, 1.6, 0); tolva.add(tv2)
  ;[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach((pz) => {
    const pata2 = caja(0.34, 3.2, 0.34, mat(0x2b3850)); pata2.position.set(pz[0], 1.6, pz[1]); tolva.add(pata2)
  })
  tolva.position.set(-13, 0, 26); escena.add(tolva)
  // Conos de seguridad
  ;[[-24, 19], [-16, 22], [-9, 20]].forEach((cc) => {
    const cono = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 14), mat(0xd96c3b, { roughness: 0.6 }))
    cono.position.set(cc[0], 0.48, cc[1]); cono.castShadow = true; escena.add(cono)
    const anillo = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 0.14, 14), mat(0xf4f5f7, { emissive: 0xf4f5f7, emissiveIntensity: oscuro ? 0.4 : 0.05 }))
    anillo.position.set(cc[0], 0.52, cc[1]); escena.add(anillo)
  })

  // ── Casas y árboles ───────────────────────────────────────────────────────
  function casa(x, z, cTecho, rot) {
    const g = new THREE.Group()
    const base = caja(5, 3, 4.4, mat(COL.blanco, { roughness: 0.9 })); base.position.y = 1.5; g.add(base)
    const shape = new THREE.Shape()
    shape.moveTo(-2.75, 0); shape.lineTo(2.75, 0); shape.lineTo(0, 1.9); shape.closePath()
    const tch = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 4.8, bevelEnabled: false }), mat(cTecho, { roughness: 0.8 }))
    tch.castShadow = true; tch.position.set(0, 3, -2.4)
    g.add(tch)
    const chim = caja(0.5, 1.2, 0.5, mat(0x9aa0ab)); chim.position.set(1.6, 4.1, -1.1); g.add(chim)
    const puertaC = caja(1.0, 1.8, 0.12, mat(COL.navy, { roughness: 0.5 })); puertaC.position.set(0.9, 0.9, 2.21); g.add(puertaC)
    const perilla = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(COL.gold, { metalness: 0.7, roughness: 0.3 })); perilla.position.set(1.25, 0.95, 2.3); g.add(perilla)
    ;[-1.3].forEach((wx) => {
      const marco = caja(1.5, 1.25, 0.1, mat(0xffffff)); marco.position.set(wx, 1.7, 2.22); g.add(marco)
      const vid = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 1.0), matVentana); vid.position.set(wx, 1.7, 2.29); g.add(vid)
    })
    const arbusto = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(0x5d7a4e, { roughness: 1 })); arbusto.position.set(-2.1, 0.5, 2.4); arbusto.castShadow = true; g.add(arbusto)
    g.position.set(x, 0, z); g.rotation.y = rot || 0
    escena.add(g)
  }
  casa(20, 20, COL.rojo, -0.5)
  casa(30, 25, COL.gold, 0.25)
  casa(22, 32, COL.steel, 0.1)
  casa(33, 35, COL.teal, -0.3)
  function arbol(x, z, s) {
    const g = new THREE.Group()
    const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 1.5 * s, 8), mat(0x7e5f3e, { roughness: 1 })); tronco.position.y = 0.75 * s; tronco.castShadow = true; g.add(tronco)
    ;[[0, 2.4, 0, 1.45], [0.7, 2.0, 0.4, 0.95], [-0.6, 2.1, -0.3, 1.0]].forEach((b, i) => {
      const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(b[3] * s, 0), mat(i % 2 ? 0x55724a : 0x6b8a58, { roughness: 1 }))
      copa.position.set(b[0] * s, b[1] * s, b[2] * s); copa.castShadow = true; g.add(copa)
    })
    g.position.set(x, 0, z); g.rotation.y = x * 1.7
    escena.add(g)
  }
  arbol(14, 26, 1); arbol(27, 15, 0.8); arbol(38, 28, 1.2); arbol(16, 38, 0.9); arbol(36, -14, 1.1); arbol(-14, 14, 0.8); arbol(44, 10, 1); arbol(-48, 16, 1.1)

  // ── Lámparas de calle ─────────────────────────────────────────────────────
  const cabezasLamp = []
  ;[[-30, 6.6, 0], [10, 6.6, 0], [40, 6.6, 0], [6.6, -30, 1], [6.6, 16, 1], [-6.6, 36, 1]].forEach((lp) => {
    const g = new THREE.Group()
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.4, 10), mat(0x2b3242, { metalness: 0.4, roughness: 0.5 }))
    poste.position.y = 3.2; poste.castShadow = true; g.add(poste)
    const brazo = caja(1.6, 0.12, 0.12, mat(0x2b3242)); brazo.position.set(lp[2] ? 0 : -0.7, 6.3, lp[2] ? -0.7 : 0)
    if (lp[2]) brazo.rotation.y = Math.PI / 2
    g.add(brazo)
    const cab = caja(0.75, 0.18, 0.32, mat(0xf0e6c8, { emissive: 0xffe3ae, emissiveIntensity: oscuro ? 1.6 : 0.0 }))
    cab.position.set(lp[2] ? 0 : -1.35, 6.22, lp[2] ? -1.35 : 0)
    g.add(cab); cabezasLamp.push(cab)
    if (oscuro) {
      const halo2 = new THREE.Sprite(matGlow); halo2.scale.set(4, 4, 1)
      halo2.position.copy(cab.position).add(new THREE.Vector3(0, -0.3, 0)); g.add(halo2)
    }
    g.position.set(lp[0], 0, lp[1])
    escena.add(g)
  })
  if (oscuro) {
    const plCalle = new THREE.PointLight(0xffe3ae, 0.5, 40, 2); plCalle.position.set(0, 8, 0); escena.add(plCalle)
  }

  // ── Vehículos ─────────────────────────────────────────────────────────────
  function llanta(g, x, z, r) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 18), mat(0x14181f, { roughness: 0.5 }))
    tire.rotation.x = Math.PI / 2; tire.position.set(x, r, z); tire.castShadow = true; g.add(tire)
    const rin = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.52, 12), mat(0xcfd5de, { metalness: 0.75, roughness: 0.25 }))
    rin.rotation.x = Math.PI / 2; rin.position.set(x, r, z); g.add(rin)
    return tire
  }
  function luzDelantera(g, x, z) {
    const f = caja(0.1, 0.22, 0.3, mat(0xfff6dd, { emissive: 0xfff2c8, emissiveIntensity: oscuro ? 1.8 : 0.4 }))
    f.position.set(x, 1.05, z); g.add(f)
  }
  function luzTrasera(g, x, z) {
    const f = caja(0.08, 0.2, 0.26, mat(0xc0392b, { emissive: 0xe74c3c, emissiveIntensity: oscuro ? 1.4 : 0.35 }))
    f.position.set(x, 1.5, z); g.add(f)
  }
  function vanNueva(color) {
    const g = new THREE.Group()
    const cuerpo = caja(4.4, 2.2, 2.2, mat(color, { roughness: 0.35, metalness: 0.25 })); cuerpo.position.set(-0.4, 1.75, 0); g.add(cuerpo)
    const techo = caja(4.0, 0.16, 2.0, mat(color, { roughness: 0.3, metalness: 0.3 })); techo.position.set(-0.5, 2.92, 0); g.add(techo)
    const cab = caja(1.7, 1.7, 2.1, mat(color, { roughness: 0.35, metalness: 0.25 })); cab.position.set(2.35, 1.42, 0); g.add(cab)
    const cofre = caja(0.5, 0.75, 2.05, mat(color, { roughness: 0.35, metalness: 0.25 })); cofre.position.set(3.35, 0.95, 0); g.add(cofre)
    const parab = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.85), matVidrio)
    parab.rotation.y = Math.PI / 2; parab.rotation.x = -0.12; parab.position.set(3.22, 1.8, 0); g.add(parab)
    ;[-1.08, 1.08].forEach((lado) => {
      const vlat = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.65), matVidrio)
      vlat.rotation.y = lado > 0 ? 0 : Math.PI
      vlat.position.set(2.3, 1.8, lado * 1.001 + (lado > 0 ? 0.055 : -0.055)); g.add(vlat)
      const espejo = caja(0.1, 0.28, 0.18, mat(0x1c2435)); espejo.position.set(3.1, 1.75, lado * 1.25); g.add(espejo)
    })
    const bumper = caja(0.25, 0.4, 2.15, mat(0x222a38, { roughness: 0.6 })); bumper.position.set(3.58, 0.55, 0); g.add(bumper)
    luzDelantera(g, 3.64, 0.75); luzDelantera(g, 3.64, -0.75)
    luzTrasera(g, -2.62, 0.8); luzTrasera(g, -2.62, -0.8)
    g.ruedas = [llanta(g, 1.7, 1.12, 0.55), llanta(g, 1.7, -1.12, 0.55), llanta(g, -1.5, 1.12, 0.55), llanta(g, -1.5, -1.12, 0.55)]
    escena.add(g); return g
  }
  function volteoNuevo() {
    const g = new THREE.Group()
    const chasis = caja(6.6, 0.45, 2.3, mat(0x1a2233, { roughness: 0.7 })); chasis.position.set(0, 0.95, 0); g.add(chasis)
    const cajaV = caja(4.4, 1.95, 2.45, mat(COL.steel, { map: texCorrugado('#3d5a80', 'rgba(0,0,0,.3)', 'rgba(255,255,255,.14)'), roughness: 0.5, metalness: 0.35 })); cajaV.position.set(-0.95, 2.25, 0); g.add(cajaV)
    ;[-2.9, -0.95, 1.0].forEach((rx) => {
      const rib = caja(0.14, 1.95, 2.55, mat(0x2e4664)); rib.position.set(rx, 2.25, 0); g.add(rib)
    })
    const carga = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.25, 4), mat(0xffffff, { map: texGrava, roughness: 1 }))
    carga.rotation.y = Math.PI / 4; carga.scale.set(1.6, 1, 0.85)
    carga.position.set(-0.95, 3.65, 0); carga.castShadow = true; g.add(carga)
    const cab2 = caja(1.8, 2.05, 2.3, mat(COL.gold, { roughness: 0.35, metalness: 0.3 })); cab2.position.set(2.7, 1.95, 0); g.add(cab2)
    const parab2 = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.85), matVidrio)
    parab2.rotation.y = Math.PI / 2; parab2.rotation.x = -0.1; parab2.position.set(3.62, 2.35, 0); g.add(parab2)
    const escape = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 8), mat(0x9aa3b2, { metalness: 0.7, roughness: 0.3 }))
    escape.position.set(1.85, 2.6, 1.15); g.add(escape)
    const bumper2 = caja(0.3, 0.5, 2.35, mat(0x222a38)); bumper2.position.set(3.75, 0.6, 0); g.add(bumper2)
    luzDelantera(g, 3.85, 0.8); luzDelantera(g, 3.85, -0.8)
    luzTrasera(g, -3.18, 0.85); luzTrasera(g, -3.18, -0.85)
    g.ruedas = [llanta(g, 2.5, 1.2, 0.62), llanta(g, 2.5, -1.2, 0.62), llanta(g, -0.3, 1.2, 0.62), llanta(g, -0.3, -1.2, 0.62), llanta(g, -2.3, 1.2, 0.62), llanta(g, -2.3, -1.2, 0.62)]
    escena.add(g); return g
  }
  const volteo1 = volteoNuevo(), volteo2 = volteoNuevo()
  const van1 = vanNueva(COL.gold), van2 = vanNueva(COL.steel)
  volteo2.rotation.y = Math.PI
  van2.rotation.y = Math.PI

  // ── Cámara orbital + modos (fuera / dentro del almacén) ───────────────────
  const T0 = new THREE.Vector3(-13, 2, -7)
  const TI = new THREE.Vector3(cxm, 4, czm + 2)
  const orb = { th: 0.66, ph: 0.58, r: 64, tgt: T0.clone() }
  const meta = { th: 0.66, ph: 0.58, r: 64 }
  let modo = 'fuera'
  let anim = null
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  function posOrbita(o, tgt) {
    return new THREE.Vector3(
      tgt.x + o.r * Math.sin(o.ph) * Math.cos(o.th),
      tgt.y + o.r * Math.cos(o.ph),
      tgt.z + o.r * Math.sin(o.ph) * Math.sin(o.th)
    )
  }
  function volar(hastaPos, hastaTgt, dur, alTerminar) {
    anim = {
      t0: performance.now(), dur: reduce ? 1 : dur,
      desde: { pos: camara.position.clone(), tgt: orb.tgt.clone() },
      hasta: { pos: hastaPos.clone(), tgt: hastaTgt.clone() },
      alTerminar
    }
  }
  const puntoPuertaFuera = new THREE.Vector3(ALM.puertaX, 3.4, ALM.z2 + 16)
  const puntoDentro = new THREE.Vector3(ALM.puertaX, 3.6, czm + 4)
  function alternarAlmacen() {
    if (modo === 'fuera') {
      modo = 'entrando'; alCambiarModo('entrando')
      volar(puntoPuertaFuera, new THREE.Vector3(ALM.puertaX, 4, ALM.z2), 1500, () => {
        volar(puntoDentro, TI, 1800, () => {
          modo = 'dentro'; alCambiarModo('dentro')
          const rel = camara.position.clone().sub(TI)
          orb.tgt.copy(TI)
          orb.r = 12; meta.r = 12
          orb.th = Math.atan2(rel.z, rel.x); meta.th = orb.th
          orb.ph = 1.12; meta.ph = 1.12
        })
      })
    } else if (modo === 'dentro') {
      modo = 'saliendo'; alCambiarModo('saliendo')
      volar(new THREE.Vector3(ALM.puertaX, 3.4, ALM.z2 + 7), new THREE.Vector3(ALM.puertaX, 3.5, ALM.z2 + 20), 1500, () => {
        orb.tgt.copy(T0); orb.th = 0.66; orb.ph = 0.58; orb.r = 64
        meta.th = orb.th; meta.ph = orb.ph; meta.r = orb.r
        volar(posOrbita(orb, T0), T0, 1600, () => { modo = 'fuera'; alCambiarModo('fuera') })
      })
    }
  }
  const zoomMas = () => { meta.r = clamp(meta.r * 0.78, modo === 'dentro' ? 6 : 16, modo === 'dentro' ? 18 : 110) }
  const zoomMenos = () => { meta.r = clamp(meta.r / 0.78, modo === 'dentro' ? 6 : 16, modo === 'dentro' ? 18 : 110) }
  const centrar = () => {
    if (modo === 'dentro') { meta.r = 12 } else { meta.th = 0.66; meta.ph = 0.58; meta.r = 64 }
  }
  function alRueda(e) {
    e.preventDefault()
    meta.r = clamp(meta.r * (e.deltaY > 0 ? 1.09 : 1 / 1.09), modo === 'dentro' ? 6 : 16, modo === 'dentro' ? 18 : 110)
  }
  renderer.domElement.addEventListener('wheel', alRueda, { passive: false })
  let drag = null, ultimaInteraccion = 0
  function alBajar(e) {
    drag = { x: e.clientX, y: e.clientY }
    cont.classList.add('arrastrando')
    try { renderer.domElement.setPointerCapture(e.pointerId) } catch (err) { /* noop */ }
  }
  function alMover(e) {
    if (!drag) return
    ultimaInteraccion = performance.now()
    meta.th += (e.clientX - drag.x) * 0.0062
    meta.ph = clamp(meta.ph - (e.clientY - drag.y) * 0.0045, modo === 'dentro' ? 0.9 : 0.3, modo === 'dentro' ? 1.5 : 1.25)
    drag = { x: e.clientX, y: e.clientY }
  }
  function soltar() { drag = null; cont.classList.remove('arrastrando') }
  renderer.domElement.addEventListener('pointerdown', alBajar)
  renderer.domElement.addEventListener('pointermove', alMover)
  renderer.domElement.addEventListener('pointerup', soltar)
  renderer.domElement.addEventListener('pointercancel', soltar)

  // ── Bucle ─────────────────────────────────────────────────────────────────
  let vivo = true
  let raf = 0
  const reloj = new THREE.Clock()
  function lazo() {
    if (!vivo) return
    raf = requestAnimationFrame(lazo)
    const t = performance.now()
    const s = reloj.getElapsedTime()
    if (!reduce) {
      const vx1 = -130 + ((s * 10) % 260); volteo1.position.set(vx1, 0, 2.3)
      const vx2 = 130 - ((s * 9 + 80) % 260); volteo2.position.set(vx2, 0, -2.3)
      const vz1 = -130 + ((s * 12 + 40) % 260); van1.position.set(2.3, 0, vz1); van1.rotation.y = -Math.PI / 2
      const vz2 = 130 - ((s * 11 + 140) % 260); van2.position.set(-2.3, 0, vz2); van2.rotation.y = Math.PI / 2
      ;[volteo1, volteo2, van1, van2].forEach((v) => { v.ruedas.forEach((w) => { w.rotation.y += 0.18 }) })
      for (let cb2 = 0; cb2 < cajasBanda.length; cb2++) {
        const bp = -33.5 + ((s * 2.2 + cb2 * 4.2) % 15.5)
        cajasBanda[cb2].position.set(bp, 1.72, -12.5)
        cajasBanda[cb2].visible = bp < -19
      }
      const mz = -27 + (1 + Math.sin(s * 0.45)) * 5
      monta.position.set(-20, 0, mz)
      monta.rotation.y = Math.cos(s * 0.45) > 0 ? 0 : Math.PI
      caminante.position.x = -18 + Math.sin(s * 0.5) * 4
      caminante.rotation.y = Math.cos(s * 0.5) > 0 ? Math.PI / 2 : -Math.PI / 2
      if (modo === 'fuera' && !anim && t - ultimaInteraccion > 4000) meta.th += 0.00045
    } else {
      volteo1.position.set(-22, 0, 2.3); volteo2.position.set(28, 0, -2.3)
      van1.position.set(2.3, 0, 26); van1.rotation.y = -Math.PI / 2
      van2.position.set(-2.3, 0, -18); van2.rotation.y = Math.PI / 2
      monta.position.set(-20, 0, -22)
      for (let cb3 = 0; cb3 < cajasBanda.length; cb3++) cajasBanda[cb3].position.set(-32 + cb3 * 4, 1.72, -12.5)
    }
    const abierta = modo !== 'fuera'
    puerta.position.y += ((abierta ? puertaAbiertaY : puertaCerradaY) - puerta.position.y) * (reduce ? 1 : 0.06)
    if (anim) {
      const p = clamp((t - anim.t0) / anim.dur, 0, 1)
      const e2 = easeInOut(p)
      camara.position.lerpVectors(anim.desde.pos, anim.hasta.pos, e2)
      orb.tgt.lerpVectors(anim.desde.tgt, anim.hasta.tgt, e2)
      camara.lookAt(orb.tgt)
      if (p >= 1) { const fin = anim.alTerminar; anim = null; if (fin) fin() }
    } else {
      const f = reduce ? 1 : 0.08
      orb.th += (meta.th - orb.th) * f
      orb.ph += (meta.ph - orb.ph) * f
      orb.r += (meta.r - orb.r) * f
      camara.position.copy(posOrbita(orb, orb.tgt))
      camara.lookAt(orb.tgt)
    }
    renderer.render(escena, camara)
  }
  ajustar()
  camara.position.set(80, 55, 100)
  volar(posOrbita(orb, T0), T0, reduce ? 1 : 2200)
  lazo()

  function destruir() {
    vivo = false
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', ajustar)
    renderer.domElement.removeEventListener('wheel', alRueda)
    renderer.domElement.removeEventListener('pointerdown', alBajar)
    renderer.domElement.removeEventListener('pointermove', alMover)
    renderer.domElement.removeEventListener('pointerup', soltar)
    renderer.domElement.removeEventListener('pointercancel', soltar)
    escena.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose() }) }
    })
    renderer.dispose()
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
  }

  return { zoomMas, zoomMenos, centrar, alternarAlmacen, destruir }
}
