import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { LogIn } from 'lucide-react'

export function LoginButton({ variant = 'default', size = 'default', className = '' }) {
  const { loginWithGoogle, loading } = useAuth()

  return (
    <Button
      variant={variant}
      size={size}
      onClick={loginWithGoogle}
      disabled={loading}
      className={className}
    >
      <LogIn className="h-4 w-4 mr-2" />
      Sign in with Google
    </Button>
  )
}

export default LoginButton
