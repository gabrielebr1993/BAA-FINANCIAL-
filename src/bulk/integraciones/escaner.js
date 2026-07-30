// BULK · "Escáner" de documentos en el navegador (sin dependencias pesadas).
// Toma la foto del ticket y la procesa para que el OCR la lea mejor: escala de
// grises + estiramiento de contraste + realce (gamma). No hace recorte de bordes
// (eso requiere OpenCV); esto ya mejora bastante la lectura de tickets de báscula.
export function escanearParaOCR(dataURL) {
  return new Promise((resolve) => {
    if (!dataURL) return resolve(dataURL)
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.width; c.height = img.height
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const imgData = ctx.getImageData(0, 0, c.width, c.height)
        const px = imgData.data
        const n = px.length / 4
        const g = new Float32Array(n)
        let min = 255, max = 0
        for (let i = 0, j = 0; i < px.length; i += 4, j++) {
          const v = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
          g[j] = v; if (v < min) min = v; if (v > max) max = v
        }
        const range = Math.max(1, max - min)
        for (let i = 0, j = 0; i < px.length; i += 4, j++) {
          let v = (g[j] - min) * 255 / range        // estira contraste
          v = 255 * Math.pow(v / 255, 0.72)          // realza (gamma) para separar tinta del fondo
          px[i] = px[i + 1] = px[i + 2] = v
        }
        ctx.putImageData(imgData, 0, 0)
        resolve(c.toDataURL('image/jpeg', 0.85))
      } catch { resolve(dataURL) }
    }
    img.onerror = () => resolve(dataURL)
    img.src = dataURL
  })
}
