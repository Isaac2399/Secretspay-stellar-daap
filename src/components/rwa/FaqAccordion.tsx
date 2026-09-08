import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: '¿Qué tan seguro es tokenizar un activo real?',
    a: 'El token en Stellar representa una participación. El respaldo no es “la blockchain sola”: es el contrato costarricense (garantía mobiliaria RUGM o fideicomiso) más el registro y la estructuración interna. Si hay incumplimiento, se ejecuta el contrato en el fuero local, no un smart contract milagroso.',
  },
  {
    q: '¿Qué es el RUGM y se puede ejecutar en Costa Rica?',
    a: 'La Ley 9078 crea la Garantía Mobiliaria y el Registro de Garantías Mobiliarias (RUGM). Permite constituir garantía sobre bienes muebles, derechos de crédito y flujos. Un número de inscripción RUGM da oponibilidad frente a terceros. La ejecución sigue las vías legales del país.',
  },
  {
    q: '¿Y un fideicomiso?',
    a: 'El fideicomiso separa el activo en un patrimonio de propósito. El fiduciario administra según el contrato (alquileres, cobros, venta). Los tokens reflejan derechos económicos de ese patrimonio. Es útil para inmuebles y flotas cuando se necesita un vehículo legal más robusto.',
  },
  {
    q: '¿Voy a poder vender el token cuando quiera?',
    a: 'La liquidez no es automática como en una acción bursátil. El mercado interno permite transferencias entre usuarios con trustline del asset. La facilidad de salida depende de la demanda, el plazo del activo y las reglas del contrato. Sea claro con sus inversionistas: es un instrumento de mediano plazo, no un cajero.',
  },
  {
    q: '¿Cuándo llegan los dividendos a mi wallet?',
    a: 'El calendario (mensual o trimestral) se define en la estructuración. Cuando el originador cobra alquiler, cuotas o facturas, el flujo se convierte a USDC y se envía a las public keys de los tenedores, con un memo de dividendo. Puede verlo en “Mis dividendos” y en el historial de la wallet.',
  },
  {
    q: '¿USDC es dinero de verdad?',
    a: 'USDC es un stablecoin de dólares en Stellar. En esta app opera en Testnet para pruebas. En producción, el USDC llega a la misma wallet que ya usa para pagos. No sustituye un banco; es el riel de liquidación.',
  },
]

export function FaqAccordion() {
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
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              >
                <span className="text-sm font-medium">{item.q}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-app-muted transition-transform ${
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
