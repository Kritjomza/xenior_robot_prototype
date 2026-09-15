import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

type AuthApi = Pick<SupabaseClient['auth'],
  'getSession' | 'onAuthStateChange' | 'resetPasswordForEmail' | 'signInWithOAuth'
  | 'signInWithPassword' | 'signOut' | 'signUp'>

export interface AuthClient {
  auth: AuthApi
}

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

export interface AuthContext {
  status: AuthStatus
  session: Session | null
  user: User | null
  error: string | null
  getAccessToken: () => string | null
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const Context = createContext<AuthContext | null>(null)

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Authentication failed'
}

export function AuthProvider({ children, client = supabase }: {
  children: ReactNode
  client?: AuthClient | null
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client) return
    let current = true
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      if (!current) return
      setSession(next)
      setStatus(next ? 'authenticated' : 'anonymous')
      setError(null)
    })
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!current) return
      if (sessionError) {
        setError(sessionError.message)
        setStatus('anonymous')
        return
      }
      setSession(data.session)
      setStatus(data.session ? 'authenticated' : 'anonymous')
    }).catch(failure => {
      if (!current) return
      setError(message(failure))
      setStatus('anonymous')
    })
    return () => {
      current = false
      subscription.unsubscribe()
    }
  }, [client])

  const value = useMemo<AuthContext>(() => {
    async function run(operation: () => Promise<{ error: { message: string } | null }>) {
      setError(null)
      try {
        const result = await operation()
        if (result.error) throw new Error(result.error.message)
      } catch (failure) {
        const detail = message(failure)
        setError(detail)
        throw failure
      }
    }
    return {
      status,
      session,
      user: session?.user ?? null,
      error,
      getAccessToken: () => session?.access_token ?? null,
      signInWithPassword: (email, password) => run(() =>
        client!.auth.signInWithPassword({ email, password })),
      signUp: (email, password) => run(() => client!.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })),
      resetPassword: (email) => run(() => client!.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })),
      signInWithGoogle: () => run(() => client!.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })),
      signOut: async () => {
        await run(() => client!.auth.signOut())
        setSession(null)
        setStatus('anonymous')
      },
    }
  }, [client, error, session, status])

  if (!client) return <main role="alert" className="auth-setup-required">
    <h1>Supabase setup required</h1>
    <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable sign in.</p>
  </main>

  return <Context.Provider value={value}>{children}</Context.Provider>
}

// Auth consumers intentionally share the provider module so the public contract stays together.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContext {
  const context = useContext(Context)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
