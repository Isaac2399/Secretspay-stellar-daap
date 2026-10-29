import { useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { Store, User } from 'lucide-react'
import { AuthField, fieldClass } from '@/components/auth/AuthLayout'
import {
  AuthSubmitButton,
  PasswordField,
  RoleButton,
  useAuthForm,
} from '@/components/auth/formHelpers'
import { BUSINESS_CATEGORIES } from '@/lib/places/categories'
import type { MerchantApplicationInput } from '@/types/merchantApplication'
import type { UserRole } from '@/types/user'

type CustomerSignup = {
  kind: 'customer'
  email: string
  password: string
  role: UserRole
}

type MerchantSignup = MerchantApplicationInput & { kind: 'merchant' }

type RegisterFormProps = {
  onSubmit: (input: CustomerSignup | MerchantSignup) => Promise<void>
  formatError: (err: unknown) => string
}

export function RegisterForm({ onSubmit, formatError }: RegisterFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<UserRole>('customer')
  const [businessName, setBusinessName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [taxId, setTaxId] = useState('')
  const [category, setCategory] = useState('restaurant')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [acceptsRojos, setAcceptsRojos] = useState(true)
  const { error, submitting, runSubmit } = useAuthForm()
  const isMerchant = role === 'merchant'

  return (
    <div className="space-y-4 rounded-[28px] bg-app-card p-5">
      <form
        className="space-y-4"
        onSubmit={(event) =>
          void runSubmit(
            event,
            async () => {
              if (password !== confirmPassword) {
                throw new Error('Las contraseñas no coinciden')
              }
              if (!isMerchant) {
                await onSubmit({ kind: 'customer', email, password, role: 'customer' })
                return
              }
              await onSubmit({
                kind: 'merchant',
                email,
                password,
                businessName,
                contactName,
                phone,
                taxId,
                category,
                address,
                description,
                acceptsRojos,
              })
            },
            formatError,
          )
        }
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-white/80">Rol</legend>
          <div className="grid grid-cols-2 gap-2">
            <RoleButton
              active={role === 'customer'}
              onClick={() => setRole('customer')}
              icon={<User className="w-4 h-4" />}
              label="Cliente"
            />
            <RoleButton
              active={role === 'merchant'}
              onClick={() => setRole('merchant')}
              icon={<Store className="w-4 h-4" />}
              label="Empresa"
            />
          </div>
          {isMerchant ? (
            <p className="text-xs leading-relaxed text-app-muted">
              La cuenta no se crea ahora. El super admin revisa estos datos y
              acepta o rechaza la solicitud.
            </p>
          ) : null}
        </fieldset>

        {isMerchant ? (
          <>
            <AuthField label="Nombre comercial">
              <input
                className={fieldClass}
                name="businessName"
                autoComplete="organization"
                minLength={2}
                maxLength={80}
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                required
              />
            </AuthField>
            <AuthField label="Nombre de quien solicita">
              <input
                className={fieldClass}
                name="contactName"
                autoComplete="name"
                minLength={2}
                maxLength={80}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                required
              />
            </AuthField>
            <AuthField label="Teléfono">
              <input
                className={fieldClass}
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </AuthField>
            <AuthField label="Cédula jurídica">
              <input
                className={fieldClass}
                name="taxId"
                inputMode="numeric"
                autoComplete="off"
                value={taxId}
                onChange={(event) => setTaxId(event.target.value)}
                required
              />
            </AuthField>
            <AuthField label="Tipo de negocio">
              <select
                className={fieldClass}
                name="category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                required
              >
                {BUSINESS_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </AuthField>
            <AuthField label="Dirección del local">
              <input
                className={fieldClass}
                name="address"
                autoComplete="street-address"
                minLength={4}
                maxLength={200}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                required
              />
            </AuthField>
            <AuthField label="Qué vende o qué servicio ofrece">
              <textarea
                className={`${fieldClass} min-h-24 resize-y`}
                name="description"
                minLength={8}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </AuthField>
            <label className="flex items-start gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-app-accent"
                checked={acceptsRojos}
                onChange={(event) => setAcceptsRojos(event.target.checked)}
              />
              <span>Quiere aceptar ROJOS como medio de pago o descuento</span>
            </label>
          </>
        ) : null}

        <AuthField label="Email">
          <input
            className={fieldClass}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </AuthField>

        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
        />

        <PasswordField
          label="Confirmar contraseña"
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />

        <AuthSubmitButton
          submitting={submitting}
          idleLabel={isMerchant ? 'Enviar solicitud' : 'Crear cuenta'}
          busyLabel={isMerchant ? 'Enviando solicitud…' : 'Creando cuenta en Stellar…'}
        />
      </form>

      {error ? <ErrorModal message={error} /> : null}
    </div>
  )
}
