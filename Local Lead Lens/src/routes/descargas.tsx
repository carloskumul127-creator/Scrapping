import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { History, Trash2, Filter, ChevronLeft, ChevronRight, Building2, MapPin, Search } from "lucide-react";
import { fetchDownloads, deleteDownload, type DownloadEntry } from "@/lib/leads-store";

export const Route = createFileRoute("/descargas")({
  component: DownloadsPage,
  head: () => ({
    meta: [
      { title: "Descargas — Historial de leads" },
      { name: "description", content: "Historial de contactos descargados, paginado, con filtro por industria y ciudad." },
    ],
  }),
});

const PAGE_SIZE = 20;

function DownloadsPage() {
  const [items, setItems] = useState<DownloadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [industry, setIndustry] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const reload = async () => {
    setLoading(true);
    setItems(await fetchDownloads());
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const industries = useMemo(() => Array.from(new Set(items.map((i) => i.industry))).sort(), [items]);
  const cities = useMemo(
    () => Array.from(new Set(items.filter((i) => !industry || i.industry === industry).map((i) => i.city ?? "—"))).sort(),
    [items, industry],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (industry && i.industry !== industry) return false;
      if (city && (i.city ?? "—") !== city) return false;
      if (q) {
        const inTitles = i.contact_titles.some((t) => t.toLowerCase().includes(q));
        const inMeta = `${i.industry} ${i.city ?? ""} ${i.filename ?? ""}`.toLowerCase().includes(q);
        if (!inTitles && !inMeta) return false;
      }
      return true;
    });
  }, [items, industry, city, search]);

  useEffect(() => setPage(1), [industry, city, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalContacts = filtered.reduce((s, i) => s + i.contact_count, 0);

  const onDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro del historial?")) return;
    await deleteDownload(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="min-h-screen px-4 md:px-8 py-6 max-w-[1500px] mx-auto">
      <header className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl glass-strong glow-violet flex items-center justify-center">
            <History className="w-5 h-5 text-violet" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Historial de <span className="text-violet">descargas</span>
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              {filtered.length} eventos · {totalContacts} contactos descargados
            </p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <section className="glass rounded-2xl p-4 mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 glass-strong rounded-xl flex items-center gap-2 px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre de contacto, industria, ciudad…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground"
          />
        </div>
        <FilterSelect icon={<Building2 className="w-4 h-4 text-emerald" />} value={industry} onChange={setIndustry} options={industries} placeholder="Todas las industrias" />
        <FilterSelect icon={<MapPin className="w-4 h-4 text-pink" />} value={city} onChange={setCity} options={cities} placeholder="Todas las ciudades" />
      </section>

      {/* List */}
      {loading ? (
        <div className="text-center text-muted-foreground py-12 font-mono text-sm">Cargando…</div>
      ) : pageItems.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-sm text-muted-foreground font-mono">
          <Filter className="w-6 h-6 mx-auto mb-2 opacity-50" />
          Aún no hay descargas registradas que coincidan con el filtro.
        </div>
      ) : (
        <div className="space-y-3">
          {pageItems.map((it) => (
            <article key={it.id} className="glass rounded-2xl p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-md bg-emerald/15 text-emerald border border-emerald/30 text-xs font-mono">
                    {it.industry}
                  </span>
                  {it.city && (
                    <span className="px-2.5 py-1 rounded-md bg-pink/15 text-pink border border-pink/30 text-xs font-mono">
                      {it.city}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-md bg-azure/15 text-azure border border-azure/30 text-xs font-mono">
                    {it.contact_count} contactos
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <time className="text-xs font-mono text-muted-foreground">
                    {new Date(it.created_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                  <button
                    onClick={() => onDelete(it.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-pink hover:bg-pink/10 transition"
                    title="Eliminar del historial"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {it.filename && (
                <div className="text-xs text-muted-foreground font-mono mb-2">📄 {it.filename}</div>
              )}
              {it.contact_titles.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground font-mono">
                    Ver contactos descargados ({it.contact_titles.length})
                  </summary>
                  <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 text-xs text-foreground/80">
                    {it.contact_titles.map((t, i) => (
                      <li key={i} className="truncate font-mono">· {t}</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-xs text-muted-foreground font-mono">
            Página {page} de {totalPages} · mostrando {pageItems.length} de {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="glass px-3 py-2 rounded-lg text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/5"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="glass px-3 py-2 rounded-lg text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/5"
            >
              Siguiente <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  icon, value, onChange, options, placeholder,
}: { icon: React.ReactNode; value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <label className="glass-strong rounded-xl flex items-center gap-2 px-3 py-2">
      {icon}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm flex-1 cursor-pointer"
      >
        <option value="" className="bg-background">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-background">{o}</option>
        ))}
      </select>
    </label>
  );
}
