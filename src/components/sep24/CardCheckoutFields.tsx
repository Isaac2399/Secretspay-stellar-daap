import { fieldClass } from '@/components/auth/AuthLayout'
import { ErrorModal } from '@/components/feedback/ErrorModal'

export type CardCheckoutValues = {
  pan: string
  expiry: string
  cvc: string
  holder: string
}

const TEST_PAN = '4242424242424242'

export function CardCheckoutFields({
  value,
  onChange,
  error,
}: {
  value: CardCheckoutValues
  onChange: (next: CardCheckoutValues) => void
  error?: string | null
}) {
  return (
    <div className="space-y-3 rounded-[22px] border border-white/10 bg-gradient-to-br from-[#1a2744] to-[#0d1220] p-4">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/55">
        <span>Visa / Mastercard</span>
        <span>Testnet</span>
      </div>
      <label className="grid gap-1 text-sm">
        Nombre en la tarjeta
        <input
          className={fieldClass}
          autoComplete="cc-name"
          value={value.holder}
          onChange={(event) => onChange({ ...value, holder: event.target.value })}
          placeholder="Como aparece en la tarjeta"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        Número
        <input
          className={`${fieldClass} font-mono tracking-wider`}
          inputMode="numeric"
          autoComplete="cc-number"
          value={formatPan(value.pan)}
          onChange={(event) =>
            onChange({ ...value, pan: digitsOnly(event.target.value, 16) })
          }
          placeholder="4242 4242 4242 4242"
          required
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm">
          Vence
          <input
            className={fieldClass}
            inputMode="numeric"
            autoComplete="cc-exp"
            value={formatExpiry(value.expiry)}
            onChange={(event) =>
              onChange({ ...value, expiry: digitsOnly(event.target.value, 4) })
            }
            placeholder="MM/AA"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          CVC
          <input
            className={fieldClass}
            inputMode="numeric"
            autoComplete="cc-csc"
            value={value.cvc}
            onChange={(event) =>
              onChange({ ...value, cvc: digitsOnly(event.target.value, 4) })
            }
            placeholder="123"
            required
          />
        </label>
      </div>
      <p className="text-xs text-white/50">
        En Testnet usa {formatPan(TEST_PAN)}. El PAN no se envía al servidor.
      </p>
      {error ? <ErrorModal message={error} /> : null}
    </div>
  )
}

export function emptyCardCheckout(): CardCheckoutValues {
  return { pan: '', expiry: '', cvc: '', holder: '' }
}

export function validateCardCheckout(value: CardCheckoutValues): string | null {
  if (value.holder.trim().length < 2) {
    return 'Escribe el nombre de la tarjeta.'
  }
  if (!isTestPan(value.pan)) {
    return `En Testnet solo se acepta la tarjeta de prueba ${formatPan(TEST_PAN)}.`
  }
  if (value.expiry.length !== 4) {
    return 'La fecha debe ser MM/AA.'
  }
  const month = Number(value.expiry.slice(0, 2))
  if (month < 1 || month > 12) {
    return 'El mes de vencimiento no es válido.'
  }
  if (value.cvc.length < 3) {
    return 'El CVC debe tener 3 o 4 dígitos.'
  }
  return null
}

function isTestPan(pan: string): boolean {
  return pan === TEST_PAN
}

function digitsOnly(raw: string, max: number): string {
  return raw.replace(/\D/g, '').slice(0, max)
}

function formatPan(pan: string): string {
  return pan.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

function formatExpiry(expiry: string): string {
  if (expiry.length <= 2) {
    return expiry
  }
  return `${expiry.slice(0, 2)}/${expiry.slice(2)}`
}
