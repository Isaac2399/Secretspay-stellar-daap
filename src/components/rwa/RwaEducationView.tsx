import { useState } from 'react'
import { Building2, Landmark, Wallet } from 'lucide-react'

const SLIDES = [
  {
    id: 'tokenizar',
    icon: Building2,
    title: '¿Qué es tokenizar?',
    kicker: 'De lo físico a un token Stellar',
    body: 'Tokenizar es representar un activo real —un local, una flota o una cartera de facturas— como un asset nativo de Stellar (código + cuenta emisora). Quien invierte no “compra un NFT decorativo”: recibe un título digital atado a un contrato en Costa Rica. El token viaja por trustlines; el respaldo sigue siendo el bien y el documento legal.',
  },
  {
    id: 'legal',
    icon: Landmark,
    title: 'Respaldo legal',
    kicker: 'RUGM y fideicomisos',
    body: 'En Costa Rica el respaldo típico es la Garantía Mobiliaria de la Ley 9078, inscrita en el RUGM, o un fideicomiso que segrega el bien. El panel interno registra el número RUGM o el hash del contrato antes de publicar. Sin ese expediente, el token no sale al mercado.',
  },
  {
    id: 'dividendos',
    icon: Wallet,
    title: 'Dividendos automáticos',
    kicker: 'Alquiler y cuotas en USDC',
    body: 'Cuando el activo genera renta, cuotas de deuda o cobro de facturas, ese flujo se liquida en USDC hacia las wallets Stellar de los inversionistas. El calendario (mensual o trimestral) queda en la ficha del activo. Usted ve el ingreso en el saldo USDC y en “Mis dividendos”, con memo de pago.',
  },
] as const

export function RwaEducationView() {
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index] ?? SLIDES[0]
  const Icon = slide.icon

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Aprender RWA
        </p>
        <h1 className="mt-1 text-xl font-semibold">Activos reales, en su wallet</h1>
        <p className="mt-1 text-sm text-app-muted">
          Una guía corta para empresas e inversionistas en Costa Rica. Sin jerga innecesaria.
        </p>
      </div>

      <article className="rounded-[24px] bg-app-card p-5">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-app-chip text-app-accent">
          <Icon className="h-5 w-5" />
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-app-accent">
          {slide.kicker}
        </p>
        <h2 className="mt-1 text-[17px] font-semibold">{slide.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/80">{slide.body}</p>
      </article>

      <div className="flex items-center justify-center gap-2">
        {SLIDES.map((item, slideIndex) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.title}
            onClick={() => setIndex(slideIndex)}
            className={`h-2 rounded-full transition-all ${
              slideIndex === index ? 'w-6 bg-app-accent' : 'w-2 bg-white/20'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SLIDES.map((item, slideIndex) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setIndex(slideIndex)}
            className={`rounded-2xl px-2 py-2.5 text-[11px] font-medium ${
              slideIndex === index
                ? 'bg-app-accent text-white'
                : 'bg-app-chip text-white/70'
            }`}
          >
            {slideIndex + 1}. {item.title.split(' ')[0]}
          </button>
        ))}
      </div>
    </section>
  )
}
