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
      className={`flex-shrink-0 ${className}`}
      aria-label="Sign in with Google"
    >
      <LogIn className="h-4 w-4 sm:mr-2" />
      {/* Full label on >=sm; compact on phones so the CTA never clips */}
      <span className="hidden sm:inline">Sign in with Google</span>
      <span className="sm:hidden">Sign in</span>
    </Button>
  )
}

export default LoginButton
