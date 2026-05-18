import { supabase } from "@/integrations/supabase/client";
import type { Business } from "./dataset";

export type WhatsappType = "business" | "normal" | "fixed" | null;

export type ContactOverride = {
  phone: string;
  title: string | null;
  whatsapp_type: WhatsappType;
  hidden: boolean;
  shared: boolean;
  shared_at: string | null;
  shared_with: string | null;
  updated_at: string;
};

export type DownloadEntry = {
  id: string;
  industry: string;
  city: string | null;
  scope: string;
  contact_count: number;
  contact_titles: string[];
  filename: string | null;
  created_at: string;
};

/** Normalise phone for stable PK (digits only). */
export const phoneKey = (phone: string): string => phone.replace(/\D/g, "");

/**
 * Heuristic phone classifier for Mexican numbers.
 *  - 10-digit MX mobiles (lada celular) → WhatsApp normal (assumed).
 *  - 10-digit MX landlines (lada fija)   → fixed (no WhatsApp).
 *  - Numbers <10 digits or unknown → fixed (cannot be reached on WA).
 * Business vs Normal cannot be detected without WhatsApp Business API → defaults to "normal".
 */
export function classifyPhone(phone: string): { whatsapp: boolean; type: WhatsappType } {
  const digits = phoneKey(phone);
  if (digits.length < 10) return { whatsapp: false, type: "fixed" };

  // Strip MX country code (52 / 521) if present
  let local = digits;
  if (local.length === 12 && local.startsWith("52")) local = local.slice(2);
  if (local.length === 13 && local.startsWith("521")) local = local.slice(3);

  if (local.length !== 10) {
    // Non-MX: treat as mobile by default
    return { whatsapp: true, type: "normal" };
  }

  // Mexican mobile lada (cellular). Common MX mobile area codes start with these prefixes:
  // 55, 56 (CDMX/EdoMex mobile), 33 (GDL), 81 (MTY), 222, 442, 477, 998, 999, 664...
  // A robust heuristic: the 4th digit of a MX mobile is usually 1-9 in the mobile range,
  // but the cleanest public rule is: mobile if first 2 digits are in mobile ladas list.
  const lada2 = local.slice(0, 2);
  const lada3 = local.slice(0, 3);
  const mobileLadas2 = new Set(["55", "56", "33", "81"]);
  const mobileLadas3 = new Set([
    "222","223","225","228","229","231","238","244","246","248","249",
    "271","272","273","274","275","276","278","281","282","283","285","287","288",
    "311","312","313","314","315","316","317","318","319","321","322","323","324","325","326","327","328","329",
    "341","342","343","344","345","346","347","348","351","352","353","354","355","356","357","358","359",
    "371","372","373","374","375","376","377","378","381","382","383","384","385","386","387","388","389",
    "391","392","393","394","395","396","411","412","413","414","415","417","418","419","421","422","423","424","425","426","427","428","429",
    "431","432","433","434","435","436","437","438","441","442","443","444","445","447","448","449",
    "451","452","453","454","455","456","458","459","461","462","463","464","465","466","467","468","469","471","472","473","474","475","476","477","478","492","493","494","495","496","498","499",
    "612","613","614","615","616","618","621","622","623","624","625","626","627","628","629","631","632","633","634","635","636","637","638","639","641","642","643","644","645","646","647","648","649","651","652","653","656","658","659","661","662","664","665","667","668","669","671","672","673","674","675","676","677","686","687","694","695","696","697","698","711","712","713","714","715","716","717","718","719","721","722","723","724","725","726","727","728","729","731","732","733","734","735","736","737","738","739","741","742","743","744","745","746","747","748","749","751","753","754","755","756","757","758","759","761","762","763","764","765","766","767","768","769","771","772","773","774","775","776","777","778","779","781","782","783","784","785","786","787","788","789","791","793","794","796","797",
    "811","812","813","814","815","816","817","818","819","821","822","823","824","825","826","827","828","829","831","832","833","834","835","836","841","842","844","845","846","861","862","864","865","866","867","868","869","871","872","873","877","878","891","892","893","894","896","897","898","899",
    "911","912","913","914","915","916","917","918","919","921","922","923","924","932","933","934","936","937","938","951","953","954","958","961","962","963","964","965","966","967","968","969","971","972","981","982","983","984","985","986","987","988","991","992","993","994","995","996","997","998","999",
  ]);

  if (mobileLadas2.has(lada2) || mobileLadas3.has(lada3)) {
    return { whatsapp: true, type: "normal" };
  }

  // Anything else 10-digit → assume landline / fijo
  return { whatsapp: false, type: "fixed" };
}

/* ---------- downloads ---------- */
export async function logDownload(entry: {
  industry: string;
  city?: string | null;
  scope: string;
  contacts: Pick<Business, "title">[];
  filename?: string;
}) {
  const titles = entry.contacts.map((c) => c.title).filter(Boolean).slice(0, 500);
  const { error } = await supabase.from("downloads").insert({
    industry: entry.industry,
    city: entry.city ?? null,
    scope: entry.scope,
    contact_count: entry.contacts.length,
    contact_titles: titles,
    filename: entry.filename ?? null,
  });
  if (error) console.error("[downloads] insert", error);
}

export async function fetchDownloads(): Promise<DownloadEntry[]> {
  const { data, error } = await supabase
    .from("downloads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[downloads] fetch", error);
    return [];
  }
  return (data ?? []) as unknown as DownloadEntry[];
}

export async function deleteDownload(id: string) {
  const { error } = await supabase.from("downloads").delete().eq("id", id);
  if (error) console.error("[downloads] delete", error);
}

/* ---------- contact overrides ---------- */
export async function fetchOverrides(): Promise<Record<string, ContactOverride>> {
  const { data, error } = await supabase.from("contact_overrides").select("*");
  if (error) {
    console.error("[overrides] fetch", error);
    return {};
  }
  const map: Record<string, ContactOverride> = {};
  (data ?? []).forEach((o: any) => {
    map[o.phone] = o as ContactOverride;
  });
  return map;
}

export async function upsertOverride(o: {
  phone: string;
  title?: string;
  whatsapp_type?: WhatsappType;
  hidden?: boolean;
  shared?: boolean;
  shared_at?: string | null;
  shared_with?: string | null;
}) {
  const payload: any = {
    phone: o.phone,
    title: o.title ?? null,
    whatsapp_type: o.whatsapp_type ?? null,
    hidden: o.hidden ?? false,
    updated_at: new Date().toISOString(),
  };
  if (o.shared !== undefined) payload.shared = o.shared;
  if (o.shared_at !== undefined) payload.shared_at = o.shared_at;
  if (o.shared_with !== undefined) payload.shared_with = o.shared_with;
  const { error } = await supabase
    .from("contact_overrides")
    .upsert(payload, { onConflict: "phone" });
  if (error) console.error("[overrides] upsert", error);
}
