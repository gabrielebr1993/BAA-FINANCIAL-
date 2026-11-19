// Logo MilePay: "MilePay" en Sora 800 + 4 cuadritos de 7px con los 4 colores
// de módulo. Reutilizado en inicio, selector y login.
export default function MilePayLogo({ dark = false, className = '', size = 'text-xl' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-extrabold tracking-tight ${size} ${className}`}>
      <span className={dark ? 'text-white' : 'text-rd-ink'}>MilePay</span>
      <span className="grid grid-cols-2 gap-[2px]" aria-hidden="true">
        {['#3D8BFF', '#F2A900', '#2BC48A', '#9B6BFF'].map((c) => (
          <span key={c} className="h-[7px] w-[7px] rounded-[2px]" style={{ background: c }} />
        ))}
      </span>
    </span>
  )
}
