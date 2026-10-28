import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: '¿Qué son los ROJOS?',
    a: 'Son el saldo del evento. Con ellos ordenas en la barra y pagas con QR. En esta pantalla solo ves ROJOS.',
  },
  {
    q: '¿Cómo cargo ROJOS?',
    a: 'En Inicio pulsa Agregar dinero. Puedes usar SINPE Móvil, efectivo en un stand o recibirlos en tu cuenta.',
  },
  {
    q: '¿Cómo ordeno?',
    a: 'En Evento eliges la barra, sumas lo que quieres y pulsas Pagar y ordenar. El pago sale de tus ROJOS.',
  },
  {
    q: '¿Cómo sé si mi pedido está listo?',
    a: 'En Evento, debajo de los productos, ves tus pedidos. Si está listo, muestra el QR en la barra.',
  },
  {
    q: '¿Qué significa recogido?',
    a: 'El pedido ya te lo entregaron. Queda en Recogidos para que lo veas después.',
  },
  {
    q: '¿Cómo pago con QR?',
    a: 'En Inicio, el icono de arriba a la derecha abre la cámara. Apunta al código del local y confirma el monto.',
  },
]

export function CustomerFaq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold">Preguntas frecuentes</h2>
      <ul className="space-y-2">
        {FAQS.map((item, index) => {
          const isOpen = open === index
          return (
            <li key={item.q} className="overflow-hidden rounded-[20px] bg-app-card">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <span className="text-base font-medium">{item.q}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-app-muted transition-transform ${
                    isOpen ? 'rotate-180 text-app-accent' : ''
                  }`}
                />
              </button>
              {isOpen ? (
                <p className="border-t border-white/5 px-4 pb-4 pt-3 text-sm leading-relaxed text-white/75">
                  {item.a}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
