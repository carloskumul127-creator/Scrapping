import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogIn, Mail, Lock, AlertCircle, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === 'undefined') return; // Skip SSR auth check
    const bypass = localStorage.getItem("dev_bypass") === "true";
    const { data: { session } } = await supabase.auth.getSession();
    if (session || bypass) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: Login,
  head: () => ({
    meta: [{ title: "Iniciar Sesión – Local Lead Lens" }],
  }),
});

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // MODO DE PRUEBA: Permite entrar con un correo falso específico
    if (email === "prueba@correo.com" && password === "abecedario") {
      localStorage.setItem("dev_bypass", "true");
      window.location.href = "/dashboard";
      return;
    }

    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/dashboard";
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1020] px-4 overflow-hidden relative">
      {/* Background decorations */}
      <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] bg-emerald/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] bg-violet/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <div className="glass-strong rounded-3xl p-8 shadow-2xl border border-white/10 relative overflow-hidden">
          {/* Subtle top highlight */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald via-azure to-violet opacity-50" />

          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl glass glow-emerald flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-6 h-6 text-emerald" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">
              Bienvenido de vuelta
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              Inicia sesión para acceder a tu dashboard
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-pink/10 border border-pink/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-pink shrink-0 mt-0.5" />
              <p className="text-sm text-pink/90">{error}</p>
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-muted-foreground font-mono ml-1">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-11 py-3.5 text-sm outline-none focus:border-emerald/50 focus:bg-white/10 transition-all placeholder:text-muted-foreground/50"
                  placeholder="tu@correo.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-muted-foreground font-mono ml-1">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-11 py-3.5 text-sm outline-none focus:border-emerald/50 focus:bg-white/10 transition-all placeholder:text-muted-foreground/50"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Hint for test mode */}
            <div className="text-xs text-emerald/70 font-mono text-center mb-2">
              Para pruebas usa: <br /><b>prueba@correo.com</b> / <b>abecedario</b>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald hover:bg-emerald/90 text-primary-foreground py-3.5 rounded-xl font-medium tracking-wide transition-all glow-emerald disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Iniciar Sesión
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-4 before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">o</span>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full mt-6 bg-white hover:bg-gray-100 text-gray-900 py-3.5 rounded-xl font-medium tracking-wide transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continuar con Google
          </button>

        </div>
      </div>
    </div>
  );
}
