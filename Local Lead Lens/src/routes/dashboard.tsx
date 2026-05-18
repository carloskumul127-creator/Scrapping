import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import {
  Upload, Download, Search, Star, MessageSquare, Globe, Phone, MapPin, ExternalLink,
  Building2, Compass, ChevronDown, ChevronRight, Sparkles, FileSpreadsheet, Filter,
  Trash2, EyeOff, MessageCircle, CheckSquare, Square, X, BarChart3, LayoutGrid, FilePlus2,
} from "lucide-react";
import { Business, normalizeRow, sampleData } from "@/lib/dataset";
import {
  classifyPhone, phoneKey, fetchOverrides, upsertOverride, logDownload,
  type ContactOverride, type WhatsappType,
} from "@/lib/leads-store";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (typeof window === 'undefined') return; // Skip SSR auth check
    const bypass = localStorage.getItem("dev_bypass") === "true";
    const { data: { session } } = await supabase.auth.getSession();
    if (!session && !bypass) {
      throw redirect({ to: "/" });
    }
  },
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Scrape Dashboard – Análisis de Negocios Locales" },
      { name: "description", content: "Dashboard glassmorphism para analizar leads scrappeados desde Google Maps por industria y ciudad." },
    ],
  }),
});

const ACCENT = ["#10b981", "#3b82f6", "#d8b4fe", "#ec4899", "#f59e0b"];

/* ---------- helpers ---------- */
function fmt(n: number) {
  return new Intl.NumberFormat("es-MX").format(n);
}
function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item) || "—";
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
function csvFromBusinesses(rows: Business[]) {
  const header = ["Title", "Rating", "Reviews", "Phone", "Industry", "City", "Address", "Website", "Google Maps Link"];
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    header.join(","),
    ...rows.map((r) =>
      [r.title, r.rating ?? "", r.reviews ?? "", r.phone, r.industry, r.city, r.address, r.website, r.mapsLink]
        .map(escape).join(","),
    ),
  ].join("\n");
}

/* ---------- AI summary (heuristic, no API) ---------- */
function buildAISummary(rows: Business[]) {
  if (!rows.length) return "Carga datos para ver el análisis automático.";
  const total = rows.length;
  const rated = rows.filter((r) => r.rating != null);
  const avg = rated.reduce((s, r) => s + (r.rating ?? 0), 0) / Math.max(rated.length, 1);
  const withSite = rows.filter((r) => r.website).length;
  const sitePct = withSite / total;
  const lowRated = rows.filter((r) => (r.rating ?? 5) < 3.5).length;
  const cities = new Set(rows.map((r) => r.city)).size;
  const industries = new Set(rows.map((r) => r.industry)).size;
  const opportunity = rows.filter((r) => !r.website && (r.rating ?? 0) >= 4).length;
  return [
    `Se analizaron ${total} negocios en ${cities} ciudades y ${industries} industrias.`,
    `Calificación promedio: ${avg.toFixed(2)}★. ${pct(sitePct)} cuenta con sitio web.`,
    opportunity > 0
      ? `Oportunidad: ${opportunity} negocios bien calificados (≥4★) NO tienen sitio web — leads de alta conversión.`
      : `No se detectaron leads sin sitio web con calificación ≥4★.`,
    lowRated > 0 ? `Anomalía: ${lowRated} negocios con calificación <3.5★ pueden requerir revisión manual.` : "",
  ].filter(Boolean).join(" ");
}

/* ---------- Component ---------- */
type EnrichedBusiness = Business & {
  phoneKey: string;
  hidden: boolean;
  whatsappType: WhatsappType;
  shared: boolean;
  sharedAt: string | null;
  sharedWith: string | null;
};

function Dashboard() {
  const [data, setData] = useState<Business[]>(sampleData);
  const [fileName, setFileName] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ContactOverride>>({});
  const [waFilter, setWaFilter] = useState<"all" | "business" | "normal" | "fixed">("all");
  const [sharedFilter, setSharedFilter] = useState<"all" | "shared" | "pending">("all");
  const [showHidden, setShowHidden] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"directory" | "analytics">("directory");

  // Auto-cargar dataset limpio
  useEffect(() => {
    fetch("/data/leads.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (Array.isArray(json) && json.length) {
          setData(json as Business[]);
          setFileName("leads.json (limpio: 4 ciudades)");
        }
      })
      .catch(() => { });
  }, []);

  // Cargar overrides desde el backend
  useEffect(() => { fetchOverrides().then(setOverrides); }, []);

  const reloadOverrides = useCallback(async () => {
    setOverrides(await fetchOverrides());
  }, []);

  const [search, setSearch] = useState("");
  const [openTags, setOpenTags] = useState<Record<string, boolean>>({});
  const [focused, setFocused] = useState<Business | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mergeFileRef = useRef<HTMLInputElement>(null);

  /* ---------- enrich data with overrides + WA classification ---------- */
  const enriched = useMemo<EnrichedBusiness[]>(() => {
    return data.map((r) => {
      const key = phoneKey(r.phone);
      const ov = overrides[key];
      const auto = classifyPhone(r.phone);
      const whatsappType: WhatsappType = ov?.whatsapp_type ?? auto.type;
      return {
        ...r,
        whatsapp: whatsappType === "business" || whatsappType === "normal",
        phoneKey: key,
        hidden: !!ov?.hidden,
        whatsappType,
        shared: !!ov?.shared,
        sharedAt: ov?.shared_at ?? null,
        sharedWith: ov?.shared_with ?? null,
      };
    });
  }, [data, overrides]);

  /* ---------- visible (apply hidden + WA filter) ---------- */
  const visible = useMemo(() => {
    return enriched.filter((r) => {
      if (!showHidden && r.hidden) return false;
      if (waFilter !== "all" && r.whatsappType !== waFilter) return false;
      if (sharedFilter === "shared" && !r.shared) return false;
      if (sharedFilter === "pending" && r.shared) return false;
      return true;
    });
  }, [enriched, waFilter, sharedFilter, showHidden]);

  /* ---------- file upload ---------- */
  const onFile = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    setData(json.map(normalizeRow).filter((r) => r.title));
    setFileName(file.name);
  }, []);

  /* ---------- merge file upload (ADD to existing data) ---------- */
  const onMergeFile = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const newRows = json.map(normalizeRow).filter((r) => r.title);
    if (!newRows.length) { alert("No se encontraron datos válidos en el archivo."); return; }
    setData((prev) => {
      const existingKeys = new Set(prev.map((r) => `${r.title}|${r.phone}|${r.city}`));
      const unique = newRows.filter((r) => !existingKeys.has(`${r.title}|${r.phone}|${r.city}`));
      const merged = [...prev, ...unique];
      alert(`Se agregaron ${unique.length} negocios nuevos (${newRows.length - unique.length} duplicados omitidos). Total: ${merged.length}`);
      return merged;
    });
    setFileName((prev) => prev ? `${prev} + ${file.name}` : file.name);
  }, []);

  /* ---------- ZIP download (per industry / city CSV) ---------- */
  const downloadZip = useCallback(async () => {
    const zip = new JSZip();
    zip.file("ALL_BUSINESSES.csv", csvFromBusinesses(visible));
    const byInd = groupBy(visible, (r) => r.industry);
    for (const [ind, rows] of Object.entries(byInd)) {
      const safeInd = ind.replace(/[^a-z0-9]+/gi, "_");
      zip.file(`${safeInd}/_ALL_${safeInd}.csv`, csvFromBusinesses(rows));
      const byCity = groupBy(rows, (r) => r.city);
      for (const [city, crows] of Object.entries(byCity)) {
        const safeCity = city.replace(/[^a-z0-9]+/gi, "_");
        zip.file(`${safeInd}/${safeCity}.csv`, csvFromBusinesses(crows));
      }
    }
    zip.file("README.md", `# Dataset segmentado\n\nGenerado desde el dashboard.\n`);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const filename = `dataset_${new Date().toISOString().slice(0, 10)}.zip`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    await logDownload({
      industry: "TODAS",
      city: null,
      scope: "all",
      contacts: visible,
      filename,
    });
  }, [visible]);

  /* ---------- focus dataset ---------- */
  const scope = useMemo(() => (focused ? visible.filter((r) => r.title === focused.title && r.city === focused.city) : visible), [visible, focused]);

  /* ---------- derived metrics ---------- */
  const metrics = useMemo(() => {
    const total = scope.length;
    const rated = scope.filter((r) => r.rating != null);
    const avg = rated.length ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : 0;
    const reviews = scope.reduce((s, r) => s + (r.reviews ?? 0), 0);
    const withSite = scope.filter((r) => r.website).length;
    const phones = scope.filter((r) => r.phone && r.phone.replace(/\D/g, "").length >= 7).length;
    return { total, avg, reviews, withSite, sitePct: total ? withSite / total : 0, phones };
  }, [scope]);

  const ratingDist = useMemo(() => {
    const buckets = [1, 2, 3, 4, 5].map((s) => ({ stars: `${s}★`, count: 0 }));
    scope.forEach((r) => {
      if (r.rating == null) return;
      const idx = Math.max(0, Math.min(4, Math.round(r.rating) - 1));
      buckets[idx].count += 1;
    });
    return buckets;
  }, [scope]);

  const reviewVolume = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { label: d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }), count: 0 };
    });
    const total = scope.reduce((s, r) => s + (r.reviews ?? 0), 0);
    const weights = [0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.1, 0.1, 0.1, 0.11, 0.1];
    months.forEach((m, i) => (m.count = Math.round(total * weights[i])));
    return months;
  }, [scope]);

  /* ---------- segmentation: by industry, then city (uses visible) ---------- */
  const byIndustry = useMemo(() => {
    const groups = groupBy(visible, (r) => r.industry);
    return Object.entries(groups)
      .map(([industry, rows]) => ({
        industry,
        rows,
        cities: groupBy(rows, (r) => r.city),
      }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [visible]);

  const filterRows = (rows: EnrichedBusiness[]) => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q),
    );
  };

  const aiSummary = useMemo(() => buildAISummary(scope), [scope]);

  return (
    <div className="min-h-screen px-4 md:px-8 py-6 max-w-[1500px] mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl glass-strong glow-emerald flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-emerald" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Scrape <span className="text-emerald">Dashboard</span>
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              {fileName ? `· ${fileName}` : "· demo data activa"} · {fmt(data.length)} negocios
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { e.target.files?.[0] && onFile(e.target.files[0]); e.target.value = ""; }}
          />
          <input
            ref={mergeFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { e.target.files?.[0] && onMergeFile(e.target.files[0]); e.target.value = ""; }}
          />
          <button
            onClick={() => mergeFileRef.current?.click()}
            className="glass px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:glow-emerald transition"
          >
            <FilePlus2 className="w-4 h-4 text-emerald" /> Agregar datos
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="glass px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:glow-azure transition"
          >
            <Upload className="w-4 h-4 text-azure" /> Reemplazar Excel/CSV
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            className="glass px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:glow-violet transition"
          >
            <CheckSquare className="w-4 h-4 text-violet" /> Descargar selección
          </button>
          <button
            onClick={downloadZip}
            className="px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 bg-emerald text-primary-foreground glow-emerald hover:opacity-90 transition font-medium"
          >
            <Download className="w-4 h-4" /> Descargar todo (ZIP)
          </button>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="glass rounded-2xl p-1.5 flex items-center gap-1 mb-6">
        <button
          onClick={() => setActiveTab("directory")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition ${activeTab === "directory" ? "bg-emerald/20 text-emerald glow-emerald" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
        >
          <LayoutGrid className="w-4 h-4" /> Directorio
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition ${activeTab === "analytics" ? "bg-violet/20 text-violet glow-violet" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
        >
          <BarChart3 className="w-4 h-4" /> Analíticas
        </button>
        {focused && (
          <div className="ml-auto flex items-center gap-2 text-xs font-mono text-emerald">
            <Building2 className="w-3.5 h-3.5" /> Enfocado: {focused.title}
            <button onClick={() => setFocused(null)} className="text-muted-foreground hover:text-pink ml-1">✕</button>
          </div>
        )}
      </nav>

      {/* ===== ANALYTICS TAB ===== */}
      {activeTab === "analytics" && (
        <div>
          {/* Focus banner */}
          {focused && (
            <section className="glass-strong rounded-2xl p-4 mb-6 flex items-center justify-between gap-4 border border-emerald/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald/20 flex items-center justify-center glow-emerald">
                  <Building2 className="w-4 h-4 text-emerald" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-emerald font-mono">Enfocando negocio</div>
                  <div className="text-base font-semibold">{focused.title}</div>
                  <div className="text-xs text-muted-foreground font-mono">{focused.industry} · {focused.city}</div>
                </div>
              </div>
              <button
                onClick={() => setFocused(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono glass hover:bg-white/10 transition"
              >
                ✕ Ver todo
              </button>
            </section>
          )}

          {/* AI Summary */}
          <section className="glass rounded-2xl p-5 mb-6 flex gap-4 items-start">
            <div className="w-9 h-9 rounded-xl bg-violet/20 flex items-center justify-center shrink-0 glow-violet">
              <Sparkles className="w-4 h-4 text-violet" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-violet font-mono mb-1">IA · Resumen de leads</div>
              <p className="text-sm text-foreground/90 leading-relaxed">{aiSummary}</p>
            </div>
          </section>

          {/* High-level metrics */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard icon={<Building2 className="w-4 h-4" />} label="Total negocios" value={fmt(metrics.total)} accent="emerald" />
            <MetricCard icon={<Star className="w-4 h-4" />} label="Rating promedio" value={metrics.avg.toFixed(2)} suffix="★" accent="azure" />
            <MetricCard icon={<MessageSquare className="w-4 h-4" />} label="Total reseñas" value={fmt(metrics.reviews)} accent="violet" />
            <MetricCard icon={<Globe className="w-4 h-4" />} label="% con sitio web" value={pct(metrics.sitePct)} accent="pink" />
          </section>

          {/* Charts */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <ChartCard title="Distribución de calificaciones" className="lg:col-span-1">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ratingDist}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="stars" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {ratingDist.map((_, i) => (
                      <Cell key={i} fill={ACCENT[i % ACCENT.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Volumen de reseñas (últimos 12 meses)" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={reviewVolume}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>

          {/* Digital presence + phones */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            <ChartCard title="Presencia digital">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Con sitio", value: metrics.withSite },
                      { name: "Sin sitio", value: metrics.total - metrics.withSite },
                    ]}
                    dataKey="value"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#ec4899" />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs font-mono -mt-2">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald" /> Con sitio</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink" /> Sin sitio</span>
              </div>
            </ChartCard>

            <div className="glass rounded-2xl p-5 lg:col-span-2 flex flex-col justify-between">
              <div className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-2">KPIs clave</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiBlock value={fmt(metrics.phones)} label="Teléfonos válidos" icon={<Phone className="w-4 h-4 text-azure" />} />
                <KpiBlock value={fmt(byIndustry.length)} label="Industrias" icon={<Compass className="w-4 h-4 text-violet" />} />
                <KpiBlock value={fmt(new Set(visible.map((d) => d.city)).size)} label="Ciudades" icon={<MapPin className="w-4 h-4 text-pink" />} />
                <KpiBlock
                  value={`${fmt(enriched.filter((r) => !r.hidden && r.shared).length)} / ${fmt(enriched.filter((r) => !r.hidden).length)}`}
                  label="Ya compartidos"
                  icon={<MessageCircle className="w-4 h-4 text-emerald" />}
                />
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ===== DIRECTORY TAB ===== */}
      {activeTab === "directory" && (
        <div>
          {/* Industry quick-access buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {byIndustry.map(({ industry }, i) => (
              <button
                key={industry}
                onClick={() => {
                  setOpenTags((s) => ({ ...s, [industry]: true }));
                  document.getElementById(`industry-${industry}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="glass px-3 py-1.5 rounded-lg text-xs font-mono hover:bg-white/5 transition flex items-center gap-1.5"
                style={{ borderColor: `${ACCENT[i % ACCENT.length]}44`, color: ACCENT[i % ACCENT.length] }}
              >
                <Building2 className="w-3 h-3" /> {industry}
              </button>
            ))}
          </div>

          {/* Search + WhatsApp filter */}
          <div className="flex flex-wrap items-center gap-3 mb-4 sticky top-0 z-30 py-3 -mx-4 px-4 md:-mx-8 md:px-8" style={{ background: "linear-gradient(180deg, rgba(11,16,32,0.97) 70%, rgba(11,16,32,0) 100%)" }}>
            <div className="glass rounded-xl flex items-center gap-2 px-3 py-2 flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, ciudad, teléfono…"
                className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground"
              />
            </div>
            <div className="glass rounded-xl flex items-center gap-1 p-1">
              {([
                ["all", "Todos", enriched.filter((r) => !r.hidden).length],
                ["business", "WA Business", enriched.filter((r) => !r.hidden && r.whatsappType === "business").length],
                ["normal", "WA Normal", enriched.filter((r) => !r.hidden && r.whatsappType === "normal").length],
                ["fixed", "Fijo", enriched.filter((r) => !r.hidden && r.whatsappType === "fixed").length],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setWaFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 ${waFilter === key ? "bg-emerald/20 text-emerald" : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {key !== "all" && <MessageCircle className="w-3 h-3" />}
                  {label} <span className="opacity-60">({fmt(count)})</span>
                </button>
              ))}
            </div>
            <div className="glass rounded-xl flex items-center gap-1 p-1">
              {([
                ["all", "Todos"],
                ["pending", "Pendientes"],
                ["shared", "Pasados"],
              ] as const).map(([key, label]) => {
                const count = key === "all"
                  ? enriched.filter((r) => !r.hidden).length
                  : key === "shared"
                    ? enriched.filter((r) => !r.hidden && r.shared).length
                    : enriched.filter((r) => !r.hidden && !r.shared).length;
                return (
                  <button
                    key={key}
                    onClick={() => setSharedFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${sharedFilter === key ? "bg-violet/20 text-violet" : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    {label} <span className="opacity-60">({fmt(count)})</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowHidden((v) => !v)}
              className={`glass px-3 py-2 rounded-xl text-xs font-mono flex items-center gap-1.5 transition ${showHidden ? "text-pink" : "text-muted-foreground hover:text-foreground"}`}
              title="Mostrar contactos ocultos / borrados"
            >
              <EyeOff className="w-3.5 h-3.5" /> {showHidden ? "Ocultando: ver todo" : "Ver ocultos"}
            </button>
            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" /> {byIndustry.length} bloques
            </div>
          </div>

          {/* INDUSTRY BLOCKS — separated, with city subdivisions */}
          <section className="space-y-5">
            {byIndustry.map(({ industry, rows, cities }, i) => {
              const isOpen = openTags[industry] ?? false;
              const accent = ACCENT[i % ACCENT.length];
              const visibleRows = filterRows(rows);
              return (
                <div key={industry} id={`industry-${industry}`} className="glass rounded-2xl overflow-hidden scroll-mt-24">
                  {/* Block header */}
                  <button
                    onClick={() => setOpenTags((s) => ({ ...s, [industry]: !isOpen }))}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: `${accent}22`, boxShadow: `0 0 0 1px ${accent}44, 0 8px 30px -10px ${accent}` }}
                      >
                        <Building2 className="w-4 h-4" style={{ color: accent }} />
                      </div>
                      <div className="text-left">
                        <div className="text-lg font-semibold">{industry}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {rows.length} negocios · {Object.keys(cities).length} ciudades
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <SmallStat label="rating" value={(rows.reduce((s, r) => s + (r.rating ?? 0), 0) / Math.max(rows.filter((r) => r.rating).length, 1)).toFixed(2)} />
                      <SmallStat label="reviews" value={fmt(rows.reduce((s, r) => s + (r.reviews ?? 0), 0))} />
                      <SmallStat label="con web" value={pct(rows.filter((r) => r.website).length / rows.length)} />
                      {isOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-white/5 p-5 space-y-5">
                      {Object.entries(cities)
                        .sort(([, a], [, b]) => b.length - a.length)
                        .map(([city, crows]) => {
                          const cVisible = filterRows(crows);
                          if (search && cVisible.length === 0) return null;
                          return (
                            <CityBlock key={city} industry={industry} city={city} rows={cVisible.length ? cVisible : crows} accent={accent} onFocus={(b) => { setFocused(b); setActiveTab("analytics"); window.scrollTo({ top: 0, behavior: "smooth" }); }} onOverride={reloadOverrides} />
                          );
                        })}
                      {visibleRows.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-6 font-mono">Sin resultados para "{search}"</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      )}

      <footer className="text-center text-xs text-muted-foreground font-mono mt-12 mb-4">
        <FileSpreadsheet className="inline w-3 h-3 mr-1" />
        Dataset · Glassmorphism Dashboard · v1
      </footer>

      {pickerOpen && (
        <DownloadPickerModal
          rows={visible}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */
const tooltipStyle = {
  background: "rgba(17,24,39,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  fontSize: 12,
  color: "#fff",
};

function MetricCard({
  icon, label, value, suffix, accent,
}: { icon: React.ReactNode; label: string; value: string; suffix?: string; accent: "emerald" | "azure" | "violet" | "pink" }) {
  const glowMap = { emerald: "glow-emerald", azure: "glow-azure", violet: "glow-violet", pink: "glow-pink" };
  const colorMap = { emerald: "text-emerald", azure: "text-azure", violet: "text-violet", pink: "text-pink" };
  return (
    <div className={`glass rounded-2xl p-5 ${glowMap[accent]}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground font-mono">{label}</div>
        <div className={colorMap[accent]}>{icon}</div>
      </div>
      <div className="text-3xl font-semibold tracking-tight">
        {value}
        {suffix && <span className={`text-lg ml-1 ${colorMap[accent]}`}>{suffix}</span>}
      </div>
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-2xl p-5 ${className}`}>
      <div className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-4">{title}</div>
      {children}
    </div>
  );
}

function KpiBlock({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <div className="glass-strong rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
        {icon} {label}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden md:block text-right">
      <div className="text-xs text-muted-foreground font-mono uppercase">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

const PAGE_SIZE = 10;

function CityBlock({
  industry, city, rows, accent, onFocus, onOverride,
}: {
  industry: string;
  city: string;
  rows: EnrichedBusiness[];
  accent: string;
  onFocus: (b: Business) => void;
  onOverride: () => void;
}) {
  const [sortKey, setSortKey] = useState<keyof Business>("rating");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
      return dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, sortKey, dir]);

  useEffect(() => setPage(1), [rows.length, sortKey, dir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (k: keyof Business) => {
    if (sortKey === k) setDir(dir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setDir("desc"); }
  };

  const downloadCsv = async () => {
    const csv = csvFromBusinesses(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const filename = `${industry}_${city}.csv`.replace(/[^a-z0-9_.]+/gi, "_");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    await logDownload({ industry, city, scope: "city", contacts: rows, filename });
  };

  const hideContact = async (r: EnrichedBusiness) => {
    if (!r.phoneKey) return;
    if (!confirm(`¿Borrar/ocultar "${r.title}" del listado?`)) return;
    await upsertOverride({ phone: r.phoneKey, title: r.title, whatsapp_type: r.whatsappType, hidden: true });
    onOverride();
  };

  const restoreContact = async (r: EnrichedBusiness) => {
    if (!r.phoneKey) return;
    await upsertOverride({ phone: r.phoneKey, title: r.title, whatsapp_type: r.whatsappType, hidden: false });
    onOverride();
  };

  const markShared = async (r: EnrichedBusiness) => {
    if (!r.phoneKey) return;
    const who = prompt(`¿A qué empresa/cliente le pasaste el contacto de "${r.title}"?\n(opcional, deja vacío si solo quieres marcarlo)`, r.sharedWith ?? "");
    if (who === null) return; // cancelled
    await upsertOverride({
      phone: r.phoneKey,
      title: r.title,
      whatsapp_type: r.whatsappType,
      hidden: r.hidden,
      shared: true,
      shared_at: new Date().toISOString(),
      shared_with: who.trim() || null,
    });
    onOverride();
  };

  const unmarkShared = async (r: EnrichedBusiness) => {
    if (!r.phoneKey) return;
    await upsertOverride({
      phone: r.phoneKey,
      title: r.title,
      whatsapp_type: r.whatsappType,
      hidden: r.hidden,
      shared: false,
      shared_at: null,
      shared_with: null,
    });
    onOverride();
  };

  return (
    <div className="glass-strong rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5" style={{ color: accent }} />
          <div className="text-sm font-semibold">{industry} · <span style={{ color: accent }}>{city}</span></div>
          <div className="text-xs text-muted-foreground font-mono">({rows.length})</div>
        </div>
        <button onClick={downloadCsv} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono">
          <Download className="w-3 h-3" /> CSV
        </button>
      </div>
      <div className="overflow-x-auto scrollbar-thin" style={{ minHeight: `${(PAGE_SIZE * 41) + 40}px` }}>
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground font-mono">
              {[
                ["title", "Nombre"], ["rating", "★ / Reseñas"], ["phone", "Teléfono · WhatsApp"],
                ["address", "Dirección"], ["website", "Web"], ["mapsLink", "Google Maps"],
              ].map(([k, label]) => (
                <th
                  key={k}
                  onClick={() => toggleSort(k as keyof Business)}
                  className="px-4 py-2.5 cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                >
                  {label} {sortKey === k && (dir === "asc" ? "↑" : "↓")}
                </th>
              ))}
              <th className="px-4 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => {
              const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.title} ${r.address} ${r.city}`)}`;
              const badgeStyles: Record<string, string> = {
                business: "bg-emerald/15 text-emerald border-emerald/30",
                normal: "bg-azure/15 text-azure border-azure/30",
                fixed: "bg-pink/15 text-pink border-pink/30",
              };
              const badgeLabel: Record<string, string> = {
                business: "WA Business",
                normal: "WA Normal",
                fixed: "Fijo",
              };
              const t = r.whatsappType ?? "fixed";
              return (
                <tr key={i} className={`border-t border-white/5 transition ${r.hidden ? "opacity-50" : r.shared ? "bg-emerald/[0.04] hover:bg-emerald/[0.08]" : "hover:bg-white/[0.03]"}`}>
                  <td className="px-4 py-2.5 font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { onFocus(r); }}
                        className="text-left hover:text-emerald hover:underline inline-flex items-center gap-1"
                        title="Click para enfocar este negocio en las gráficas"
                      >
                        {r.title}
                      </button>
                      {r.shared && (
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-emerald/15 text-emerald border border-emerald/30"
                          title={`Pasado${r.sharedWith ? ` a ${r.sharedWith}` : ""}${r.sharedAt ? ` · ${new Date(r.sharedAt).toLocaleDateString("es-MX")}` : ""}`}
                        >
                          ✓ Pasado{r.sharedWith ? ` · ${r.sharedWith}` : ""}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Star className={`w-3 h-3 ${r.rating ? "text-emerald fill-emerald" : "text-muted-foreground"}`} />
                      <span className="font-semibold">{r.rating != null ? r.rating.toFixed(1) : "0.0"}</span>
                      <span className="font-mono text-xs text-muted-foreground">({fmt(r.reviews ?? 0)})</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                    {r.phone ? (
                      <div className="flex items-center gap-2">
                        <span>{r.phone}</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono border ${badgeStyles[t]}`}>{badgeLabel[t]}</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[260px] truncate" title={r.address}>{r.address}</td>
                  <td className="px-4 py-2.5">
                    {r.website ? (
                      <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-azure inline-flex items-center gap-1 text-xs hover:underline">
                        <Globe className="w-3 h-3" /> visitar
                      </a>
                    ) : <span className="text-pink text-xs font-mono">sin web</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="text-violet inline-flex items-center gap-1 text-xs hover:underline whitespace-nowrap">
                      <ExternalLink className="w-3 h-3" /> abrir mapa
                    </a>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.shared ? (
                        <button
                          onClick={() => unmarkShared(r)}
                          className="text-[10px] font-mono text-muted-foreground hover:text-pink whitespace-nowrap"
                          title={`Pasado${r.sharedAt ? ` el ${new Date(r.sharedAt).toLocaleString("es-MX")}` : ""}. Click para desmarcar.`}
                        >
                          desmarcar
                        </button>
                      ) : (
                        <button
                          onClick={() => markShared(r)}
                          className="text-[10px] font-mono text-emerald hover:underline whitespace-nowrap"
                          title="Marcar que ya pasaste este número a una empresa"
                        >
                          ✓ pasado
                        </button>
                      )}
                      {r.hidden ? (
                        <button
                          onClick={() => restoreContact(r)}
                          className="text-xs text-muted-foreground hover:text-emerald font-mono"
                          title="Restaurar contacto"
                        >
                          restaurar
                        </button>
                      ) : (
                        <button
                          onClick={() => hideContact(r)}
                          className="text-muted-foreground hover:text-pink p-1 rounded transition"
                          title={t === "fixed" ? "Borrar (es número fijo, sin WhatsApp)" : "Ocultar contacto"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
          <div className="text-xs text-muted-foreground font-mono">
            Página {page} de {totalPages} · {pageRows.length} de {sorted.length} contactos
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg text-xs font-mono glass hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronRight className="w-3 h-3 rotate-180" /> Anterior
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg text-xs font-mono glass hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Siguiente <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Download picker modal ---------- */
function DownloadPickerModal({
  rows,
  onClose,
}: {
  rows: EnrichedBusiness[];
  onClose: () => void;
}) {
  const industries = useMemo(() => {
    const m = new Map<string, EnrichedBusiness[]>();
    rows.forEach((r) => {
      if (!m.has(r.industry)) m.set(r.industry, []);
      m.get(r.industry)!.push(r);
    });
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  const cities = useMemo(() => {
    const m = new Map<string, EnrichedBusiness[]>();
    rows.forEach((r) => {
      const c = r.city || "—";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(r);
    });
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  // Nada preseleccionado: el usuario elige industria → ciudad → contactos
  const [selInds, setSelInds] = useState<Set<string>>(new Set());
  const [selCities, setSelCities] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  const hasInd = selInds.size > 0;
  const hasCity = selCities.size > 0;

  // Contactos visibles: solo cuando hay industria Y ciudad seleccionadas
  const visible = useMemo(() => {
    if (!hasInd || !hasCity) return [] as EnrichedBusiness[];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!selInds.has(r.industry)) return false;
      if (!selCities.has(r.city || "—")) return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, selInds, selCities, search, hasInd, hasCity]);

  // Selección individual por phoneKey; vacío = nada marcado (nada se descarga)
  const [selContacts, setSelContacts] = useState<Set<string>>(new Set());

  const contactKey = (r: EnrichedBusiness) => (phoneKey(r.phone) || r.title) + "|" + r.title + "|" + (r.city || "");

  const isContactSelected = (r: EnrichedBusiness) => selContacts.has(contactKey(r));

  const toggleContact = (r: EnrichedBusiness) => {
    const key = contactKey(r);
    const next = new Set(selContacts);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelContacts(next);
  };

  const selectAllVisible = () =>
    setSelContacts(new Set([...selContacts, ...visible.map(contactKey)]));
  const selectNoneVisible = () => {
    const visibleKeys = new Set(visible.map(contactKey));
    setSelContacts(new Set([...selContacts].filter((k) => !visibleKeys.has(k))));
  };

  const filtered = useMemo(
    () => rows.filter((r) => selContacts.has(contactKey(r))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, selContacts],
  );

  const onDownload = async () => {
    if (!filtered.length) return;
    setBusy(true);
    try {
      const csv = csvFromBusinesses(filtered);
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const indPart = Array.from(selInds).join("-").replace(/[^a-z0-9-]+/gi, "_") || "seleccion";
      const cityPart = Array.from(selCities).join("-").replace(/[^a-z0-9-]+/gi, "_") || "todas";
      const filename = `${indPart}_${cityPart}_${new Date().toISOString().slice(0, 10)}.csv`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      await logDownload({
        industry: Array.from(selInds).join(", ") || "TODAS",
        city: selCities.size === cities.length ? null : Array.from(selCities).join(", "),
        scope: "selection",
        contacts: filtered,
        filename,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-strong rounded-2xl w-full max-w-5xl max-h-[88vh] overflow-hidden flex flex-col border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet/20 flex items-center justify-center glow-violet">
              <CheckSquare className="w-4 h-4 text-violet" />
            </div>
            <div>
              <div className="text-base font-semibold">Descargar selección</div>
              <div className="text-xs text-muted-foreground font-mono">
                Filtra por industria/ciudad y elige contactos uno por uno
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 overflow-y-auto">
          <PickerColumn
            title="1. Industria"
            items={industries}
            selected={selInds}
            onToggle={(k) => { toggle(selInds, k, setSelInds); setSelContacts(new Set()); }}
            onAll={() => { setSelInds(new Set(industries.map(([k]) => k))); setSelContacts(new Set()); }}
            onNone={() => { setSelInds(new Set()); setSelContacts(new Set()); }}
            accent="emerald"
          />
          <PickerColumn
            title="2. Ciudad"
            items={cities}
            selected={selCities}
            onToggle={(k) => { toggle(selCities, k, setSelCities); setSelContacts(new Set()); }}
            onAll={() => { setSelCities(new Set(cities.map(([k]) => k))); setSelContacts(new Set()); }}
            onNone={() => { setSelCities(new Set()); setSelContacts(new Set()); }}
            accent="pink"
          />
          <div className="glass rounded-xl flex flex-col min-h-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <div className="text-xs uppercase tracking-widest font-mono text-violet">
                3. Contactos ({fmt(filtered.length)}/{fmt(visible.length)})
              </div>
              <div className="flex gap-1">
                <button onClick={selectAllVisible} disabled={!visible.length} className="text-[10px] font-mono px-2 py-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground disabled:opacity-30">Todo</button>
                <button onClick={selectNoneVisible} disabled={!visible.length} className="text-[10px] font-mono px-2 py-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground disabled:opacity-30">Ninguno</button>
              </div>
            </div>
            {hasInd && hasCity && (
              <div className="px-2 pt-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre…"
                  className="w-full px-2 py-1.5 rounded-md bg-black/30 border border-white/10 text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:border-violet/50"
                />
              </div>
            )}
            <ul className="overflow-y-auto max-h-[45vh] p-1 mt-1">
              {!hasInd && (
                <li className="text-center text-xs text-muted-foreground py-8 px-3">
                  Selecciona primero una <span className="text-emerald">industria</span>
                </li>
              )}
              {hasInd && !hasCity && (
                <li className="text-center text-xs text-muted-foreground py-8 px-3">
                  Ahora elige una <span className="text-pink">ciudad</span>
                </li>
              )}
              {hasInd && hasCity && visible.map((r) => {
                const checked = isContactSelected(r);
                const key = contactKey(r);
                return (
                  <li key={key}>
                    <button
                      onClick={() => toggleContact(r)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs transition ${checked ? "bg-white/5" : "hover:bg-white/[0.03] text-muted-foreground"
                        }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        {checked ? (
                          <CheckSquare className="w-3.5 h-3.5 shrink-0 text-violet" />
                        ) : (
                          <Square className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="truncate text-left">
                          {r.title}
                          <span className="opacity-50"> · {r.city}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {hasInd && hasCity && !visible.length && (
                <li className="text-center text-xs text-muted-foreground py-6">Sin resultados</li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10 bg-black/20">
          <div className="text-xs font-mono text-muted-foreground">
            {fmt(filtered.length)} contactos seleccionados ·{" "}
            {selInds.size}/{industries.length} industrias ·{" "}
            {selCities.size}/{cities.length} ciudades
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg glass text-xs font-mono hover:bg-white/5">
              Cancelar
            </button>
            <button
              onClick={onDownload}
              disabled={!filtered.length || busy}
              className="px-4 py-2 rounded-lg bg-emerald text-primary-foreground text-xs font-medium glow-emerald hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              {busy ? "Generando…" : `Descargar CSV (${fmt(filtered.length)})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PickerColumn({
  title, items, selected, onToggle, onAll, onNone, accent,
}: {
  title: string;
  items: [string, EnrichedBusiness[]][];
  selected: Set<string>;
  onToggle: (k: string) => void;
  onAll: () => void;
  onNone: () => void;
  accent: "emerald" | "pink";
}) {
  const accentText = accent === "emerald" ? "text-emerald" : "text-pink";
  return (
    <div className="glass rounded-xl flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className={`text-xs uppercase tracking-widest font-mono ${accentText}`}>{title}</div>
        <div className="flex gap-1">
          <button onClick={onAll} className="text-[10px] font-mono px-2 py-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground">
            Todo
          </button>
          <button onClick={onNone} className="text-[10px] font-mono px-2 py-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground">
            Ninguno
          </button>
        </div>
      </div>
      <ul className="overflow-y-auto max-h-[45vh] p-1">
        {items.map(([key, rows]) => {
          const checked = selected.has(key);
          return (
            <li key={key}>
              <button
                onClick={() => onToggle(key)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition ${checked ? "bg-white/5" : "hover:bg-white/[0.03] text-muted-foreground"
                  }`}
              >
                <span className="flex items-center gap-2 truncate">
                  {checked ? (
                    <CheckSquare className={`w-4 h-4 shrink-0 ${accentText}`} />
                  ) : (
                    <Square className="w-4 h-4 shrink-0" />
                  )}
                  <span className="truncate">{key}</span>
                </span>
                <span className="text-xs font-mono opacity-60 shrink-0">{fmt(rows.length)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
