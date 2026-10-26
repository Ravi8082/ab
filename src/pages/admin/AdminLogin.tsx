import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import { useBrand } from '@/context/BrandContext';

export default function AdminLogin({ variant = 'admin' }: { variant?: 'admin' | 'staff' }) {
  const { signIn } = useAdmin();
  const { brand } = useBrand();
  const isStaff = variant === 'staff';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <div
      className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10"
      style={{ background: 'linear-gradient(160deg,#0A1830 0%,#0F2342 48%,#3A1B4E 82%,#7C1E55 100%)' }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background:
            'radial-gradient(ellipse 70% 100% at 50% 100%, rgba(255,210,31,.22), rgba(238,44,143,.14) 45%, transparent 75%)',
        }}
      />
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-sky/10 blur-3xl" />

      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 26, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-1.5 font-ui text-xs text-cream-on-dark/45 transition-colors hover:text-marigold"
        >
          <ArrowLeft size={14} /> Back to the event site
        </Link>

        <div className="overflow-hidden rounded-[26px] border border-white/15 bg-sindoor-deep/70 shadow-[0_40px_100px_-40px_rgba(0,0,0,.8)] backdrop-blur-xl">
          <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#13BBE8,#EE2C8F,#FFD21F)' }} />
          <div className="p-7 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-marigold/30 bg-marigold/10">
                <Lock size={21} className="text-marigold" />
              </span>
              <div>
                <p className="font-ui text-[0.58rem] uppercase tracking-[0.22em] text-sky">{brand.name_en}</p>
                <h1 className="font-display text-[1.7rem] leading-tight text-white">
                  {isStaff ? 'Staff scanner' : 'Admin panel'}
                </h1>
              </div>
            </div>

            <p className="mt-4 text-sm text-cream-on-dark/55">
              {isStaff
                ? 'Sign in with the gate account created by your event manager. Staff accounts can only scan passes.'
                : 'Sign in to manage passes, cities, schedules and gate check-in.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block font-ui text-[0.62rem] uppercase tracking-[0.16em] text-cream-on-dark/45">
                  Email
                </span>
                <span className="relative block">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cream-on-dark/35" />
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-xl border border-white/15 bg-white/[0.06] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-cream-on-dark/25 focus:border-marigold/70"
                    placeholder="you@example.com"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block font-ui text-[0.62rem] uppercase tracking-[0.16em] text-cream-on-dark/45">
                  Password
                </span>
                <span className="relative block">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cream-on-dark/35" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="w-full rounded-xl border border-white/15 bg-white/[0.06] py-3 pl-10 pr-11 text-sm text-white outline-none transition-colors placeholder:text-cream-on-dark/25 focus:border-marigold/70"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-on-dark/35 transition-colors hover:text-marigold"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>

              {error && (
                <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-block !py-3"
              >
                {loading ? (
                  <>
                    <Loader2 size={17} className="animate-spin" /> Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            <p className="mt-5 flex items-start gap-2 text-[0.68rem] leading-relaxed text-cream-on-dark/35">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-sky/60" />
              Authorised team access only. Failed attempts are rate limited and recorded.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
