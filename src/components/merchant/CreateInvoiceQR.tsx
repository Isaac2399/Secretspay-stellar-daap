import { useState, type FormEvent } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { QRCodeSVG } from 'qrcode.react'
import {
  paymentAssetOptions,
  serializePaymentPayload,
} from '@/lib/stellar/qrPayload'
import { stellarConfig } from '@/lib/stellar/config'
import { fieldClass } from '@/components/auth/AuthLayout'
import type { PaymentAssetCode } from '@/types/user'

type CreateInvoiceQRProps = {
  merchantPublicKey: string
  loyaltyBalance?: string
}

export function CreateInvoiceQR({
  merchantPublicKey,
  loyaltyBalance,
}: CreateInvoiceQRProps) {
  const assetOptions = paymentAssetOptions()
  const [amount, setAmount] = useState('10.00')
  const [asset, setAsset] = useState<PaymentAssetCode>(
    assetOptions[0]?.value ?? 'USDC',
  )
  const [memo, setMemo] = useState('ORD-1234')
  const [reward, setReward] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [payloadText, setPayloadText] = useState<string | null>(null)
  const loyaltyCode = stellarConfig.loyalty.code

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      const encoded = serializePaymentPayload({
        destination: merchantPublicKey,
        amount,
        asset,
        memo,
        reward,
      })
      setPayloadText(encoded.qr)
    } catch (err) {
      setPayloadText(null)
      setError(err instanceof Error ? err.message : 'No se pudo generar el QR')
    }
  }

  return (
    <div className="space-y-4">
      {!stellarConfig.loyalty.issuer ? (
        <p className="rounded-2xl bg-app-chip px-3 py-2 text-sm text-app-muted">
          Configura el issuer de {stellarConfig.loyalty.code} en .env.local para
          cobrar con ese token.
        </p>
      ) : null}

      <form className="grid gap-3" onSubmit={onSubmit}>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Monto
          <input
            className={fieldClass}
            inputMode="decimal"
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.00"
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Moneda
          <select
            className={fieldClass}
            name="asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value as PaymentAssetCode)}
          >
            {assetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Concepto / Memo
          <input
            className={fieldClass}
            name="memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="ORD-1234"
            maxLength={28}
          />
        </label>

        {stellarConfig.loyalty.issuer ? (
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Regalo de {loyaltyCode} (opcional)
            <input
              className={fieldClass}
              inputMode="decimal"
              name="reward"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="Vacío = sin regalo"
            />
            <span className="text-xs font-normal text-app-muted">
              Si el cliente paga el monto de esta factura, se le envían esos{' '}
              {loyaltyCode} desde el saldo de la empresa
              {loyaltyBalance != null
                ? ` (ahora tienes ${loyaltyBalance}).`
                : '.'}
            </span>
          </label>
        ) : null}

        <button
          type="submit"
          className="rounded-2xl bg-app-accent py-3 text-sm font-medium text-white"
        >
          Generar QR
        </button>
      </form>

      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}

      {payloadText ? (
        <div className="grid justify-items-center gap-3">
          <div className="rounded-2xl bg-white p-3">
            <QRCodeSVG value={payloadText} size={240} level="M" includeMargin />
          </div>
          <pre className="w-full overflow-auto text-xs bg-app-chip p-3 rounded-lg text-white/80">
            {payloadText}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
