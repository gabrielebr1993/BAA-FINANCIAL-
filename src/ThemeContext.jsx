// Contexto de tema claro/oscuro. PERSISTIDO en localStorage: al recargar o
// actualizar la app se mantiene el tema elegido (no se reinicia a claro).
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()
export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(() => {
    try { return localStorage.getItem('milepay_tema') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
  })

  useEffect(() => {
    const root = document.documentElement
    if (tema === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    try { localStorage.setItem('milepay_tema', tema) } catch { /* noop */ }
  }, [tema])

  const alternar = () => setTema((t) => (t === 'dark' ? 'light' : 'dark'))

  return <ThemeContext.Provider value={{ tema, oscuro: tema === 'dark', setTema, alternar }}>{children}</ThemeContext.Provider>
}
