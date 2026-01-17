import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { ChatBox } from './ChatBox'
import { ArrowLeft, Loader2 } from 'lucide-react'

export function ChatPage() {
  const { isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, loading, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="container max-w-4xl mx-auto py-4 px-4 flex-shrink-0">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
      </div>

      <div className="container max-w-4xl mx-auto px-4 pb-4 flex-1 min-h-0">
        <div className="h-[calc(100vh-120px)]">
          <ChatBox />
        </div>
      </div>
    </div>
  )
}

export default ChatPage
