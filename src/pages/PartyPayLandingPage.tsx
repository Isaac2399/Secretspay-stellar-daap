import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  CreditCard,
  Globe,
  KeyRound,
  Landmark,
  Mail,
  QrCode,
  Timer,
  TrendingDown,
  Users,
  WifiOff,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import './PartyPayLandingPage.css'

type Lang = 'en' | 'es'

const copy = {
  en: {
    title: 'PartyPay · Live payments on Stellar',
    nav: [
      { href: '#problem', label: 'Problem' },
      { href: '#secrets', label: 'Secrets' },
      { href: '#product', label: 'Product' },
      { href: '#stellar', label: 'Stellar' },
      { href: '#roadmap', label: 'Roadmap' },
    ],
    openApp: 'Open the app',
    signIn: 'Sign in',
    createAccount: 'Create account',
    kicker: 'BAF × Stellar Builder Challenge',
    hero: 'High-speed custodial payment infrastructure built on Stellar for live events and high-volume merchants.',
    partnerPill: 'Validated B2B partner: Secrets, Costa Rica',
    dexPill: 'Stellar native DEX rails',
    stats: [
      ['< 1s', 'Transaction finality'],
      ['< $0.001', 'Cost per settlement'],
      ['2,000–5,000', 'Attendees at the anchor venue'],
    ],
    problemKicker: '01 · Problem validation',
    problemTitle: 'The high cost of checkout friction',
    problemLede: 'In a packed venue, every second of waiting is a sale that walks away.',
    secretsKicker: '02 · Market and partner',
    secretsTitle: 'Anchor client: Secrets',
    secretsLede: 'Direct B2B partnership with Secrets, a live-event organizer in Costa Rica.',
    secretsBody:
      'A real venue for testing payment throughput at the gate and the bars, with a dense audience of 2,000 to 5,000 people.',
    secretsAlt: 'Neon Secrets sign at the venue',
    attendeesTitle: '2,000 – 5,000 attendees',
    attendeesBody: 'Peak-load testing at the entrance and the bars, not a desktop demo.',
    modelTitle: 'Sustainable model',
    modelBody: 'A per-transaction fee, co-designed for the venue’s long-term profitability.',
    productKicker: '03 · Usability',
    productTitle: 'Frictionless custodial wallet',
    productLede: 'Attendees do not need to understand Stellar to pay.',
    stellarKicker: '04 · Infrastructure',
    stellarTitle: 'Stellar settlement engine',
    roadmapKicker: '05 · Testing and adoption',
    roadmapTitle: 'Real-world pilot',
    roadmapLede: 'Three phases, from Secrets Halloween to a base that comes back.',
    users: 'users',
    scaleKicker: '06 · Go-to-market',
    scaleTitle: 'Mainnet scale via VISA and MoneyGram',
    scaleLede: 'PartyPay evolves from an event feature into a daily payment wallet.',
    advantageKicker: '07 · Advantage',
    advantageTitle: 'Why PartyPay wins',
    criteriaKicker: '08 · Builder Challenge',
    criteriaTitle: 'Aligned with the evaluation criteria',
    futureKicker: 'Future outlook',
    futureTitle: 'From Costa Rica events to global mainnet retail',
    futureBody:
      'We have the validated problem, the B2B client (Secrets), and the sub-second power of Stellar.',
    footer: 'PartyPay · custodial payments for live events · Costa Rica',
    toSpanish: 'Translate to Spanish',
  },
  es: {
    title: 'PartyPay · Pagos en vivo sobre Stellar',
    nav: [
      { href: '#problem', label: 'Problema' },
      { href: '#secrets', label: 'Secrets' },
      { href: '#product', label: 'Producto' },
      { href: '#stellar', label: 'Stellar' },
      { href: '#roadmap', label: 'Ruta' },
    ],
    openApp: 'Abrir la app',
    signIn: 'Entrar',
    createAccount: 'Crear cuenta',
    kicker: 'BAF × Stellar Builder Challenge',
    hero: 'Infraestructura de pagos custodial de alta velocidad, construida sobre Stellar para eventos en vivo y comercios de alto volumen.',
    partnerPill: 'Socio B2B validado: Secrets, Costa Rica',
    dexPill: 'Rieles del DEX nativo de Stellar',
    stats: [
      ['< 1s', 'Finalidad de la transacción'],
      ['< $0.001', 'Costo por liquidación'],
      ['2,000–5,000', 'Asistentes en el venue ancla'],
    ],
    problemKicker: '01 · Validación del problema',
    problemTitle: 'El alto costo de la fricción en el checkout',
    problemLede: 'En un venue lleno, cada segundo de espera es una venta que se va.',
    secretsKicker: '02 · Mercado y socio',
    secretsTitle: 'Cliente ancla: Secrets',
    secretsLede: 'Alianza B2B directa con Secrets, organizador de eventos en vivo en Costa Rica.',
    secretsBody:
      'Venue real para probar el throughput de pagos en el acceso y en las barras, con una audiencia densa de 2,000 a 5,000 personas.',
    secretsAlt: 'Letrero de neón de Secrets en el venue',
    attendeesTitle: '2,000 – 5,000 asistentes',
    attendeesBody: 'Prueba de pico en entrada y barras, no en un demo de escritorio.',
    modelTitle: 'Modelo sostenible',
    modelBody: 'Captura de comisión por transacción, co-diseñada para la rentabilidad del venue.',
    productKicker: '03 · Usabilidad',
    productTitle: 'Wallet custodial sin fricción',
    productLede: 'El asistente no tiene que entender Stellar para pagar.',
    stellarKicker: '04 · Infraestructura',
    stellarTitle: 'Motor de liquidación Stellar',
    roadmapKicker: '05 · Pruebas y adopción',
    roadmapTitle: 'Piloto en el mundo real',
    roadmapLede: 'Tres fases, del Halloween de Secrets a una base que se repite.',
    users: 'usuarios',
    scaleKicker: '06 · Go-to-market',
    scaleTitle: 'Escala a mainnet con VISA y MoneyGram',
    scaleLede: 'PartyPay pasa de ser una función de evento a una wallet de uso diario.',
    advantageKicker: '07 · Ventaja',
    advantageTitle: 'Por qué gana PartyPay',
    criteriaKicker: '08 · Builder Challenge',
    criteriaTitle: 'Alineado con los criterios de evaluación',
    futureKicker: 'Futuro',
    futureTitle: 'De los eventos en Costa Rica al retail global en mainnet',
    futureBody:
      'Tenemos el problema validado, el cliente B2B (Secrets) y la potencia sub-segundo de Stellar.',
    footer: 'PartyPay · pagos custodiales para eventos en vivo · Costa Rica',
    toSpanish: 'Traducir al español',
  },
} as const

const problems = [
  {
    icon: Timer,
    title: { en: 'Endless bar and gate queues', es: 'Filas en barra y acceso' },
    body: {
      en: 'Multi-second payment latencies stall entrance gates and beverage sales in dense venues.',
      es: 'Latencias de varios segundos frenan las entradas y la venta de bebidas en venues densos.',
    },
  },
  {
    icon: TrendingDown,
    title: { en: 'Direct revenue drop-off', es: 'Caída directa de ingresos' },
    body: {
      en: 'Frustrated attendees abandon the line, and those sales are not recovered.',
      es: 'Los asistentes abandonan la fila. Esas ventas no se recuperan.',
    },
  },
  {
    icon: WifiOff,
    title: { en: 'Outages and fees', es: 'Caídas de red y comisiones' },
    body: {
      en: 'Legacy card terminals fail during peak hours, on top of high processing fees.',
      es: 'Los datáfonos fallan en hora pico, encima de comisiones altas de procesamiento.',
    },
  },
]

const product = [
  {
    icon: Mail,
    title: { en: 'Email and password', es: 'Email y contraseña' },
    body: {
      en: 'The wallet is created instantly with ordinary credentials, without web3 complexity.',
      es: 'La wallet se crea al instante con credenciales normales, sin complejidad web3.',
    },
  },
  {
    icon: KeyRound,
    title: { en: 'Zero seed phrases', es: 'Cero seed phrases' },
    body: {
      en: 'Custodial keys remove the technical barrier for any attendee.',
      es: 'La custodia de llaves quita la barrera técnica para cualquier asistente.',
    },
  },
  {
    icon: Landmark,
    title: { en: 'Local fiat rails', es: 'Rieles fiat locales' },
    body: {
      en: 'Top-ups integrated with Costa Rican banking rails.',
      es: 'Recargas integradas con la banca de Costa Rica.',
    },
  },
  {
    icon: QrCode,
    title: { en: 'Self-explanatory UX', es: 'UX autoexplicativa' },
    body: {
      en: 'One-tap QR checkout. People pay without anyone having to explain the flow.',
      es: 'Checkout QR de un toque. Se paga sin que nadie tenga que explicar el flujo.',
    },
  },
]

const stellar = [
  {
    icon: Zap,
    stat: '< 1s',
    title: { en: 'Sub-second speed', es: 'Velocidad sub-segundo' },
    body: {
      en: 'Instant finality so the gate and the bar never stop.',
      es: 'Finalidad inmediata para que el acceso y la barra no se detengan.',
    },
  },
  {
    icon: ArrowLeftRight,
    stat: 'Auto',
    title: { en: 'Path payments', es: 'Path payments' },
    body: {
      en: 'Background asset swaps, executed atomically on the native Stellar DEX.',
      es: 'Swaps de activos en segundo plano, atómicos, vía el DEX nativo de Stellar.',
    },
  },
  {
    icon: Banknote,
    stat: '< $0.001',
    title: { en: 'Ultra-low overhead', es: 'Overhead mínimo' },
    body: {
      en: 'Fraction-of-a-cent fees that leave venue and vendor margins intact.',
      es: 'Fracciones de centavo que dejan intacto el margen del venue y del vendor.',
    },
  },
]

const phases = [
  {
    phase: { en: 'Phase 1', es: 'Fase 1' },
    when: { en: 'Halloween 2026', es: 'Halloween 2026' },
    users: '10 – 50',
    body: {
      en: 'First live deployment, on Halloween night with the Secrets venue.',
      es: 'Primer despliegue en vivo, en la noche de Halloween con el venue Secrets.',
    },
  },
  {
    phase: { en: 'Phase 2', es: 'Fase 2' },
    when: { en: "New Year's Eve 2026", es: 'Nochevieja 2026' },
    users: '50 – 100',
    body: {
      en: 'Stress test during the end-of-year nightlife peak.',
      es: 'Prueba de estrés en el pico de la vida nocturna de fin de año.',
    },
  },
  {
    phase: { en: 'Phase 3', es: 'Fase 3' },
    when: { en: 'Early 2027', es: 'Inicios de 2027' },
    users: '100+',
    body: {
      en: 'A consolidated active base, expanding to recurring venues and retail partners.',
      es: 'Base activa consolidada, hacia venues recurrentes y socios de retail.',
    },
  },
]

const scale = [
  {
    icon: Banknote,
    title: { en: 'MoneyGram cash anchor', es: 'Ancla MoneyGram' },
    body: {
      en: 'Physical cash-in and cash-out points worldwide for custodial balances.',
      es: 'Puntos físicos de cash-in y cash-out en el mundo para los saldos custodiales.',
    },
  },
  {
    icon: CreditCard,
    title: { en: 'VISA anchor', es: 'Ancla VISA' },
    body: {
      en: 'Virtual card issuing so mainnet balances spend at any traditional POS.',
      es: 'Emisión de tarjeta virtual para gastar en mainnet en cualquier POS tradicional.',
    },
  },
  {
    icon: Globe,
    title: { en: 'Universal merchant network', es: 'Red universal de comercios' },
    body: {
      en: 'The same rail leaves the event and enters everyday spending.',
      es: 'El mismo riel sale del evento y entra al gasto de todos los días.',
    },
  },
]

const advantages = [
  {
    n: '01',
    title: { en: 'Real client demand', es: 'Demanda real' },
    body: {
      en: 'Co-designed with Secrets to solve verified live-venue checkout friction.',
      es: 'Co-diseñado con Secrets para una fricción de checkout ya verificada.',
    },
  },
  {
    n: '02',
    title: { en: 'Ultra-light rails', es: 'Rieles ultraligeros' },
    body: {
      en: 'Built on Stellar for near-zero fees and instant execution.',
      es: 'Stellar: comisiones casi nulas y ejecución inmediata.',
    },
  },
  {
    n: '03',
    title: { en: 'Ecosystem gateway', es: 'Puerta al ecosistema' },
    body: {
      en: 'From live-event payments into a universal custodial daily wallet.',
      es: 'Del pago en el evento a una wallet custodial de uso diario.',
    },
  },
]

const criteria = [
  {
    label: { en: 'Problem validation', es: 'Validación del problema' },
    title: { en: 'Secrets venue', es: 'Venue Secrets' },
    body: {
      en: 'Verified with a real operator of 2,000–5,000 attendee events in Costa Rica.',
      es: 'Verificado con un operador real de eventos de 2,000 a 5,000 asistentes en Costa Rica.',
    },
  },
  {
    label: { en: 'Business focus', es: 'Enfoque de negocio' },
    title: { en: 'Mainnet scale', es: 'Escala a mainnet' },
    body: {
      en: 'A fee-capture model that expands to universal retail via VISA and MoneyGram.',
      es: 'Modelo de captura de comisión que se extiende al retail universal vía VISA y MoneyGram.',
    },
  },
  {
    label: { en: 'Product focus', es: 'Enfoque de producto' },
    title: { en: 'Self-guided UX', es: 'UX sin guía' },
    body: {
      en: 'Custodial email login and a simple QR flow, ready for unassisted testing.',
      es: 'Login custodial por email y flujo QR simple, listo para pruebas sin asistencia.',
    },
  },
  {
    label: { en: 'Technical execution', es: 'Ejecución técnica' },
    title: { en: 'Stellar engine', es: 'Motor Stellar' },
    body: {
      en: 'Sub-second settlement, automated DEX path payments, and clear code.',
      es: 'Liquidación en menos de un segundo, path payments automáticos en el DEX y código claro.',
    },
  },
]

type Copy = (typeof copy)[Lang]

function storedLang(): Lang {
  try {
    return localStorage.getItem('partypay-lang') === 'es' ? 'es' : 'en'
  } catch {
    return 'en'
  }
}

function Section({
  id,
  kicker,
  title,
  lede,
  children,
}: {
  id: string
  kicker: string
  title: string
  lede?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/10 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <p className="pp-kicker">{kicker}</p>
        <h2 className="pp-display mt-3 max-w-3xl text-3xl font-bold text-white sm:text-5xl">{title}</h2>
        {lede ? <p className="mt-4 max-w-2xl text-base text-white/60 sm:text-lg">{lede}</p> : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

function AccountActions({
  text,
  user,
  loading,
}: {
  text: Copy
  user: boolean
  loading: boolean
}) {
  if (loading) return null
  if (user) {
    return (
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
      >
        {text.openApp}
        <ArrowRight className="h-4 w-4" />
      </Link>
    )
  }
  return (
    <>
      <Link
        to="/register"
        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
      >
        {text.createAccount}
        <ArrowRight className="h-4 w-4" />
      </Link>
      <Link
        to="/login"
        className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white"
      >
        {text.signIn}
      </Link>
    </>
  )
}

export default function PartyPayLandingPage() {
  const { user, loading } = useAuth()
  const [lang, setLang] = useState<Lang>(storedLang)
  const text = copy[lang]

  useEffect(() => {
    const previousTitle = document.title
    const previousLang = document.documentElement.lang
    document.title = text.title
    document.documentElement.lang = lang
    document.documentElement.classList.add('scroll-smooth')
    return () => {
      document.title = previousTitle
      document.documentElement.lang = previousLang
      document.documentElement.classList.remove('scroll-smooth')
    }
  }, [lang, text.title])

  function chooseLang(next: Lang) {
    setLang(next)
    try {
      localStorage.setItem('partypay-lang', next)
    } catch {
      // The page still switches for this visit.
    }
  }

  return (
    <div className="pp-landing min-h-dvh overflow-x-clip">
      <div className="pp-grid pointer-events-none fixed inset-0" />
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05060a]/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <a href="#top" className="pp-display shrink-0 text-lg font-bold text-white">
            PartyPay
          </a>
          <nav className="hidden items-center gap-6 text-sm text-white/65 md:flex">
            {text.nav.map((item) => (
              <a key={item.href} href={item.href} className="hover:text-white">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-white/15 p-0.5 text-xs font-semibold">
              <button
                type="button"
                aria-pressed={lang === 'en'}
                onClick={() => chooseLang('en')}
                className={`rounded-full px-2.5 py-1.5 ${lang === 'en' ? 'bg-white text-black' : 'text-white/70'}`}
              >
                EN
              </button>
              <button
                type="button"
                aria-pressed={lang === 'es'}
                aria-label={text.toSpanish}
                onClick={() => chooseLang('es')}
                className={`rounded-full px-2.5 py-1.5 ${lang === 'es' ? 'bg-white text-black' : 'text-white/70'}`}
              >
                ES
              </button>
            </div>
            {loading ? null : user ? (
              <Link
                to="/"
                className="rounded-full bg-[var(--pp-green)] px-3 py-2 text-sm font-semibold text-white sm:px-4"
              >
                {text.openApp}
              </Link>
            ) : (
              <Link
                to="/register"
                className="rounded-full bg-[var(--pp-green)] px-3 py-2 text-sm font-semibold text-white sm:px-4"
              >
                {text.createAccount}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="pp-rise max-w-3xl">
            <p className="pp-kicker">{text.kicker}</p>
            <h1 className="pp-display mt-4 text-5xl font-extrabold leading-[0.95] text-white sm:text-7xl">
              PartyPay
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70 sm:text-xl">{text.hero}</p>
            <div className="mt-6 flex flex-wrap gap-2 text-sm text-white/75">
              <span className="rounded-full border border-white/15 px-3 py-1.5">{text.partnerPill}</span>
              <span className="rounded-full border border-white/15 px-3 py-1.5">{text.dexPill}</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <AccountActions text={text} user={Boolean(user)} loading={loading} />
            </div>
          </div>
          <figure className="pp-rise overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl shadow-black/40">
            <video
              className="aspect-video w-full bg-black"
              src="/secrets-venue.mp4"
              controls
              playsInline
              preload="metadata"
              aria-label={lang === 'en' ? 'Secrets venue video' : 'Video del venue Secrets'}
            />
          </figure>
        </section>

        <section className="border-y border-white/10 bg-black/30">
          <dl className="mx-auto grid max-w-6xl gap-px bg-white/10 sm:grid-cols-3">
            {text.stats.map(([value, label]) => (
              <div key={label} className="bg-[#05060a] px-5 py-8">
                <dt className="pp-display text-4xl font-bold text-[var(--pp-mint)]">{value}</dt>
                <dd className="mt-1 text-sm text-white/55">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Section id="problem" kicker={text.problemKicker} title={text.problemTitle} lede={text.problemLede}>
          <div className="grid gap-4 md:grid-cols-3">
            {problems.map((item) => (
              <article key={item.title.en} className="pp-card rounded-3xl p-6">
                <item.icon className="h-5 w-5 text-[var(--pp-mint)]" />
                <h3 className="mt-4 text-lg font-semibold text-white">{item.title[lang]}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{item.body[lang]}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section id="secrets" kicker={text.secretsKicker} title={text.secretsTitle} lede={text.secretsLede}>
          <figure className="overflow-hidden rounded-[28px] border border-white/10">
            <img
              src="/secrets-neon.png"
              alt={text.secretsAlt}
              className="h-72 w-full object-cover object-center sm:h-[28rem]"
            />
          </figure>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <article className="pp-card rounded-3xl p-6">
              <p className="pp-display text-4xl font-bold text-white">Secrets</p>
              <p className="mt-3 text-sm leading-relaxed text-white/60">{text.secretsBody}</p>
            </article>
            <article className="pp-card rounded-3xl p-6">
              <Users className="h-5 w-5 text-[var(--pp-mint)]" />
              <h3 className="mt-4 text-lg font-semibold">{text.attendeesTitle}</h3>
              <p className="mt-2 text-sm text-white/60">{text.attendeesBody}</p>
            </article>
            <article className="pp-card rounded-3xl p-6">
              <Banknote className="h-5 w-5 text-[var(--pp-mint)]" />
              <h3 className="mt-4 text-lg font-semibold">{text.modelTitle}</h3>
              <p className="mt-2 text-sm text-white/60">{text.modelBody}</p>
            </article>
          </div>
        </Section>

        <Section id="product" kicker={text.productKicker} title={text.productTitle} lede={text.productLede}>
          <div className="grid gap-4 sm:grid-cols-2">
            {product.map((item) => (
              <article key={item.title.en} className="pp-card flex gap-4 rounded-3xl p-6">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pp-mint)]" />
                <div>
                  <h3 className="text-lg font-semibold">{item.title[lang]}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{item.body[lang]}</p>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section id="stellar" kicker={text.stellarKicker} title={text.stellarTitle}>
          <div className="grid gap-4 md:grid-cols-3">
            {stellar.map((item) => (
              <article key={item.title.en} className="pp-card rounded-3xl p-6">
                <div className="flex items-center justify-between">
                  <item.icon className="h-5 w-5 text-[var(--pp-mint)]" />
                  <span className="pp-display text-3xl font-bold text-white">{item.stat}</span>
                </div>
                <h3 className="mt-6 text-lg font-semibold">{item.title[lang]}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{item.body[lang]}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section id="roadmap" kicker={text.roadmapKicker} title={text.roadmapTitle} lede={text.roadmapLede}>
          <ol className="grid gap-4 lg:grid-cols-3">
            {phases.map((item, index) => (
              <li key={item.phase.en} className="pp-card relative rounded-3xl p-6">
                <p className="pp-kicker">
                  {item.phase[lang]} · {item.when[lang]}
                </p>
                <p className="pp-display mt-5 text-5xl font-bold text-white">{item.users}</p>
                <p className="mt-1 text-sm text-white/45">{text.users}</p>
                <p className="mt-4 text-sm leading-relaxed text-white/65">{item.body[lang]}</p>
                <span className="mt-6 block text-xs text-white/30">0{index + 1}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="scale" kicker={text.scaleKicker} title={text.scaleTitle} lede={text.scaleLede}>
          <div className="grid gap-4 md:grid-cols-3">
            {scale.map((item) => (
              <article key={item.title.en} className="pp-card rounded-3xl p-6">
                <item.icon className="h-5 w-5 text-[var(--pp-mint)]" />
                <h3 className="mt-4 text-lg font-semibold">{item.title[lang]}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{item.body[lang]}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section id="advantage" kicker={text.advantageKicker} title={text.advantageTitle}>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {advantages.map((item) => (
              <div
                key={item.n}
                className="grid gap-2 py-6 sm:grid-cols-[4rem_14rem_1fr] sm:items-baseline sm:gap-6"
              >
                <span className="pp-display text-sm text-[var(--pp-mint)]">{item.n}</span>
                <h3 className="text-xl font-semibold">{item.title[lang]}</h3>
                <p className="text-white/60">{item.body[lang]}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="criteria" kicker={text.criteriaKicker} title={text.criteriaTitle}>
          <div className="grid gap-4 sm:grid-cols-2">
            {criteria.map((item) => (
              <article key={item.label.en} className="pp-card rounded-3xl p-6">
                <p className="pp-kicker">{item.label[lang]}</p>
                <h3 className="mt-3 text-2xl font-semibold">{item.title[lang]}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{item.body[lang]}</p>
              </article>
            ))}
          </div>
        </Section>

        <section className="border-t border-white/10 px-5 py-24">
          <div className="mx-auto max-w-4xl text-center">
            <p className="pp-kicker">{text.futureKicker}</p>
            <h2 className="pp-display mt-4 text-4xl font-bold leading-tight text-white sm:text-6xl">
              {text.futureTitle}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-white/65">{text.futureBody}</p>
            <p className="pp-display mt-8 text-sm tracking-[0.18em] text-[var(--pp-mint)]">PARTYPAY × STELLAR</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <AccountActions text={text} user={Boolean(user)} loading={loading} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-5 py-8 text-center text-sm text-white/40">{text.footer}</footer>
    </div>
  )
}
