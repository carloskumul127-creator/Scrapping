import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { importarLote } from '@/integrations/supabase/importarLote';
import {
  X, CheckCircle2, ChevronRight, AlertTriangle, ArrowRight,
  Database, Loader2, Sparkles, Check, MessageSquare, Phone, MapPin, Building2, Eye, EyeOff
} from 'lucide-react';

interface DataImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  userId: string | null;
  onComplete: () => void;
}

interface ParsedData {
  headers: string[];
  rows: Record<string, any>[];
}

interface MappingResult {
  title: string | null;      // empresa_nombre_bruto
  phone: string | null;      // telefono_bruto
  industry: string | null;   // categoria_sugerida
  address: string | null;    // direccion_bruta
}

export default function DataImportWizard({
  isOpen,
  onClose,
  file,
  userId,
  onComplete
}: DataImportWizardProps) {
  // Wizard steps:
  // 1: Configurar Lote (Categoría / Ciudad)
  // 2: Mapeo Visual (Automático)
  // 3: Vista Previa (Tabla con 10 contactos)
  // 4: Procesando / Guardando en Supabase
  // 5: Validación WhatsApp
  const [step, setStep] = useState<number>(1);
  const [progress, setProgress] = useState<number>(20); // 20%, 40%, 60%, 80%, 100%

  // Lote configuration
  const [nombreLote, setNombreLote] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [showNuevaCatInput, setShowNuevaCatInput] = useState(false);

  // File parsing states
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Auto mapping state
  const [mappings, setMappings] = useState<MappingResult>({
    title: null,
    phone: null,
    industry: null,
    address: null,
  });

  // DB Insert State
  const [insertResult, setInsertResult] = useState<{
    loteId: string;
    totalInsertados: number;
    totalIgnorados: number;
    errores: string[];
  } | null>(null);
  const [isInserting, setIsInserting] = useState(false);

  // WhatsApp Validation State
  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Record<string, boolean>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [leadsValidadosCount, setLeadsValidadosCount] = useState(0);
  const [hasValidated, setHasValidated] = useState(false);

  // Load existing categories from Supabase
  useEffect(() => {
    async function fetchCategorias() {
      const { data, error } = await (supabase.from('categorias') as any).select('id, nombre');
      if (!error && data) {
        setCategorias(data);
      }
    }
    if (isOpen) {
      fetchCategorias();
    }
  }, [isOpen]);

  // Set default values when file is passed
  useEffect(() => {
    if (file) {
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      setNombreLote(`${baseName}_${new Date().toISOString().slice(0, 10)}`);
      parseFile(file);
    }
  }, [file]);

  // Update progress percentage according to wizard step
  useEffect(() => {
    setProgress(step * 20);
  }, [step]);

  // Parse CSV or Excel files
  const parseFile = (fileToParse: File) => {
    setIsParsing(true);
    setParseError(null);

    const fileExtension = fileToParse.name.split('.').pop()?.toLowerCase();

    if (fileExtension === 'csv') {
      Papa.parse(fileToParse, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            const headers = Object.keys(results.data[0] as object);
            setParsedData({
              headers,
              rows: results.data as Record<string, any>[]
            });
            performAutoMapping(headers);
          } else {
            setParseError('El archivo CSV está vacío.');
          }
          setIsParsing(false);
        },
        error: (err) => {
          setParseError(`Error parsing CSV: ${err.message}`);
          setIsParsing(false);
        }
      });
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

          if (json && json.length > 0) {
            const headers = Object.keys(json[0]);
            setParsedData({
              headers,
              rows: json
            });
            performAutoMapping(headers);
          } else {
            setParseError('El archivo de Excel está vacío.');
          }
        } catch (err: any) {
          setParseError(`Error leyendo archivo Excel: ${err.message}`);
        } finally {
          setIsParsing(false);
        }
      };
      reader.onerror = () => {
        setParseError('Error de lectura de archivo.');
        setIsParsing(false);
      };
      reader.readAsBinaryString(fileToParse);
    } else {
      setParseError('Formato de archivo no soportado. Sube un CSV o Excel.');
      setIsParsing(false);
    }
  };

  // Automated intelligent heuristic mapping
  const performAutoMapping = (headers: string[]) => {
    const findMatch = (candidates: string[]) => {
      for (const cand of candidates) {
        const found = headers.find(h => h.toLowerCase().trim() === cand.toLowerCase() || h.toLowerCase().trim().includes(cand.toLowerCase()));
        if (found) return found;
      }
      return null;
    };

    const titleMap = findMatch(['title', 'name', 'nombre', 'empresa', 'business', 'company', 'titulo']);
    const phoneMap = findMatch(['phone', 'telefono', 'teléfono', 'celular', 'mobile', 'contacto']);
    const industryMap = findMatch(['industry', 'industria', 'categoria', 'categoría', 'tag', 'rubro', 'sector']);
    const addressMap = findMatch(['address', 'direccion', 'dirección', 'ubicacion', 'location', 'calle']);

    setMappings({
      title: titleMap,
      phone: phoneMap,
      industry: industryMap,
      address: addressMap,
    });
  };

  // Convert mapped data back to the schema expected by `importarLote.ts`
  const generateNormalizedCSVFile = (): File => {
    if (!parsedData) throw new Error('No hay datos parseados');

    const transformedRows = parsedData.rows.map(row => {
      // Map dirty keys to exactly what FilaCSV expects in importarLote.ts
      return {
        'Google maps href': row[mappings.title || ''] || '', // Just a mock or website
        'empresa_nombre_bruto': mappings.title ? String(row[mappings.title] || '') : '',
        'Estrella': row['Rating'] || row['Estrella'] || row['Stars'] || '5',
        'Reseña': row['Reviews'] || row['Reseña'] || row['Resenas'] || '0',
        'categoria_sugerida': mappings.industry ? String(row[mappings.industry] || '') : (nuevaCategoria || selectedCategoria || 'General'),
        'direccion_bruta': mappings.address ? String(row[mappings.address] || '') : 'Sin dirección',
        'Sitio Web': row['Website'] || row['Sitio Web'] || '',
        'telefono_bruto': mappings.phone ? String(row[mappings.phone] || '') : ''
      };
    });

    const csvContent = Papa.unparse(transformedRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    return new File([blob], file?.name || 'importacion.csv', { type: 'text/csv' });
  };

  // Trigger Supabase importation (Step 4)
  const handleDatabaseImport = async () => {
    if (!parsedData) return;
    setIsInserting(true);
    setStep(4);

    try {
      // 1. Rename category suggestions in CSV or create category if user typed a new one
      let catName = '';
      if (showNuevaCatInput && nuevaCategoria.trim()) {
        catName = nuevaCategoria.trim();
        // Add newly created category locally
        const { data: newCat, error: catError } = await (supabase
          .from('categorias') as any)
          .insert({ nombre: catName, activa: true })
          .select('id, nombre')
          .single();
        if (!catError && newCat) {
          setCategorias(prev => [...prev, newCat]);
          setSelectedCategoria(newCat.id);
        }
      } else {
        const found = categorias.find(c => c.id === selectedCategoria);
        catName = found ? found.nombre : 'General';
      }

      // Generate the clean file format to be compatible with importarLote.ts
      const cleanFile = generateNormalizedCSVFile();

      // 2. Call the server/db importer
      const res = await importarLote({
        archivo: cleanFile,
        nombreLote: nombreLote || file?.name || 'Lote',
        ciudad: ciudad || 'General',
        usuarioId: userId,
      });

      setInsertResult(res);

      // Fetch the newly inserted raw leads for WhatsApp Validation step
      const { data: newlyInserted, error: fetchError } = await (supabase
        .from('leads_raw') as any)
        .select('*')
        .eq('lote_id', res.loteId);

      if (!fetchError && newlyInserted) {
        setRawLeads(newlyInserted);
        // Pre-select all leads for validation
        const initialSelection: Record<string, boolean> = {};
        newlyInserted.forEach((l: any) => {
          initialSelection[l.id] = true;
        });
        setSelectedLeads(initialSelection);
      }

      // Advance to Step 5 (WhatsApp Validation)
      setStep(5);
    } catch (err: any) {
      alert(`Error al importar: ${err.message}`);
      setStep(3); // return to preview if it fails
    } finally {
      setIsInserting(false);
    }
  };

  // Perform WhatsApp API validation simulation
  const handleValidateWhatsApp = async () => {
    const selectedIds = Object.keys(selectedLeads).filter(id => selectedLeads[id]);
    if (selectedIds.length === 0) {
      alert('Por favor selecciona al menos un contacto para validar.');
      return;
    }

    setIsValidating(true);
    setValidationProgress(0);
    setLeadsValidadosCount(0);

    // Fetch latest categories to map suggestions to actual category IDs
    const { data: latestCats } = await (supabase.from('categorias') as any).select('id, nombre');
    const catMap = new Map<string, string>();
    if (latestCats) {
      latestCats.forEach((c: any) => {
        catMap.set(c.nombre.toLowerCase().trim(), c.id);
      });
    }

    const total = selectedIds.length;
    let validated = 0;

    // We will validate in batches to simulate realistic API latency and update db
    for (let i = 0; i < total; i++) {
      const id = selectedIds[i];

      // Simulate network request to WhatsApp validation API
      await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 150));

      // Decide WA type (business, normal, or fijo)
      const rand = Math.random();
      let type: 'business' | 'normal' | 'fijo' = 'normal';
      if (rand < 0.35) type = 'business';
      else if (rand < 0.5) type = 'fijo';

      // 1. Update status of lead_raw as processed = true, status = true
      // 2. Insert into leads_final
      const leadRaw = rawLeads.find(l => l.id === id);
      if (leadRaw) {
        // Mark as processed in leads_raw
        await (supabase
          .from('leads_raw') as any)
          .update({ procesado: true, status: true })
          .eq('id', id);

        // Resolve final category ID
        let finalCategoriaId: string | null = selectedCategoria || null;
        if (leadRaw.categoria_sugerida) {
          const suggestedNormalized = leadRaw.categoria_sugerida.toLowerCase().trim();
          if (catMap.has(suggestedNormalized)) {
            finalCategoriaId = catMap.get(suggestedNormalized) || null;
          }
        }

        // Insert into leads_final
        await (supabase
          .from('leads_final') as any)
          .insert({
            raw_id: id,
            nombre_empresa: leadRaw.empresa_nombre_bruto,
            telefono_e164: leadRaw.telefono_bruto,
            tipo_whatsapp: type,
            categoria_id: finalCategoriaId,
          });
      }

      validated++;
      setLeadsValidadosCount(validated);
      setValidationProgress(Math.round((validated / total) * 100));
    }

    setIsValidating(false);
    setHasValidated(true);
  };

  const handleFinish = () => {
    onComplete();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#070b19]/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-strong rounded-3xl border border-white/10 w-full max-w-4xl shadow-2xl relative flex flex-col my-8 overflow-hidden max-h-[85vh]">
        {/* Top Gradient Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald via-azure to-violet" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald/20 flex items-center justify-center glow-emerald">
              <Sparkles className="w-5 h-5 text-emerald" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Importación Inteligente de Leads</h2>
              <p className="text-xs text-muted-foreground font-mono">
                {file ? `Archivo: ${file.name}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 hover:text-pink text-muted-foreground transition duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {/* STEP 1: CONFIGURAR LOTE */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center max-w-lg mx-auto mb-4">
                <h3 className="text-lg font-semibold text-foreground">Configuración de Importación</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Define dónde se guardarán los contactos antes de iniciar el mapeo inteligente.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lote Nombre */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Nombre del Lote</label>
                  <input
                    type="text"
                    value={nombreLote}
                    onChange={(e) => setNombreLote(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald/50 focus:bg-white/10 transition-all text-foreground"
                    placeholder="Ej. Constructoras_Mérida_Mayo"
                  />
                </div>

                {/* Ciudad */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Ciudad Origen</label>
                  <input
                    type="text"
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald/50 focus:bg-white/10 transition-all text-foreground"
                    placeholder="Ej. Mérida, Guadalajara"
                  />
                </div>

                {/* Categoría */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Categoría Principal</label>
                  {!showNuevaCatInput ? (
                    <div className="flex gap-2">
                      <select
                        value={selectedCategoria}
                        onChange={(e) => setSelectedCategoria(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald/50 focus:bg-white/10 transition-all text-foreground"
                      >
                        <option value="" className="bg-[#0b1020]">-- Selecciona una Categoría --</option>
                        {categorias.map(cat => (
                          <option key={cat.id} value={cat.id} className="bg-[#0b1020]">{cat.nombre}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNuevaCatInput(true)}
                        className="glass px-4 rounded-xl text-xs font-mono text-emerald border-emerald/30 hover:glow-emerald transition shrink-0"
                      >
                        + Crear Nueva
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={nuevaCategoria}
                        onChange={(e) => setNuevaCategoria(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald/50 focus:bg-white/10 transition-all text-foreground"
                        placeholder="Nombre de la nueva categoría"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNuevaCatInput(false)}
                        className="glass px-4 rounded-xl text-xs font-mono text-muted-foreground transition shrink-0"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  disabled={!nombreLote || !ciudad || (!selectedCategoria && !nuevaCategoria)}
                  onClick={() => setStep(2)}
                  className="bg-emerald hover:bg-emerald/90 text-primary-foreground px-6 py-3 rounded-xl font-medium tracking-wide transition-all glow-emerald disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Continuar <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MAPEO VISUAL (AUTOMÁTICO) */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center max-w-lg mx-auto">
                <h3 className="text-lg font-semibold text-foreground">Escaneo y Mapeo Inteligente</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Hemos mapeado automáticamente los campos necesarios. Todo lo demás se omitirá.
                </p>
              </div>

              {isParsing ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="w-8 h-8 text-emerald animate-spin" />
                  <p className="text-sm font-mono text-muted-foreground">Procesando archivo...</p>
                </div>
              ) : parseError ? (
                <div className="p-4 rounded-xl bg-pink/10 border border-pink/20 text-center space-y-2">
                  <AlertTriangle className="w-8 h-8 text-pink mx-auto" />
                  <p className="text-sm font-medium text-pink">{parseError}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-white/[0.01] p-6 rounded-2xl border border-white/5 relative">
                  {/* Clean side (Limpio) */}
                  <div className="space-y-4">
                    <h4 className="text-xs uppercase tracking-widest text-emerald font-mono mb-2">CAMPOS LIMPIOS</h4>
                    
                    {[
                      { key: 'title', label: 'Nombre de Empresa', icon: <Building2 className="w-4 h-4 text-emerald" /> },
                      { key: 'phone', label: 'Teléfono / WhatsApp', icon: <Phone className="w-4 h-4 text-emerald" /> },
                      { key: 'industry', label: 'Industria', icon: <Sparkles className="w-4 h-4 text-emerald" /> },
                      { key: 'address', label: 'Dirección', icon: <MapPin className="w-4 h-4 text-emerald" /> }
                    ].map(item => {
                      const dirtyMatch = mappings[item.key as keyof MappingResult];
                      return (
                        <div key={item.key} className="glass border-emerald/20 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden group">
                          <div className="absolute top-0 left-0 w-1 h-full bg-emerald" />
                          <div className="flex items-center gap-3">
                            {item.icon}
                            <div>
                              <div className="text-xs text-muted-foreground font-mono uppercase">Requerido</div>
                              <div className="text-sm font-medium text-foreground">{item.label}</div>
                            </div>
                          </div>
                          {dirtyMatch ? (
                            <div className="text-xs font-mono bg-emerald/10 text-emerald border border-emerald/20 px-2.5 py-1 rounded-md">
                              ✓ Mapeado
                            </div>
                          ) : (
                            <div className="text-xs font-mono bg-pink/10 text-pink border border-pink/20 px-2.5 py-1 rounded-md">
                              ⚠️ Buscando...
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Dirty matches visual connection with lines */}
                  <div className="space-y-4">
                    <h4 className="text-xs uppercase tracking-widest text-pink font-mono mb-2">DATOS SUCIOS MAPEADOS</h4>

                    {[
                      { key: 'title', label: 'Nombre de Empresa' },
                      { key: 'phone', label: 'Teléfono / WhatsApp' },
                      { key: 'industry', label: 'Industria' },
                      { key: 'address', label: 'Dirección' }
                    ].map(item => {
                      const dirtyMatch = mappings[item.key as keyof MappingResult];
                      return (
                        <div key={item.key} className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                          dirtyMatch 
                            ? 'glass border-azure/20 text-foreground bg-azure/5 shadow-md' 
                            : 'bg-white/5 border-pink/20 text-muted-foreground bg-pink/5'
                        }`}>
                          <ArrowRight className={`w-4 h-4 shrink-0 ${dirtyMatch ? 'text-azure animate-pulse' : 'text-pink animate-pulse'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-muted-foreground font-mono uppercase">Columna para {item.label}</div>
                            <select
                              value={dirtyMatch || ''}
                              onChange={(e) => {
                                const val = e.target.value || null;
                                setMappings(prev => ({
                                  ...prev,
                                  [item.key]: val
                                }));
                              }}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-azure/50 focus:bg-[#0b1020] text-azure font-mono cursor-pointer mt-1 font-semibold"
                            >
                              <option value="" className="bg-[#0b1020] text-muted-foreground">-- No mapeado --</option>
                              {parsedData?.headers.map(h => (
                                <option key={h} value={h} className="bg-[#0b1020] text-foreground">
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="glass px-5 py-3 rounded-xl text-sm font-medium text-foreground transition hover:bg-white/5"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  disabled={!mappings.title || !mappings.phone || isParsing || !!parseError}
                  onClick={() => setStep(3)}
                  className="bg-emerald hover:bg-emerald/90 text-primary-foreground px-6 py-3 rounded-xl font-medium tracking-wide transition-all glow-emerald disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Continuar <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: VISTA PREVIA (10 CONTACTOS) */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center max-w-lg mx-auto">
                <h3 className="text-lg font-semibold text-foreground">Vista Previa de Contactos</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Aquí tienes una vista previa de los primeros 10 registros limpios listos para registrar.
                </p>
              </div>

              {parsedData && (
                <div className="space-y-4">
                  <div className="text-xs text-muted-foreground font-mono flex items-center justify-between">
                    <span>Total en archivo: {parsedData.rows.length} registros</span>
                    <span className="text-emerald font-semibold">✓ Mapeo listo</span>
                  </div>

                  <div className="overflow-x-auto border border-white/10 rounded-2xl glass">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-white/5 border-b border-white/10 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                          <th className="p-4 font-semibold">Empresa</th>
                          <th className="p-4 font-semibold">Teléfono</th>
                          <th className="p-4 font-semibold">Categoría / Industria</th>
                          <th className="p-4 font-semibold">Dirección</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {parsedData.rows.slice(0, 10).map((row, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-4 font-medium text-foreground max-w-[200px] truncate">
                              {mappings.title ? String(row[mappings.title] || '—') : '—'}
                            </td>
                            <td className="p-4 font-mono text-muted-foreground">
                              {mappings.phone ? String(row[mappings.phone] || '—') : '—'}
                            </td>
                            <td className="p-4 text-muted-foreground max-w-[150px] truncate">
                              {mappings.industry ? String(row[mappings.industry] || '—') : (nuevaCategoria || selectedCategoria || '—')}
                            </td>
                            <td className="p-4 text-muted-foreground max-w-[250px] truncate">
                              {mappings.address ? String(row[mappings.address] || '—') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="glass px-5 py-3 rounded-xl text-sm font-medium text-foreground transition hover:bg-white/5"
                >
                  Atrás
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="glass px-5 py-3 rounded-xl text-sm font-medium text-pink border-pink/30 hover:glow-pink transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDatabaseImport}
                    className="bg-emerald hover:bg-emerald/90 text-primary-foreground px-6 py-3 rounded-xl font-medium tracking-wide transition-all glow-emerald flex items-center gap-2"
                  >
                    <Database className="w-4 h-4" /> Agregar a la base de datos
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: PROCESANDO IMPORTACIÓN */}
          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-16 space-y-6 animate-fade-in">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-emerald/20 border-t-emerald animate-spin" />
                <Database className="w-6 h-6 text-emerald absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Registrando en Supabase...</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Guardando leads sucios en <code className="text-emerald">leads_raw</code> y procesando categorías. Esto tomará solo unos segundos.
                </p>
              </div>
            </div>
          )}

          {/* STEP 5: VALIDACIÓN WHATSAPP */}
          {step === 5 && (
            <div className="space-y-6 animate-fade-in max-h-[60vh] flex flex-col">
              <div className="text-center max-w-lg mx-auto shrink-0">
                <h3 className="text-lg font-semibold text-foreground">Validación de Números (Simulador API)</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Valida los números recién importados para verificar si corresponden a cuentas normales, corporativas o teléfonos fijos.
                </p>
              </div>

              {insertResult && (
                <div className="grid grid-cols-3 gap-4 shrink-0">
                  <div className="glass rounded-xl p-4 text-center">
                    <div className="text-xs font-mono text-muted-foreground uppercase">Importados</div>
                    <div className="text-2xl font-semibold text-emerald">{insertResult.totalInsertados}</div>
                  </div>
                  <div className="glass rounded-xl p-4 text-center">
                    <div className="text-xs font-mono text-muted-foreground uppercase">Ignorados (Sin Teléfono)</div>
                    <div className="text-2xl font-semibold text-pink">{insertResult.totalIgnorados}</div>
                  </div>
                  <div className="glass rounded-xl p-4 text-center">
                    <div className="text-xs font-mono text-muted-foreground uppercase">Validados WhatsApp</div>
                    <div className="text-2xl font-semibold text-azure">{leadsValidadosCount} / {rawLeads.length}</div>
                  </div>
                </div>
              )}

              {/* Progress bar inside WhatsApp verification screen */}
              {isValidating && (
                <div className="space-y-2 bg-azure/5 border border-azure/20 p-4 rounded-2xl shrink-0">
                  <div className="flex justify-between text-xs font-mono text-azure">
                    <span>Validando contactos por WhatsApp API...</span>
                    <span>{validationProgress}%</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-azure h-full transition-all duration-300 rounded-full"
                      style={{ width: `${validationProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Paged Table for all raw leads to validate */}
              <div className="flex-1 overflow-y-auto border border-white/10 rounded-2xl glass min-h-[200px]">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      <th className="p-4 font-semibold w-12">
                        <input
                          type="checkbox"
                          disabled={isValidating || hasValidated}
                          checked={rawLeads.length > 0 && Object.keys(selectedLeads).filter(id => selectedLeads[id]).length === rawLeads.length}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const nextSel: Record<string, boolean> = {};
                            rawLeads.forEach(l => nextSel[l.id] = checked);
                            setSelectedLeads(nextSel);
                          }}
                          className="rounded border-white/20 bg-white/5 text-emerald focus:ring-emerald focus:ring-offset-[#0b1020]"
                        />
                      </th>
                      <th className="p-4 font-semibold">Empresa</th>
                      <th className="p-4 font-semibold">Teléfono</th>
                      <th className="p-4 font-semibold">Categoría</th>
                      <th className="p-4 font-semibold">Dirección</th>
                      <th className="p-4 font-semibold text-right">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rawLeads.map((lead, i) => (
                      <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            disabled={isValidating || hasValidated}
                            checked={!!selectedLeads[lead.id]}
                            onChange={(e) => {
                              setSelectedLeads(prev => ({
                                ...prev,
                                [lead.id]: e.target.checked
                              }));
                            }}
                            className="rounded border-white/20 bg-white/5 text-emerald focus:ring-emerald focus:ring-offset-[#0b1020]"
                          />
                        </td>
                        <td className="p-4 font-medium text-foreground max-w-[200px] truncate">{lead.empresa_nombre_bruto}</td>
                        <td className="p-4 font-mono text-muted-foreground">{lead.telefono_bruto}</td>
                        <td className="p-4 text-muted-foreground">{lead.categoria_sugerida || 'General'}</td>
                        <td className="p-4 text-muted-foreground max-w-[200px] truncate">{lead.direccion_bruta || 'Sin dirección'}</td>
                        <td className="p-4 text-right">
                          {lead.procesado ? (
                            <span className="text-xs font-mono bg-azure/10 text-azure border border-azure/20 px-2 py-0.5 rounded">
                              ✓ Validado
                            </span>
                          ) : (
                            <span className="text-xs font-mono bg-amber/10 text-amber border border-amber/20 px-2 py-0.5 rounded">
                              Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rawLeads.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground font-mono">
                          No se encontraron leads para validar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between pt-4 shrink-0">
                <button
                  type="button"
                  disabled={isValidating}
                  onClick={onClose}
                  className="glass px-5 py-3 rounded-xl text-sm font-medium text-foreground transition hover:bg-white/5 disabled:opacity-50"
                >
                  Cerrar
                </button>
                <div className="flex gap-2">
                  {!hasValidated ? (
                    <button
                      type="button"
                      disabled={isValidating || Object.keys(selectedLeads).filter(id => selectedLeads[id]).length === 0}
                      onClick={handleValidateWhatsApp}
                      className="bg-azure hover:bg-azure/90 text-primary-foreground px-6 py-3 rounded-xl font-medium tracking-wide transition-all glow-azure disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isValidating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Validando {leadsValidadosCount}...
                        </>
                      ) : (
                        <>
                          <Phone className="w-4 h-4" />
                          Validar Números por WhatsApp
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleFinish}
                      className="bg-emerald hover:bg-emerald/90 text-primary-foreground px-6 py-3 rounded-xl font-medium tracking-wide transition-all glow-emerald flex items-center gap-2 animate-bounce"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Finalizar e Importar al Dashboard
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PERSISTENT PROGRESS BAR */}
        <div className="px-6 py-4 border-t border-white/5 bg-white/[0.01] shrink-0">
          <div className="flex justify-between text-xs font-mono text-muted-foreground mb-2">
            <span>PASO {step} DE 5: {
              step === 1 ? 'Configurar Categoría y Ciudad' :
              step === 2 ? 'Mapeo Visual de Datos' :
              step === 3 ? 'Vista Previa de Contactos' :
              step === 4 ? 'Procesando en Supabase' :
              'Validación de WhatsApp API'
            }</span>
            <span>{progress}% Completado</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald via-azure to-violet h-full transition-all duration-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
