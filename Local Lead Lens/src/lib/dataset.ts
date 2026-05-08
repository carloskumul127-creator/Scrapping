export type Business = {
  title: string;
  rating: number | null;
  reviews: number | null;
  phone: string;
  industry: string;
  address: string;
  website: string;
  mapsLink: string;
  city: string;
  reviewDate?: string | null;
  whatsapp?: boolean;
};

const pickKey = (obj: Record<string, any>, candidates: string[]) => {
  const keys = Object.keys(obj);
  for (const c of candidates) {
    const k = keys.find((k) => k.toLowerCase().trim() === c.toLowerCase());
    if (k) return obj[k];
  }
  return undefined;
};

export const extractCity = (address: string): string => {
  if (!address) return "Sin ciudad";
  // Try to pick a city-like token: "..., City, State, Country" or "City, ..."
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "Sin ciudad";
  // Heuristic: take 2nd-to-last (often city in "Street, City, State ZIP, Country")
  const candidate = parts.length >= 3 ? parts[parts.length - 3] : parts[0];
  // Strip postal codes / numbers
  return candidate.replace(/\d{4,}/g, "").replace(/\s+/g, " ").trim() || "Sin ciudad";
};

export const normalizeRow = (row: Record<string, any>): Business => {
  const title = String(pickKey(row, ["Title", "Name", "Nombre"]) ?? "").trim();
  const ratingRaw = pickKey(row, ["Rating", "Calificación", "Calificacion"]);
  const reviewsRaw = pickKey(row, ["Reviews", "Reseñas", "Resenas"]);
  const phone = String(pickKey(row, ["Phone", "Teléfono", "Telefono"]) ?? "").trim();
  const industry = String(pickKey(row, ["Industry", "Industria", "Categoría", "Categoria", "Tag"]) ?? "Otros").trim() || "Otros";
  const address = String(pickKey(row, ["Address", "Dirección", "Direccion"]) ?? "").trim();
  const website = String(pickKey(row, ["Website", "Sitio Web", "URL"]) ?? "").trim();
  const mapsLink = String(pickKey(row, ["Google Maps Link", "Maps", "Google Maps", "Link"]) ?? "").trim();
  const reviewDate = pickKey(row, ["Date", "Fecha", "Review Date"]);
  const city = String(pickKey(row, ["City", "Ciudad"]) ?? extractCity(address)).trim() || "Sin ciudad";

  return {
    title,
    rating: ratingRaw === "" || ratingRaw == null ? null : Number(ratingRaw) || null,
    reviews: reviewsRaw === "" || reviewsRaw == null ? null : Number(reviewsRaw) || null,
    phone,
    industry,
    address,
    website,
    mapsLink,
    city,
    reviewDate: reviewDate ? String(reviewDate) : null,
  };
};

export const sampleData: Business[] = [
  // Arquitectos
  { title: "Estudio MX Arquitectos", rating: 4.8, reviews: 142, phone: "+52 999 123 4567", industry: "Arquitectos", address: "Calle 60 #200, Mérida, Yucatán, México", website: "https://estudiomx.com", mapsLink: "https://maps.google.com/?q=estudio+mx", city: "Mérida" },
  { title: "Arquitectura Nórdica", rating: 4.6, reviews: 89, phone: "+52 999 234 5678", industry: "Arquitectos", address: "Av. Itzaes #500, Mérida, Yucatán, México", website: "", mapsLink: "https://maps.google.com/?q=nordica", city: "Mérida" },
  { title: "MTY Arquitectos", rating: 4.9, reviews: 312, phone: "+52 81 1234 5678", industry: "Arquitectos", address: "Av. Constitución 100, Monterrey, NL, México", website: "https://mtyarq.com", mapsLink: "https://maps.google.com/?q=mty", city: "Monterrey" },
  { title: "DF Studio", rating: 4.3, reviews: 56, phone: "+52 55 5555 1234", industry: "Arquitectos", address: "Polanco, CDMX, México", website: "https://dfstudio.mx", mapsLink: "https://maps.google.com/?q=dfstudio", city: "CDMX" },
  // Constructoras
  { title: "Constructora Peninsular", rating: 4.4, reviews: 220, phone: "+52 999 345 6789", industry: "Constructoras", address: "Periférico Norte, Mérida, Yucatán, México", website: "https://peninsular.mx", mapsLink: "https://maps.google.com/?q=peninsular", city: "Mérida" },
  { title: "Grupo Construye MTY", rating: 4.1, reviews: 178, phone: "+52 81 8765 4321", industry: "Constructoras", address: "San Pedro Garza García, Monterrey, NL, México", website: "https://construyemty.com", mapsLink: "https://maps.google.com/?q=construyemty", city: "Monterrey" },
  { title: "Edificadora Maya", rating: 3.9, reviews: 64, phone: "+52 999 456 7890", industry: "Constructoras", address: "Calle 50 #80, Mérida, Yucatán, México", website: "", mapsLink: "https://maps.google.com/?q=maya", city: "Mérida" },
  { title: "Construcciones Capital", rating: 4.7, reviews: 401, phone: "+52 55 9999 8888", industry: "Constructoras", address: "Reforma 500, CDMX, México", website: "https://capital.mx", mapsLink: "https://maps.google.com/?q=capital", city: "CDMX" },
  // Diseñadores
  { title: "Studio Interiores", rating: 4.5, reviews: 92, phone: "+52 999 999 0000", industry: "Diseñadores", address: "Paseo de Montejo, Mérida, Yucatán, México", website: "https://studiointeriores.com", mapsLink: "https://maps.google.com/?q=studio", city: "Mérida" },
  { title: "Casa Diseño MTY", rating: 4.2, reviews: 38, phone: "+52 81 0000 1111", industry: "Diseñadores", address: "Valle Oriente, Monterrey, NL, México", website: "", mapsLink: "https://maps.google.com/?q=casadis", city: "Monterrey" },
];
