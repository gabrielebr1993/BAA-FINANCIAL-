import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from './firebase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')

  const entrar = async () => {
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, pass)
    } catch {
      setError('Correo o contraseña incorrectos')
    }
  }

  return (
    <div style={{ maxWidth: 340, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h2 style={{ color: '#13233f' }}>Gofo</h2>
      <input placeholder="Correo" value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ width: '100%', padding: 10, marginBottom: 8, boxSizing: 'border-box' }} />
      <input placeholder="Contraseña" type="password" value={pass}
        onChange={e => setPass(e.target.value)}
        style={{ width: '100%', padding: 10, marginBottom: 8, boxSizing: 'border-box' }} />
      <button onClick={entrar}
        style={{ width: '100%', padding: 10, background: '#13233f', color: '#fff', border: 'none', borderRadius: 6 }}>
        Entrar
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  )
}
