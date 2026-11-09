import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CustomerFaq } from '@/components/customer/CustomerFaq'

export default function FaqPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <Link to="/profile" className="inline-flex items-center gap-2 text-sm text-app-muted">
        <ArrowLeft className="h-4 w-4" />
        Perfil
      </Link>
      <CustomerFaq />
    </section>
  )
}
