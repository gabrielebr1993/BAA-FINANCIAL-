// ============================================================================
// ESCENA 3D del home público de MilePay (three.js r128) — v3 "fulfillment".
//
// Centro de distribución estilo Amazon: almacén grande con MUELLES de carga
// (tráilers acoplados, cortinas metálicas, topes y luces), patio de maniobras
// con vans que ENTRAN y SALEN por rutas reales, tráfico en las vías (volteos
// de Freight, camionetas, un tráiler), y por dentro una MÁQUINA CLASIFICADORA
// de paquetes: línea elevada con rampas de salida a contenedores, operadores
// en cada rampa y montacargas patrullando junto a los racks.
//
// Acabado: tone mapping ACES, atardecer dorado, sombras suaves, texturas
// procedurales en canvas (cero descargas). Modo oscuro = noche con luces.
// API: montarEscenaMilePay(cont, { oscuro, reduce, alCambiarModo })
//   → { zoomMas, zoomMenos, centrar, alternarAlmacen, destruir }
// ============================================================================
import * as THREE from 'three'

export function montarEscenaMilePay(cont, opciones = {}) {
  const oscuro = !!opciones.oscuro
  const reduce = !!opciones.reduce
  const alCambiarModo = opciones.alCambiarModo || (() => {})

  // ── Renderer ──────────────────────────────────────────────────────────────
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
  escena.fog = new THREE.Fog(oscuro ? 0x0d1730 : 0xf3dcb4, 120, 280)

  // ── Texturas procedurales ─────────────────────────────────────────────────
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
      for (let i = 0; i < 90; i++) { cx.globalAlpha = 0.25 + Math.random() * 0.7; cx.fillRect(Math.random() * w, Math.random() * h * 0.6, 1, 1) }
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
    ruido(cx, w, h, oscuro ? '#20304e' : '#d2cbbb', 2000, 0.05)
    cx.strokeStyle = 'rgba(0,0,0,.12)'; cx.lineWidth = 2
    cx.strokeRect(0, 0, w, h)
    cx.beginPath(); cx.moveTo(w / 2, 0); cx.lineTo(w / 2, h); cx.moveTo(0, h / 2); cx.lineTo(w, h / 2); cx.stroke()
  })
  texConcreto.repeat.set(12, 10)
  const texGrama = lienzo(256, 256, (cx, w, h) => {
    ruido(cx, w, h, oscuro ? '#15243a' : '#8f9d6a', 3000, 0.08)
    cx.fillStyle = oscuro ? 'rgba(40,60,50,.4)' : 'rgba(110,125,80,.5)'
    for (let i = 0; i < 260; i++) cx.fillRect(Math.random() * w, Math.random() * h, 2, 3)
  })
  texGrama.repeat.set(36, 36)
  function texCorrugado(base, sombra, claro) {
    return lienzo(128, 128, (cx, w, h) => {
      cx.fillStyle = base; cx.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 10) {
        cx.fillStyle = sombra; cx.fillRect(x, 0, 3, h)
        cx.fillStyle = claro; cx.fillRect(x + 6, 0, 2, h)
      }
    })
  }
  const texMuro = texCorrugado('#182a49', 'rgba(0,0,0,.35)', 'rgba(140,170,220,.16)')
  const texRoller = lienzo(128, 128, (cx, w, h) => {
    cx.fillStyle = '#9aa3b2'; cx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 14) {
      cx.fillStyle = 'rgba(255,255,255,.25)'; cx.fillRect(0, y, w, 3)
      cx.fillStyle = 'rgba(0,0,0,.28)'; cx.fillRect(0, y + 11, w, 3)
    }
  })
  const texCarton = lienzo(128, 128, (cx, w, h) => {
    ruido(cx, w, h, '#c1915c', 500, 0.05)
    cx.fillStyle = 'rgba(122,82,42,.55)'; cx.fillRect(0, h / 2 - 7, w, 14)
    cx.fillStyle = 'rgba(255,255,255,.85)'; cx.fillRect(8, 10, 34, 22)
    cx.fillStyle = '#13233f'; cx.fillRect(12, 16, 26, 3); cx.fillRect(12, 23, 18, 3)
  })
  const texGrava = lienzo(128, 128, (cx, w, h) => { ruido(cx, w, h, '#7e8795', 2400, 0.16) })
  const texArena = lienzo(128, 128, (cx, w, h) => { ruido(cx, w, h, '#c2a06b', 2000, 0.10) })
  const texPiso = lienzo(256, 256, (cx, w, h) => { ruido(cx, w, h, oscuro ? '#243655' : '#d8d1c2', 1400, 0.045) })
  texPiso.repeat.set(8, 6)
  const texTrailer = lienzo(256, 128, (cx, w, h) => {
    cx.fillStyle = '#e8eaee'; cx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 16) { cx.fillStyle = 'rgba(0,0,0,.08)'; cx.fillRect(x, 0, 2, h) }
    cx.fillStyle = '#13233f'; cx.font = '800 34px -apple-system, Segoe UI, Roboto, sans-serif'
    cx.fillText('MilePay', 54, 76)
    cx.fillStyle = '#c9a24b'; cx.beginPath(); cx.arc(206, 68, 7, 0, 7); cx.fill()
  })

  // ── Luces / cielo ─────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(oscuro ? 0x2c4370 : 0xffe9cd, oscuro ? 0x0a1020 : 0x9c8d72, oscuro ? 0.45 : 0.55)
  escena.add(hemi)
  const sol = new THREE.DirectionalLight(oscuro ? 0x93aede : 0xffcf9b, oscuro ? 0.32 : 1.35)
  sol.position.set(-58, 32, 44)
  sol.castShadow = true
  sol.shadow.mapSize.set(2048, 2048)
  sol.shadow.camera.left = -95; sol.shadow.camera.right = 95
  sol.shadow.camera.top = 95; sol.shadow.camera.bottom = -95
  sol.shadow.camera.far = 260
  sol.shadow.bias = -0.00035
  sol.shadow.radius = 5
  escena.add(sol)
  const cielo = new THREE.Mesh(new THREE.SphereGeometry(340, 24, 16), new THREE.MeshBasicMaterial({ map: texCielo, side: THREE.BackSide, fog: false }))
  escena.add(cielo)
  function spriteSuave(color, interior) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128
    const cx = cv.getContext('2d')
    const g = cx.createRadialGradient(64, 64, 6, 64, 64, 62)
    g.addColorStop(0, interior); g.addColorStop(1, color)
    cx.fillStyle = g; cx.fillRect(0, 0, 128, 128)
    return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
  }
  const matGlow = spriteSuave('rgba(255,220,150,0)', 'rgba(255,230,170,.8)')
  matGlow.blending = THREE.AdditiveBlending
  if (!oscuro) {
    const solV = new THREE.Sprite(spriteSuave('rgba(255,200,130,0)', 'rgba(255,236,200,.95)'))
    solV.material.blending = THREE.AdditiveBlending
    solV.scale.set(90, 90, 1); solV.position.set(-220, 70, 150)
    escena.add(solV)
    const matNube = spriteSuave('rgba(255,255,255,0)', 'rgba(255,248,238,.85)')
    for (let nb = 0; nb < 7; nb++) {
      const sp = new THREE.Sprite(matNube)
      sp.scale.set(40 + nb * 7, 15 + (nb % 3) * 4, 1)
      sp.position.set(-120 + nb * 45, 48 + (nb % 3) * 7, -100 + (nb % 2) * 160)
      escena.add(sp)
    }
  } else {
    const luna = new THREE.Sprite(spriteSuave('rgba(200,215,255,0)', 'rgba(235,242,255,.95)'))
    luna.scale.set(26, 26, 1); luna.position.set(140, 110, -180)
    escena.add(luna)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0.04 }, o || {}))
  const matVidrio = mat(0x9fc2e8, { roughness: 0.12, metalness: 0.65 })
  const matCarton = mat(0xffffff, { map: texCarton, roughness: 0.85 })
  function caja(w, h, d, m) {
    const ms = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === 'number' ? mat(m) : m)
    ms.castShadow = true; ms.receiveShadow = true
    return ms
  }
  function en(obj, x, y, z, padre) { obj.position.set(x, y, z); (padre || escena).add(obj); return obj }
  const COL = { navy: 0x16263f, gold: 0xc9a24b, steel: 0x3d5a80, teal: 0x4a9c8c, rojo: 0xb9533f, blanco: 0xf1f2f4 }

  // ── Terreno + vías ────────────────────────────────────────────────────────
  const pasto = new THREE.Mesh(new THREE.PlaneGeometry(620, 620), mat(0xffffff, { map: texGrama, roughness: 1 }))
  pasto.rotation.x = -Math.PI / 2; pasto.receiveShadow = true
  escena.add(pasto)
  const patio = new THREE.Mesh(new THREE.PlaneGeometry(190, 150), mat(0xffffff, { map: texConcreto, roughness: 0.95 }))
  patio.rotation.x = -Math.PI / 2; patio.position.set(-16, 0.02, -8); patio.receiveShadow = true
  escena.add(patio)
  const viaX = new THREE.Mesh(new THREE.PlaneGeometry(470, 10.5), mat(0xffffff, { map: texAsfalto, roughness: 0.98 }))
  viaX.rotation.x = -Math.PI / 2; viaX.position.y = 0.045; viaX.receiveShadow = true
  escena.add(viaX)
  const texAsf2 = texAsfalto.clone(); texAsf2.needsUpdate = true; texAsf2.repeat.set(3, 40)
  const viaZ = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 470), mat(0xffffff, { map: texAsf2, roughness: 0.98 }))
  viaZ.rotation.x = -Math.PI / 2; viaZ.position.y = 0.045; viaZ.receiveShadow = true
  escena.add(viaZ)
  const matRaya = mat(0xd9b35e, { emissive: 0xd9b35e, emissiveIntensity: oscuro ? 0.5 : 0.1, roughness: 0.6 })
  const matBorde = mat(0xd8dce2, { roughness: 0.6, emissive: 0xd8dce2, emissiveIntensity: oscuro ? 0.12 : 0 })
  for (let r = -230; r < 230; r += 8) {
    const r1 = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.32), matRaya)
    r1.rotation.x = -Math.PI / 2; r1.position.set(r, 0.055, 0); escena.add(r1)
    const r2 = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 3.4), matRaya)
    r2.rotation.x = -Math.PI / 2; r2.position.set(0, 0.055, r + 4); escena.add(r2)
  }
  ;[-5.05, 5.05].forEach((off) => {
    const b1 = new THREE.Mesh(new THREE.PlaneGeometry(470, 0.22), matBorde)
    b1.rotation.x = -Math.PI / 2; b1.position.set(0, 0.052, off); escena.add(b1)
    const b2 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 470), matBorde)
    b2.rotation.x = -Math.PI / 2; b2.position.set(off, 0.052, 0); escena.add(b2)
  })
  const matCebra = mat(0xe8eaee, { roughness: 0.55 })
  for (let c = -3.9; c <= 3.9; c += 1.3) {
    const c1 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.2), matCebra)
    c1.rotation.x = -Math.PI / 2; c1.position.set(c, 0.06, 7.4); escena.add(c1)
    const c2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), matCebra)
    c2.rotation.x = -Math.PI / 2; c2.position.set(7.4, 0.06, c); escena.add(c2)
  }

  // ── ALMACÉN estilo fulfillment (patio profundo + muelles) ────────────────
  const ALM = { x1: -56, x2: -10, z1: -44, z2: -16, alto: 14, puertaX: -20, puertaW: 8, puertaH: 8 }
  const cw = ALM.x2 - ALM.x1, cd = ALM.z2 - ALM.z1, cxm = (ALM.x1 + ALM.x2) / 2, czm = (ALM.z1 + ALM.z2) / 2
  const G = 0.55
  function muro(w, h, d, x, y, z, repX) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(0xffffff, { map: texMuro.clone(), roughness: 0.75, metalness: 0.15 }))
    m.material.map.repeat.set(Math.max(2, repX / 3.2), 1); m.material.map.needsUpdate = true
    m.castShadow = true; m.receiveShadow = true
    m.position.set(x, y, z); escena.add(m); return m
  }
  muro(cw, ALM.alto, G, cxm, ALM.alto / 2, ALM.z1, cw)
  muro(G, ALM.alto, cd, ALM.x1, ALM.alto / 2, czm, cd)
  muro(G, ALM.alto, cd, ALM.x2, ALM.alto / 2, czm, cd)
  const izqW = (ALM.puertaX - ALM.puertaW / 2) - ALM.x1
  const derW = ALM.x2 - (ALM.puertaX + ALM.puertaW / 2)
  muro(izqW, ALM.alto, G, ALM.x1 + izqW / 2, ALM.alto / 2, ALM.z2, izqW)
  muro(derW, ALM.alto, G, ALM.x2 - derW / 2, ALM.alto / 2, ALM.z2, derW)
  muro(ALM.puertaW, ALM.alto - ALM.puertaH, G, ALM.puertaX, ALM.puertaH + (ALM.alto - ALM.puertaH) / 2, ALM.z2, ALM.puertaW)
  en(caja(cw + 0.3, 1.1, 0.35, mat(0x9aa0ab, { roughness: 1 })), cxm, 0.55, ALM.z2 + 0.18)
  en(caja(cw + 1.4, 0.7, cd + 1.4, mat(0x44536b, { roughness: 0.6, metalness: 0.3 })), cxm, ALM.alto + 0.35, czm)
  ;[[-48, -34], [-38, -22], [-26, -38], [-16, -24]].forEach((u, i) => {
    en(caja(3.2, 1.6, 2.4, mat(0x7d8798, { roughness: 0.5, metalness: 0.4 })), u[0], ALM.alto + 1.5, u[1])
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 10), mat(0x9aa3b2, { metalness: 0.5, roughness: 0.4 }))
    tubo.position.set(u[0] + 2, ALM.alto + 1.8, u[1] + (i % 2 ? 1.4 : -1.4)); tubo.castShadow = true
    escena.add(tubo)
  })
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
  letrero.position.set(ALM.puertaX + 12, ALM.alto - 1.1, ALM.z2 + 0.36)
  escena.add(letrero)
  en(caja(ALM.puertaW + 1.6, 0.28, 2.2, mat(COL.gold, { roughness: 0.4, metalness: 0.5 })), ALM.puertaX, ALM.puertaH + 0.6, ALM.z2 + 1.1)
  const puerta = caja(ALM.puertaW - 0.3, ALM.puertaH, 0.3, mat(0xc9a24b, { map: texRoller.clone(), roughness: 0.45, metalness: 0.5 }))
  puerta.material.map.repeat.set(1, 2); puerta.material.map.needsUpdate = true
  en(puerta, ALM.puertaX, ALM.puertaH / 2, ALM.z2)
  const puertaCerradaY = ALM.puertaH / 2, puertaAbiertaY = ALM.puertaH * 1.42

  // MUELLES de carga (4): plataforma + cortina + topes + luz de muelle + número
  const DOCKS = [-50, -43, -36, -29]
  DOCKS.forEach((dx, i) => {
    en(caja(5.6, 1.25, 3.2, mat(0x9aa0ab, { map: texConcreto, roughness: 1 })), dx, 0.62, ALM.z2 + 1.6)
    const cortina = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.8), mat(0xffffff, { map: texRoller, roughness: 0.5, metalness: 0.45 }))
    cortina.position.set(dx, 3.2, ALM.z2 + 0.29)
    escena.add(cortina)
    en(caja(0.5, 0.5, 0.35, mat(0x11151d, { roughness: 0.95 })), dx - 1.9, 1.3, ALM.z2 + 3.1)
    en(caja(0.5, 0.5, 0.35, mat(0x11151d, { roughness: 0.95 })), dx + 1.9, 1.3, ALM.z2 + 3.1)
    const foco = caja(0.3, 0.3, 0.3, mat(i % 2 ? 0x37d67a : 0xd9b35e, { emissive: i % 2 ? 0x37d67a : 0xd9b35e, emissiveIntensity: 1.4 }))
    en(foco, dx - 2.5, 5.6, ALM.z2 + 0.4)
    const num = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({
      map: lienzo(64, 64, (cx) => { cx.fillStyle = '#13233f'; cx.fillRect(0, 0, 64, 64); cx.fillStyle = '#fff'; cx.font = '800 40px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(String(i + 1), 32, 36) }),
    }))
    num.position.set(dx + 2.6, 5.6, ALM.z2 + 0.4)
    escena.add(num)
  })
  // Bolardos frente al portón peatonal/vehicular
  ;[-25, -22.6, -17.4, -15].forEach((bx) => {
    const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.05, 10), mat(COL.gold, { roughness: 0.4, metalness: 0.4, emissive: COL.gold, emissiveIntensity: oscuro ? 0.25 : 0 }))
    bol.position.set(bx, 0.52, ALM.z2 + 4.4); bol.castShadow = true
    escena.add(bol)
  })
  // Ventanales altos
  const matVentana = mat(0xbcd9f8, { emissive: 0xcfe2ff, emissiveIntensity: oscuro ? 1.1 : 0.12, roughness: 0.2, metalness: 0.4 })
  for (let vx = ALM.x1 + 4; vx < ALM.x2 - 3; vx += 5.4) {
    const marco = caja(3.5, 2.0, 0.12, mat(0x0e1626, { roughness: 0.6 }))
    en(marco, vx, ALM.alto - 2.4, ALM.z2 + 0.3)
    const vn = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.7), matVentana)
    vn.position.set(vx, ALM.alto - 2.4, ALM.z2 + 0.37)
    escena.add(vn)
  }
  // Rayas de estacionamiento del patio
  for (let px = -8; px <= 4; px += 3) {
    const ry = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 5.5), matBorde)
    ry.rotation.x = -Math.PI / 2; ry.position.set(px - 1.5, 0.05, -10.4)
    escena.add(ry)
  }

  // ── Vehículos ─────────────────────────────────────────────────────────────
  function llanta(g, x, z, r) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 18), mat(0x14181f, { roughness: 0.5 }))
    tire.rotation.x = Math.PI / 2; tire.position.set(x, r, z); tire.castShadow = true; g.add(tire)
    const rin = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.52, 12), mat(0xcfd5de, { metalness: 0.75, roughness: 0.25 }))
    rin.rotation.x = Math.PI / 2; rin.position.set(x, r, z); g.add(rin)
    return tire
  }
  function luces(g, xF, xT, zMed, yF, yT) {
    ;[zMed, -zMed].forEach((zz) => {
      const f = caja(0.1, 0.22, 0.3, mat(0xfff6dd, { emissive: 0xfff2c8, emissiveIntensity: oscuro ? 1.8 : 0.4 }))
      f.position.set(xF, yF, zz); g.add(f)
      const t2 = caja(0.08, 0.2, 0.26, mat(0xc0392b, { emissive: 0xe74c3c, emissiveIntensity: oscuro ? 1.4 : 0.35 }))
      t2.position.set(xT, yT, zz); g.add(t2)
    })
  }
  function vanNueva(color) {
    const g = new THREE.Group()
    const cuerpo = caja(4.4, 2.2, 2.2, mat(color, { roughness: 0.35, metalness: 0.25 })); cuerpo.position.set(-0.4, 1.75, 0); g.add(cuerpo)
    const cab = caja(1.7, 1.7, 2.1, mat(color, { roughness: 0.35, metalness: 0.25 })); cab.position.set(2.35, 1.42, 0); g.add(cab)
    const cofre = caja(0.5, 0.75, 2.05, mat(color, { roughness: 0.35, metalness: 0.25 })); cofre.position.set(3.35, 0.95, 0); g.add(cofre)
    const parab = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.85), matVidrio)
    parab.rotation.y = Math.PI / 2; parab.rotation.x = -0.12; parab.position.set(3.22, 1.8, 0); g.add(parab)
    ;[-1.08, 1.08].forEach((lado) => {
      const espejo = caja(0.1, 0.28, 0.18, mat(0x1c2435)); espejo.position.set(3.1, 1.75, lado * 1.25); g.add(espejo)
    })
    const bumper = caja(0.25, 0.4, 2.15, mat(0x222a38, { roughness: 0.6 })); bumper.position.set(3.58, 0.55, 0); g.add(bumper)
    luces(g, 3.64, -2.62, 0.78, 1.05, 1.5)
    g.ruedas = [llanta(g, 1.7, 1.12, 0.55), llanta(g, 1.7, -1.12, 0.55), llanta(g, -1.5, 1.12, 0.55), llanta(g, -1.5, -1.12, 0.55)]
    escena.add(g); return g
  }
  function volteoNuevo() {
    const g = new THREE.Group()
    const chasis = caja(6.6, 0.45, 2.3, mat(0x1a2233, { roughness: 0.7 })); chasis.position.set(0, 0.95, 0); g.add(chasis)
    const cajaV = caja(4.4, 1.95, 2.45, mat(COL.steel, { map: texCorrugado('#3d5a80', 'rgba(0,0,0,.3)', 'rgba(255,255,255,.14)'), roughness: 0.5, metalness: 0.35 })); cajaV.position.set(-0.95, 2.25, 0); g.add(cajaV)
    const carga = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.25, 4), mat(0xffffff, { map: texGrava, roughness: 1 }))
    carga.rotation.y = Math.PI / 4; carga.scale.set(1.6, 1, 0.85)
    carga.position.set(-0.95, 3.65, 0); carga.castShadow = true; g.add(carga)
    const cab2 = caja(1.8, 2.05, 2.3, mat(COL.gold, { roughness: 0.35, metalness: 0.3 })); cab2.position.set(2.7, 1.95, 0); g.add(cab2)
    const parab2 = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.85), matVidrio)
    parab2.rotation.y = Math.PI / 2; parab2.rotation.x = -0.1; parab2.position.set(3.62, 2.35, 0); g.add(parab2)
    luces(g, 3.85, -3.18, 0.82, 1.05, 1.5)
    g.ruedas = [llanta(g, 2.5, 1.2, 0.62), llanta(g, 2.5, -1.2, 0.62), llanta(g, -0.3, 1.2, 0.62), llanta(g, -0.3, -1.2, 0.62), llanta(g, -2.3, 1.2, 0.62), llanta(g, -2.3, -1.2, 0.62)]
    escena.add(g); return g
  }
  // TRÁILER (tractocamión + caja larga con marca MilePay)
  function trailerNuevo(conTractor) {
    const g = new THREE.Group()
    const cajaT = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3.1, 2.5), mat(0xffffff, { map: texTrailer, roughness: 0.5, metalness: 0.15 }))
    cajaT.position.set(-1.6, 2.35, 0); cajaT.castShadow = true; cajaT.receiveShadow = true; g.add(cajaT)
    const faldon = caja(8.4, 0.5, 2.3, mat(0x9aa3b2, { roughness: 0.6 })); faldon.position.set(-1.6, 0.68, 0); g.add(faldon)
    g.ruedas = [llanta(g, -4.6, 1.15, 0.58), llanta(g, -4.6, -1.15, 0.58), llanta(g, -3.4, 1.15, 0.58), llanta(g, -3.4, -1.15, 0.58)]
    if (conTractor) {
      const cab = caja(2.2, 2.6, 2.35, mat(COL.navy, { roughness: 0.35, metalness: 0.3 })); cab.position.set(4.2, 2.0, 0); g.add(cab)
      const cofre = caja(1.3, 1.3, 2.2, mat(COL.navy, { roughness: 0.35, metalness: 0.3 })); cofre.position.set(5.8, 1.35, 0); g.add(cofre)
      const parab3 = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.0), matVidrio)
      parab3.rotation.y = Math.PI / 2; parab3.rotation.x = -0.1; parab3.position.set(5.32, 2.55, 0); g.add(parab3)
      const escape = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), mat(0xc0c7d2, { metalness: 0.8, roughness: 0.25 }))
      escape.position.set(3.2, 2.6, 1.25); g.add(escape)
      luces(g, 6.45, -6.2, 0.85, 0.95, 1.4)
      g.ruedas.push(llanta(g, 4.6, 1.2, 0.6), llanta(g, 4.6, -1.2, 0.6), llanta(g, 2.6, 1.2, 0.6), llanta(g, 2.6, -1.2, 0.6))
    }
    escena.add(g); return g
  }
  // Tráfico de las vías
  const volteo1 = volteoNuevo(), volteo2 = volteoNuevo()
  volteo2.rotation.y = Math.PI
  const van1 = vanNueva(COL.gold), van2 = vanNueva(COL.steel)
  van2.rotation.y = Math.PI
  const trailerVia = trailerNuevo(true)
  // Tráilers ACOPLADOS a los muelles 1 y 3 (perpendiculares, cola a la cortina)
  const dock1 = trailerNuevo(true)
  dock1.rotation.y = -Math.PI / 2
  dock1.position.set(DOCKS[0], 0, ALM.z2 + 3.4 + 4.6)
  const dock3 = trailerNuevo(false)
  dock3.rotation.y = -Math.PI / 2
  dock3.position.set(DOCKS[2], 0, ALM.z2 + 3.4 + 4.6)
  // Van estacionada en el patio
  const vanParqueada = vanNueva(COL.gold)
  vanParqueada.rotation.y = Math.PI / 2
  vanParqueada.position.set(-3, 0, -10.5)
  // Van que ENTRA y SALE del patio (ruta con waypoints)
  const vanPatio = vanNueva(COL.steel)
  const RUTA_PATIO = [
    { x: 2.3, z: 40 }, { x: 2.3, z: 2.2 }, { x: -8, z: -6 }, { x: -14, z: -10.5 },
    { x: -20, z: -11.5, pausa: 2.2 }, { x: -26, z: -8.5 }, { x: -14, z: -2.5 }, { x: 2.3, z: 2.3 }, { x: 2.3, z: 40 },
  ]

  // ── INTERIOR: máquina clasificadora + racks + montacargas + personal ─────
  const pisoInt = new THREE.Mesh(new THREE.PlaneGeometry(cw - 1, cd - 1), mat(0xffffff, { map: texPiso, roughness: 0.35, metalness: 0.08 }))
  pisoInt.rotation.x = -Math.PI / 2; pisoInt.position.set(cxm, 0.05, czm); pisoInt.receiveShadow = true
  escena.add(pisoInt)
  const matLinea = mat(0xd9b35e, { roughness: 0.5, emissive: 0xd9b35e, emissiveIntensity: 0.12 })
  ;[-24, -36].forEach((lz) => {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(cw - 6, 0.3), matLinea)
    ln.rotation.x = -Math.PI / 2; ln.position.set(cxm, 0.06, lz)
    escena.add(ln)
  })
  for (let vz = ALM.z1 + 4; vz <= ALM.z2 - 4; vz += 6) {
    en(caja(cw - 2, 0.45, 0.45, mat(0x27354f, { roughness: 0.6 })), cxm, ALM.alto - 0.8, vz)
  }
  const focos = []
  ;[[-48, -26], [-40, -34], [-33, -22], [-26, -32], [-18, -26], [-40, -20]].forEach((f) => {
    const pl = new THREE.PointLight(0xffe3ae, oscuro ? 0.85 : 0.55, 40, 2)
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
  // Letrero interior
  const letreroInt = new THREE.Mesh(new THREE.PlaneGeometry(11, 2), new THREE.MeshBasicMaterial({ map: texLetrero() }))
  letreroInt.position.set(cxm, ALM.alto - 3.2, ALM.z1 + G / 2 + 0.06)
  escena.add(letreroInt)

  // MÁQUINA CLASIFICADORA: línea elevada con guardas + 4 rampas a contenedores
  const SORTER = { x1: -50, x2: -16, z: -28, h: 1.35 }
  const lineaL = SORTER.x2 - SORTER.x1
  const cuerpoS = caja(lineaL, 0.9, 2.2, mat(0x2b3850, { roughness: 0.55, metalness: 0.3 }))
  en(cuerpoS, (SORTER.x1 + SORTER.x2) / 2, SORTER.h - 0.45 + 0.45, SORTER.z)
  const cintaS = caja(lineaL, 0.1, 1.7, mat(0x10141d, { roughness: 0.3, metalness: 0.25 }))
  en(cintaS, (SORTER.x1 + SORTER.x2) / 2, SORTER.h + 0.5, SORTER.z)
  ;[SORTER.z - 1.05, SORTER.z + 1.05].forEach((gz) => {
    const guarda = caja(lineaL, 0.35, 0.08, mat(0x9aa3b2, { metalness: 0.6, roughness: 0.3 }))
    en(guarda, (SORTER.x1 + SORTER.x2) / 2, SORTER.h + 0.75, gz)
  })
  for (let px2 = SORTER.x1 + 1; px2 < SORTER.x2; px2 += 4) {
    const pata = caja(0.3, SORTER.h + 0.05, 1.9, mat(0x47536b))
    en(pata, px2, (SORTER.h + 0.05) / 2, SORTER.z)
  }
  // Pórtico de escaneo sobre la línea
  const portico = new THREE.Group()
  ;[-1.5, 1.5].forEach((pz) => { const p2 = caja(0.25, 2.6, 0.25, mat(0x9aa3b2, { metalness: 0.6, roughness: 0.3 })); p2.position.set(0, 1.3, pz); portico.add(p2) })
  const dintel = caja(0.4, 0.4, 3.3, mat(0x9aa3b2, { metalness: 0.6, roughness: 0.3 })); dintel.position.set(0, 2.7, 0); portico.add(dintel)
  const ojo = caja(0.3, 0.3, 0.7, mat(0x37d67a, { emissive: 0x37d67a, emissiveIntensity: 1.6 })); ojo.position.set(0, 2.35, 0); portico.add(ojo)
  portico.position.set(SORTER.x1 + 3.5, SORTER.h + 0.55, SORTER.z)
  escena.add(portico)
  // Rampas de salida (chutes) + contenedores + operadores
  const CHUTES = [-44, -38, -32, -26]
  const binsPos = []
  CHUTES.forEach((chx, i) => {
    const rampa = caja(1.6, 0.12, 3.4, mat(0x8fd0bd + i * 0, { color: 0x9aa3b2, metalness: 0.5, roughness: 0.35 }))
    rampa.position.set(chx, SORTER.h - 0.15, SORTER.z + 2.9)
    rampa.rotation.x = 0.42
    escena.add(rampa)
    ;[-0.85, 0.85].forEach((bz) => {
      const borde = caja(1.7, 0.3, 0.08, mat(0x47536b))
      borde.position.set(chx, SORTER.h + 0.05, SORTER.z + 2.9 + bz)
      borde.rotation.x = 0.42
      escena.add(borde)
    })
    const binZ = SORTER.z + 5.2
    binsPos.push({ x: chx, z: binZ })
    const colores = [COL.gold, COL.teal, COL.steel, COL.rojo]
    const matBin = mat(colores[i], { roughness: 0.6, metalness: 0.2 })
    ;[[-0.95, 0, 0.1, 1.1, 2.1], [0.95, 0, 0.1, 1.1, 2.1]].forEach((wdef) => {
      const w2 = caja(wdef[2], wdef[3], wdef[4], matBin); w2.position.set(chx + wdef[0], 0.6, binZ); escena.add(w2)
    })
    ;[[0, -1.0], [0, 1.0]].forEach((wdef) => {
      const w3 = caja(2.0, 1.1, 0.1, matBin); w3.position.set(chx, 0.6, binZ + wdef[1]); escena.add(w3)
    })
    for (let bb = 0; bb < 3; bb++) {
      const bx2 = caja(0.6, 0.5, 0.6, matCarton)
      bx2.position.set(chx - 0.4 + bb * 0.42, 0.32 + (bb % 2) * 0.18, binZ + (bb % 2 ? 0.3 : -0.25))
      escena.add(bx2)
    }
  })
  // Alimentador: banda corta desde el muelle hacia la clasificadora
  const feeder = caja(0.9, 0.75, 9.5, mat(0x2b3850, { roughness: 0.55, metalness: 0.3 }))
  en(feeder, SORTER.x1 + 1.2, 0.95, SORTER.z - 5.9)
  const feederCinta = caja(0.7, 0.08, 9.3, mat(0x10141d, { roughness: 0.3 }))
  en(feederCinta, SORTER.x1 + 1.2, 1.37, SORTER.z - 5.9)
  // Racks al fondo y al costado
  function rack(x, z, rotY) {
    const g = new THREE.Group()
    const L = 10, D = 2.4, H = 7
    ;[-L / 2, L / 2].forEach((px3) => {
      ;[-D / 2, D / 2].forEach((pz3) => {
        const p4 = caja(0.26, H, 0.26, mat(COL.steel, { roughness: 0.5, metalness: 0.35 })); p4.position.set(px3, H / 2, pz3); g.add(p4)
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
  rack(-46, -40, 0); rack(-33, -40, 0); rack(-20, -40, 0)
  rack(-12.5, -30, Math.PI / 2)
  // Pallets sueltos + montacargas (2) + personal
  ;[[-14, -20], [-16.5, -19], [-47, -20]].forEach((pp, i) => {
    const pal = caja(1.3, 0.14, 1.3, mat(0x9a7648, { roughness: 1 })); en(pal, pp[0], 0.12, pp[1])
    const bx3 = caja(1.1, 0.95, 1.1, matCarton); en(bx3, pp[0], 0.7, pp[1])
    if (i % 2 === 0) { const bx4 = caja(0.9, 0.8, 0.9, matCarton); en(bx4, pp[0] + 0.05, 1.6, pp[1] - 0.04) }
  })
  function montacargas() {
    const g = new THREE.Group()
    const mcpo = caja(2.2, 1.35, 1.6, mat(COL.gold, { roughness: 0.4, metalness: 0.3 })); mcpo.position.set(0, 1.0, 0); g.add(mcpo)
    ;[[-0.85, -0.7], [-0.85, 0.7], [0.75, -0.7], [0.75, 0.7]].forEach((p5) => {
      const poste = caja(0.1, 1.5, 0.1, mat(0x2b3242)); poste.position.set(p5[0], 2.4, p5[1]); g.add(poste)
    })
    const techoM = caja(1.9, 0.1, 1.6, mat(0x2b3242)); techoM.position.set(-0.05, 3.15, 0); g.add(techoM)
    const mastil = caja(0.22, 3.4, 1.35, mat(0x6d7786, { metalness: 0.4, roughness: 0.4 })); mastil.position.set(1.32, 1.75, 0); g.add(mastil)
    ;[-0.4, 0.4].forEach((fz) => { const h2 = caja(1.15, 0.1, 0.28, mat(0x10141d)); h2.position.set(1.95, 0.5, fz); g.add(h2) })
    const cargaM = caja(1.15, 1.0, 1.15, matCarton); cargaM.position.set(1.95, 1.1, 0); g.add(cargaM)
    ;[[-0.7, 0.8], [0.7, 0.8], [-0.7, -0.8], [0.7, -0.8]].forEach((w4) => {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), mat(0x14181f, { roughness: 0.5 }))
      tire.rotation.x = Math.PI / 2; tire.position.set(w4[0], 0.42, w4[1]); tire.castShadow = true; g.add(tire)
      const rin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12), mat(0xb9c1cd, { metalness: 0.7, roughness: 0.3 }))
      rin.rotation.x = Math.PI / 2; rin.position.set(w4[0], 0.42, w4[1]); g.add(rin)
    })
    const baliza = caja(0.14, 0.14, 0.14, mat(0xffb020, { emissive: 0xffb020, emissiveIntensity: 1.8 }))
    baliza.position.set(-0.05, 3.3, 0); g.add(baliza)
    escena.add(g); return g
  }
  const monta1 = montacargas()
  const monta2 = montacargas()
  const RUTA_M1 = [{ x: -46, z: -35 }, { x: -20, z: -35 }, { x: -20, z: -32 }, { x: -46, z: -32 }, { x: -46, z: -35 }]
  const RUTA_M2 = [{ x: -14, z: -24 }, { x: -14, z: -36, pausa: 1.2 }, { x: -17, z: -36 }, { x: -17, z: -24, pausa: 1 }, { x: -14, z: -24 }]
  function persona(x, z, rot) {
    const g = new THREE.Group()
    const piernas = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.8, 10), mat(0x25324b)); piernas.position.y = 0.4; g.add(piernas)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.38, 0.75, 10), mat(COL.navy)); torso.position.y = 1.15; torso.castShadow = true; g.add(torso)
    const chaleco = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.42, 0.55, 10), mat(COL.gold, { emissive: COL.gold, emissiveIntensity: 0.3 })); chaleco.position.y = 1.2; g.add(chaleco)
    ;[-0.45, 0.45].forEach((bz2) => {
      const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 8), mat(COL.navy))
      brazo.position.set(0.12, 1.2, bz2); brazo.rotation.x = bz2 > 0 ? -0.5 : 0.5; g.add(brazo)
    })
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat(0xd9a877)); cabeza.position.y = 1.85; cabeza.castShadow = true; g.add(cabeza)
    const casco = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, 1.25), mat(COL.gold, { roughness: 0.35 })); casco.position.y = 1.9; g.add(casco)
    g.position.set(x, 0, z); g.rotation.y = rot || 0
    escena.add(g); return g
  }
  // Un operador por rampa (mirando a la línea) + uno en el muelle + un caminante
  const operadores = binsPos.map((b2) => persona(b2.x + 1.3, b2.z - 0.4, Math.PI))
  persona(SORTER.x1 + 2.6, SORTER.z - 8.5, 0.4)
  const caminante = persona(-24, -34, -0.6)
  // Cajas sobre la clasificadora: cada una con rampa destino
  const cajasLinea = []
  for (let cb = 0; cb < 7; cb++) {
    const b3 = caja(0.95, 0.85, 0.95, matCarton)
    b3.userData.offset = cb * 5.3
    b3.userData.chute = CHUTES[cb % CHUTES.length]
    escena.add(b3); cajasLinea.push(b3)
  }
  // Cajas del alimentador
  const cajasFeeder = []
  for (let cf = 0; cf < 3; cf++) {
    const b4 = caja(0.8, 0.7, 0.8, matCarton)
    escena.add(b4); cajasFeeder.push(b4)
  }

  // ── Zona Freight + casas + árboles + faroles (contexto) ──────────────────
  function pila(x, z, rad, h, tx) {
    const p6 = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 26, 1), mat(0xffffff, { map: tx, roughness: 1 }))
    p6.position.set(x, h / 2, z); p6.castShadow = true; p6.receiveShadow = true
    escena.add(p6)
  }
  pila(-34, 26, 5.4, 3.4, texGrava)
  pila(-24, 30, 4.2, 2.7, texArena)
  pila(-36, 34, 3.4, 2.2, texGrava)
  const tolva = new THREE.Group()
  const tv1 = caja(4.6, 4.4, 4.6, mat(COL.steel, { map: texCorrugado('#3d5a80', 'rgba(0,0,0,.3)', 'rgba(255,255,255,.12)'), roughness: 0.55, metalness: 0.35 })); tv1.position.set(0, 4.6, 0); tolva.add(tv1)
  const tv2 = new THREE.Mesh(new THREE.ConeGeometry(3.1, 2.6, 4), mat(0x2e4664, { roughness: 0.5, metalness: 0.4 }))
  tv2.rotation.y = Math.PI / 4; tv2.rotation.x = Math.PI; tv2.position.set(0, 1.6, 0); tolva.add(tv2)
  ;[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach((pz4) => {
    const pata2 = caja(0.34, 3.2, 0.34, mat(0x2b3850)); pata2.position.set(pz4[0], 1.6, pz4[1]); tolva.add(pata2)
  })
  tolva.position.set(-16, 0, 28); escena.add(tolva)
  ;[[-28, 21], [-20, 24], [-12, 22]].forEach((cc) => {
    const cono = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 14), mat(0xd96c3b, { roughness: 0.6 }))
    cono.position.set(cc[0], 0.48, cc[1]); cono.castShadow = true; escena.add(cono)
    const anillo = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 0.14, 14), mat(0xf4f5f7, { emissive: 0xf4f5f7, emissiveIntensity: oscuro ? 0.4 : 0.05 }))
    anillo.position.set(cc[0], 0.52, cc[1]); escena.add(anillo)
  })
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
    const marco = caja(1.5, 1.25, 0.1, mat(0xffffff)); marco.position.set(-1.3, 1.7, 2.22); g.add(marco)
    const vid = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 1.0), matVentana); vid.position.set(-1.3, 1.7, 2.29); g.add(vid)
    const arbusto = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(0x5d7a4e, { roughness: 1 })); arbusto.position.set(-2.1, 0.5, 2.4); arbusto.castShadow = true; g.add(arbusto)
    g.position.set(x, 0, z); g.rotation.y = rot || 0
    escena.add(g)
  }
  casa(22, 20, COL.rojo, -0.5); casa(32, 25, COL.gold, 0.25); casa(24, 32, COL.steel, 0.1); casa(35, 35, COL.teal, -0.3)
  function arbol(x, z, s2) {
    const g = new THREE.Group()
    const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s2, 0.3 * s2, 1.5 * s2, 8), mat(0x7e5f3e, { roughness: 1 })); tronco.position.y = 0.75 * s2; tronco.castShadow = true; g.add(tronco)
    ;[[0, 2.4, 0, 1.45], [0.7, 2.0, 0.4, 0.95], [-0.6, 2.1, -0.3, 1.0]].forEach((b5, i) => {
      const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(b5[3] * s2, 0), mat(i % 2 ? 0x55724a : 0x6b8a58, { roughness: 1 }))
      copa.position.set(b5[0] * s2, b5[1] * s2, b5[2] * s2); copa.castShadow = true; g.add(copa)
    })
    g.position.set(x, 0, z); g.rotation.y = x * 1.7
    escena.add(g)
  }
  arbol(16, 26, 1); arbol(29, 15, 0.8); arbol(40, 28, 1.2); arbol(18, 38, 0.9); arbol(38, -14, 1.1); arbol(10, -14, 0.8); arbol(46, 10, 1)
  const cabezasLamp = []
  ;[[-34, 6.6, 0], [10, 6.6, 0], [42, 6.6, 0], [6.6, -32, 1], [6.6, 18, 1], [-6.6, 38, 1]].forEach((lp) => {
    const g = new THREE.Group()
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.4, 10), mat(0x2b3242, { metalness: 0.4, roughness: 0.5 }))
    poste.position.y = 3.2; poste.castShadow = true; g.add(poste)
    const brazo2 = caja(1.6, 0.12, 0.12, mat(0x2b3242)); brazo2.position.set(lp[2] ? 0 : -0.7, 6.3, lp[2] ? -0.7 : 0)
    if (lp[2]) brazo2.rotation.y = Math.PI / 2
    g.add(brazo2)
    const cab3 = caja(0.75, 0.18, 0.32, mat(0xf0e6c8, { emissive: 0xffe3ae, emissiveIntensity: oscuro ? 1.6 : 0.0 }))
    cab3.position.set(lp[2] ? 0 : -1.35, 6.22, lp[2] ? -1.35 : 0)
    g.add(cab3); cabezasLamp.push(cab3)
    if (oscuro) {
      const halo2 = new THREE.Sprite(matGlow); halo2.scale.set(4, 4, 1)
      halo2.position.copy(cab3.position).add(new THREE.Vector3(0, -0.3, 0)); g.add(halo2)
    }
    g.position.set(lp[0], 0, lp[1])
    escena.add(g)
  })
  if (oscuro) {
    const plCalle = new THREE.PointLight(0xffe3ae, 0.5, 44, 2); plCalle.position.set(0, 8, 0); escena.add(plCalle)
    const plPatio = new THREE.PointLight(0xffe3ae, 0.6, 50, 2); plPatio.position.set(-24, 9, -8); escena.add(plPatio)
  }

  // ── Cámara + modos ────────────────────────────────────────────────────────
  const T0 = new THREE.Vector3(-16, 2, -10)
  const TI = new THREE.Vector3(-32, 3.5, -28)
  const orb = { th: 0.66, ph: 0.58, r: 72, tgt: T0.clone() }
  const meta = { th: 0.66, ph: 0.58, r: 72 }
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
  const puntoPuertaFuera = new THREE.Vector3(ALM.puertaX, 3.6, ALM.z2 + 17)
  const puntoDentro = new THREE.Vector3(ALM.puertaX - 2, 4.2, czm + 6)
  function alternarAlmacen() {
    if (modo === 'fuera') {
      modo = 'entrando'; alCambiarModo('entrando')
      volar(puntoPuertaFuera, new THREE.Vector3(ALM.puertaX, 4, ALM.z2), 1500, () => {
        volar(puntoDentro, TI, 1900, () => {
          modo = 'dentro'; alCambiarModo('dentro')
          const rel = camara.position.clone().sub(TI)
          orb.tgt.copy(TI)
          orb.r = 14; meta.r = 14
          orb.th = Math.atan2(rel.z, rel.x); meta.th = orb.th
          orb.ph = 1.08; meta.ph = 1.08
        })
      })
    } else if (modo === 'dentro') {
      modo = 'saliendo'; alCambiarModo('saliendo')
      volar(new THREE.Vector3(ALM.puertaX, 3.6, ALM.z2 + 8), new THREE.Vector3(ALM.puertaX, 3.5, ALM.z2 + 22), 1500, () => {
        orb.tgt.copy(T0); orb.th = 0.66; orb.ph = 0.58; orb.r = 72
        meta.th = orb.th; meta.ph = orb.ph; meta.r = orb.r
        volar(posOrbita(orb, T0), T0, 1600, () => { modo = 'fuera'; alCambiarModo('fuera') })
      })
    }
  }
  const zoomMas = () => { meta.r = clamp(meta.r * 0.78, modo === 'dentro' ? 7 : 16, modo === 'dentro' ? 22 : 120) }
  const zoomMenos = () => { meta.r = clamp(meta.r / 0.78, modo === 'dentro' ? 7 : 16, modo === 'dentro' ? 22 : 120) }
  const centrar = () => {
    if (modo === 'dentro') { meta.r = 14 } else { meta.th = 0.66; meta.ph = 0.58; meta.r = 72 }
  }
  function alRueda(e) {
    e.preventDefault()
    meta.r = clamp(meta.r * (e.deltaY > 0 ? 1.09 : 1 / 1.09), modo === 'dentro' ? 7 : 16, modo === 'dentro' ? 22 : 120)
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
    meta.ph = clamp(meta.ph - (e.clientY - drag.y) * 0.0045, modo === 'dentro' ? 0.85 : 0.3, modo === 'dentro' ? 1.5 : 1.25)
    drag = { x: e.clientX, y: e.clientY }
  }
  function soltar() { drag = null; cont.classList.remove('arrastrando') }
  renderer.domElement.addEventListener('pointerdown', alBajar)
  renderer.domElement.addEventListener('pointermove', alMover)
  renderer.domElement.addEventListener('pointerup', soltar)
  renderer.domElement.addEventListener('pointercancel', soltar)

  // ── Rutas con waypoints (vehículos que entran/salen y montacargas) ───────
  function prepararRuta(pts) {
    const segs = []
    let total = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].z - pts[i].z
      const len = Math.hypot(dx, dz)
      segs.push({ a: pts[i], b: pts[i + 1], len, ini: total, pausa: pts[i + 1].pausa || 0 })
      total += len
      if (pts[i + 1].pausa) total += 0 // la pausa se maneja por tiempo
    }
    return { segs, total }
  }
  function seguirRuta(obj, ruta, dist) {
    // dist ∈ [0, total): posición + orientación a lo largo de la polilínea.
    let d = dist % ruta.total
    for (const sg of ruta.segs) {
      if (d <= sg.len) {
        const f = sg.len ? d / sg.len : 0
        obj.position.set(sg.a.x + (sg.b.x - sg.a.x) * f, 0, sg.a.z + (sg.b.z - sg.a.z) * f)
        obj.rotation.y = Math.atan2(-(sg.b.z - sg.a.z), sg.b.x - sg.a.x)
        return
      }
      d -= sg.len
    }
  }
  const rutaPatio = prepararRuta(RUTA_PATIO)
  const rutaM1 = prepararRuta(RUTA_M1)
  const rutaM2 = prepararRuta(RUTA_M2)

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
      // Tráfico de las vías
      const vx1 = -140 + ((s * 10) % 280); volteo1.position.set(vx1, 0, 2.3)
      const vx2 = 140 - ((s * 9 + 90) % 280); volteo2.position.set(vx2, 0, -2.3)
      const vz2 = 140 - ((s * 11 + 150) % 280); van2.position.set(-2.3, 0, vz2); van2.rotation.y = Math.PI / 2
      const vt = -140 + ((s * 8.2 + 50) % 280); trailerVia.position.set(vt, 0, 2.3)
      // Van del patio: entra, pasa por el portón, da la vuelta y sale
      seguirRuta(vanPatio, rutaPatio, s * 6.5)
      // Van exterior 1 circula por la vía Z
      const vz1 = -140 + ((s * 12 + 60) % 280); van1.position.set(2.3, 0, vz1); van1.rotation.y = -Math.PI / 2
      ;[volteo1, volteo2, van1, van2, trailerVia, vanPatio].forEach((v) => { v.ruedas.forEach((w5) => { w5.rotation.y += 0.18 }) })
      // CLASIFICADORA: cajas avanzan y se desvían por su rampa
      for (const b6 of cajasLinea) {
        const ciclo = (s * 2.6 + b6.userData.offset) % (lineaL + 14)
        const lx = SORTER.x1 + ciclo
        if (lx < b6.userData.chute || lx > SORTER.x2 - 0.5) {
          // sobre la línea (o reiniciando)
          if (lx <= SORTER.x2 - 0.5) {
            b6.visible = true
            b6.position.set(lx, SORTER.h + 0.95, SORTER.z)
            b6.rotation.y = 0
          } else b6.visible = false
        } else {
          // bajando por la rampa hacia el contenedor
          const fDesvio = Math.min((lx - b6.userData.chute) / 4.2, 1)
          if (fDesvio >= 1) { b6.visible = false } else {
            b6.visible = true
            b6.position.set(
              b6.userData.chute,
              SORTER.h + 0.95 - fDesvio * (SORTER.h + 0.2),
              SORTER.z + fDesvio * 4.6
            )
            b6.rotation.y = fDesvio * 0.5
          }
        }
      }
      // Alimentador: cajas que llegan del muelle a la línea
      for (let cf2 = 0; cf2 < cajasFeeder.length; cf2++) {
        const fz2 = ((s * 2.2 + cf2 * 3.4) % 9.5)
        cajasFeeder[cf2].position.set(SORTER.x1 + 1.2, 1.75, SORTER.z - 10.6 + fz2)
      }
      // Montacargas patrullando
      seguirRuta(monta1, rutaM1, s * 3.2)
      seguirRuta(monta2, rutaM2, s * 2.6)
      // Caminante + operadores con leve vaivén (trabajando)
      caminante.position.x = -24 + Math.sin(s * 0.5) * 5
      caminante.rotation.y = Math.cos(s * 0.5) > 0 ? Math.PI / 2 : -Math.PI / 2
      operadores.forEach((op, i) => { op.rotation.y = Math.PI + Math.sin(s * 1.6 + i) * 0.18 })
      if (modo === 'fuera' && !anim && t - ultimaInteraccion > 4000) meta.th += 0.00045
    } else {
      volteo1.position.set(-24, 0, 2.3); volteo2.position.set(30, 0, -2.3)
      van1.position.set(2.3, 0, 28); van1.rotation.y = -Math.PI / 2
      van2.position.set(-2.3, 0, -20); van2.rotation.y = Math.PI / 2
      trailerVia.position.set(14, 0, 2.3)
      seguirRuta(vanPatio, rutaPatio, rutaPatio.total * 0.42)
      seguirRuta(monta1, rutaM1, 4); seguirRuta(monta2, rutaM2, 3)
      cajasLinea.forEach((b7, i) => { b7.position.set(SORTER.x1 + 3 + i * 4.4, SORTER.h + 0.95, SORTER.z) })
      cajasFeeder.forEach((b8, i) => { b8.position.set(SORTER.x1 + 1.2, 1.75, SORTER.z - 10 + i * 3.2) })
    }
    const abierta = modo !== 'fuera'
    puerta.position.y += ((abierta ? puertaAbiertaY : puertaCerradaY) - puerta.position.y) * (reduce ? 1 : 0.06)
    if (anim) {
      const p7 = clamp((t - anim.t0) / anim.dur, 0, 1)
      const e2 = easeInOut(p7)
      camara.position.lerpVectors(anim.desde.pos, anim.hasta.pos, e2)
      orb.tgt.lerpVectors(anim.desde.tgt, anim.hasta.tgt, e2)
      camara.lookAt(orb.tgt)
      if (p7 >= 1) { const fin = anim.alTerminar; anim = null; if (fin) fin() }
    } else {
      const f2 = reduce ? 1 : 0.08
      orb.th += (meta.th - orb.th) * f2
      orb.ph += (meta.ph - orb.ph) * f2
      orb.r += (meta.r - orb.r) * f2
      camara.position.copy(posOrbita(orb, orb.tgt))
      camara.lookAt(orb.tgt)
    }
    renderer.render(escena, camara)
  }
  ajustar()
  camara.position.set(85, 58, 105)
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
