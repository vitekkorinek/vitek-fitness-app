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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { File, Paths } from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
const makeUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
import t from '@/i18n/en';
import { BottomSheet } from '@/components/BottomSheet';
import type { Invoice, LineItem } from '@/types/database';

// ─── Constants ────────────────────────────────────────────────────────────────

const BG = '#faf9f7';
const CARD = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const MUTED = '#999';
const RADIUS = 16;

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

function buildInvoiceHtml(params: {
  invoiceNumber: string;
  issueDate: string;
  trainerName: string;
  trainerStreet: string;
  trainerCity: string;
  trainerPostcode: string;
  trainerEmail: string;
  trainerSteuernummer: string;
  trainerIban: string;
  trainerBic: string;
  trainerLogoUrl: string;
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
    trainerName, trainerStreet, trainerCity, trainerPostcode, trainerEmail, trainerSteuernummer, trainerIban, trainerBic, trainerLogoUrl,
    clientName, clientStreet, clientCity, clientPostcode, clientCountry,
    lineItems, gross, net, vat, notes,
  } = params;

  const trainerAddr = [trainerStreet, [trainerCity, trainerPostcode].filter(Boolean).join(' ')].filter(Boolean).join('<br>');
  const clientAddr = [clientStreet, [clientCity, clientPostcode].filter(Boolean).join(' '), clientCountry].filter(Boolean).join('<br>');

  const itemRows = lineItems.map(item => `
    <tr>
      <td style="padding:14px 12px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
        <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${escHtml(item.description)}</div>
        ${item.additional_info ? `<div style="font-size:11px;color:#666;margin-bottom:2px;">${escHtml(item.additional_info)}</div>` : ''}
        ${item.leistungszeitraum ? `<div style="font-size:11px;color:#666;font-style:italic;">Leistungszeitraum: ${escHtml(item.leistungszeitraum)}</div>` : ''}
      </td>
      <td style="padding:14px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:12px;white-space:nowrap;">${fmtEur(item.unit_price_eur)} €</td>
      <td style="padding:14px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:12px;">${item.quantity}</td>
      <td style="padding:14px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:12px;white-space:nowrap;">${fmtEur(item.total_eur)} €</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
  .page { padding: 44px 52px 52px; max-width: 680px; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; }
</style>
</head>
<body>
<div class="page">
  <!-- Top green line -->
  <div style="height:4px;background:#244e43;margin-bottom:36px;"></div>

  <!-- Header row -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:44px;">
    <div>
      <div style="font-size:34px;font-weight:800;color:#000;margin-bottom:20px;letter-spacing:-0.5px;">RECHNUNG</div>
      <div style="font-weight:700;font-size:13px;margin-bottom:6px;">${escHtml(trainerName)}</div>
      <div style="font-size:11px;color:#555;line-height:1.8;">
        ${trainerAddr ? trainerAddr + '<br>' : ''}
        ${trainerEmail ? escHtml(trainerEmail) + '<br>' : ''}
        ${trainerSteuernummer ? 'USt-IdNr.: ' + escHtml(trainerSteuernummer) : ''}
      </div>
    </div>
    <div style="text-align:right;">
      ${trainerLogoUrl ? `<img src="${trainerLogoUrl}" style="width:72px;height:72px;object-fit:contain;margin-bottom:10px;display:block;margin-left:auto;" />` : ''}
      <div style="font-size:13px;font-weight:700;color:#244e43;letter-spacing:2px;">VITEK FITNESS</div>
    </div>
  </div>

  <!-- Client + invoice meta box -->
  <div style="background:#f2f3f0;border-radius:10px;padding:20px 24px;display:flex;justify-content:space-between;margin-bottom:36px;">
    <div>
      <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:0.5px;margin-bottom:10px;">Für</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">${escHtml(clientName)}</div>
      <div style="font-size:11px;color:#555;line-height:1.7;">${clientAddr}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">RECHNUNG NUMMER</div>
      <div style="font-size:14px;font-weight:700;margin-bottom:16px;">${escHtml(invoiceNumber)}</div>
      <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">AUSGESTELLT</div>
      <div style="font-size:14px;font-weight:700;">${fmtGermanDate(issueDate)}</div>
    </div>
  </div>

  <!-- Line items table -->
  <table style="margin-bottom:28px;">
    <thead>
      <tr style="background:#244e43;">
        <th style="color:#fff;font-size:10px;font-weight:700;letter-spacing:0.8px;padding:10px 12px;text-align:left;">ARTIKEL</th>
        <th style="color:#fff;font-size:10px;font-weight:700;letter-spacing:0.8px;padding:10px 12px;text-align:right;">PREIS</th>
        <th style="color:#fff;font-size:10px;font-weight:700;letter-spacing:0.8px;padding:10px 12px;text-align:right;">MENGE</th>
        <th style="color:#fff;font-size:10px;font-weight:700;letter-spacing:0.8px;padding:10px 12px;text-align:right;">BETRAG</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:28px;">
    <table style="min-width:260px;">
      <tr>
        <td style="padding:5px 0;font-size:12px;color:#444;">Nettobetrag</td>
        <td style="padding:5px 0;font-size:12px;text-align:right;padding-left:32px;">${fmtEur(net)} €</td>
      </tr>
      <tr>
        <td style="padding:5px 0;font-size:12px;color:#444;">Mehrwertsteuer 19%</td>
        <td style="padding:5px 0;font-size:12px;text-align:right;">${fmtEur(vat)} €</td>
      </tr>
      <tr>
        <td style="border-top:1.5px solid #ccc;padding:8px 0 5px;font-size:12px;font-weight:700;color:#1a1a1a;">Gesamtbetrag</td>
        <td style="border-top:1.5px solid #ccc;padding:8px 0 5px;font-size:12px;font-weight:700;text-align:right;">${fmtEur(gross)} €</td>
      </tr>
    </table>
  </div>

  <!-- Betrag fällig -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:36px;">
    <div style="display:flex;justify-content:space-between;align-items:center;min-width:260px;border-top:2px solid #1a1a1a;padding-top:10px;">
      <span style="font-size:18px;font-weight:800;">Betrag fällig</span>
      <span style="font-size:18px;font-weight:800;">${fmtEur(gross)} €</span>
    </div>
  </div>

  <!-- Payment info -->
  <div style="border-top:1px solid #eee;padding-top:20px;">
    <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:8px;">Zahlungs-Anweisungen</div>
    <div style="font-size:11px;color:#555;line-height:1.7;">
      Bank Details: ${escHtml(trainerName)}${trainerIban ? ' / IBAN: ' + escHtml(trainerIban) : ''}${trainerBic ? ' / BIC/SWIFT: ' + escHtml(trainerBic) : ''}
    </div>
    <div style="font-size:11px;color:#555;margin-top:8px;">Bitte als Verwendungszweck die Rechnungsnummer angeben.</div>
    ${notes ? `<div style="font-size:11px;color:#555;margin-top:8px;">${escHtml(notes)}</div>` : ''}
  </div>
</div>
</body>
</html>`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InvoiceScreen() {
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

  // Trainer settings
  const [trainerSettings, setTrainerSettings] = useState<TrainerSettings | null>(null);

  const [presetVisible, setPresetVisible] = useState(false);

  // Modal for date edit
  const [dateDraft, setDateDraft] = useState('');
  const [dateModalVisible, setDateModalVisible] = useState(false);

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

    return {
      invoice_number: invoiceNumber,
      client_id: selectedClient?.id ?? null,
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
      const params: Omit<PreviewData, 'localUri'> = {
        invoiceNumber,
        issueDate,
        trainerName: trainerSettings?.full_name ?? '',
        trainerStreet: trainerSettings?.address_street ?? '',
        trainerCity: trainerSettings?.address_city ?? '',
        trainerPostcode: trainerSettings?.address_postcode ?? '',
        trainerEmail: profile.email ?? '',
        trainerSteuernummer: trainerSettings?.steuernummer ?? '',
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
      const html = buildInvoiceHtml({ ...params, trainerLogoUrl: trainerSettings?.logo_url ?? '' });
      const safeNum = invoiceNumber.replace(/[\/\-]/g, '_');
      const file = new File(Paths.cache, `invoice_${safeNum}.html`);
      await file.write(html);
      setPreviewData({ ...params, localUri: file.uri });
      setPreviewVisible(true);
    } catch {
      Alert.alert(t.common.error, t.invoice.pdfError);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const uploadAndMark = async (): Promise<string | null> => {
    if (!previewData || !profile?.id) return null;
    let uploadedUrl: string | null = null;
    try {
      const safeNum = previewData.invoiceNumber.replace(/[\/\-]/g, '_');
      const uploadFilename = `${profile.id}/${safeNum}-${makeUUID()}.html`;
      const response = await fetch(previewData.localUri);
      const arrayBuffer = await response.arrayBuffer();
      const { data: uploadData } = await supabase.storage
        .from('invoices')
        .upload(uploadFilename, arrayBuffer, { contentType: 'text/html', upsert: true });
      if (uploadData) {
        const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(uploadData.path);
        uploadedUrl = urlData.publicUrl;
      }
    } catch { /* upload failed, proceed with local */ }
    const newStatus = status === 'draft' ? 'sent' : status === 'paid' ? 'paid' : 'updated';
    await saveInvoice(newStatus, uploadedUrl);
    return previewData.localUri;
  };

  const confirmAndShare = async () => {
    if (!previewData) return;
    setSaving(true);
    try {
      const localUri = await uploadAndMark();
      setPreviewVisible(false);
      await Share.share({ url: localUri ?? previewData.localUri, title: `Invoice ${previewData.invoiceNumber}` });
    } catch {
      Alert.alert(t.common.error, t.invoice.pdfError);
    } finally {
      setSaving(false);
    }
  };

  const confirmAndSaveToFile = async () => {
    if (!previewData) return;
    setSaving(true);
    try {
      const localUri = await uploadAndMark();
      setPreviewVisible(false);
      await Share.share({ url: localUri ?? previewData.localUri, title: `Invoice ${previewData.invoiceNumber}` });
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
      <View style={{ flex: 1, backgroundColor: HEADER, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor={HEADER} />
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  const isSent = status === 'sent' || status === 'updated';
  const isPaid = status === 'paid';
  const hasContent = lineItems.some(it => it.description.trim().length > 0);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER} />

      {/* Header */}
      <SafeAreaView style={s.headerSafe} edges={['top']}>
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <SymbolView name="chevron.left" size={20} tintColor="#ffffff" />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>
            {isNew ? t.invoice.newTitle : t.invoice.editTitle(invoiceNumber)}
          </Text>
          <View style={s.headerRight}>
            {(saving || generatingPdf) ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : pdfUrl ? (
              <TouchableOpacity onPress={preparePreview} hitSlop={8}>
                <SymbolView name="square.and.arrow.up" size={20} tintColor="#ffffff" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 24 }} />
            )}
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 120 }]}
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

            {/* Invoice number (read-only) */}
            <View style={s.row}>
              <Text style={s.rowLabel}>{t.invoice.invoiceNumber}</Text>
              <Text style={s.rowValue}>{invoiceNumber}</Text>
            </View>
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
        onClose={() => setClientPickerVisible(false)}
      />

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
        onSaveToFile={confirmAndSaveToFile}
        onClose={() => setPreviewVisible(false)}
      />

      {/* Mark as Paid modal */}
      {markPaidOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMarkPaidOpen(false)} statusBarTranslucent>
          <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setMarkPaidOpen(false)} />
            <View style={m.box}>
              <Text style={m.title}>{t.invoice.confirmPayment}</Text>
              <Text style={[m.title, { fontSize: 13, fontWeight: '400', color: MUTED }]}>{t.invoice.paymentDate}</Text>
              <TextInput
                style={[m.input, { alignSelf: 'stretch' }]}
                value={paymentDateDraft}
                onChangeText={setPaymentDateDraft}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#ccc"
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
                <Text style={m.cancelText}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID="mark-paid-date-input">
              <View style={{ height: 0 }} />
            </InputAccessoryView>
          )}
        </Modal>
      )}

      {/* Date edit sheet */}
      {dateModalVisible && (
        <BottomSheet onClose={() => setDateModalVisible(false)}>
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
  visible, clients, onSelect, onClose,
}: {
  visible: boolean;
  clients: ClientRow[];
  onSelect: (c: ClientRow) => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <View style={cpSt.sheetContent}>
          <Text style={cpSt.title}>{t.invoice.clientPickerTitle}</Text>
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
          <TouchableOpacity onPress={() => close()} hitSlop={8} style={{ paddingTop: 12 }}>
            <Text style={cpSt.cancelText}>{t.common.cancel}</Text>
          </TouchableOpacity>
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
          <TouchableOpacity onPress={() => close()} hitSlop={8} style={{ paddingTop: 12 }}>
            <Text style={ppSt.cancelText}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}

// ─── Invoice preview modal ────────────────────────────────────────────────────

function InvoicePreviewModal({
  visible, data, saving, onShare, onSaveToFile, onClose,
}: {
  visible: boolean;
  data: PreviewData | null;
  saving: boolean;
  onShare: () => void;
  onSaveToFile: () => void;
  onClose: () => void;
}) {
  if (!data) return null;

  const { gross, net, vat } = data;

  const trainerAddrLines = [
    data.trainerStreet,
    [data.trainerCity, data.trainerPostcode].filter(Boolean).join(' '),
  ].filter(Boolean);

  const clientAddrLines = [
    data.clientStreet,
    [data.clientCity, data.clientPostcode].filter(Boolean).join(' '),
    data.clientCountry,
  ].filter(Boolean);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} statusBarTranslucent>
      <View style={pvSt.root}>
        {/* Modal header */}
        <View style={pvSt.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={pvSt.headerClose}>
            <SymbolView name="xmark" size={18} tintColor="#fff" />
          </TouchableOpacity>
          <Text style={pvSt.headerTitle}>Invoice Preview</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Scrollable invoice content */}
        <ScrollView
          style={pvSt.scroll}
          contentContainerStyle={pvSt.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Green accent top bar */}
          <View style={pvSt.accentBar} />

          {/* RECHNUNG heading */}
          <View style={pvSt.section}>
            <Text style={pvSt.rechnungTitle}>RECHNUNG</Text>
            {data.trainerName ? <Text style={pvSt.trainerName}>{data.trainerName}</Text> : null}
            {trainerAddrLines.map((line, i) => (
              <Text key={i} style={pvSt.trainerAddr}>{line}</Text>
            ))}
            {data.trainerEmail ? <Text style={pvSt.trainerAddr}>{data.trainerEmail}</Text> : null}
            {data.trainerSteuernummer ? <Text style={pvSt.trainerAddr}>USt-IdNr.: {data.trainerSteuernummer}</Text> : null}
          </View>

          {/* Client + invoice meta */}
          <View style={pvSt.metaBox}>
            <View style={{ flex: 1 }}>
              <Text style={pvSt.metaBoxLabel}>Für</Text>
              <Text style={pvSt.clientName}>{data.clientName || '—'}</Text>
              {clientAddrLines.map((line, i) => (
                <Text key={i} style={pvSt.clientAddr}>{line}</Text>
              ))}
            </View>
            <View style={{ alignItems: 'flex-end', marginLeft: 16 }}>
              <Text style={pvSt.metaBoxLabel}>RECHNUNG NR.</Text>
              <Text style={pvSt.metaValue}>{data.invoiceNumber}</Text>
              <Text style={[pvSt.metaBoxLabel, { marginTop: 12 }]}>AUSGESTELLT</Text>
              <Text style={pvSt.metaValue}>{fmtGermanDate(data.issueDate)}</Text>
            </View>
          </View>

          {/* Line items */}
          <View style={pvSt.tableHeader}>
            <Text style={[pvSt.th, { flex: 1 }]}>ARTIKEL</Text>
            <Text style={[pvSt.th, pvSt.thRight, { width: 56 }]}>PREIS</Text>
            <Text style={[pvSt.th, pvSt.thRight, { width: 36 }]}>QTY</Text>
            <Text style={[pvSt.th, pvSt.thRight, { width: 64 }]}>BETRAG</Text>
          </View>
          {data.lineItems.filter(it => it.description.trim()).map((item, i) => (
            <View key={i} style={pvSt.tableRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={pvSt.itemDesc}>{item.description}</Text>
                {item.additional_info ? <Text style={pvSt.itemInfo}>{item.additional_info}</Text> : null}
                {item.leistungszeitraum ? <Text style={pvSt.itemLz}>Leistungszeitraum: {item.leistungszeitraum}</Text> : null}
              </View>
              <Text style={[pvSt.itemNum, { width: 56 }]}>{fmtEur(item.unit_price_eur)} €</Text>
              <Text style={[pvSt.itemNum, { width: 36 }]}>{item.quantity}</Text>
              <Text style={[pvSt.itemNum, { width: 64 }]}>{fmtEur(item.total_eur)} €</Text>
            </View>
          ))}

          {/* Totals */}
          <View style={pvSt.totalsBox}>
            <View style={pvSt.totalRow}>
              <Text style={pvSt.totalLabel}>Nettobetrag</Text>
              <Text style={pvSt.totalValue}>{fmtEur(net)} €</Text>
            </View>
            <View style={pvSt.totalRow}>
              <Text style={pvSt.totalLabel}>Mehrwertsteuer 19%</Text>
              <Text style={pvSt.totalValue}>{fmtEur(vat)} €</Text>
            </View>
            <View style={pvSt.totalDivider} />
            <View style={pvSt.totalRow}>
              <Text style={[pvSt.totalLabel, pvSt.totalBold]}>Gesamtbetrag</Text>
              <Text style={[pvSt.totalValue, pvSt.totalBold]}>{fmtEur(gross)} €</Text>
            </View>
            <View style={pvSt.totalThickDivider} />
            <View style={pvSt.totalRow}>
              <Text style={pvSt.betragFaelligLabel}>Betrag fällig</Text>
              <Text style={pvSt.betragFaelligValue}>{fmtEur(gross)} €</Text>
            </View>
          </View>

          {/* Payment info */}
          <View style={pvSt.paymentSection}>
            <Text style={pvSt.paymentTitle}>Zahlungs-Anweisungen</Text>
            <Text style={pvSt.paymentLine}>
              {[data.trainerName, data.trainerIban ? `IBAN: ${data.trainerIban}` : null, data.trainerBic ? `BIC: ${data.trainerBic}` : null].filter(Boolean).join(' / ')}
            </Text>
            <Text style={pvSt.paymentLine}>Bitte als Verwendungszweck die Rechnungsnummer angeben.</Text>
            {data.notes ? <Text style={pvSt.paymentLine}>{data.notes}</Text> : null}
          </View>
        </ScrollView>

        {/* Action buttons */}
        <SafeAreaView style={pvSt.bottomBar} edges={['bottom']}>
          <View style={pvSt.actionRow}>
            <TouchableOpacity
              style={[pvSt.saveToFileBtn, saving && { opacity: 0.5 }]}
              onPress={onSaveToFile}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={pvSt.saveToFileBtnText}>{t.invoice.saveToFileBtn}</Text>
            </TouchableOpacity>
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
          </View>
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
  root: { flex: 1, backgroundColor: HEADER },
  headerSafe: { backgroundColor: HEADER },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '700', marginHorizontal: 8 },
  headerRight: { width: 24, alignItems: 'center' },

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
  root: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: HEADER, paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
  },
  headerClose: { width: 40, alignItems: 'flex-start' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  scroll: { flex: 1, backgroundColor: '#f9f9f7' },
  scrollContent: { paddingBottom: 32 },

  accentBar: { height: 4, backgroundColor: HEADER },

  section: { padding: 20 },
  rechnungTitle: { fontSize: 28, fontWeight: '800', color: '#000', marginBottom: 12, letterSpacing: -0.3 },
  trainerName: { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 2 },
  trainerAddr: { fontSize: 11, color: '#666', lineHeight: 18 },

  metaBox: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 20,
    backgroundColor: '#f0f1ee', borderRadius: 10, padding: 16,
  },
  metaBoxLabel: { fontSize: 10, fontWeight: '700', color: '#999', letterSpacing: 0.4, marginBottom: 4 },
  clientName: { fontSize: 15, fontWeight: '700', color: TEXT, marginBottom: 4 },
  clientAddr: { fontSize: 11, color: '#666', lineHeight: 17 },
  metaValue: { fontSize: 13, fontWeight: '700', color: TEXT },

  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: HEADER, paddingHorizontal: 16, paddingVertical: 9,
  },
  th: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.6 },
  thRight: { textAlign: 'right' },
  tableRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#ebebeb',
    backgroundColor: '#fff',
  },
  itemDesc: { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 2 },
  itemInfo: { fontSize: 11, color: '#666' },
  itemLz: { fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 2 },
  itemNum: { fontSize: 12, color: TEXT, textAlign: 'right' },

  totalsBox: { margin: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 11 },
  totalLabel: { fontSize: 13, color: '#555' },
  totalValue: { fontSize: 13, color: TEXT, fontWeight: '600' },
  totalBold: { fontWeight: '800', fontSize: 14, color: TEXT },
  totalDivider: { height: 1, backgroundColor: '#e0e0de' },
  totalThickDivider: { height: 2, backgroundColor: TEXT },
  betragFaelligLabel: { fontSize: 16, fontWeight: '800', color: TEXT },
  betragFaelligValue: { fontSize: 16, fontWeight: '800', color: TEXT },

  paymentSection: { marginHorizontal: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e8e8e4' },
  paymentTitle: { fontSize: 11, fontWeight: '700', color: '#444', marginBottom: 6 },
  paymentLine: { fontSize: 11, color: '#666', lineHeight: 18, marginBottom: 2 },

  bottomBar: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, gap: 10,
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  shareBtn: {
    flex: 1.4, backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 14, alignItems: 'center',
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  saveToFileBtn: {
    flex: 1, borderRadius: 100, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: ACCENT,
  },
  saveToFileBtnText: { color: ACCENT, fontSize: 14, fontWeight: '700' },
  closeBtn: {
    paddingVertical: 12, alignItems: 'center',
  },
  closeBtnText: { color: MUTED, fontSize: 14, fontWeight: '600' },
});
