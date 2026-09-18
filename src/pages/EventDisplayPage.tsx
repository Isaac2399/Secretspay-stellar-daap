import { Navigate, useParams } from 'react-router-dom'
import { EventDisplayBoard } from '@/components/event/EventDisplayBoard'

export default function EventDisplayPage() {
  const { merchantId } = useParams()
  if (!merchantId) {
    return <Navigate to="/" replace />
  }
  return <EventDisplayBoard merchantId={merchantId} />
}
