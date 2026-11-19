// Login del módulo Package (Última milla). Usa el login unificado <ModuleLogin>;
// conserva EXACTO el auth actual: signInWithEmailAndPassword(auth, …) y
// sendPasswordResetEmail(auth, …). La redirección es implícita (al autenticar,
// ProtectedRoute re-renderiza la app). Se eliminó el ticker/datos pre-login.
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from './firebase'
import ModuleLogin from './components/ModuleLogin'

export default function Login() {
  return (
    <ModuleLogin
      moduleId="package"
      onSignIn={(email, pass) => signInWithEmailAndPassword(auth, email, pass)}
      onReset={(email) => sendPasswordResetEmail(auth, email)}
    />
  )
}
