import NextAuth from 'next-auth'
import { bootstrapAuthService } from '@/lib/auth/auth-service-bootstrap'
import { createNextAuthConfig } from '@/lib/auth/next-auth-config'

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth(() =>
  createNextAuthConfig({
    authService: bootstrapAuthService(),
  }),
)
