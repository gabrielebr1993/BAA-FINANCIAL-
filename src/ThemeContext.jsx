// Contexto de tema claro/oscuro. Estado en memoria (sin localStorage) que
// añade/quita la clase `dark` en <html> para la estrategia darkMode:'class'.
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()
export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState('light') // 'light' por defecto

  useEffect(() => {
    const root = document.documentElement
    if (tema === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [tema])

  const alternar = () => setTema((t) => (t === 'dark' ? 'light' : 'dark'))

  return <ThemeContext.Provider value={{ tema, oscuro: tema === 'dark', setTema, alternar }}>{children}</ThemeContext.Provider>
}
