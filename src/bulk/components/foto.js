// Lee un File de imagen y devuelve un dataURL JPEG reducido (~máx 900px, calidad
// 0.7) para poder guardarlo sin exceder el límite de documento de Firestore.
// En producción esto se subirá a Storage; aquí queda embebido para levantar el flujo.
export function leerFotoReducida(file, maxLado = 900, calidad = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null)
    const fr = new FileReader()
    fr.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width: w, height: h } = img
        if (w > h && w > maxLado) { h = Math.round(h * maxLado / w); w = maxLado }
        else if (h > maxLado) { w = Math.round(w * maxLado / h); h = maxLado }
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(c.toDataURL('image/jpeg', calidad))
      }
      img.onerror = reject
      img.src = fr.result
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}
