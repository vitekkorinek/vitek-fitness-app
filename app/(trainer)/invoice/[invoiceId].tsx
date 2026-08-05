import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  Platform,
  InputAccessoryView,
  KeyboardAvoidingView,
  Share,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
const makeUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
import t from '@/i18n/en';
import { BottomSheet } from '@/components/BottomSheet';
import GlassPanel from '@/components/GlassPanel';
import type { Invoice, LineItem } from '@/types/database';
import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import { VFLogo, VF_LOCKUP_PATHS, VF_LOCKUP_RATIO, VF_LOCKUP_VIEWBOX } from '@/components/VFIcon';

// ─── Constants ────────────────────────────────────────────────────────────────

const BG = '#faf9f7';
const CARD = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const MUTED = '#999';
const RADIUS = 16;

// Sentinel id for a recipient typed manually (not a registered client). Never a
// real users.id — buildPayload maps it to client_id NULL + manual_client_name.
const MANUAL_CLIENT_ID = 'manual';

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientRow = {
  id: string;
  name: string;
  address_street: string | null;
  address_city: string | null;
  address_postcode: string | null;
  address_country: string | null;
};

type TrainerSettings = {
  full_name: string | null;
  address_street: string | null;
  address_city: string | null;
  address_postcode: string | null;
  steuernummer: string | null;
  vat_number: string | null;
  iban: string | null;
  bic: string | null;
  logo_url: string | null;
  invoice_number_start: number;
};

type PreviewData = {
  invoiceNumber: string;
  issueDate: string;
  trainerName: string;
  trainerStreet: string;
  trainerCity: string;
  trainerPostcode: string;
  trainerEmail: string;
  trainerSteuernummer: string;
  trainerVatNumber: string;
  trainerIban: string;
  trainerBic: string;
  clientName: string;
  clientStreet: string;
  clientCity: string;
  clientPostcode: string;
  clientCountry: string;
  lineItems: LineItem[];
  gross: number;
  net: number;
  vat: number;
  notes: string;
  localUri: string;
  html: string;
};

const EMPTY_LINE_ITEM: LineItem = {
  description: '',
  additional_info: '',
  leistungszeitraum: '',
  quantity: 1,
  unit_price_eur: 0,
  total_eur: 0,
};

const GENERIC_PRESETS: { label: string; description: string; price: number }[] = [
  { label: 'Quick 40, 6er',     description: '6×40min Personal Training in Fitness First Schönhauser Allee',  price: 480 },
  { label: 'Quick 40, 12er',    description: '12×40min Personal Training in Fitness First Schönhauser Allee', price: 900 },
  { label: 'Quick 40, 20er',    description: '20×40min Personal Training in Fitness First Schönhauser Allee', price: 1400 },
  { label: 'Standard 60, 6er',  description: '6×60min Personal Training in Fitness First Schönhauser Allee',  price: 540 },
  { label: 'Standard 60, 12er', description: '12×60min Personal Training in Fitness First Schönhauser Allee', price: 1020 },
  { label: 'Standard 60, 20er', description: '20×60min Personal Training in Fitness First Schönhauser Allee', price: 1600 },
  { label: 'Extended 75, 6er',  description: '6×75min Personal Training in Fitness First Schönhauser Allee',  price: 600 },
  { label: 'Extended 75, 12er', description: '12×75min Personal Training in Fitness First Schönhauser Allee', price: 1140 },
  { label: 'Extended 75, 20er', description: '20×75min Personal Training in Fitness First Schönhauser Allee', price: 1800 },
];


// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDisplayDate(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo - 1]} ${y}`;
}

function fmtGermanDate(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return `${d}. ${['Jan.','Feb.','Mär.','Apr.','Mai','Jun.','Jul.','Aug.','Sep.','Okt.','Nov.','Dez.'][mo - 1]} ${y}`;
}

function calcLeistungszeitraum(description: string, issueDate: string): string {
  const months = description.includes('20er') ? 12 : description.includes('12er') ? 9 : description.includes('6er') ? 6 : 0;
  if (!months || !issueDate) return '';
  const [y, mo, d] = issueDate.split('-').map(Number);
  let endMo = mo + months;
  let endY = y;
  while (endMo > 12) { endMo -= 12; endY++; }
  return `${d}.${mo}.${y}–${d}.${endMo}.${endY}`;
}

function calcTotals(items: LineItem[]): { gross: number; net: number; vat: number } {
  const gross = items.reduce((s, it) => s + it.total_eur, 0);
  const net = gross / 1.19;
  const vat = gross - net;
  return { gross, net, vat };
}

async function nextInvoiceNumber(trainerId: string, start: number): Promise<string> {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('created_by', trainerId)
    .ilike('invoice_number', `%-${year}`);

  let maxNum = start - 1;
  (data ?? []).forEach((row: any) => {
    const parts = (row.invoice_number as string).split('-');
    const n = parseInt(parts[0], 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });
  return `${maxNum + 1}-${year}`;
}

// ─── PDF HTML builder ─────────────────────────────────────────────────────────
// ⚠️ The PDF and the in-app InvoicePreviewModal are the SAME design — any layout
// change here must be mirrored there (Vitek: the saved PDF must look like the
// preview).

// The full VF lockup (mark centred over the wordmark) as inline SVG for the
// PDF (vector — crisp at any size).
function vfLogoSvg(height: number, color: string): string {
  const width = Math.round(height * VF_LOCKUP_RATIO);
  const paths = VF_LOCKUP_PATHS.map(d => `<path d="${d}" fill="${color}"/>`).join('');
  return `<svg width="${width}" height="${height}" viewBox="${VF_LOCKUP_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}

function buildInvoiceHtml(params: {
  invoiceNumber: string;
  issueDate: string;
  trainerName: string;
  trainerStreet: string;
  trainerCity: string;
  trainerPostcode: string;
  trainerEmail: string;
  trainerSteuernummer: string;
  trainerVatNumber: string;
  trainerIban: string;
  trainerBic: string;
  clientName: string;
  clientStreet: string;
  clientCity: string;
  clientPostcode: string;
  clientCountry: string;
  lineItems: LineItem[];
  gross: number;
  net: number;
  vat: number;
  notes: string;
}): string {
  const {
    invoiceNumber, issueDate,
    trainerName, trainerStreet, trainerCity, trainerPostcode, trainerEmail, trainerSteuernummer, trainerVatNumber, trainerIban, trainerBic,
    clientName, clientStreet, clientCity, clientPostcode, clientCountry,
    lineItems, gross, net, vat, notes,
  } = params;

  // German convention: postcode before city ("12051 Berlin")
  const trainerAddr = [trainerStreet, [trainerPostcode, trainerCity].filter(Boolean).join(' ')].filter(Boolean).join('<br>');
  const clientAddr = [clientStreet, [clientPostcode, clientCity].filter(Boolean).join(' '), clientCountry].filter(Boolean).join('<br>');

  const itemRows = lineItems.map(item => `
    <tr>
      <td style="padding:14px 0 12px 14px;border-bottom:1px solid #f2f2ef;vertical-align:top;">
        <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${escHtml(item.description)}</div>
        ${item.additional_info ? `<div style="font-size:11px;color:#666;margin-bottom:2px;">${escHtml(item.additional_info)}</div>` : ''}
        ${item.leistungszeitraum ? `<div style="font-size:11px;color:#888;font-style:italic;">Leistungszeitraum: ${escHtml(item.leistungszeitraum)}</div>` : ''}
      </td>
      <td style="padding:14px 14px 12px 24px;border-bottom:1px solid #f2f2ef;text-align:right;font-size:12px;vertical-align:top;white-space:nowrap;">${fmtEur(item.unit_price_eur)} €</td>
      <td style="padding:14px 14px 12px 24px;border-bottom:1px solid #f2f2ef;text-align:right;font-size:12px;vertical-align:top;">${item.quantity}</td>
      <td style="padding:14px 14px 12px 24px;border-bottom:1px solid #f2f2ef;text-align:right;font-size:12px;vertical-align:top;white-space:nowrap;">${fmtEur(item.total_eur)} €</td>
    </tr>
  `).join('');

  const thStyle = 'background:#244e43;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.8px;padding:10px 14px;';

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  /* print-color-adjust: WKWebView's print formatter strips CSS backgrounds
     ("economy" mode) without it — the green bar/top line/card tint vanish
     from the saved PDF while the preview shows them. Never remove. */
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Zero the print engine's own default page margin — .page padding is then the
     ONLY margin, so the white space is exactly what we set here. */
  @page { margin: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
  .page { padding: 52px 24px 48px; max-width: 680px; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; }
</style>
</head>
<body>
<div class="page">
  <!-- Rounded brand line across the top -->
  <div style="height:6px;background:#244e43;border-radius:100px;margin-bottom:30px;"></div>

  <!-- Header: title + sender left, brand lockup right (vertically centred) -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:36px;">
    <div>
      <div style="font-size:31px;font-weight:700;color:#1a1a1a;margin-bottom:16px;letter-spacing:-0.5px;">RECHNUNG</div>
      <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${escHtml(trainerName)}</div>
      <div style="font-size:11px;color:#666;line-height:1.65;">
        ${trainerAddr ? trainerAddr + '<br>' : ''}
        ${trainerEmail ? escHtml(trainerEmail) + '<br>' : ''}
        ${trainerSteuernummer ? 'Steuernummer: ' + escHtml(trainerSteuernummer) + '<br>' : ''}
        ${trainerVatNumber ? 'USt-IdNr.: ' + escHtml(trainerVatNumber) : ''}
      </div>
    </div>
    <div>
      ${vfLogoSvg(88, '#244e43')}
    </div>
  </div>

  <!-- Client + invoice meta box: Für left, label–value rows right.
       Off-green tint — Vitek: it "goes more with my brand". -->
  <div style="background:#e9efe9;border-radius:12px;padding:20px 22px;display:flex;margin-bottom:32px;">
    <div style="flex:1;padding-right:18px;">
      <div style="font-size:11px;color:#999;font-weight:600;margin-bottom:6px;">Für</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:5px;">${escHtml(clientName)}</div>
      <div style="font-size:11px;color:#666;line-height:1.7;">${clientAddr}</div>
    </div>
    <!-- Label sits tight next to its value (right-aligned pairs) — Vitek: the
         label–value gap of the space-between layout was "quite far from the data" -->
    <div style="display:flex;flex-direction:column;gap:14px;justify-content:flex-start;">
      <div style="display:flex;justify-content:flex-end;align-items:baseline;gap:14px;">
        <div style="font-size:10px;color:#999;font-weight:700;letter-spacing:0.5px;">RECHNUNG NUMMER</div>
        <div style="font-size:13px;font-weight:700;white-space:nowrap;">${escHtml(invoiceNumber)}</div>
      </div>
      <div style="display:flex;justify-content:flex-end;align-items:baseline;gap:14px;">
        <div style="font-size:10px;color:#999;font-weight:700;letter-spacing:0.5px;">AUSGESTELLT</div>
        <div style="font-size:13px;font-weight:700;white-space:nowrap;">${fmtGermanDate(issueDate)}</div>
      </div>
    </div>
  </div>

  <!-- Line items: rounded segmented green header bar (Vitek's reference) -->
  <table style="border-collapse:separate;border-spacing:0;margin-bottom:8px;">
    <thead>
      <tr>
        <th style="${thStyle}text-align:left;border-radius:8px 0 0 8px;">ARTIKEL</th>
        <th style="${thStyle}text-align:right;width:90px;border-left:1px solid rgba(255,255,255,0.22);">PREIS</th>
        <th style="${thStyle}text-align:right;width:64px;border-left:1px solid rgba(255,255,255,0.22);">MENGE</th>
        <th style="${thStyle}text-align:right;width:95px;border-left:1px solid rgba(255,255,255,0.22);border-radius:0 8px 8px 0;">BETRAG</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- Totals: light hairlines only — no heavy dark rules -->
  <div style="display:flex;justify-content:flex-end;margin-top:18px;">
    <table style="width:300px;">
      <tr>
        <td style="border-top:1px solid #e3e3df;padding:9px 0 5px;font-size:12px;color:#555;">Nettobetrag</td>
        <td style="border-top:1px solid #e3e3df;padding:9px 0 5px;font-size:12px;text-align:right;padding-left:32px;">${fmtEur(net)} €</td>
      </tr>
      <tr>
        <td style="padding:5px 0;font-size:12px;color:#555;">Mehrwertsteuer 19%</td>
        <td style="padding:5px 0;font-size:12px;text-align:right;">${fmtEur(vat)} €</td>
      </tr>
      <tr>
        <td style="border-top:1px solid #e3e3df;padding:9px 0 5px;font-size:12px;font-weight:700;color:#1a1a1a;">Gesamtbetrag</td>
        <td style="border-top:1px solid #e3e3df;padding:9px 0 5px;font-size:12px;font-weight:700;text-align:right;">${fmtEur(gross)} €</td>
      </tr>
    </table>
  </div>

  <!-- Betrag fällig -->
  <div style="display:flex;justify-content:flex-end;margin:24px 0 44px;">
    <div style="display:flex;justify-content:space-between;align-items:center;width:300px;">
      <span style="font-size:17px;font-weight:700;">Betrag fällig</span>
      <span style="font-size:17px;font-weight:700;">${fmtEur(gross)} €</span>
    </div>
  </div>

  <!-- Payment info — text indented 14px to sit on the same left edge as the
       ARTIKEL bar text / item names (at the page margin it read misaligned) -->
  <div style="border-top:1px solid #ebebe8;padding:18px 14px 0;">
    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:8px;">Zahlungs-Anweisungen</div>
    <div style="font-size:11px;color:#666;line-height:1.7;">
      Bank Details: ${escHtml(trainerName)}${trainerIban ? ' / IBAN: ' + escHtml(trainerIban) : ''}${trainerBic ? ' / BIC/SWIFT: ' + escHtml(trainerBic) : ''}
    </div>
    <div style="font-size:11px;color:#666;margin-top:8px;">Bitte als Verwendungszweck die Rechnungsnummer angeben.</div>
    <div style="font-size:11px;color:#666;margin-top:8px;">Please use the invoice number as the reference information.</div>
    ${notes ? `<div style="font-size:11px;color:#666;margin-top:8px;">${escHtml(notes)}</div>` : ''}
  </div>
</div>
</body>
</html>`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InvoiceScreen() {
  const headerH = useHeaderHeight();
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const isNew = invoiceId === 'new';
  const router = useRouter();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  // Core state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Preview modal
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  // Invoice data
  const [existingId, setExistingId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(todayIso());
  const [status, setStatus] = useState<'draft' | 'sent' | 'updated' | 'paid'>('draft');
  const [paidAt, setPaidAt] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...EMPTY_LINE_ITEM }]);
  const [notes, setNotes] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Mark as paid modal
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [paymentDateDraft, setPaymentDateDraft] = useState('');

  // Client
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientPickerVisible, setClientPickerVisible] = useState(false);
  const [manualClientVisible, setManualClientVisible] = useState(false);

  // Trainer settings
  const [trainerSettings, setTrainerSettings] = useState<TrainerSettings | null>(null);

  const [presetVisible, setPresetVisible] = useState(false);

  // Modal for date edit
  const [dateDraft, setDateDraft] = useState('');
  const [dateModalVisible, setDateModalVisible] = useState(false);

  // Modal for invoice number edit
  const [numberDraft, setNumberDraft] = useState('');
  const [numberModalVisible, setNumberModalVisible] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!profile?.id) return;

    const [settingsRes, clientsRes] = await Promise.all([
      supabase.from('trainer_settings').select('*').eq('trainer_id', profile.id).single(),
      supabase.from('users').select('id, name, address_street, address_city, address_postcode, address_country').eq('role', 'client').order('name'),
    ]);

    const ts: TrainerSettings = {
      full_name: settingsRes.data?.full_name ?? null,
      address_street: settingsRes.data?.address_street ?? null,
      address_city: settingsRes.data?.address_city ?? null,
      address_postcode: settingsRes.data?.address_postcode ?? null,
      steuernummer: settingsRes.data?.steuernummer ?? null,
      vat_number: settingsRes.data?.vat_number ?? null,
      iban: settingsRes.data?.iban ?? null,
      bic: settingsRes.data?.bic ?? null,
      logo_url: settingsRes.data?.logo_url ?? null,
      invoice_number_start: settingsRes.data?.invoice_number_start ?? 1,
    };
    setTrainerSettings(ts);
    setClients((clientsRes.data ?? []) as ClientRow[]);

    if (isNew) {
      const num = await nextInvoiceNumber(profile.id, ts.invoice_number_start);
      setInvoiceNumber(num);
    } else {
      const { data: inv } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();
      if (inv) {
        const invoice = inv as Invoice;
        setExistingId(invoice.id);
        setInvoiceNumber(invoice.invoice_number);
        setIssueDate(invoice.issue_date);
        setStatus(invoice.status);
        setPaidAt((invoice as any).paid_at ?? null);
        setLineItems((invoice.line_items as LineItem[]).length > 0 ? invoice.line_items as LineItem[] : [{ ...EMPTY_LINE_ITEM }]);
        setNotes(invoice.notes ?? '');
        setPdfUrl(invoice.pdf_url);
        // Restore client from snapshot
        if (invoice.client_id) {
          const found = (clientsRes.data ?? []).find((c: any) => c.id === invoice.client_id);
          if (found) {
            setSelectedClient(found as ClientRow);
          } else if (invoice.client_snapshot) {
            const snap = invoice.client_snapshot;
            setSelectedClient({
              id: invoice.client_id,
              name: snap.name ?? '',
              address_street: snap.address_street ?? null,
              address_city: snap.address_city ?? null,
              address_postcode: snap.address_postcode ?? null,
              address_country: snap.address_country ?? null,
            });
          }
        } else if (invoice.manual_client_name) {
          const snap = invoice.client_snapshot ?? {};
          setSelectedClient({
            id: MANUAL_CLIENT_ID,
            name: invoice.manual_client_name,
            address_street: snap.address_street ?? null,
            address_city: snap.address_city ?? null,
            address_postcode: snap.address_postcode ?? null,
            address_country: snap.address_country ?? null,
          });
        }
      }
    }
  }, [profile?.id, invoiceId, isNew]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // ── Calculations ──────────────────────────────────────────────────────────

  const { gross, net, vat } = calcTotals(lineItems);

  // ── Line item helpers ─────────────────────────────────────────────────────

  const updateLineItem = (idx: number, patch: Partial<LineItem>) => {
    setLineItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, ...patch };
      updated.total_eur = updated.quantity * updated.unit_price_eur;
      if ('description' in patch && !('leistungszeitraum' in patch)) {
        const auto = calcLeistungszeitraum(updated.description, issueDate);
        if (auto) updated.leistungszeitraum = auto;
      }
      return updated;
    }));
  };

  const addLineItem = () => {
    setLineItems(prev => [...prev, { ...EMPTY_LINE_ITEM }]);
  };

  const removeLineItem = (idx: number) => {
    setLineItems(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [{ ...EMPTY_LINE_ITEM }];
    });
  };

  // Recalculate leistungszeitraum for all auto-detectable items when issue date changes
  useEffect(() => {
    setLineItems(prev => prev.map(item => {
      const auto = calcLeistungszeitraum(item.description, issueDate);
      if (!auto) return item;
      return { ...item, leistungszeitraum: auto };
    }));
  }, [issueDate]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const buildPayload = (newStatus: 'draft' | 'sent' | 'updated' | 'paid', newPdfUrl?: string | null, newPaidAt?: string | null) => {
    const { gross: g, net: n, vat: v } = calcTotals(lineItems);
    const trainerSnap = {
      name: trainerSettings?.full_name ?? null,
      address_street: trainerSettings?.address_street ?? null,
      address_city: trainerSettings?.address_city ?? null,
      address_postcode: trainerSettings?.address_postcode ?? null,
      steuernummer: trainerSettings?.steuernummer ?? null,
      vat_number: trainerSettings?.vat_number ?? null,
      iban: trainerSettings?.iban ?? null,
      bic: trainerSettings?.bic ?? null,
      logo_url: trainerSettings?.logo_url ?? null,
    };
    const clientSnap = selectedClient ? {
      name: selectedClient.name,
      address_street: selectedClient.address_street ?? null,
      address_city: selectedClient.address_city ?? null,
      address_postcode: selectedClient.address_postcode ?? null,
      address_country: selectedClient.address_country ?? null,
    } : null;

    const isManualClient = selectedClient?.id === MANUAL_CLIENT_ID;
    return {
      invoice_number: invoiceNumber,
      client_id: selectedClient && !isManualClient ? selectedClient.id : null,
      manual_client_name: isManualClient ? selectedClient!.name : null,
      created_by: profile!.id,
      status: newStatus,
      issue_date: issueDate,
      line_items: lineItems,
      net_amount_eur: n,
      vat_rate: 19,
      vat_amount_eur: v,
      gross_amount_eur: g,
      notes: notes.trim() || null,
      trainer_snapshot: trainerSnap,
      client_snapshot: clientSnap,
      pdf_url: newPdfUrl !== undefined ? newPdfUrl : pdfUrl,
      paid_at: newPaidAt !== undefined ? newPaidAt : paidAt,
      updated_at: new Date().toISOString(),
    };
  };

  const saveInvoice = async (newStatus: 'draft' | 'sent' | 'updated' | 'paid', newPdfUrl?: string | null, newPaidAt?: string | null): Promise<string | null> => {
    if (!profile?.id) return null;
    setSaving(true);
    try {
      const payload = buildPayload(newStatus, newPdfUrl, newPaidAt);
      if (existingId) {
        await supabase.from('invoices').update(payload).eq('id', existingId);
        setStatus(newStatus);
        if (newPdfUrl !== undefined) setPdfUrl(newPdfUrl);
        if (newPaidAt !== undefined) setPaidAt(newPaidAt);
        return existingId;
      } else {
        const { data } = await supabase.from('invoices').insert(payload).select('id').single();
        if (data) {
          setExistingId(data.id);
          setStatus(newStatus);
          if (newPdfUrl !== undefined) setPdfUrl(newPdfUrl);
          if (newPaidAt !== undefined) setPaidAt(newPaidAt);
          return data.id;
        }
        return null;
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Preview + sharing ─────────────────────────────────────────────────────

  const preparePreview = async () => {
    if (!profile?.id) return;
    setGeneratingPdf(true);
    try {
      const { gross: g, net: n, vat: v } = calcTotals(lineItems);
      const params: Omit<PreviewData, 'localUri' | 'html'> = {
        invoiceNumber,
        issueDate,
        trainerName: trainerSettings?.full_name ?? '',
        trainerStreet: trainerSettings?.address_street ?? '',
        trainerCity: trainerSettings?.address_city ?? '',
        trainerPostcode: trainerSettings?.address_postcode ?? '',
        trainerEmail: profile.email ?? '',
        trainerSteuernummer: trainerSettings?.steuernummer ?? '',
        trainerVatNumber: trainerSettings?.vat_number ?? '',
        trainerIban: trainerSettings?.iban ?? '',
        trainerBic: trainerSettings?.bic ?? '',
        clientName: selectedClient?.name ?? '',
        clientStreet: selectedClient?.address_street ?? '',
        clientCity: selectedClient?.address_city ?? '',
        clientPostcode: selectedClient?.address_postcode ?? '',
        clientCountry: selectedClient?.address_country ?? 'DE',
        lineItems,
        gross: g,
        net: n,
        vat: v,
        notes,
      };
      const html = buildInvoiceHtml(params);
      const safeNum = invoiceNumber.replace(/[\/\-]/g, '_');
      const file = new File(Paths.cache, `invoice_${safeNum}.html`);
      await file.write(html);
      setPreviewData({ ...params, localUri: file.uri, html });
      setPreviewVisible(true);
    } catch {
      Alert.alert(t.common.error, t.invoice.pdfError);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Renders the invoice HTML to a real PDF named Rechnung_<num>.pdf. Returns null
  // when expo-print is unavailable (Expo Go) — callers fall back to the HTML file.
  const generatePdfFile = async (): Promise<string | null> => {
    if (!previewData) return null;
    try {
      const { uri } = await Print.printToFileAsync({ html: previewData.html });
      const safeNum = previewData.invoiceNumber.replace(/[\/\-]/g, '_');
      try {
        const dest = new File(Paths.cache, `Rechnung_${safeNum}.pdf`);
        if (dest.exists) dest.delete();
        new File(uri).copy(dest);
        return dest.uri;
      } catch {
        return uri;
      }
    } catch {
      return null;
    }
  };

  const uploadAndMark = async (): Promise<string | null> => {
    if (!previewData || !profile?.id) return null;
    const pdfUri = await generatePdfFile();
    const localUri = pdfUri ?? previewData.localUri;
    let uploadedUrl: string | null = null;
    try {
      const safeNum = previewData.invoiceNumber.replace(/[\/\-]/g, '_');
      const ext = pdfUri ? 'pdf' : 'html';
      const uploadFilename = `${profile.id}/${safeNum}-${makeUUID()}.${ext}`;
      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();
      const { data: uploadData } = await supabase.storage
        .from('invoices')
        .upload(uploadFilename, arrayBuffer, { contentType: pdfUri ? 'application/pdf' : 'text/html', upsert: true });
      if (uploadData) {
        const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(uploadData.path);
        uploadedUrl = urlData.publicUrl;
      }
    } catch { /* upload failed, proceed with local */ }
    const newStatus = status === 'draft' ? 'sent' : status === 'paid' ? 'paid' : 'updated';
    await saveInvoice(newStatus, uploadedUrl);
    return localUri;
  };

  // The iOS share sheet cannot present while the pageSheet preview is still
  // animating out — it gets dropped SILENTLY (why Share / Save to File appeared
  // to do nothing). Wait for the dismissal to finish before presenting.
  const shareAfterPreviewCloses = (localUri: string, invoiceNum: string) => {
    setTimeout(() => {
      Share.share({ url: localUri, title: `Invoice ${invoiceNum}` })
        .catch(() => Alert.alert(t.common.error, t.invoice.pdfError));
    }, 750);
  };

  const confirmAndShare = async () => {
    if (!previewData) return;
    setSaving(true);
    try {
      const localUri = await uploadAndMark();
      setPreviewVisible(false);
      shareAfterPreviewCloses(localUri ?? previewData.localUri, previewData.invoiceNumber);
    } catch {
      Alert.alert(t.common.error, t.invoice.pdfError);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsPaid = async () => {
    const date = paymentDateDraft.trim() || todayIso();
    setMarkPaidOpen(false);
    await saveInvoice('paid', undefined, date + 'T00:00:00.000Z');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  const isSent = status === 'sent' || status === 'updated';
  const isPaid = status === 'paid';
  const hasContent = lineItems.some(it => it.description.trim().length > 0);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingTop: headerH + 16, paddingBottom: insets.bottom + 120 }]}
          scrollIndicatorInsets={{ top: headerH }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Invoice info card */}
          <Text style={s.sectionLabel}>INVOICE</Text>
          <View style={s.card}>
            {/* Client row */}
            {isNew ? (
              <TouchableOpacity
                style={s.row}
                onPress={() => setClientPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={s.rowLabel}>{t.invoice.client}</Text>
                <Text style={[s.rowValue, !selectedClient && s.rowMuted]} numberOfLines={1}>
                  {selectedClient?.name ?? t.invoice.pickClient}
                </Text>
                <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
              </TouchableOpacity>
            ) : (
              <View style={s.row}>
                <Text style={s.rowLabel}>{t.invoice.client}</Text>
                <Text style={s.rowValue} numberOfLines={1}>{selectedClient?.name ?? '—'}</Text>
              </View>
            )}
            <View style={s.sep} />

            {/* Invoice number (tappable — trainer can override the auto number) */}
            <TouchableOpacity
              style={s.row}
              onPress={() => { setNumberDraft(invoiceNumber); setNumberModalVisible(true); }}
              activeOpacity={0.7}
            >
              <Text style={s.rowLabel}>{t.invoice.invoiceNumber}</Text>
              <Text style={s.rowValue}>{invoiceNumber}</Text>
            </TouchableOpacity>
            <View style={s.sep} />

            {/* Issue date */}
            <TouchableOpacity
              style={s.row}
              onPress={() => { setDateDraft(issueDate); setDateModalVisible(true); }}
              activeOpacity={0.7}
            >
              <Text style={s.rowLabel}>{t.invoice.issueDate}</Text>
              <Text style={s.rowValue}>{fmtDisplayDate(issueDate)}</Text>
            </TouchableOpacity>
          </View>

          {/* Line items */}
          <Text style={s.sectionLabel}>{t.invoice.lineItems.toUpperCase()}</Text>
          {lineItems.map((item, idx) => (
            <LineItemCard
              key={idx}
              item={item}
              idx={idx}
              total={lineItems.length}
              onChange={(patch) => updateLineItem(idx, patch)}
              onRemove={() => removeLineItem(idx)}
            />
          ))}
          <View style={s.addLineBtnRow}>
            <TouchableOpacity style={[s.fromPkgBtn, { flex: 1 }]} onPress={() => setPresetVisible(true)} activeOpacity={0.7}>
              <Text style={s.fromPkgBtnText}>{t.invoice.fromPackage}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.addLineBtn} onPress={addLineItem} activeOpacity={0.7}>
              <Text style={s.addLineBtnText}>{t.invoice.addLineItem}</Text>
            </TouchableOpacity>
          </View>

          {/* Totals */}
          <View style={[s.card, { marginTop: 8 }]}>
            <TotalRow label={t.invoice.nettobetrag} value={`${fmtEur(net)} €`} />
            <View style={s.sep} />
            <TotalRow label={t.invoice.mehrwertsteuer} value={`${fmtEur(vat)} €`} />
            <View style={s.totalDivider} />
            <TotalRow label={t.invoice.gesamtbetrag} value={`${fmtEur(gross)} €`} />
            <View style={s.sep} />
            <TotalRow label={t.invoice.betragFaellig} value={`${fmtEur(gross)} €`} bold />
          </View>

          {/* Notes */}
          <Text style={s.sectionLabel}>NOTES</Text>
          <View style={s.card}>
            <TextInput
              style={s.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder={t.invoice.notesPlaceholder}
              placeholderTextColor="#ccc"
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom action bar */}
      <SafeAreaView style={s.bottomBar} edges={['bottom']}>
        {isPaid ? (
          <>
            <View style={[s.paidBadge, { flex: 1 }]}>
              <Text style={s.paidBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {'✓ Paid'}{paidAt ? ` · ${fmtDisplayDate(paidAt.split('T')[0])}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.sendBtn, (!hasContent || saving || generatingPdf) && { opacity: 0.5 }]}
              onPress={preparePreview}
              disabled={!hasContent || saving || generatingPdf}
              activeOpacity={0.85}
            >
              <Text style={s.sendBtnText}>
                {generatingPdf ? t.invoice.generatingPdf : t.invoice.finalizeBtn}
              </Text>
            </TouchableOpacity>
          </>
        ) : isSent ? (
          <>
            <TouchableOpacity
              style={[s.markPaidBtn, (saving || generatingPdf) && { opacity: 0.5 }]}
              onPress={() => { setPaymentDateDraft(todayIso()); setMarkPaidOpen(true); }}
              disabled={saving || generatingPdf}
              activeOpacity={0.85}
            >
              <Text style={s.markPaidBtnText}>{t.invoice.markAsPaid}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sendBtn, (!hasContent || saving || generatingPdf) && { opacity: 0.5 }]}
              onPress={preparePreview}
              disabled={!hasContent || saving || generatingPdf}
              activeOpacity={0.85}
            >
              <Text style={s.sendBtnText}>
                {generatingPdf ? t.invoice.generatingPdf : t.invoice.finalizeBtn}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[s.draftBtn, (saving || generatingPdf) && { opacity: 0.5 }]}
              onPress={() => saveInvoice('draft').then(() => router.back())}
              disabled={saving || generatingPdf}
              activeOpacity={0.85}
            >
              <Text style={s.draftBtnText}>{t.invoice.saveDraft}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sendBtn, (!hasContent || saving || generatingPdf) && { opacity: 0.5 }]}
              onPress={preparePreview}
              disabled={!hasContent || saving || generatingPdf}
              activeOpacity={0.85}
            >
              <Text style={s.sendBtnText}>
                {generatingPdf ? t.invoice.generatingPdf : t.invoice.finalizeBtn}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </SafeAreaView>

      {/* Client picker modal */}
      <ClientPickerModal
        visible={clientPickerVisible}
        clients={clients}
        onSelect={(c) => { setSelectedClient(c); setClientPickerVisible(false); }}
        onAddManual={() => { setClientPickerVisible(false); setManualClientVisible(true); }}
        onClose={() => setClientPickerVisible(false)}
      />

      {/* Manual recipient sheet (person not registered as a client yet) */}
      {manualClientVisible && (
        <ManualClientSheet
          initial={selectedClient?.id === MANUAL_CLIENT_ID ? selectedClient : null}
          onConfirm={(c) => { setSelectedClient(c); setManualClientVisible(false); }}
          onClose={() => setManualClientVisible(false)}
        />
      )}

      {/* Preset picker modal */}
      <PresetPickerModal
        visible={presetVisible}
        onSelect={(patch) => {
          setLineItems(prev => {
            // Fill the first empty item in-place; only add a new row if all are filled
            const emptyIdx = prev.findIndex(it => !it.description.trim());
            const target = emptyIdx >= 0 ? emptyIdx : prev.length;
            const base = emptyIdx >= 0 ? prev[emptyIdx] : { ...EMPTY_LINE_ITEM };
            const updated = { ...base, ...patch };
            updated.total_eur = updated.quantity * updated.unit_price_eur;
            const lz = calcLeistungszeitraum(updated.description, issueDate);
            if (lz) updated.leistungszeitraum = lz;
            const next = emptyIdx >= 0
              ? prev.map((it, i) => i === emptyIdx ? updated : it)
              : [...prev, updated];
            return next;
          });
          setPresetVisible(false);
        }}
        onClose={() => setPresetVisible(false)}
      />

      {/* Invoice preview modal */}
      <InvoicePreviewModal
        visible={previewVisible}
        data={previewData}
        saving={saving}
        onShare={confirmAndShare}
        onClose={() => setPreviewVisible(false)}
      />

      {/* Mark as Paid modal */}
      {markPaidOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMarkPaidOpen(false)} statusBarTranslucent>
          <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setMarkPaidOpen(false)} />
            <View style={m.glassShadow}>
            <GlassPanel style={m.glassBox}>
              <Text style={m.title}>{t.invoice.confirmPayment}</Text>
              <Text style={[m.title, { fontSize: 13, fontWeight: '500', color: '#414b45' }]}>{t.invoice.paymentDate}</Text>
              <TextInput
                style={[m.input, m.inputOnGlass, { alignSelf: 'stretch' }]}
                value={paymentDateDraft}
                onChangeText={setPaymentDateDraft}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#8a938e"
                autoFocus
                autoCapitalize="none"
                inputAccessoryViewID={Platform.OS === 'ios' ? 'mark-paid-date-input' : undefined}
              />
              <TouchableOpacity
                style={m.confirmBtn}
                onPress={handleMarkAsPaid}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={m.confirmBtnText}>{t.invoice.confirmPayment}</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMarkPaidOpen(false)} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={[m.cancelText, m.cancelTextOnGlass]}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </GlassPanel>
            </View>
          </KeyboardAvoidingView>
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID="mark-paid-date-input">
              <View style={{ height: 0 }} />
            </InputAccessoryView>
          )}
          <KeyboardDoneButton />
        </Modal>
      )}

      {/* Invoice number edit sheet */}
      {numberModalVisible && (
        <BottomSheet onClose={() => setNumberModalVisible(false)} avoidKeyboard>
          {close => (
            <View style={m.sheetContent}>
              <Text style={m.title}>{t.invoice.invoiceNumber}</Text>
              <TextInput
                style={m.input}
                value={numberDraft}
                onChangeText={setNumberDraft}
                placeholder="12-2026"
                placeholderTextColor="#ccc"
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                inputAccessoryViewID={Platform.OS === 'ios' ? 'inv-number-input' : undefined}
              />
              <TouchableOpacity
                style={m.confirmBtn}
                onPress={() => {
                  if (!numberDraft.trim()) { Alert.alert(t.common.error, t.invoice.invoiceNumberRequired); return; }
                  close(() => setInvoiceNumber(numberDraft.trim()));
                }}
                activeOpacity={0.85}
              >
                <Text style={m.confirmBtnText}>{t.common.confirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => close()} hitSlop={8}>
                <Text style={m.cancelText}>{t.common.cancel}</Text>
              </TouchableOpacity>
              {Platform.OS === 'ios' && (
                <InputAccessoryView nativeID="inv-number-input">
                  <View style={{ height: 0 }} />
                </InputAccessoryView>
              )}
            </View>
          )}
        </BottomSheet>
      )}

      {/* Date edit sheet */}
      {dateModalVisible && (
        <BottomSheet onClose={() => setDateModalVisible(false)} avoidKeyboard>
          {close => (
            <View style={m.sheetContent}>
              <Text style={m.title}>{t.invoice.issueDate}</Text>
              <TextInput
                style={m.input}
                value={dateDraft}
                onChangeText={setDateDraft}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#ccc"
                autoFocus
                autoCapitalize="none"
                inputAccessoryViewID={Platform.OS === 'ios' ? 'inv-date-input' : undefined}
              />
              <TouchableOpacity
                style={m.confirmBtn}
                onPress={() => close(() => setIssueDate(dateDraft))}
                activeOpacity={0.85}
              >
                <Text style={m.confirmBtnText}>{t.common.confirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => close()} hitSlop={8}>
                <Text style={m.cancelText}>{t.common.cancel}</Text>
              </TouchableOpacity>
              {Platform.OS === 'ios' && (
                <InputAccessoryView nativeID="inv-date-input">
                  <View style={{ height: 0 }} />
                </InputAccessoryView>
              )}
            </View>
          )}
        </BottomSheet>
      )}

      {/* Glass header — rendered last so it overlays the form. Carried the old
          dark-green SafeAreaView bar until July 26. The share glyph keeps its three
          states (spinner while saving/generating, share once a PDF exists, nothing
          before that). NOTE: the print-preview facsimile below (`pvSt`) keeps its own
          dark bar on purpose — it mirrors the printed PDF, not the app chrome. */}
      <LightHeader
        left={
          <HeaderIcon onPress={() => router.back()}>
            <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
        title={isNew ? t.invoice.newTitle : t.invoice.editTitle(invoiceNumber)}
        right={
          (saving || generatingPdf) ? (
            <ActivityIndicator color={HEADER_ICON} size="small" />
          ) : pdfUrl ? (
            <HeaderIcon onPress={preparePreview}>
              <SymbolView name="square.and.arrow.up" size={21} tintColor={HEADER_ICON} weight="semibold" />
            </HeaderIcon>
          ) : undefined
        }
      />
    </View>
  );
}

// ─── Line item card ───────────────────────────────────────────────────────────

function LineItemCard({
  item, idx, total, onChange, onRemove,
}: {
  item: LineItem;
  idx: number;
  total: number;
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
}) {
  return (
    <View style={[liSt.card, { marginBottom: idx < total - 1 ? 8 : 0 }]}>
      <View style={liSt.header}>
        <Text style={liSt.headerLabel}>Item {idx + 1}</Text>
        {(total > 1 || item.description.trim().length > 0) && (
          <TouchableOpacity onPress={onRemove} hitSlop={8}>
            <SymbolView name="trash" size={15} tintColor="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      {/* Description */}
      <TextInput
        style={liSt.descInput}
        value={item.description}
        onChangeText={v => onChange({ description: v })}
        placeholder={t.invoice.descriptionPlaceholder}
        placeholderTextColor="#ccc"
        autoCapitalize="sentences"
        autoCorrect={false}
      />

      {/* Additional info */}
      <TextInput
        style={liSt.infoInput}
        value={item.additional_info}
        onChangeText={v => onChange({ additional_info: v })}
        placeholder={t.invoice.additionalInfoPlaceholder}
        placeholderTextColor="#ccc"
        autoCapitalize="sentences"
        autoCorrect={false}
      />

      {/* Leistungszeitraum */}
      <TextInput
        style={liSt.infoInput}
        value={item.leistungszeitraum}
        onChangeText={v => onChange({ leistungszeitraum: v })}
        placeholder={t.invoice.leistungszeitraumPlaceholder}
        placeholderTextColor="#ccc"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Qty + Unit price */}
      <View style={liSt.numRow}>
        <View style={liSt.numField}>
          <Text style={liSt.numLabel}>{t.invoice.quantity}</Text>
          <TextInput
            style={liSt.numInput}
            value={item.quantity === 0 ? '' : String(item.quantity)}
            onChangeText={v => onChange({ quantity: parseFloat(v) || 0 })}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor="#ccc"
          />
        </View>
        <View style={liSt.numField}>
          <Text style={liSt.numLabel}>{t.invoice.unitPrice}</Text>
          <TextInput
            style={liSt.numInput}
            value={item.unit_price_eur === 0 ? '' : String(item.unit_price_eur)}
            onChangeText={v => onChange({ unit_price_eur: parseFloat(v) || 0 })}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#ccc"
          />
        </View>
        <View style={liSt.numField}>
          <Text style={liSt.numLabel}>{t.invoice.total}</Text>
          <Text style={liSt.totalText}>{`€${String(item.total_eur % 1 === 0 ? item.total_eur.toFixed(2) : item.total_eur.toFixed(2))}`}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Total row ────────────────────────────────────────────────────────────────

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={totSt.row}>
      <Text style={[totSt.label, bold && totSt.bold]}>{label}</Text>
      <Text style={[totSt.value, bold && totSt.bold]}>{value}</Text>
    </View>
  );
}

// ─── Client picker modal ──────────────────────────────────────────────────────

function ClientPickerModal({
  visible, clients, onSelect, onAddManual, onClose,
}: {
  visible: boolean;
  clients: ClientRow[];
  onSelect: (c: ClientRow) => void;
  onAddManual: () => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <View style={cpSt.sheetContent}>
          <Text style={cpSt.title}>{t.invoice.clientPickerTitle}</Text>
          <TouchableOpacity style={cpSt.manualRow} onPress={() => close(onAddManual)} activeOpacity={0.7}>
            <SymbolView name="person.badge.plus" size={16} tintColor={ACCENT} />
            <Text style={cpSt.manualText}>{t.invoice.addManualClient}</Text>
          </TouchableOpacity>
          <View style={cpSt.sep} />
          <ScrollView style={cpSt.list} showsVerticalScrollIndicator={false}>
            {clients.map((c, i) => (
              <View key={c.id}>
                <TouchableOpacity style={cpSt.row} onPress={() => close(() => onSelect(c))} activeOpacity={0.7}>
                  <Text style={cpSt.name}>{c.name}</Text>
                  <Text style={cpSt.addr} numberOfLines={1}>
                    {c.address_street
                      ? [c.address_street, c.address_city].filter(Boolean).join(', ')
                      : t.invoice.noClientAddress}
                  </Text>
                </TouchableOpacity>
                {i < clients.length - 1 && <View style={cpSt.sep} />}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </BottomSheet>
  );
}

// ─── Manual recipient sheet ──────────────────────────────────────────────────
// For trial-session people not registered as clients yet: the invoice keeps
// client_id NULL and stores this name in manual_client_name (+ address in the
// snapshot). When the person later registers under the same name, the Finance
// client filter folds these invoices under the registered client.

function ManualClientSheet({
  initial, onConfirm, onClose,
}: {
  initial: ClientRow | null;
  onConfirm: (c: ClientRow) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [street, setStreet] = useState(initial?.address_street ?? '');
  const [postcode, setPostcode] = useState(initial?.address_postcode ?? '');
  const [city, setCity] = useState(initial?.address_city ?? '');
  const canConfirm = name.trim().length > 0;

  return (
    <BottomSheet onClose={onClose} avoidKeyboard>
      {close => (
        <View style={mcSt.sheetContent}>
          <Text style={mcSt.title}>{t.invoice.manualClientTitle}</Text>
          <Text style={mcSt.hint}>{t.invoice.manualClientHint}</Text>
          <TextInput
            style={mcSt.input}
            value={name}
            onChangeText={setName}
            placeholder={t.invoice.manualNamePlaceholder}
            placeholderTextColor="#ccc"
            autoCapitalize="words"
            autoCorrect={false}
            inputAccessoryViewID={Platform.OS === 'ios' ? 'manual-client-input' : undefined}
          />
          <TextInput
            style={mcSt.input}
            value={street}
            onChangeText={setStreet}
            placeholder={t.invoice.manualStreetPlaceholder}
            placeholderTextColor="#ccc"
            autoCapitalize="words"
            autoCorrect={false}
            inputAccessoryViewID={Platform.OS === 'ios' ? 'manual-client-input' : undefined}
          />
          <View style={mcSt.inputRow}>
            <TextInput
              style={[mcSt.input, mcSt.inputPostcode]}
              value={postcode}
              onChangeText={setPostcode}
              placeholder={t.invoice.manualPostcodePlaceholder}
              placeholderTextColor="#ccc"
              autoCapitalize="none"
              autoCorrect={false}
              inputAccessoryViewID={Platform.OS === 'ios' ? 'manual-client-input' : undefined}
            />
            <TextInput
              style={[mcSt.input, { flex: 1 }]}
              value={city}
              onChangeText={setCity}
              placeholder={t.invoice.manualCityPlaceholder}
              placeholderTextColor="#ccc"
              autoCapitalize="words"
              autoCorrect={false}
              inputAccessoryViewID={Platform.OS === 'ios' ? 'manual-client-input' : undefined}
            />
          </View>
          <TouchableOpacity
            style={[mcSt.confirmBtn, !canConfirm && { opacity: 0.4 }]}
            disabled={!canConfirm}
            onPress={() => close(() => onConfirm({
              id: MANUAL_CLIENT_ID,
              name: name.trim(),
              address_street: street.trim() || null,
              address_city: city.trim() || null,
              address_postcode: postcode.trim() || null,
              address_country: null,
            }))}
            activeOpacity={0.85}
          >
            <Text style={mcSt.confirmBtnText}>{t.common.confirm}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => close()} hitSlop={8} style={{ alignSelf: 'center' }}>
            <Text style={mcSt.cancelText}>{t.common.cancel}</Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID="manual-client-input">
              <View style={{ height: 0 }} />
            </InputAccessoryView>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

// ─── Preset picker modal ─────────────────────────────────────────────────────

function PresetPickerModal({
  visible, onSelect, onClose,
}: {
  visible: boolean;
  onSelect: (patch: Partial<LineItem>) => void;
  onClose: () => void;
}) {
  const presets = GENERIC_PRESETS;

  if (!visible) return null;
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <View style={ppSt.sheetContent}>
          <Text style={ppSt.title}>{t.invoice.presetPickerTitle}</Text>
          <ScrollView style={ppSt.list} showsVerticalScrollIndicator={false}>
            {presets.map((p, i) => (
              <View key={i}>
                <TouchableOpacity
                  style={ppSt.row}
                  onPress={() => close(() => onSelect({
                    description: p.label,
                    additional_info: p.description,
                    quantity: 1,
                    unit_price_eur: p.price,
                    total_eur: p.price,
                  }))}
                  activeOpacity={0.7}
                >
                  <Text style={ppSt.name}>{p.label}</Text>
                  <Text style={ppSt.desc} numberOfLines={2}>{p.description}</Text>
                  {p.price > 0 && <Text style={ppSt.price}>€ {fmtEur(p.price)}</Text>}
                </TouchableOpacity>
                {i < presets.length - 1 && <View style={ppSt.sep} />}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </BottomSheet>
  );
}

// ─── Invoice preview modal ────────────────────────────────────────────────────

// The page renders at a fixed "paper" width matching the PDF's proportions —
// scaled down to fit the phone. This is what keeps preview and PDF identical.
const PAGE_W = 640;

// The DOCUMENT's typeface — explicit on every text style inside the page so the
// app-wide Manrope wrapper skips them (an explicit fontFamily opts out). The PDF
// prints 'Helvetica Neue' (same stack in buildInvoiceHtml's CSS); without this
// the preview rendered Manrope and the two looked different (wider letters,
// different wrapping).
const DOC_FONT = 'Helvetica Neue';

// ⚠️ Mirrors buildInvoiceHtml — the preview and the PDF are the SAME design.
function InvoicePageBody({ data }: { data: PreviewData }) {
  const { gross, net, vat } = data;

  // German convention: postcode before city ("12051 Berlin")
  const trainerAddrLines = [
    data.trainerStreet,
    [data.trainerPostcode, data.trainerCity].filter(Boolean).join(' '),
  ].filter(Boolean);

  const clientAddrLines = [
    data.clientStreet,
    [data.clientPostcode, data.clientCity].filter(Boolean).join(' '),
    data.clientCountry,
  ].filter(Boolean);

  return (
          <View style={pvSt.page}>
            {/* Rounded brand line across the top */}
            <View style={pvSt.topLine} />

            {/* Header: title + sender left, brand lockup right (vertically centred) */}
            <View style={pvSt.headRow}>
              <View style={{ flexShrink: 1 }}>
                <Text style={pvSt.rechnungTitle}>RECHNUNG</Text>
                {data.trainerName ? <Text style={pvSt.trainerName}>{data.trainerName}</Text> : null}
                {trainerAddrLines.map((line, i) => (
                  <Text key={i} style={pvSt.trainerAddr}>{line}</Text>
                ))}
                {data.trainerEmail ? <Text style={pvSt.trainerAddr}>{data.trainerEmail}</Text> : null}
                {data.trainerSteuernummer ? <Text style={pvSt.trainerAddr}>Steuernummer: {data.trainerSteuernummer}</Text> : null}
                {data.trainerVatNumber ? <Text style={pvSt.trainerAddr}>USt-IdNr.: {data.trainerVatNumber}</Text> : null}
              </View>
              <View style={pvSt.brandCol}>
                <VFLogo height={88} color={HEADER} />
              </View>
            </View>

            {/* Client + invoice meta: Für left, label–value rows right */}
            <View style={pvSt.metaBox}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={pvSt.metaBoxLabel}>Für</Text>
                <Text style={pvSt.clientName}>{data.clientName || '—'}</Text>
                {clientAddrLines.map((line, i) => (
                  <Text key={i} style={pvSt.clientAddr}>{line}</Text>
                ))}
              </View>
              <View style={pvSt.metaRight}>
                <View style={pvSt.metaRow}>
                  <Text style={pvSt.metaRowLabel}>RECHNUNG NUMMER</Text>
                  <Text style={pvSt.metaValue}>{data.invoiceNumber}</Text>
                </View>
                <View style={pvSt.metaRow}>
                  <Text style={pvSt.metaRowLabel}>AUSGESTELLT</Text>
                  <Text style={pvSt.metaValue}>{fmtGermanDate(data.issueDate)}</Text>
                </View>
              </View>
            </View>

            {/* Line items: rounded segmented green header bar */}
            <View style={pvSt.tableHeaderBar}>
              <View style={[pvSt.thCell, { flex: 1, alignItems: 'flex-start' }]}>
                <Text style={pvSt.th}>ARTIKEL</Text>
              </View>
              <View style={[pvSt.thCell, pvSt.thCellDivided, { width: 90 }]}>
                <Text style={pvSt.th}>PREIS</Text>
              </View>
              <View style={[pvSt.thCell, pvSt.thCellDivided, { width: 64 }]}>
                <Text style={pvSt.th}>MENGE</Text>
              </View>
              <View style={[pvSt.thCell, pvSt.thCellDivided, { width: 95 }]}>
                <Text style={pvSt.th}>BETRAG</Text>
              </View>
            </View>
            {data.lineItems.filter(it => it.description.trim()).map((item, i) => (
              <View key={i} style={pvSt.tableRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={pvSt.itemDesc}>{item.description}</Text>
                  {item.additional_info ? <Text style={pvSt.itemInfo}>{item.additional_info}</Text> : null}
                  {item.leistungszeitraum ? <Text style={pvSt.itemLz}>Leistungszeitraum: {item.leistungszeitraum}</Text> : null}
                </View>
                <Text style={[pvSt.itemNum, { width: 90 }]}>{fmtEur(item.unit_price_eur)} €</Text>
                <Text style={[pvSt.itemNum, { width: 64 }]}>{item.quantity}</Text>
                <Text style={[pvSt.itemNum, { width: 95 }]}>{fmtEur(item.total_eur)} €</Text>
              </View>
            ))}

            {/* Totals: light hairlines only — no heavy dark rules */}
            <View style={pvSt.totalsWrap}>
              <View style={pvSt.totalsCol}>
                <View style={[pvSt.totalRow, pvSt.totalRowRuled]}>
                  <Text style={pvSt.totalLabel}>Nettobetrag</Text>
                  <Text style={pvSt.totalValue}>{fmtEur(net)} €</Text>
                </View>
                <View style={pvSt.totalRow}>
                  <Text style={pvSt.totalLabel}>Mehrwertsteuer 19%</Text>
                  <Text style={pvSt.totalValue}>{fmtEur(vat)} €</Text>
                </View>
                <View style={[pvSt.totalRow, pvSt.totalRowRuled]}>
                  <Text style={[pvSt.totalLabel, pvSt.totalBold]}>Gesamtbetrag</Text>
                  <Text style={[pvSt.totalValue, pvSt.totalBold]}>{fmtEur(gross)} €</Text>
                </View>
              </View>
            </View>
            <View style={pvSt.totalsWrap}>
              <View style={pvSt.faelligRow}>
                <Text style={pvSt.betragFaelligLabel}>Betrag fällig</Text>
                <Text style={pvSt.betragFaelligValue}>{fmtEur(gross)} €</Text>
              </View>
            </View>

            {/* Payment info */}
            <View style={pvSt.paymentSection}>
              <Text style={pvSt.paymentTitle}>Zahlungs-Anweisungen</Text>
              <Text style={pvSt.paymentLine}>
                {'Bank Details: ' + [data.trainerName, data.trainerIban ? `IBAN: ${data.trainerIban}` : null, data.trainerBic ? `BIC/SWIFT: ${data.trainerBic}` : null].filter(Boolean).join(' / ')}
              </Text>
              <Text style={pvSt.paymentLine}>Bitte als Verwendungszweck die Rechnungsnummer angeben.</Text>
              <Text style={pvSt.paymentLine}>Please use the invoice number as the reference information.</Text>
              {data.notes ? <Text style={pvSt.paymentLine}>{data.notes}</Text> : null}
            </View>
          </View>
  );
}

// Small document thumbnail by default (like a file preview), tap to enlarge to
// a pinch-zoomable full view — Vitek's reference flow ("small with the buttons
// and clicking on it it gets bigger").
function InvoicePreviewModal({
  visible, data, saving, onShare, onClose,
}: {
  visible: boolean;
  data: PreviewData | null;
  saving: boolean;
  onShare: () => void;
  onClose: () => void;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);
  const [pageH, setPageH] = useState<number | null>(null);

  if (!data) return null;

  const fitW = winW / (PAGE_W + 16);
  const thumbAvailH = winH - 360;
  const thumbScale = Math.min((winW - 72) / PAGE_W, pageH ? thumbAvailH / pageH : 0.45);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} statusBarTranslucent>
      <View style={pvSt.root}>
        {/* Slim modal header */}
        <View style={pvSt.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={pvSt.headerClose}>
            <SymbolView name="xmark" size={17} tintColor="#fff" />
          </TouchableOpacity>
          <Text style={pvSt.headerTitle}>Invoice Preview</Text>
          {zoomed ? (
            <TouchableOpacity onPress={() => setZoomed(false)} hitSlop={10} style={pvSt.headerZoomOut}>
              <SymbolView name="arrow.down.right.and.arrow.up.left" size={16} tintColor="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {zoomed ? (
          /* Full view: fit-to-width, pinch to zoom (native iOS scroll zoom) */
          <ScrollView
            style={pvSt.zoomScroll}
            minimumZoomScale={fitW}
            maximumZoomScale={2.5}
            zoomScale={fitW}
            bouncesZoom
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            <View style={{ padding: 8 }}>
              <InvoicePageBody data={data} />
            </View>
          </ScrollView>
        ) : (
          /* Thumbnail: whole document scaled to fit, tap to enlarge */
          <View style={pvSt.thumbWrap}>
            <Pressable
              onPress={() => setZoomed(true)}
              style={{ height: pageH ? pageH * thumbScale : thumbAvailH, alignSelf: 'stretch', alignItems: 'center' }}
            >
              <View
                onLayout={e => setPageH(e.nativeEvent.layout.height)}
                style={{
                  width: PAGE_W,
                  transform: [{ scale: thumbScale }],
                  transformOrigin: 'top center',
                  opacity: pageH ? 1 : 0,
                }}
              >
                <InvoicePageBody data={data} />
              </View>
            </Pressable>
            <Text style={pvSt.thumbHint}>{t.invoice.tapToEnlarge}</Text>
          </View>
        )}

        {/* One Share button — the iOS share sheet covers both "send to someone"
            and "Save to Files" (the separate Save to File button was removed;
            both did the same thing). */}
        <SafeAreaView style={pvSt.bottomBar} edges={['bottom']}>
          <TouchableOpacity
            style={[pvSt.shareBtn, saving && { opacity: 0.5 }]}
            onPress={onShare}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={pvSt.shareBtnText}>{t.invoice.shareBtn}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={pvSt.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={pvSt.closeBtnText}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { padding: 16, gap: 0 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    marginBottom: 8, marginTop: 12,
  },
  card: {
    backgroundColor: CARD, borderRadius: RADIUS,
    marginBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  rowLabel: { flex: 1, fontSize: 14, color: TEXT, fontWeight: '500' },
  rowValue: { fontSize: 14, color: TEXT, fontWeight: '400', textAlign: 'right', flexShrink: 1 },
  rowMuted: { color: '#bbb' },

  addLineBtnRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 },
  addLineBtn: {
    alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: '#f5f5f3', borderRadius: RADIUS,
  },
  addLineBtnText: { fontSize: 13, fontWeight: '600', color: MUTED },
  fromPkgBtn: {
    alignItems: 'center', paddingVertical: 14,
    backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: ACCENT,
  },
  fromPkgBtnText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  totalDivider: { height: 1.5, backgroundColor: '#d0d0ce' },

  notesInput: {
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: TEXT,
    minHeight: 80,
  },

  bottomBar: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER,
  },
  draftBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 100, alignItems: 'center',
    backgroundColor: '#f0f0ec',
  },
  draftBtnText: { fontSize: 14, fontWeight: '600', color: TEXT },
  sendBtn: {
    flex: 1.3, paddingVertical: 14, borderRadius: 100, alignItems: 'center',
    backgroundColor: HEADER,
  },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  markPaidBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 100, alignItems: 'center',
    borderWidth: 1.5, borderColor: ACCENT,
  },
  markPaidBtnText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  paidBadge: {
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 100, alignItems: 'center',
    backgroundColor: '#e8f7f2',
  },
  paidBadgeText: { fontSize: 13, fontWeight: '700', color: ACCENT },
});

const liSt = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderRadius: RADIUS,
    paddingHorizontal: 16, paddingBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 10 },
  headerLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  descInput: {
    fontSize: 15, fontWeight: '600', color: TEXT,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    paddingBottom: 10, marginBottom: 10,
  },
  infoInput: {
    fontSize: 13, color: '#666',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    paddingBottom: 10, marginBottom: 10,
  },
  numRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  numField: { flex: 1, gap: 4 },
  numLabel: { fontSize: 11, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  numInput: {
    fontSize: 15, fontWeight: '600', color: TEXT,
    backgroundColor: '#f5f5f3', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  totalText: { fontSize: 15, fontWeight: '700', color: HEADER, paddingHorizontal: 10, paddingVertical: 8 },
});

const totSt = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontSize: 14, color: TEXT },
  value: { fontSize: 14, color: TEXT, fontWeight: '600' },
  bold: { fontWeight: '800', fontSize: 15 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 28 },
  box: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 14 },
  glassShadow: { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  glassBox: { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center', gap: 14 },
  inputOnGlass: { backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  cancelTextOnGlass: { fontWeight: '600', color: '#414b45' },
  sheetContent: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12, alignItems: 'center', gap: 14 },
  title: { fontSize: 16, fontWeight: '700', color: TEXT },
  input: {
    alignSelf: 'stretch', backgroundColor: '#f5f5f3', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: TEXT,
  },
  confirmBtn: {
    alignSelf: 'stretch', backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 13, alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelText: { fontSize: 14, color: MUTED },
});

const cpSt = StyleSheet.create({
  sheetContent: { paddingHorizontal: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 28 },
  box: { backgroundColor: CARD, borderRadius: 16, padding: 20, maxHeight: '70%' },
  title: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 16, textAlign: 'center' },
  list: { maxHeight: 320 },
  row: { paddingVertical: 13, paddingHorizontal: 4 },
  name: { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 2 },
  addr: { fontSize: 12, color: MUTED },
  sep: { height: 1, backgroundColor: '#f0f0f0' },
  cancelText: { fontSize: 14, color: MUTED, textAlign: 'center' },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 4 },
  manualText: { fontSize: 14, fontWeight: '700', color: ACCENT },
});

const mcSt = StyleSheet.create({
  sheetContent: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12, gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  hint: { fontSize: 12, color: MUTED, textAlign: 'center', marginBottom: 2 },
  input: {
    alignSelf: 'stretch', backgroundColor: '#f5f5f3', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: TEXT,
  },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputPostcode: { alignSelf: 'auto', width: 110 },
  confirmBtn: {
    alignSelf: 'stretch', backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 13, alignItems: 'center', marginTop: 2,
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelText: { fontSize: 14, color: MUTED },
});

const ppSt = StyleSheet.create({
  sheetContent: { paddingHorizontal: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 28 },
  box: { backgroundColor: CARD, borderRadius: 16, padding: 20, maxHeight: '75%' },
  title: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 16, textAlign: 'center' },
  list: { maxHeight: 360 },
  row: { paddingVertical: 13, paddingHorizontal: 4 },
  name: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 3 },
  desc: { fontSize: 12, color: MUTED, lineHeight: 17 },
  price: { fontSize: 13, fontWeight: '600', color: ACCENT, marginTop: 4 },
  sep: { height: 1, backgroundColor: '#f0f0f0' },
  cancelText: { fontSize: 14, color: MUTED, textAlign: 'center' },
});

const pvSt = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e9e9e6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: HEADER, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12,
  },
  headerClose: { width: 40, alignItems: 'flex-start' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerZoomOut: { width: 40, alignItems: 'flex-end' },

  // The document renders at PAGE_W (paper proportions, same as the PDF) and is
  // scaled down to fit — thumbnail first, pinch-zoomable when enlarged.
  zoomScroll: { flex: 1, backgroundColor: '#e9e9e6' },
  thumbWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9e9e6' },
  thumbHint: { marginTop: 12, fontSize: 13, fontWeight: '600', color: '#8a8a86' },
  page: {
    width: PAGE_W,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 25, paddingTop: 54, paddingBottom: 50,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10, shadowRadius: 12, elevation: 4,
  },

  topLine: { height: 6, borderRadius: 100, backgroundColor: HEADER, marginBottom: 30 },

  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 36 },
  // ⚠️ Document weights cap at '700' — iOS resolves 'Helvetica Neue' at 800+ to
  // the CONDENSED BLACK face (squished-heavy titles) while the PDF maps 800→Bold.
  rechnungTitle: { fontFamily: DOC_FONT, fontSize: 31, fontWeight: '700', color: TEXT, marginBottom: 18, letterSpacing: -0.5 },
  trainerName: { fontFamily: DOC_FONT, fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 4 },
  trainerAddr: { fontFamily: DOC_FONT, fontSize: 11, color: '#666', lineHeight: 18 },
  brandCol: { alignItems: 'flex-end', marginLeft: 16 },

  metaBox: {
    flexDirection: 'row', marginBottom: 32,
    backgroundColor: '#e9efe9', borderRadius: 12, paddingVertical: 20, paddingHorizontal: 22,
  },
  metaBoxLabel: { fontFamily: DOC_FONT, fontSize: 11, fontWeight: '600', color: '#999', marginBottom: 6 },
  clientName: { fontFamily: DOC_FONT, fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 5 },
  clientAddr: { fontFamily: DOC_FONT, fontSize: 11, color: '#666', lineHeight: 18 },
  metaRight: { gap: 14 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14 },
  metaRowLabel: { fontFamily: DOC_FONT, fontSize: 10, fontWeight: '700', color: '#999', letterSpacing: 0.5 },
  metaValue: { fontFamily: DOC_FONT, fontSize: 13, fontWeight: '700', color: TEXT },

  tableHeaderBar: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: HEADER, borderRadius: 8, paddingHorizontal: 14,
  },
  thCell: { paddingVertical: 10, alignItems: 'flex-end', justifyContent: 'center' },
  thCellDivided: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.22)' },
  th: { fontFamily: DOC_FONT, fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.8 },
  tableRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 14, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#f2f2ef',
  },
  itemDesc: { fontFamily: DOC_FONT, fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 3 },
  itemInfo: { fontFamily: DOC_FONT, fontSize: 11, color: '#666' },
  itemLz: { fontFamily: DOC_FONT, fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 2 },
  itemNum: { fontFamily: DOC_FONT, fontSize: 12, color: TEXT, textAlign: 'right' },

  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end' },
  totalsCol: { width: 300, marginTop: 18 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  totalRowRuled: { borderTopWidth: 1, borderTopColor: '#e3e3df', marginTop: 3, paddingTop: 9 },
  totalLabel: { fontFamily: DOC_FONT, fontSize: 12, color: '#555' },
  totalValue: { fontFamily: DOC_FONT, fontSize: 12, color: TEXT, fontWeight: '600' },
  totalBold: { fontWeight: '700', fontSize: 13, color: TEXT },
  faelligRow: {
    width: 300, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 24,
  },
  betragFaelligLabel: { fontFamily: DOC_FONT, fontSize: 17, fontWeight: '700', color: TEXT },
  betragFaelligValue: { fontFamily: DOC_FONT, fontSize: 17, fontWeight: '700', color: TEXT },

  paymentSection: { marginTop: 34, paddingTop: 18, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#ebebe8' },
  paymentTitle: { fontFamily: DOC_FONT, fontSize: 11, fontWeight: '700', color: '#444', marginBottom: 6 },
  paymentLine: { fontFamily: DOC_FONT, fontSize: 11, color: '#666', lineHeight: 18, marginBottom: 2 },

  bottomBar: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, gap: 10,
  },
  shareBtn: {
    backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 14, alignItems: 'center',
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  closeBtn: {
    paddingVertical: 12, alignItems: 'center',
  },
  closeBtnText: { color: MUTED, fontSize: 14, fontWeight: '600' },
});
