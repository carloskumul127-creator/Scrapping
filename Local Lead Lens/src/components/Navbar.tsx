import { Link } from "@tanstack/react-router";
import { Sparkles, LayoutDashboard, History, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function Navbar() {
  const { session, signOut } = useAuth();
  const bypass = typeof window !== 'undefined' ? localStorage.getItem("dev_bypass") === "true" : false;

  if (!session && !bypass) return null;

  const handleSignOut = () => {
    localStorage.removeItem("dev_bypass");
    signOut();
    window.location.href = "/";
  };
  return (
    <nav className="sticky top-0 z-30 backdrop-blur-xl bg-background/60 border-b border-white/5">
      <div className="max-w-[1500px] mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-xl glass-strong glow-emerald flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-emerald" />
          </div>
          <span className="font-semibold tracking-tight">
            Scrape <span className="text-emerald">Dashboard</span>
          </span>
        </Link>
        <div className="flex items-center gap-1 text-sm font-mono">
          <NavLink to="/dashboard" icon={<LayoutDashboard className="w-3.5 h-3.5" />} label="Dashboard" />
          <NavLink to="/descargas" icon={<History className="w-3.5 h-3.5" />} label="Descargas" />
          
          <button 
            onClick={handleSignOut}
            className="ml-2 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition text-pink hover:bg-pink/10 hover:border-pink/30 border border-transparent"
          >
            <LogOut className="w-3.5 h-3.5" /> Salir
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      activeProps={{ className: "bg-emerald/15 text-emerald border border-emerald/30" }}
      inactiveProps={{ className: "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent" }}
      className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
    >
      {icon} {label}
    </Link>
  );
}
