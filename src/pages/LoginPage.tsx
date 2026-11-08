import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { useAuth } from '@/hooks/useAuth'
import { getErrorMessage } from '@/lib/errors'
import { loginSchema, type LoginValues } from '@/lib/validation'

export function LoginPage() {
  const { session, signIn } = useAuth()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await signIn(values.email, values.password)
      toast.success('Welcome back')
    } catch (error) {
      const message = getErrorMessage(error)
      form.setError('root', { message })
      toast.error(message)
    }
  })

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr] dark:bg-ink-950">
      <div className="relative hidden overflow-hidden bg-ink-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(circle at 15% 10%, rgba(56,189,248,0.18), transparent 45%), radial-gradient(circle at 85% 85%, rgba(16,185,129,0.16), transparent 45%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-black text-ink-950">
              E
            </span>
            <div>
              <p className="text-sm font-extrabold tracking-[0.18em]">EVOLAIRE</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                Invoice system
              </p>
            </div>
          </div>

          <div className="mt-20 max-w-md">
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Invoices that look as good as your work.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              Create the EVOLAIRE A4 invoice, record payments, follow up on balances and keep every
              client in one calm place.
            </p>
          </div>
        </div>

        <div className="relative grid gap-3 text-sm text-white/70">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Private, owner-only workspace
          </div>
          <p className="text-xs text-white/40">
            Signed in with Supabase Auth · data protected by row-level security
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-950 text-xs font-black text-white dark:bg-white dark:text-ink-950">
                E
              </span>
              <span className="text-sm font-extrabold tracking-[0.16em] text-ink-950 dark:text-white">
                EVOLAIRE
              </span>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-ink-950 dark:text-white">Sign in</h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Use the owner account you created in Supabase.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <Field label="Email" htmlFor="login-email" required error={form.formState.errors.email?.message}>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@evolaire.lk"
                  className="pl-9"
                  {...form.register('email')}
                />
              </div>
            </Field>

            <Field
              label="Password"
              htmlFor="login-password"
              required
              error={form.formState.errors.password?.message}
            >
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                  {...form.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {form.formState.errors.root?.message ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {form.formState.errors.root.message}
              </p>
            ) : null}

            <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
              Sign in
            </Button>
          </form>

          <div className="mt-8 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
            <p className="font-semibold text-ink-700 dark:text-ink-200">First time here?</p>
            <p className="mt-1">
              Create the owner user in Supabase → Authentication → Users, then disable public
              sign-ups. See the README for the full setup.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
