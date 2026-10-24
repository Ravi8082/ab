import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Mail, Loader2, ArrowLeft } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import { Link } from 'react-router-dom';

export default function AdminLogin() {
  const { signIn } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError(error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900" />
      <div className="absolute left-1/2 top-1/3 -translate-x-1/2 w-[400px] h-[300px] rounded-full bg-gold/5 blur-3xl" />

      <motion.div
        className="relative w-full max-w-md glass rounded-3xl border border-gold/25 p-8"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <Link to="/" className="flex items-center gap-2 text-ivory/40 hover:text-gold text-sm font-mukta mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to site
        </Link>

        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-saffron/30 to-gold/20 flex items-center justify-center mb-4">
            <Lock size={24} className="text-gold-light" />
          </div>
          <h1 className="font-devanagari text-2xl text-gradient-gold">Admin Panel</h1>
          <p className="text-ivory/50 text-sm font-mukta mt-1">Sign in to manage Adhyatmik Bharat</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory placeholder-ivory/30 font-mukta focus:border-gold focus:outline-none transition-colors"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory placeholder-ivory/30 font-mukta focus:border-gold focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-mukta">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-saffron to-saffron-dark text-ivory font-mukta font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:shadow-lg hover:shadow-saffron/30 transition-all"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
