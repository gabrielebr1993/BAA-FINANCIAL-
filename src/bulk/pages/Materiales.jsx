import CatalogoSimple from './CatalogoSimple'
import { MATERIALES_SEED } from '../domain/constants'

export default function Materiales() {
  return <CatalogoSimple titulo="Materiales" coleccion="materials" entidad="material" semilla={MATERIALES_SEED} />
}
