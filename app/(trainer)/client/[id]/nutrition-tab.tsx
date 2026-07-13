import { useEffect, useCallback, useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  ActivityIndicator, Platform, InputAccessoryView, Pressable, Animated, PanResponder,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import type { ClientNutritionTargets, FoodLogEntry } from '@/lib/nutritionInsights';
import type { User } from '@/types/database';

const ACCENT    = '#24ac88';
const HEADER    = '#244e43';
const BG        = '#faf9f7';
const CARD      = '#ffffff';
const BORDER    = '#e8e8e4';
const TEXT      = '#1a1a1a';
const MUTED     = '#999';
const AMBER     = '#f5a623';
const CORAL     = '#e05555';
const WARN_TEXT = '#8A5C00';
const COL_PROT  = '#378ADD';
const COL_CARB  = '#EF9F27';
const COL_FAT   = '#D85A30';
const CAL_MAX   = 6000;

const DIET_OPTIONS = [
  { key: 'omnivore',    label: 'Omnivore' },
  { key: 'pescatarian', label: 'Pescatarian' },
  { key: 'vegetarian',  label: 'Vegetarian' },
  { key: 'vegan',       label: 'Vegan' },
  { key: 'keto',        label: 'Keto' },
  { key: 'carnivore',   label: 'Carnivore' },
  { key: 'low-carb',    label: 'Low-carb' },
  { key: 'custom',      label: 'Custom' },
] as const;
type DietKey = typeof DIET_OPTIONS[number]['key'];

const LIMIT_FIELDS: { key: keyof ClientNutritionTargets; label: string; unit: string }[] = [
  { key: 'water_target_ml', label: 'Water target',  unit: '' },
  { key: 'fiber_min_g',     label: 'Fiber (min)',    unit: 'g' },
  { key: 'sugar_max_g',     label: 'Sugar (max)',    unit: 'g' },
  { key: 'salt_max_g',      label: 'Salt (max)',     unit: 'g' },
];

const ACTIVITY_OPTIONS = [
  { key: 'sedentary',         label: 'Sedentary',         mult: 1.2   },
  { key: 'lightly_active',    label: 'Lightly active',    mult: 1.375 },
  { key: 'moderately_active', label: 'Moderately active', mult: 1.55  },
  { key: 'very_active',       label: 'Very active',       mult: 1.725 },
] as const;
type ActivityKey = typeof ACTIVITY_OPTIONS[number]['key'];

const GOAL_OPTIONS = [
  { key: 'maintain',  label: 'Maintain',        adj:    0 },
  { key: 'lose_025',  label: 'Lose 0.25 kg/wk', adj: -250 },
  { key: 'lose_05',   label: 'Lose 0.5 kg/wk',  adj: -500 },
  { key: 'gain',      label: 'Gain muscle',      adj: +250 },
] as const;
type GoalKey = typeof GOAL_OPTIONS[number]['key'];

const SEX_OPTIONS = [
  { key: 'male',   label: 'Male'   },
  { key: 'female', label: 'Female' },
  { key: 'other',  label: 'Other'  },
] as const;

type NutritionMeal = 'breakfast'|'snack_morning'|'lunch'|'snack_afternoon'|'dinner'|'snack_evening';
const ALL_MEALS: NutritionMeal[] = ['breakfast','snack_morning','lunch','snack_afternoon','dinner','snack_evening'];
const MEAL_LABELS: Record<NutritionMeal,string> = { breakfast:'Breakfast',snack_morning:'Morning Snack',lunch:'Lunch',snack_afternoon:'Afternoon Snack',dinner:'Dinner',snack_evening:'Evening Snack' };
const MEAL_EMOJI:  Record<NutritionMeal,string> = { breakfast:'🍳',snack_morning:'🥐',lunch:'🥗',snack_afternoon:'🍎',dinner:'🍲',snack_evening:'🫖' };
const MEAL_COLOR:  Record<NutritionMeal,string> = { breakfast:'#f5a623',snack_morning:'#e8923a',lunch:'#24ac88',snack_afternoon:'#34c759',dinner:'#6b5ce7',snack_evening:'#5ac8fa' };
type MacroKey = 'protein'|'carbs'|'fat';
type SubTab   = 'planning'|'overview';
type CalcSubModal = 'weight'|'height'|'sex'|'activity'|'goal'|null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatWater(ml: number): string {
  if (ml >= 1000) return `${(ml/1000).toFixed(ml%1000===0?0:1)} L/day`;
  return `${ml} ml/day`;
}
function toDateStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function addDays(d: Date, n: number) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function displayDate(d: Date) {
  const t=new Date(), y=addDays(t,-1);
  if (toDateStr(d)===toDateStr(t)) return 'Today';
  if (toDateStr(d)===toDateStr(y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
}
function getWeekStart() { const d=new Date(),dow=d.getDay(); d.setDate(d.getDate()-(dow===0?6:dow-1)); return toDateStr(d); }
function getWeekStartDate(d: Date = new Date()): Date { const r=new Date(d),dow=r.getDay(); r.setDate(r.getDate()-(dow===0?6:dow-1)); r.setHours(0,0,0,0); return r; }
function fmtWeekRange(start: Date): string {
  const end=new Date(start); end.setDate(start.getDate()+6);
  const s=start.getDate(),e=end.getDate();
  const sm=start.toLocaleDateString('en-GB',{month:'short'}),em=end.toLocaleDateString('en-GB',{month:'short'});
  return sm===em?`${s}–${e} ${sm}`:`${s} ${sm} – ${e} ${em}`;
}
function sumField(logs: FoodLogEntry[], key: keyof FoodLogEntry): number { return logs.reduce((a,e)=>a+((e[key] as number)??0),0); }
function calcAgeYears(dob: string|null): number|null {
  if (!dob) return null;
  const t=new Date(), b=new Date(dob); if(isNaN(b.getTime())) return null;
  let age=t.getFullYear()-b.getFullYear(); const m=t.getMonth()-b.getMonth();
  if(m<0||(m===0&&t.getDate()<b.getDate())) age--; return age>=0?age:null;
}
function calcBMR(w:number,h:number,a:number,sex:string){ const base=10*w+6.25*h-5*a; return Math.round(sex==='female'?base-161:base+5); }

function balanceMacros(edited: MacroKey, newPct: number, p: number, c: number, f: number): [number,number,number] {
  const clamped = Math.max(5, Math.min(90, Math.round(newPct)));
  const rem = 100 - clamped;
  function split(a:number,b:number):[number,number] { const s=a+b; if(s<=0){const h=Math.round(rem/2);return[h,rem-h];} const na=Math.round(a/s*rem); return[na,rem-na]; }
  if (edited==='protein') { const[nc,nf]=split(c,f); return[clamped,nc,nf]; }
  if (edited==='carbs')   { const[np,nf]=split(p,f); return[np,clamped,nf]; }
  const[np,nc]=split(p,c); return[np,nc,clamped];
}
function macroGrams(cal:number,p:number,c:number,f:number) { return { protein_g:Math.round(cal*p/100/4), carbs_g:Math.round(cal*c/100/4), fat_g:Math.round(cal*f/100/9) }; }

function MacroCell({ label, value, color }: { label:string; value:string; color:string }) {
  return <View style={s.macroCell}><Text style={[s.macroCellVal,{color}]}>{value}</Text><Text style={s.macroCellLabel}>{label}</Text></View>;
}

type TargetsRow = ClientNutritionTargets & { id?: string };

interface CalcResult {
  weightKg:number; heightCm:number; ageYears:number; sex:string; activityLabel:string; goalLabel:string;
  mult:number; bmr:number; tdee:number; goalAdj:number; calories:number; proteinG:number; fatG:number; carbsG:number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NutritionTab({ clientId, trainerId, client }: {
  clientId:string; trainerId:string; client:User|null;
}) {
  const insets = useSafeAreaInsets();
  const [subTab, setSubTab] = useState<SubTab>('planning');

  const [targets,          setTargets]         = useState<TargetsRow|null>(null);
  const [weekLogs,         setWeekLogs]         = useState<FoodLogEntry[]>([]);
  const [weekNote,         setWeekNote]         = useState('');
  const [weekNoteId,       setWeekNoteId]       = useState<string|null>(null);
  const [loading,          setLoading]          = useState(true);
  const [savingNote,       setSavingNote]       = useState(false);
  const [noteSaved,        setNoteSaved]        = useState(false);
  const [recentWeight,     setRecentWeight]     = useState<number|null>(null);
  const [recentWeightDate, setRecentWeightDate] = useState<string|null>(null);
  const [calcWeight,       setCalcWeight]       = useState('');
  const [nutritionNotes,   setNutritionNotes]   = useState('');
  const [savingNutNotes,   setSavingNutNotes]   = useState(false);
  const [nutNotesSaved,    setNutNotesSaved]    = useState(false);

  const [overviewDate,    setOverviewDate]    = useState(new Date());
  const [overviewLogs,    setOverviewLogs]    = useState<FoodLogEntry[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [weekModal,        setWeekModal]        = useState(false);
  const [selectedWeekDay,  setSelectedWeekDay]  = useState<string|null>(null);
  const [weekModalStart,   setWeekModalStart]   = useState<Date>(()=>getWeekStartDate());
  const [weekModalLogs,    setWeekModalLogs]    = useState<FoodLogEntry[]>([]);
  const [weekModalLoading, setWeekModalLoading] = useState(false);

  // Macro percentages
  const [protPct,  setProtPct]  = useState(0);
  const [carbsPct, setCarbsPct] = useState(0);
  const [fatPct,   setFatPct]   = useState(0);
  const skipMacroSyncRef = useRef(false);

  // Animated bars
  const animProt  = useRef(new Animated.Value(0)).current;
  const animCarbs = useRef(new Animated.Value(0)).current;
  const animFat   = useRef(new Animated.Value(0)).current;
  const animCal   = useRef(new Animated.Value(0)).current;   // 0-100 mapped from 0-6000

  // Stable refs for PanResponder callbacks
  const protPctRef    = useRef(0);
  const carbsPctRef   = useRef(0);
  const fatPctRef     = useRef(0);
  const targetsRef    = useRef<TargetsRow|null>(null);
  const barWidthRef   = useRef(1);
  const calBarWidthRef= useRef(1);
  const isDragging    = useRef(false);
  const dragStartP    = useRef(0);
  const dragStartC    = useRef(0);
  const dragStartF    = useRef(0);
  const calDragStart  = useRef(0);
  const draftCalRef   = useRef<number|null>(null);
  const patchFnRef    = useRef<(p:Partial<ClientNutritionTargets>)=>Promise<void>>(async()=>{});

  useEffect(()=>{ protPctRef.current  = protPct;  },[protPct]);
  useEffect(()=>{ carbsPctRef.current = carbsPct; },[carbsPct]);
  useEffect(()=>{ fatPctRef.current   = fatPct;   },[fatPct]);
  useEffect(()=>{ targetsRef.current  = targets;  },[targets]);

  // Animate bars on external changes (skip during drag)
  useEffect(() => {
    if (isDragging.current) return;
    Animated.parallel([
      Animated.timing(animProt,  { toValue:protPct,  duration:320, useNativeDriver:false }),
      Animated.timing(animCarbs, { toValue:carbsPct, duration:320, useNativeDriver:false }),
      Animated.timing(animFat,   { toValue:fatPct,   duration:320, useNativeDriver:false }),
    ]).start();
  }, [protPct, carbsPct, fatPct]);

  useEffect(() => {
    if (isDragging.current) return;
    const cal = targets?.calories ?? 0;
    Animated.timing(animCal, { toValue:(cal/CAL_MAX)*100, duration:320, useNativeDriver:false }).start();
  }, [targets?.calories]);

  // Derive macro percentages from DB
  useEffect(() => {
    if (skipMacroSyncRef.current) { skipMacroSyncRef.current=false; return; }
    const c = targets?.calories;
    if (!c||c<=0||targets?.protein_g==null||targets?.carbs_g==null||targets?.fat_g==null) return;
    const np=Math.round(targets.protein_g*4/c*100);
    const nf=Math.round(targets.fat_g*9/c*100);
    const nc=Math.max(0,100-np-nf);
    setProtPct(np); setCarbsPct(nc); setFatPct(nf);
    protPctRef.current=np; carbsPctRef.current=nc; fatPctRef.current=nf;
  }, [targets?.calories,targets?.protein_g,targets?.carbs_g,targets?.fat_g]);

  // Sync nutrition notes from targets
  useEffect(() => {
    if (targets?.nutrition_notes != null) setNutritionNotes(targets.nutrition_notes);
  }, [targets?.nutrition_notes]);

  // Modal states
  const [dietModal,    setDietModal]    = useState(false);
  const [fieldModal,   setFieldModal]   = useState<{key:keyof ClientNutritionTargets;label:string}|null>(null);
  const [fieldDraft,   setFieldDraft]   = useState('');
  const [macroModal,   setMacroModal]   = useState<MacroKey|null>(null);
  const [macroDraft,   setMacroDraft]   = useState('');
  const [draftCalView, setDraftCalView] = useState<number|null>(null);

  // Calculator
  const [calcModal,    setCalcModal]    = useState(false);
  const [calcStep,     setCalcStep]     = useState<1|2>(1);
  const [calcResult,   setCalcResult]   = useState<CalcResult|null>(null);
  const [calcSubModal, setCalcSubModal] = useState<CalcSubModal>(null);
  const [calcSubDraft, setCalcSubDraft] = useState('');
  const [calcHeight,   setCalcHeight]   = useState('');
  const [calcSex,      setCalcSex]      = useState<'male'|'female'|'other'|null>(null);
  const [calcActivity, setCalcActivity] = useState<ActivityKey|null>(null);
  const [calcGoal,     setCalcGoal]     = useState<GoalKey|null>(null);

  useEffect(() => {
    setCalcHeight(client?.height_cm!=null?String(Math.round(client.height_cm)):'');
    setCalcSex(client?.sex??null);
    setCalcActivity((client?.activity_level??null) as ActivityKey|null);
    setCalcGoal((client?.goal??null) as GoalKey|null);
  }, [clientId]);
  useEffect(() => {
    if (!client) return;
    setCalcHeight(p=>p!==''?p:(client.height_cm!=null?String(Math.round(client.height_cm)):''));
    setCalcSex(p=>p!==null?p:(client.sex??null));
    setCalcActivity(p=>p!==null?p:((client.activity_level??null) as ActivityKey|null));
    setCalcGoal(p=>p!==null?p:((client.goal??null) as GoalKey|null));
  }, [client]);

  const INPUT_ID = 'trainer-nut-input';

  // ─── Data ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const today=toDateStr(new Date()), ws=getWeekStart();
    const [tRes,weekRes,noteRes,weightRes] = await Promise.all([
      supabase.from('client_nutrition_targets').select('*').eq('client_id',clientId).maybeSingle(),
      supabase.from('food_log_entries').select('*').eq('client_id',clientId).gte('date',ws).lte('date',today),
      supabase.from('weekly_nutrition_notes').select('*').eq('client_id',clientId).eq('week_start',ws).maybeSingle(),
      supabase.from('measurements').select('weight_kg,date').eq('client_id',clientId).not('weight_kg','is',null).order('date',{ascending:false}).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    ]);
    setTargets((tRes.data as TargetsRow)??null);
    setWeekLogs((weekRes.data??[]) as FoodLogEntry[]);
    setWeekNote((noteRes.data as any)?.content??'');
    setWeekNoteId((noteRes.data as any)?.id??null);
    const wKg=(weightRes.data as any)?.weight_kg??null;
    setRecentWeight(wKg);
    setRecentWeightDate((weightRes.data as any)?.date??null);
    if (wKg!=null) setCalcWeight(String(wKg));
  }, [clientId]);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    const {data} = await supabase.from('food_log_entries').select('*').eq('client_id',clientId).eq('date',toDateStr(overviewDate)).order('created_at');
    setOverviewLogs((data??[]) as FoodLogEntry[]); setOverviewLoading(false);
  }, [clientId, overviewDate]);

  const navigateWeekModal = useCallback(async (dir:-1|1) => {
    const newStart=new Date(weekModalStart);
    newStart.setDate(weekModalStart.getDate()+dir*7);
    if(toDateStr(newStart)>getWeekStart()) return;
    setWeekModalStart(newStart);
    setSelectedWeekDay(null);
    setWeekModalLoading(true);
    const ws=toDateStr(newStart),end=new Date(newStart);end.setDate(newStart.getDate()+6);
    const{data}=await supabase.from('food_log_entries').select('*').eq('client_id',clientId).gte('date',ws).lte('date',toDateStr(end));
    setWeekModalLogs((data??[]) as FoodLogEntry[]);
    setWeekModalLoading(false);
  },[weekModalStart,clientId]);

  useEffect(()=>{ setLoading(true); load().finally(()=>setLoading(false)); },[load]);
  useEffect(()=>{ if(subTab==='overview') loadOverview(); },[subTab,loadOverview]);
  useEffect(()=>{
    if(!weekModal) return;
    setWeekModalStart(getWeekStartDate());
    setWeekModalLogs(weekLogs);
    setSelectedWeekDay(null);
  },[weekModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Targets CRUD ──────────────────────────────────────────────────────────

  const patchTargets = async (patch: Partial<ClientNutritionTargets>) => {
    const {data} = await supabase.from('client_nutrition_targets')
      .upsert({client_id:clientId,set_by:trainerId,...targets,...patch,updated_at:new Date().toISOString()},{onConflict:'client_id'})
      .select().single();
    if (data) setTargets(data as TargetsRow);
  };
  patchFnRef.current = patchTargets;

  const openField = (key: keyof ClientNutritionTargets, label: string) => {
    const val = targets?(targets as any)[key]:null;
    setFieldDraft(val!=null?String(val):'');
    setFieldModal({key,label});
  };

  const confirmField = async () => {
    if (!fieldModal) return;
    const raw=fieldDraft.trim(); const numVal=raw===''?null:parseFloat(raw);
    const val=isNaN(numVal as number)?null:numVal;
    if (fieldModal.key==='calories'&&val!=null&&val>0&&(protPct+carbsPct+fatPct)>0) {
      const grams=macroGrams(val,protPct,carbsPct,fatPct);
      skipMacroSyncRef.current=true; await patchTargets({calories:val,...grams});
    } else { await patchTargets({[fieldModal.key]:val}); }
    setFieldModal(null);
  };

  // ─── Macro drag ────────────────────────────────────────────────────────────

  const openMacroModal = (m: MacroKey) => {
    const cur=m==='protein'?protPct:m==='carbs'?carbsPct:fatPct;
    setMacroDraft(cur>0?String(cur):''); setMacroModal(m);
  };
  const confirmMacro = async () => {
    if (!macroModal||!targets?.calories||targets.calories<=0) return;
    const pct=parseFloat(macroDraft);
    if (isNaN(pct)||pct<=0) { setMacroModal(null); return; }
    const [np,nc,nf]=balanceMacros(macroModal,pct,protPct,carbsPct,fatPct);
    setProtPct(np); setCarbsPct(nc); setFatPct(nf);
    skipMacroSyncRef.current=true;
    await patchTargets(macroGrams(targets.calories,np,nc,nf));
    setMacroModal(null);
  };

  const makePanResponder = useCallback((macro: MacroKey) =>
    PanResponder.create({
      onStartShouldSetPanResponder: ()=>true,
      onPanResponderGrant: () => {
        isDragging.current=true;
        dragStartP.current=protPctRef.current; dragStartC.current=carbsPctRef.current; dragStartF.current=fatPctRef.current;
      },
      onPanResponderMove: (_,{dx}) => {
        const bw=barWidthRef.current; if(bw<=1) return;
        const start=macro==='protein'?dragStartP.current:macro==='carbs'?dragStartC.current:dragStartF.current;
        const [np,nc,nf]=balanceMacros(macro,start+Math.round(dx/bw*100),dragStartP.current,dragStartC.current,dragStartF.current);
        animProt.setValue(np); animCarbs.setValue(nc); animFat.setValue(nf);
        setProtPct(np); setCarbsPct(nc); setFatPct(nf);
        protPctRef.current=np; carbsPctRef.current=nc; fatPctRef.current=nf;
      },
      onPanResponderRelease: () => {
        isDragging.current=false;
        const c=targetsRef.current?.calories; if(!c||c<=0) return;
        skipMacroSyncRef.current=true;
        patchFnRef.current(macroGrams(c,protPctRef.current,carbsPctRef.current,fatPctRef.current));
      },
    }), []);

  const protPR  = useRef(makePanResponder('protein')).current;
  const carbsPR = useRef(makePanResponder('carbs')).current;
  const fatPR   = useRef(makePanResponder('fat')).current;

  // ─── Calories drag ─────────────────────────────────────────────────────────

  const calPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: ()=>true,
    onPanResponderGrant: () => {
      isDragging.current=true;
      calDragStart.current=targetsRef.current?.calories??0;
    },
    onPanResponderMove: (_,{dx}) => {
      const bw=calBarWidthRef.current; if(bw<=1) return;
      const newCal=Math.max(500,Math.min(CAL_MAX,Math.round(calDragStart.current+dx/bw*CAL_MAX)));
      draftCalRef.current=newCal;
      setDraftCalView(newCal);
      animCal.setValue((newCal/CAL_MAX)*100);
    },
    onPanResponderRelease: () => {
      isDragging.current=false;
      const newCal=draftCalRef.current; draftCalRef.current=null; setDraftCalView(null);
      if (!newCal) return;
      skipMacroSyncRef.current=true;
      const p=protPctRef.current, c=carbsPctRef.current, f=fatPctRef.current;
      const extra=(p+c+f)>0?macroGrams(newCal,p,c,f):{};
      patchFnRef.current({calories:newCal,...extra});
    },
  })).current;

  // ─── Nutrition notes save ──────────────────────────────────────────────────

  const saveNutritionNotes = async () => {
    setSavingNutNotes(true);
    await patchTargets({ nutrition_notes: nutritionNotes.trim() || null });
    setSavingNutNotes(false); setNutNotesSaved(true); setTimeout(()=>setNutNotesSaved(false),2000);
  };

  // ─── Calculator ────────────────────────────────────────────────────────────

  const openCalc = () => { setCalcStep(1); setCalcResult(null); setCalcModal(true); };
  const saveCalcField = async (field:string, value:any) => { await supabase.from('users').update({[field]:value}).eq('id',clientId); };
  const confirmCalcSub = async () => {
    if (calcSubModal==='weight') { const w=parseFloat(calcSubDraft); if(!isNaN(w)&&w>0) setCalcWeight(String(w)); }
    else if (calcSubModal==='height') { const h=parseFloat(calcSubDraft); if(!isNaN(h)&&h>0){setCalcHeight(String(Math.round(h)));await saveCalcField('height_cm',Math.round(h));} }
    setCalcSubModal(null);
  };
  const selCalcSex      = async (v:'male'|'female'|'other') => { setCalcSex(v);      await saveCalcField('sex',v);            setCalcSubModal(null); };
  const selCalcActivity = async (v:ActivityKey)              => { setCalcActivity(v); await saveCalcField('activity_level',v); setCalcSubModal(null); };
  const selCalcGoal     = async (v:GoalKey)                  => { setCalcGoal(v);     await saveCalcField('goal',v);           setCalcSubModal(null); };

  const runCalc = () => {
    const wKg=parseFloat(calcWeight); if(!calcWeight||isNaN(wKg)||!calcHeight||!client?.date_of_birth||!calcSex||!calcActivity||!calcGoal) return;
    const hCm=parseFloat(calcHeight), ageYrs=calcAgeYears(client.date_of_birth);
    if (ageYrs==null||isNaN(hCm)) return;
    const actOpt=ACTIVITY_OPTIONS.find(a=>a.key===calcActivity)!, goalOpt=GOAL_OPTIONS.find(g=>g.key===calcGoal)!;
    const bmr=calcBMR(wKg,hCm,ageYrs,calcSex), tdee=Math.round(bmr*actOpt.mult);
    const calories=Math.max(1000,tdee+goalOpt.adj);
    const proteinG=Math.round(2.0*wKg), fatG=Math.round(calories*0.25/9);
    const carbsG=Math.max(0,Math.round((calories-proteinG*4-fatG*9)/4));
    setCalcResult({weightKg:wKg,heightCm:hCm,ageYears:ageYrs,sex:calcSex,activityLabel:actOpt.label,goalLabel:goalOpt.label,mult:actOpt.mult,bmr,tdee,goalAdj:goalOpt.adj,calories,proteinG,fatG,carbsG});
    setCalcStep(2);
  };

  const applyCalcResult = async () => {
    if (!calcResult) return;
    const {calories,proteinG,carbsG,fatG}=calcResult;
    const np=Math.round(proteinG*4/calories*100), nf=Math.round(fatG*9/calories*100), nc=Math.max(0,100-np-nf);
    setProtPct(np); setCarbsPct(nc); setFatPct(nf);
    skipMacroSyncRef.current=true;
    await patchTargets({calories,protein_g:proteinG,carbs_g:carbsG,fat_g:fatG});
    setCalcModal(false);
  };

  // ─── Validation ────────────────────────────────────────────────────────────

  const weightNum = parseFloat(calcWeight), heightNum = parseFloat(calcHeight);
  const ageYears  = client?.date_of_birth?calcAgeYears(client.date_of_birth):null;
  const profileBmr= (calcWeight&&!isNaN(weightNum)&&calcHeight&&!isNaN(heightNum)&&ageYears!=null&&calcSex)
    ? calcBMR(weightNum,heightNum,ageYears,calcSex):null;
  const calTarget = targets?.calories??null;
  const warnCalsBelowBmr = profileBmr!=null&&calTarget!=null&&calTarget<profileBmr;
  const macrosSet = protPct>0||carbsPct>0||fatPct>0;
  const weightForGPerKg = !isNaN(weightNum)&&weightNum>0?weightNum:recentWeight;
  const calcCanRun = calcWeight!==''&&!isNaN(parseFloat(calcWeight))&&parseFloat(calcWeight)>0
    &&calcHeight!==''&&!isNaN(parseFloat(calcHeight))
    &&client?.date_of_birth!=null&&calcAgeYears(client.date_of_birth)!=null
    &&calcSex!=null&&calcActivity!=null&&calcGoal!=null;

  const displayCalories = draftCalView??calTarget;
  const dietLabel = targets?.diet_type?DIET_OPTIONS.find(d=>d.key===targets.diet_type)?.label??targets.diet_type:'—';

  if (loading) return <View style={{alignItems:'center',paddingTop:60}}><ActivityIndicator color={ACCENT}/></View>;

  const weekDates=[ ...new Set(weekLogs.map(e=>e.date))];
  const loggedDays=weekDates.length;
  const avgCal=loggedDays>0?Math.round(weekDates.reduce((a,d)=>a+sumField(weekLogs.filter(e=>e.date===d),'calories'),0)/loggedDays):null;
  const proHitDays=targets?.protein_g!=null?weekDates.filter(d=>sumField(weekLogs.filter(e=>e.date===d),'protein_g')>=targets.protein_g!).length:null;
  const ovCal=Math.round(sumField(overviewLogs,'calories'));
  const ovPro=sumField(overviewLogs,'protein_g'), ovCarbs=sumField(overviewLogs,'carbs_g'), ovFat=sumField(overviewLogs,'fat_g');
  const ovCalPct=targets?.calories&&targets.calories>0?Math.min(1,ovCal/targets.calories):null;
  const mealLogsFor=(meal:NutritionMeal)=>meal==='snack_afternoon'?overviewLogs.filter(e=>e.meal_category===meal||e.meal_category==='snack'):overviewLogs.filter(e=>e.meal_category===meal);
  const isTodayDate=toDateStr(overviewDate)===toDateStr(new Date());

  // Overview sub-tab values (use weekLogs directly — current week)
  const wkAvgCal7    = Math.round(sumField(weekLogs,'calories')/7);
  const wkAvgPro7    = Math.round(sumField(weekLogs,'protein_g')/7);
  const wkAvgCarbs7  = Math.round(sumField(weekLogs,'carbs_g')/7);
  const wkAvgFat7    = Math.round(sumField(weekLogs,'fat_g')/7);
  const curWeekDays  = Array.from({length:7},(_,i)=>{const d=new Date(getWeekStart());d.setDate(d.getDate()+i);return toDateStr(d);});
  const getDayStatus = (ds:string): 'green'|'amber'|'coral'|'none' => {
    const dl=weekLogs.filter(e=>e.date===ds);
    if(!dl.length) return 'none';
    const cal=dl.reduce((a,e)=>a+(e.calories??0),0);
    if(!targets?.calories||targets.calories<=0) return 'amber';
    const pct=cal/targets.calories; if(pct>=0.9) return 'green'; if(pct>=0.4) return 'amber'; return 'coral';
  };
  const selDayLogs   = selectedWeekDay?weekLogs.filter(e=>e.date===selectedWeekDay):[];
  const selDayCal    = Math.round(sumField(selDayLogs,'calories'));
  const selDayPro    = sumField(selDayLogs,'protein_g');
  const selDayCarbs  = sumField(selDayLogs,'carbs_g');
  const selDayFat    = sumField(selDayLogs,'fat_g');
  const selDayCalPct = targets?.calories&&targets.calories>0?Math.min(1,selDayCal/targets.calories):null;
  const mealLogsForDay = (meal:NutritionMeal)=>meal==='snack_afternoon'?selDayLogs.filter(e=>e.meal_category===meal||e.meal_category==='snack'):selDayLogs.filter(e=>e.meal_category===meal);

  // Full-screen modal values (weekModalLogs supports past week navigation)
  const isCurrentWkModal  = toDateStr(weekModalStart)===getWeekStart();
  const wkModalDates      = [...new Set(weekModalLogs.map(e=>e.date))];
  const wkModalLoggedDays = wkModalDates.length;
  const wkModalAvgCal     = wkModalLoggedDays>0?Math.round(wkModalDates.reduce((a,d)=>a+sumField(weekModalLogs.filter(e=>e.date===d),'calories'),0)/wkModalLoggedDays):null;
  const wkModalProHitDays = targets?.protein_g!=null?wkModalDates.filter(d=>sumField(weekModalLogs.filter(e=>e.date===d),'protein_g')>=targets.protein_g!).length:null;
  const wkModalAvgCal7    = Math.round(sumField(weekModalLogs,'calories')/7);
  const wkModalAvgPro7    = Math.round(sumField(weekModalLogs,'protein_g')/7);
  const wkModalAvgCarbs7  = Math.round(sumField(weekModalLogs,'carbs_g')/7);
  const wkModalAvgFat7    = Math.round(sumField(weekModalLogs,'fat_g')/7);
  const getWkDayStatus = (ds:string): 'green'|'amber'|'coral'|'none' => {
    const dl=weekModalLogs.filter(e=>e.date===ds);
    if(!dl.length) return 'none';
    const cal=dl.reduce((a,e)=>a+(e.calories??0),0);
    if(!targets?.calories||targets.calories<=0) return 'amber';
    const pct=cal/targets.calories;
    if(pct>=0.9) return 'green'; if(pct>=0.4) return 'amber'; return 'coral';
  };
  const wkDayDetailLogs   = selectedWeekDay?weekModalLogs.filter(e=>e.date===selectedWeekDay):[];
  const wkDayDetailCal    = Math.round(sumField(wkDayDetailLogs,'calories'));
  const wkDayDetailPro    = sumField(wkDayDetailLogs,'protein_g');
  const wkDayDetailCarbs  = sumField(wkDayDetailLogs,'carbs_g');
  const wkDayDetailFat    = sumField(wkDayDetailLogs,'fat_g');
  const wkDayDetailCalPct = targets?.calories&&targets.calories>0?Math.min(1,wkDayDetailCal/targets.calories):null;
  const mealLogsForWkDay  = (meal:NutritionMeal)=>meal==='snack_afternoon'?wkDayDetailLogs.filter(e=>e.meal_category===meal||e.meal_category==='snack'):wkDayDetailLogs.filter(e=>e.meal_category===meal);
  const wkDays7    = Array.from({length:7},(_,i)=>{const d=new Date(weekModalStart);d.setDate(weekModalStart.getDate()+i);return toDateStr(d);});
  const wkDayIdx   = selectedWeekDay?wkDays7.indexOf(selectedWeekDay):-1;
  const wkPrevDay  = wkDayIdx>0?wkDays7[wkDayIdx-1]:null;
  const wkNextDay  = wkDayIdx<6?wkDays7[wkDayIdx+1]:null;
  const canWkNextDay = wkNextDay!==null&&wkNextDay<=toDateStr(new Date());

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Switcher */}
      <View style={s.switcherWrap}>
        <View style={s.switcher}>
          {(['planning','overview'] as SubTab[]).map(tab=>(
            <TouchableOpacity key={tab} style={[s.switcherItem,subTab===tab&&s.switcherItemActive]} onPress={()=>setSubTab(tab)} activeOpacity={0.75}>
              <Text style={[s.switcherText,subTab===tab&&s.switcherTextActive]}>{tab==='planning'?'Planning':'Overview'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Planning ─────────────────────────────────────────────────── */}
      {subTab==='planning'&&(
        <>
          {/* 1. Calories + Macro card */}
          <View style={s.mainCard}>
            {/* Calories */}
            <View style={s.calSection}>
              <TouchableOpacity onPress={()=>openField('calories','Calories')} activeOpacity={0.75} style={{flex:1}}>
                <Text style={s.calNumber}>{displayCalories!=null?displayCalories.toLocaleString():'—'}</Text>
                <Text style={s.calUnit}>kcal / day  •  tap to edit</Text>
              </TouchableOpacity>
            </View>
            {/* Calories drag bar */}
            <View style={s.calBarSection}
              onLayout={e=>{calBarWidthRef.current=e.nativeEvent.layout.width;}}
              {...(calPR as any).panHandlers}
            >
              <View style={s.calBarBg}/>
              <Animated.View style={[s.calBarFill,{width:animCal.interpolate({inputRange:[0,100],outputRange:['0%','100%']})}]}/>
              <Animated.View style={[s.calBarThumb,{left:animCal.interpolate({inputRange:[0,100],outputRange:['0%','100%']})}]}/>
              <View style={s.calBarLabels}>
                <Text style={s.calBarLabel}>0</Text>
                <Text style={s.calBarLabel}>3000</Text>
                <Text style={s.calBarLabel}>6000</Text>
              </View>
            </View>
            {warnCalsBelowBmr&&<View style={s.warnRow}><Text style={s.warnText}>⚠ Below BMR ({profileBmr} kcal) — may be too restrictive</Text></View>}

            <View style={s.macroCardDivider}/>

            {/* Macro rows */}
            {calTarget==null?(
              <Text style={s.macroEmpty}>Set a calorie target above to configure the macro split</Text>
            ):(
              ([
                {key:'protein' as MacroKey, label:'Protein', pct:protPct,  anim:animProt,  color:COL_PROT, grams:targets?.protein_g??null, pr:protPR  },
                {key:'carbs'   as MacroKey, label:'Carbs',   pct:carbsPct, anim:animCarbs, color:COL_CARB, grams:targets?.carbs_g??null,   pr:carbsPR },
                {key:'fat'     as MacroKey, label:'Fat',     pct:fatPct,   anim:animFat,   color:COL_FAT,  grams:targets?.fat_g??null,     pr:fatPR   },
              ] as const).map((m,i)=>{
                const gPerKg=(weightForGPerKg!=null&&m.grams!=null)?(m.grams/weightForGPerKg).toFixed(1):null;
                const fillW=m.anim.interpolate({inputRange:[0,100],outputRange:['0%','100%']});
                return (
                  <View key={m.key} style={[s.macroBlock,i<2&&s.macroBlockBorder]}>
                    <TouchableOpacity style={s.macroStatsRow} onPress={()=>openMacroModal(m.key)} activeOpacity={0.7}>
                      <Text style={s.macroName}>{m.label}</Text>
                      <Text style={[s.macroPct,{color:m.color}]}>{m.pct>0?`${m.pct}%`:'—'}</Text>
                      <Text style={s.macroGrams}>{m.grams!=null?`${m.grams} g`:'—'}</Text>
                      {gPerKg!=null&&<Text style={s.macroGPerKg}>{gPerKg} g/kg</Text>}
                    </TouchableOpacity>
                    <View style={s.barTrackOuter}
                      onLayout={e=>{barWidthRef.current=e.nativeEvent.layout.width;}}
                      {...(m.pr as any).panHandlers}
                    >
                      <View style={s.barTrackBg}/>
                      <Animated.View style={[s.barFillFull,{width:fillW,backgroundColor:m.color}]}/>
                      <Animated.View style={[s.barThumb,{left:fillW,borderColor:m.color}]}/>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* 2. Calculate targets button */}
          <TouchableOpacity style={s.calcBtn} onPress={openCalc} activeOpacity={0.8}>
            <SymbolView name="function" size={14} tintColor={ACCENT}/>
            <Text style={s.calcBtnText}>Calculate targets</Text>
          </TouchableOpacity>

          {/* 3. Daily limits card */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>DAILY LIMITS</Text>
            {LIMIT_FIELDS.map((f,i)=>{
              const val=targets?(targets as any)[f.key]:null;
              const display=f.key==='water_target_ml'?(val!=null?formatWater(val):'—'):(val!=null?`${val} ${f.unit}`:'—');
              return (
                <TouchableOpacity key={f.key} style={[s.row,i<LIMIT_FIELDS.length-1&&s.rowBorder]} onPress={()=>openField(f.key,f.label)} activeOpacity={0.7}>
                  <Text style={s.rowLabel}>{f.label}</Text>
                  <View style={s.rowRight}>
                    <Text style={[s.rowValue,val!=null&&s.rowValueSet]}>{display}</Text>
                    <SymbolView name="chevron.right" size={14} tintColor={MUTED}/>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 4. Diet & Notes card */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>DIET & NOTES</Text>
            <TouchableOpacity style={[s.row,s.rowBorder]} onPress={()=>setDietModal(true)} activeOpacity={0.7}>
              <Text style={s.rowLabel}>Diet type</Text>
              <View style={s.rowRight}>
                <Text style={[s.rowValue,targets?.diet_type!=null&&s.rowValueSet]}>{dietLabel}</Text>
                <SymbolView name="chevron.right" size={14} tintColor={MUTED}/>
              </View>
            </TouchableOpacity>
            <Text style={s.notesLabel}>Food notes</Text>
            <TextInput
              style={s.notesInput}
              value={nutritionNotes}
              onChangeText={setNutritionNotes}
              multiline
              placeholder="Allergies, intolerances, dislikes, medical restrictions..."
              placeholderTextColor={MUTED}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[s.saveBtn,(savingNutNotes||nutritionNotes===(targets?.nutrition_notes??''))&&s.saveBtnDisabled]}
              onPress={saveNutritionNotes}
              disabled={savingNutNotes||nutritionNotes===(targets?.nutrition_notes??'')}
              activeOpacity={0.8}
            >
              <Text style={s.saveBtnText}>{nutNotesSaved?'✓ Saved':'Save notes'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Overview ─────────────────────────────────────────────────── */}
      {subTab==='overview'&&(
        <>
          {/* Summary stats */}
          <View style={s.wkStatsCard}>
            <View style={s.wkStatCell}>
              <Text style={[s.wkStatNum,{color:HEADER}]}>{loggedDays}</Text>
              <Text style={s.wkStatLabel}>days logged</Text>
            </View>
            <View style={[s.wkStatCell,{borderLeftWidth:1,borderRightWidth:1,borderColor:BORDER}]}>
              <Text style={[s.wkStatNum,{color:HEADER}]}>{avgCal??'—'}</Text>
              <Text style={s.wkStatLabel}>avg kcal / day</Text>
            </View>
            <View style={s.wkStatCell}>
              <Text style={[s.wkStatNum,{color:proHitDays===7?ACCENT:COL_PROT}]}>{proHitDays??'—'}</Text>
              <Text style={s.wkStatLabel}>protein on target</Text>
            </View>
          </View>

          {/* Global Analysis */}
          {loggedDays>0&&(
            <View style={s.card}>
              <Text style={s.sectionLabel}>WEEKLY AVERAGE VS TARGET</Text>
              {[
                {label:'Calories',val:wkAvgCal7,  target:targets?.calories??null,  unit:'kcal',color:HEADER},
                {label:'Protein', val:wkAvgPro7,  target:targets?.protein_g??null, unit:'g',   color:COL_PROT},
                {label:'Carbs',   val:wkAvgCarbs7,target:targets?.carbs_g??null,   unit:'g',   color:COL_CARB},
                {label:'Fat',     val:wkAvgFat7,  target:targets?.fat_g??null,     unit:'g',   color:COL_FAT},
              ].map(row=>{
                const t=row.target,v=row.val;
                const showBar=t!=null&&t>0;
                const pct=showBar?Math.min(1,v/(t as number)):0;
                const over=showBar&&v>(t as number);
                return (
                  <View key={row.label} style={s.analysisRow}>
                    <View style={s.analysisLabels}>
                      <Text style={s.analysisName}>{row.label}</Text>
                      <Text style={[s.analysisVal,{color:over?CORAL:(showBar?row.color:TEXT)}]}>
                        {v}{showBar?(<Text style={s.analysisMuted}> / {t} {row.unit}</Text>):(<Text style={s.analysisMuted}> {row.unit}</Text>)}
                      </Text>
                    </View>
                    {showBar&&(<View style={s.analysisTrack}><View style={[s.analysisFill,{width:`${Math.round(pct*100)}%` as any,backgroundColor:over?CORAL:row.color}]}/></View>)}
                  </View>
                );
              })}
              <Text style={s.analysisNote}>Average daily intake (week total ÷ 7)</Text>
            </View>
          )}

          {/* 7-day strip */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>TAP A DAY FOR DETAIL</Text>
            <View style={s.dayStrip}>
              {curWeekDays.map((ds,i)=>{
                const d=new Date(getWeekStart());d.setDate(d.getDate()+i);
                const dl=weekLogs.filter(e=>e.date===ds);
                const isTD=ds===toDateStr(new Date());
                const isSel=ds===selectedWeekDay;
                const status=getDayStatus(ds);
                const statusColor=status==='green'?ACCENT:status==='amber'?AMBER:status==='coral'?CORAL:'transparent';
                const dayKcal=dl.length?Math.round(dl.reduce((a,e)=>a+(e.calories??0),0)):null;
                return (
                  <TouchableOpacity key={ds}
                    style={[s.dayBtn,isSel&&{backgroundColor:HEADER+'1A',borderWidth:1.5,borderColor:HEADER}]}
                    onPress={()=>setSelectedWeekDay(isSel?null:ds)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.dayBtnName,isTD&&{color:ACCENT},isSel&&{color:HEADER}]}>{d.toLocaleDateString('en-GB',{weekday:'short'}).slice(0,2)}</Text>
                    <Text style={[s.dayBtnDate,isTD&&{color:ACCENT,fontWeight:'700'},isSel&&{color:HEADER,fontWeight:'700'}]}>{d.getDate()}</Text>
                    {dayKcal!==null?<Text style={[s.dayBtnKcal,isSel&&{color:HEADER}]}>{dayKcal}</Text>:<View style={{height:14}}/>}
                    <View style={[s.dayStatusLine,{backgroundColor:statusColor}]}/>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.dayLegend}>
              <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:ACCENT}]}/><Text style={s.legendText}>On track</Text></View>
              <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:AMBER}]}/><Text style={s.legendText}>Partial</Text></View>
              <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:CORAL}]}/><Text style={s.legendText}>Struggling</Text></View>
            </View>
          </View>

          {/* Inline day detail */}
          {selectedWeekDay&&(
            <>
              <View style={s.dayDetailHeader}>
                <Text style={s.dayDetailTitle}>
                  {(()=>{const d=new Date(selectedWeekDay+'T00:00:00');return d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});})()}
                </Text>
                <TouchableOpacity onPress={()=>setSelectedWeekDay(null)} hitSlop={8}>
                  <SymbolView name="xmark.circle.fill" size={20} tintColor={MUTED}/>
                </TouchableOpacity>
              </View>

              {selDayLogs.length===0?(
                <View style={s.card}><Text style={s.emptyText}>No food logged for this day</Text></View>
              ):(
                <>
                  {/* 1. Targets */}
                  {targets&&(targets.calories!=null||targets.protein_g!=null||targets.carbs_g!=null||targets.fat_g!=null)&&(
                    <View style={s.card}>
                      <Text style={s.sectionLabel}>TARGETS</Text>
                      {[
                        {label:'Calories',val:selDayCal,              target:targets.calories??null,  color:HEADER,   unit:'kcal'},
                        {label:'Protein', val:Math.round(selDayPro),  target:targets.protein_g??null, color:COL_PROT, unit:'g'},
                        {label:'Carbs',   val:Math.round(selDayCarbs),target:targets.carbs_g??null,   color:COL_CARB, unit:'g'},
                        {label:'Fat',     val:Math.round(selDayFat),  target:targets.fat_g??null,     color:COL_FAT,  unit:'g'},
                      ].map(row=>{
                        if(row.target==null||row.target<=0) return null;
                        const pct=Math.min(1,row.val/row.target);
                        const over=row.val>row.target;
                        return (
                          <View key={row.label} style={s.analysisRow}>
                            <View style={s.analysisLabels}>
                              <Text style={s.analysisName}>{row.label}</Text>
                              <Text style={[s.analysisVal,{color:over?CORAL:row.color}]}>
                                {row.val}{row.unit==='kcal'?'':' g'}<Text style={s.analysisMuted}> / {row.target} {row.unit}</Text>
                              </Text>
                            </View>
                            <View style={s.analysisTrack}><View style={[s.analysisFill,{width:`${Math.round(pct*100)}%` as any,backgroundColor:over?CORAL:row.color}]}/></View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* 2. Meals */}
                  {ALL_MEALS.map(meal=>{
                    const entries=mealLogsForDay(meal); if(!entries.length) return null;
                    const mealCal=Math.round(entries.reduce((s,e)=>s+(e.calories??0),0));
                    return (
                      <View key={meal} style={s.mealCard}>
                        <View style={s.mealHeader}>
                          <View style={[s.mealIconWrap,{backgroundColor:MEAL_COLOR[meal]+'20'}]}><Text style={s.mealEmoji}>{MEAL_EMOJI[meal]}</Text></View>
                          <Text style={s.mealTitle}>{MEAL_LABELS[meal]}</Text>
                          <Text style={s.mealKcal}>{mealCal} kcal</Text>
                        </View>
                        <View style={s.mealDivider}/>
                        {entries.map(entry=>(
                          <View key={entry.id} style={s.logRow}>
                            <View style={{flex:1}}>
                              <Text style={s.logName} numberOfLines={1}>{entry.food_name}</Text>
                              <Text style={s.logPortion}>{(entry as any).portion_amount}{(entry as any).portion_unit}{entry.brand?` · ${entry.brand}`:''}</Text>
                            </View>
                            <View style={s.logRight}>
                              <Text style={s.logKcal}>{Math.round(entry.calories??0)}</Text>
                              <Text style={s.logPro}>{(entry.protein_g??0).toFixed(1)}g P</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )}

          {loggedDays===0&&!selectedWeekDay&&(
            <View style={{alignItems:'center',paddingVertical:32}}>
              <Text style={{fontSize:13,color:MUTED,fontStyle:'italic'}}>No food logged this week yet</Text>
            </View>
          )}
        </>
      )}

      {/* ─── Modals ──────────────────────────────────────────────────── */}

      {/* Full-week modal */}
      <Modal visible={weekModal} transparent={false} animationType="slide" onRequestClose={()=>setWeekModal(false)} statusBarTranslucent>
        <View style={{flex:1,backgroundColor:BG}}>

          {selectedWeekDay?(
            /* ── Day Detail ──────────────────────────────────────── */
            <>
              <View style={[s.wkHeader,{paddingTop:insets.top}]}>
                <View style={s.wkHeaderRow}>
                  <TouchableOpacity onPress={()=>setSelectedWeekDay(null)} style={s.wkHdrSide} hitSlop={8}>
                    <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.85)"/>
                  </TouchableOpacity>
                  <Text style={s.wkHdrTitle} numberOfLines={1}>Day Overview</Text>
                  <View style={s.wkHdrSide}/>
                </View>
              </View>
              <View style={s.wkNavRow}>
                <TouchableOpacity onPress={()=>wkPrevDay&&setSelectedWeekDay(wkPrevDay)} disabled={!wkPrevDay} hitSlop={12}>
                  <SymbolView name="chevron.left" size={18} tintColor={wkPrevDay?HEADER:'#ccc'}/>
                </TouchableOpacity>
                <Text style={s.wkNavLabel} numberOfLines={1}>
                  {(()=>{const d=new Date(selectedWeekDay+'T00:00:00');return d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});})()}
                </Text>
                <TouchableOpacity onPress={()=>canWkNextDay&&wkNextDay&&setSelectedWeekDay(wkNextDay)} disabled={!canWkNextDay} hitSlop={12}>
                  <SymbolView name="chevron.right" size={18} tintColor={canWkNextDay?HEADER:'#ccc'}/>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{padding:16,gap:12,paddingBottom:40}} showsVerticalScrollIndicator={false}>
                {wkDayDetailLogs.length===0?(
                  <View style={{alignItems:'center',paddingVertical:48}}>
                    <Text style={{fontSize:14,color:MUTED,fontStyle:'italic'}}>No food logged for this day</Text>
                  </View>
                ):(
                  <>
                    {/* 1. Targets progress */}
                    {targets&&(targets.calories!=null||targets.protein_g!=null||targets.carbs_g!=null||targets.fat_g!=null)&&(
                      <View style={s.card}>
                        <Text style={s.sectionLabel}>TARGETS</Text>
                        {[
                          {label:'Calories',val:wkDayDetailCal,              target:targets.calories??null,  color:HEADER,   unit:'kcal'},
                          {label:'Protein', val:Math.round(wkDayDetailPro),  target:targets.protein_g??null, color:COL_PROT, unit:'g'},
                          {label:'Carbs',   val:Math.round(wkDayDetailCarbs),target:targets.carbs_g??null,   color:COL_CARB, unit:'g'},
                          {label:'Fat',     val:Math.round(wkDayDetailFat),  target:targets.fat_g??null,     color:COL_FAT,  unit:'g'},
                        ].map(row=>{
                          if(row.target==null||row.target<=0) return null;
                          const pct=Math.min(1,row.val/row.target);
                          const over=row.val>row.target;
                          return (
                            <View key={row.label} style={s.analysisRow}>
                              <View style={s.analysisLabels}>
                                <Text style={s.analysisName}>{row.label}</Text>
                                <Text style={[s.analysisVal,{color:over?CORAL:row.color}]}>
                                  {row.val}{row.unit==='kcal'?'':' g'}<Text style={s.analysisMuted}> / {row.target} {row.unit}</Text>
                                </Text>
                              </View>
                              <View style={s.analysisTrack}><View style={[s.analysisFill,{width:`${Math.round(pct*100)}%` as any,backgroundColor:over?CORAL:row.color}]}/></View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* 2. Meal sections */}
                    {ALL_MEALS.map(meal=>{
                      const entries=mealLogsForWkDay(meal); if(!entries.length) return null;
                      const mealCal=Math.round(entries.reduce((s,e)=>s+(e.calories??0),0));
                      return (
                        <View key={meal} style={s.mealCard}>
                          <View style={s.mealHeader}>
                            <View style={[s.mealIconWrap,{backgroundColor:MEAL_COLOR[meal]+'20'}]}><Text style={s.mealEmoji}>{MEAL_EMOJI[meal]}</Text></View>
                            <Text style={s.mealTitle}>{MEAL_LABELS[meal]}</Text>
                            <Text style={s.mealKcal}>{mealCal} kcal</Text>
                          </View>
                          <View style={s.mealDivider}/>
                          {entries.map(entry=>(
                            <View key={entry.id} style={s.logRow}>
                              <View style={{flex:1}}>
                                <Text style={s.logName} numberOfLines={1}>{entry.food_name}</Text>
                                <Text style={s.logPortion}>{(entry as any).portion_amount}{(entry as any).portion_unit}{entry.brand?` · ${entry.brand}`:''}</Text>
                              </View>
                              <View style={s.logRight}>
                                <Text style={s.logKcal}>{Math.round(entry.calories??0)}</Text>
                                <Text style={s.logPro}>{(entry.protein_g??0).toFixed(1)}g P</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </>
                )}
              </ScrollView>
            </>
          ):(
            /* ── Week Overview ────────────────────────────────────── */
            <>
              <View style={[s.wkHeader,{paddingTop:insets.top}]}>
                <View style={s.wkHeaderRow}>
                  <TouchableOpacity onPress={()=>setWeekModal(false)} style={s.wkHdrSide} hitSlop={8}>
                    <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.85)"/>
                  </TouchableOpacity>
                  <Text style={s.wkHdrTitle}>Week Overview</Text>
                  <View style={s.wkHdrSide}/>
                </View>
              </View>
              <View style={s.wkNavRow}>
                <TouchableOpacity onPress={()=>navigateWeekModal(-1)} hitSlop={12}>
                  <SymbolView name="chevron.left" size={18} tintColor={HEADER}/>
                </TouchableOpacity>
                <Text style={s.wkNavLabel}>{fmtWeekRange(weekModalStart)}</Text>
                <TouchableOpacity onPress={()=>!isCurrentWkModal&&navigateWeekModal(1)} hitSlop={12} disabled={isCurrentWkModal}>
                  <SymbolView name="chevron.right" size={18} tintColor={isCurrentWkModal?'#ccc':HEADER}/>
                </TouchableOpacity>
              </View>

              {weekModalLoading?(
                <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator color={ACCENT} size="large"/></View>
              ):(
                <ScrollView contentContainerStyle={{padding:16,gap:12,paddingBottom:40}} showsVerticalScrollIndicator={false}>

                  {/* Summary stats card */}
                  <View style={s.wkStatsCard}>
                    <View style={s.wkStatCell}>
                      <Text style={[s.wkStatNum,{color:HEADER}]}>{wkModalLoggedDays}</Text>
                      <Text style={s.wkStatLabel}>days logged</Text>
                    </View>
                    <View style={[s.wkStatCell,{borderLeftWidth:1,borderRightWidth:1,borderColor:BORDER}]}>
                      <Text style={[s.wkStatNum,{color:HEADER}]}>{wkModalAvgCal??'—'}</Text>
                      <Text style={s.wkStatLabel}>avg kcal / day</Text>
                    </View>
                    <View style={s.wkStatCell}>
                      <Text style={[s.wkStatNum,{color:wkModalProHitDays===7?ACCENT:COL_PROT}]}>{wkModalProHitDays??'—'}</Text>
                      <Text style={s.wkStatLabel}>protein on target</Text>
                    </View>
                  </View>

                  {/* Global Analysis */}
                  {wkModalLoggedDays>0&&(
                    <View style={s.card}>
                      <Text style={s.sectionLabel}>WEEKLY AVERAGE VS TARGET</Text>
                      {[
                        {label:'Calories',val:wkModalAvgCal7,  target:targets?.calories??null,  unit:'kcal',color:HEADER},
                        {label:'Protein', val:wkModalAvgPro7,  target:targets?.protein_g??null, unit:'g',   color:COL_PROT},
                        {label:'Carbs',   val:wkModalAvgCarbs7,target:targets?.carbs_g??null,   unit:'g',   color:COL_CARB},
                        {label:'Fat',     val:wkModalAvgFat7,  target:targets?.fat_g??null,     unit:'g',   color:COL_FAT},
                      ].map(row=>{
                        const t=row.target,v=row.val;
                        const showBar=t!=null&&t>0;
                        const pct=showBar?Math.min(1,v/(t as number)):0;
                        const over=showBar&&v>(t as number);
                        return (
                          <View key={row.label} style={s.analysisRow}>
                            <View style={s.analysisLabels}>
                              <Text style={s.analysisName}>{row.label}</Text>
                              <Text style={[s.analysisVal,{color:over?CORAL:(showBar?row.color:TEXT)}]}>
                                {v}{showBar?(<Text style={s.analysisMuted}> / {t} {row.unit}</Text>):(<Text style={s.analysisMuted}> {row.unit}</Text>)}
                              </Text>
                            </View>
                            {showBar&&(<View style={s.analysisTrack}><View style={[s.analysisFill,{width:`${Math.round(pct*100)}%` as any,backgroundColor:over?CORAL:row.color}]}/></View>)}
                          </View>
                        );
                      })}
                      <Text style={s.analysisNote}>Average daily intake (week total ÷ 7)</Text>
                    </View>
                  )}

                  {/* 7-day strip */}
                  <View style={s.card}>
                    <Text style={s.sectionLabel}>TAP A DAY FOR DETAIL</Text>
                    <View style={s.dayStrip}>
                      {wkDays7.map((ds,i)=>{
                        const d=new Date(weekModalStart);d.setDate(weekModalStart.getDate()+i);
                        const dl=weekModalLogs.filter(e=>e.date===ds);
                        const isTD=ds===toDateStr(new Date());
                        const status=getWkDayStatus(ds);
                        const statusColor=status==='green'?ACCENT:status==='amber'?AMBER:status==='coral'?CORAL:'transparent';
                        const dayKcal=dl.length?Math.round(dl.reduce((a,e)=>a+(e.calories??0),0)):null;
                        return (
                          <TouchableOpacity key={ds} style={s.dayBtn} onPress={()=>setSelectedWeekDay(ds)} activeOpacity={0.7}>
                            <Text style={[s.dayBtnName,isTD&&{color:ACCENT}]}>{d.toLocaleDateString('en-GB',{weekday:'short'}).slice(0,2)}</Text>
                            <Text style={[s.dayBtnDate,isTD&&{color:ACCENT,fontWeight:'700'}]}>{d.getDate()}</Text>
                            {dayKcal!==null?<Text style={s.dayBtnKcal}>{dayKcal}</Text>:<View style={{height:14}}/>}
                            <View style={[s.dayStatusLine,{backgroundColor:statusColor}]}/>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={s.dayLegend}>
                      <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:ACCENT}]}/><Text style={s.legendText}>On track</Text></View>
                      <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:AMBER}]}/><Text style={s.legendText}>Partial</Text></View>
                      <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:CORAL}]}/><Text style={s.legendText}>Struggling</Text></View>
                    </View>
                  </View>

                  {wkModalLoggedDays===0&&(
                    <View style={{alignItems:'center',paddingVertical:32}}>
                      <Text style={{fontSize:13,color:MUTED,fontStyle:'italic'}}>No food logged this week yet</Text>
                    </View>
                  )}
                </ScrollView>
              )}
            </>
          )}
        </View>
      </Modal>

      {/* Diet modal */}
      <Modal visible={dietModal} transparent animationType="fade" onRequestClose={()=>setDietModal(false)}>
        <Pressable style={s.overlay} onPress={()=>setDietModal(false)}>
          <Pressable style={s.modal} onPress={()=>{}}>
            <Text style={s.modalTitle}>Diet Type</Text>
            <View style={s.dietGrid}>
              {DIET_OPTIONS.map(opt=>{const active=targets?.diet_type===opt.key;return(
                <TouchableOpacity key={opt.key} style={[s.dietPill,active&&s.dietPillActive]} onPress={async()=>{await patchTargets({diet_type:opt.key});setDietModal(false);}} activeOpacity={0.7}>
                  <Text style={[s.dietPillText,active&&s.dietPillTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );})}
            </View>
            {targets?.diet_type!=null&&<TouchableOpacity style={{marginTop:8,alignSelf:'center'}} onPress={async()=>{await patchTargets({diet_type:null});setDietModal(false);}}><Text style={{fontSize:13,color:MUTED}}>Clear</Text></TouchableOpacity>}
            <TouchableOpacity style={{marginTop:14,alignSelf:'center'}} onPress={()=>setDietModal(false)}><Text style={{fontSize:14,color:MUTED}}>Cancel</Text></TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Field edit modal */}
      <Modal visible={!!fieldModal} transparent animationType="fade" onRequestClose={()=>setFieldModal(null)}>
        <Pressable style={s.overlay} onPress={()=>setFieldModal(null)}>
          <Pressable style={s.modal} onPress={()=>{}}>
            <Text style={s.modalTitle}>{fieldModal?.label}</Text>
            <Text style={s.modalSub}>{fieldModal?.key==='water_target_ml'?'Enter in ml (e.g. 2000 = 2 L/day)':fieldModal?.key==='calories'?'kcal per day':'per day'}</Text>
            <TextInput style={s.fieldInput} value={fieldDraft} onChangeText={setFieldDraft} keyboardType="number-pad" placeholder="—" placeholderTextColor={MUTED} inputAccessoryViewID={INPUT_ID} autoFocus selectTextOnFocus/>
            <TouchableOpacity style={s.confirmBtn} onPress={confirmField} activeOpacity={0.8}><Text style={s.confirmBtnText}>Confirm</Text></TouchableOpacity>
            <TouchableOpacity style={{marginTop:8,alignSelf:'center'}} onPress={()=>setFieldModal(null)}><Text style={{fontSize:14,color:MUTED}}>Cancel</Text></TouchableOpacity>
          </Pressable>
        </Pressable>
        {Platform.OS==='ios'&&<InputAccessoryView nativeID={INPUT_ID}/>}
      </Modal>

      {/* Macro % modal */}
      <Modal visible={!!macroModal} transparent animationType="fade" onRequestClose={()=>setMacroModal(null)}>
        <Pressable style={s.overlay} onPress={()=>setMacroModal(null)}>
          <Pressable style={s.modal} onPress={()=>{}}>
            <Text style={s.modalTitle}>{macroModal==='protein'?'Protein':macroModal==='carbs'?'Carbs':'Fat'} percentage</Text>
            <Text style={s.modalSub}>% of calorie target · other macros auto-adjust{calTarget?`\n(${calTarget} kcal)`:''}</Text>
            <TextInput
              style={[s.fieldInput,{color:macroModal==='protein'?COL_PROT:macroModal==='carbs'?COL_CARB:COL_FAT}]}
              value={macroDraft} onChangeText={setMacroDraft} keyboardType="number-pad" placeholder="—" placeholderTextColor={MUTED}
              inputAccessoryViewID={INPUT_ID} autoFocus selectTextOnFocus
            />
            {calTarget!=null&&macroDraft!==''&&!isNaN(parseFloat(macroDraft))&&(
              <Text style={s.macroPreview}>≈ {macroModal==='fat'?Math.round(calTarget*parseFloat(macroDraft)/100/9):Math.round(calTarget*parseFloat(macroDraft)/100/4)} g</Text>
            )}
            <TouchableOpacity style={s.confirmBtn} onPress={confirmMacro} activeOpacity={0.8}><Text style={s.confirmBtnText}>Confirm</Text></TouchableOpacity>
            <TouchableOpacity style={{marginTop:8,alignSelf:'center'}} onPress={()=>setMacroModal(null)}><Text style={{fontSize:14,color:MUTED}}>Cancel</Text></TouchableOpacity>
          </Pressable>
        </Pressable>
        {Platform.OS==='ios'&&<InputAccessoryView nativeID={INPUT_ID}/>}
      </Modal>

      {/* Calculator modal */}
      <Modal visible={calcModal} transparent animationType="fade" onRequestClose={()=>{setCalcModal(false);setCalcSubModal(null);}}>
        <Pressable style={s.overlay} onPress={()=>{setCalcModal(false);setCalcSubModal(null);}}>
          <Pressable style={[s.modal,{paddingBottom:20}]} onPress={()=>{}}>
            {calcStep===1&&(
              <>
                <Text style={s.modalTitle}>Calculate targets</Text>
                <Text style={[s.modalSub,{marginBottom:8}]}>Tap any row to edit</Text>
                <View style={s.calcCard}>
                  {[
                    {label:'Weight',val:calcWeight!==''?`${calcWeight} kg`:null,sub:recentWeightDate&&calcWeight===String(recentWeight)?'from measurements':null,onPress:()=>{setCalcSubDraft(calcWeight);setCalcSubModal('weight');}},
                    {label:'Height',val:calcHeight!==''?`${calcHeight} cm`:null,sub:null,onPress:()=>{setCalcSubDraft(calcHeight);setCalcSubModal('height');}},
                    {label:'Age',val:ageYears!=null?`${ageYears} years`:null,sub:'from date of birth',onPress:null},
                    {label:'Sex',val:calcSex!=null?(calcSex==='male'?'Male':calcSex==='female'?'Female':'Other'):null,sub:null,onPress:()=>setCalcSubModal('sex')},
                    {label:'Activity',val:calcActivity!=null?ACTIVITY_OPTIONS.find(a=>a.key===calcActivity)?.label??null:null,sub:null,onPress:()=>setCalcSubModal('activity')},
                    {label:'Goal',val:calcGoal!=null?GOAL_OPTIONS.find(g=>g.key===calcGoal)?.label??null:null,sub:null,onPress:()=>setCalcSubModal('goal')},
                  ].map((row,i,arr)=>(
                    <TouchableOpacity key={row.label} style={[s.calcRow,i<arr.length-1&&s.calcRowBorder]} onPress={row.onPress??undefined} disabled={!row.onPress} activeOpacity={row.onPress?0.7:1}>
                      <Text style={s.calcLabel}>{row.label}</Text>
                      <View style={{alignItems:'flex-end'}}>
                        {row.val!=null?<Text style={s.calcValue}>{row.val}</Text>:<Text style={s.calcMissing}>Tap to add</Text>}
                        {row.sub&&<Text style={s.calcMeta}>{row.sub}</Text>}
                      </View>
                      {row.onPress&&<SymbolView name="chevron.right" size={12} tintColor={MUTED} style={{marginLeft:4}}/>}
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[s.confirmBtn,!calcCanRun&&s.confirmBtnDisabled]} onPress={runCalc} disabled={!calcCanRun} activeOpacity={0.8}>
                  <Text style={s.confirmBtnText}>Calculate</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{marginTop:10,alignSelf:'center'}} onPress={()=>setCalcModal(false)}><Text style={{fontSize:14,color:MUTED}}>Cancel</Text></TouchableOpacity>
              </>
            )}
            {calcStep===2&&calcResult&&(
              <>
                <Text style={s.modalTitle}>Suggested targets</Text>
                <View style={s.calcCard}>
                  {[
                    {label:'BMR',value:`${calcResult.bmr} kcal`,muted:true,bold:false},
                    {label:`TDEE (BMR ×${calcResult.mult.toFixed(3)})`,value:`${calcResult.tdee} kcal`,muted:true,bold:false},
                    {label:'Goal adjustment',value:calcResult.goalAdj===0?'0 kcal':`${calcResult.goalAdj>0?'+':''}${calcResult.goalAdj} kcal`,muted:true,bold:false},
                    {label:'—',value:'',muted:false,bold:false},
                    {label:'Daily calories',value:`${calcResult.calories} kcal`,muted:false,bold:true},
                    {label:'—',value:'',muted:false,bold:false},
                    {label:'Protein (2g/kg)',value:`${calcResult.proteinG} g`,muted:false,bold:false},
                    {label:'Carbs',value:`${calcResult.carbsG} g`,muted:false,bold:false},
                    {label:'Fat (25% of cals)',value:`${calcResult.fatG} g`,muted:false,bold:false},
                  ].filter(r=>r.label!=='—').map((r,i,arr)=>(
                    <View key={r.label} style={[s.calcRow,i<arr.length-1&&s.calcRowBorder]}>
                      <Text style={[s.calcLabel,r.muted&&{color:MUTED}]}>{r.label}</Text>
                      <Text style={[s.calcValue,r.bold&&{fontWeight:'700',color:HEADER,fontSize:15},r.muted&&{color:MUTED}]}>{r.value}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.calcNote}>Values will be applied to the macro split</Text>
                <TouchableOpacity style={s.confirmBtn} onPress={applyCalcResult} activeOpacity={0.8}><Text style={s.confirmBtnText}>Use these values</Text></TouchableOpacity>
                <TouchableOpacity style={{marginTop:10,alignSelf:'center'}} onPress={()=>setCalcModal(false)}><Text style={{fontSize:14,color:MUTED}}>Cancel</Text></TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
        {/* Calc sub-modals */}
        <Modal visible={calcSubModal!==null} transparent animationType="fade" onRequestClose={()=>setCalcSubModal(null)}>
          <Pressable style={s.overlay} onPress={()=>setCalcSubModal(null)}>
            <Pressable style={s.modal} onPress={()=>{}}>
              {(calcSubModal==='weight'||calcSubModal==='height')&&(
                <>
                  <Text style={s.modalTitle}>{calcSubModal==='weight'?'Weight':'Height'}</Text>
                  <Text style={s.modalSub}>{calcSubModal==='weight'?'in kg':'in cm'}</Text>
                  <TextInput style={s.fieldInput} value={calcSubDraft} onChangeText={setCalcSubDraft} keyboardType="decimal-pad" placeholder={calcSubModal==='weight'?'e.g. 77':'e.g. 178'} placeholderTextColor={MUTED} autoFocus selectTextOnFocus inputAccessoryViewID={INPUT_ID}/>
                  <TouchableOpacity style={s.confirmBtn} onPress={confirmCalcSub} activeOpacity={0.8}><Text style={s.confirmBtnText}>Confirm</Text></TouchableOpacity>
                  <TouchableOpacity style={{marginTop:8,alignSelf:'center'}} onPress={()=>setCalcSubModal(null)}><Text style={{fontSize:14,color:MUTED}}>Cancel</Text></TouchableOpacity>
                </>
              )}
              {calcSubModal==='sex'&&(<>
                <Text style={s.modalTitle}>Sex</Text>
                <View style={{gap:8,marginTop:8,alignSelf:'stretch'}}>
                  {SEX_OPTIONS.map(o=><TouchableOpacity key={o.key} style={[s.optPill,calcSex===o.key&&s.optPillActive]} onPress={()=>selCalcSex(o.key)} activeOpacity={0.7}><Text style={[s.optPillText,calcSex===o.key&&s.optPillTextActive]}>{o.label}</Text></TouchableOpacity>)}
                </View>
                <TouchableOpacity style={{marginTop:14,alignSelf:'center'}} onPress={()=>setCalcSubModal(null)}><Text style={{fontSize:14,color:MUTED}}>Cancel</Text></TouchableOpacity>
              </>)}
              {calcSubModal==='activity'&&(<>
                <Text style={s.modalTitle}>Activity level</Text>
                <View style={{gap:8,marginTop:8,alignSelf:'stretch'}}>
                  {ACTIVITY_OPTIONS.map(o=><TouchableOpacity key={o.key} style={[s.optPill,calcActivity===o.key&&s.optPillActive]} onPress={()=>selCalcActivity(o.key)} activeOpacity={0.7}><Text style={[s.optPillText,calcActivity===o.key&&s.optPillTextActive]}>{o.label}</Text></TouchableOpacity>)}
                </View>
                <TouchableOpacity style={{marginTop:14,alignSelf:'center'}} onPress={()=>setCalcSubModal(null)}><Text style={{fontSize:14,color:MUTED}}>Cancel</Text></TouchableOpacity>
              </>)}
              {calcSubModal==='goal'&&(<>
                <Text style={s.modalTitle}>Goal</Text>
                <View style={{gap:8,marginTop:8,alignSelf:'stretch'}}>
                  {GOAL_OPTIONS.map(o=><TouchableOpacity key={o.key} style={[s.optPill,calcGoal===o.key&&s.optPillActive]} onPress={()=>selCalcGoal(o.key)} activeOpacity={0.7}><Text style={[s.optPillText,calcGoal===o.key&&s.optPillTextActive]}>{o.label}</Text></TouchableOpacity>)}
                </View>
                <TouchableOpacity style={{marginTop:14,alignSelf:'center'}} onPress={()=>setCalcSubModal(null)}><Text style={{fontSize:14,color:MUTED}}>Cancel</Text></TouchableOpacity>
              </>)}
            </Pressable>
          </Pressable>
          {Platform.OS==='ios'&&<InputAccessoryView nativeID={INPUT_ID}/>}
        </Modal>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  switcherWrap: { paddingBottom: 12 },
  switcher:     { flexDirection:'row', backgroundColor:'#d8d8d4', borderRadius:100, padding:3 },
  switcherItem: { flex:1, alignItems:'center', borderRadius:100, paddingVertical:9 },
  switcherItemActive: { backgroundColor:HEADER },
  switcherText: { fontSize:13, fontWeight:'600', color:MUTED },
  switcherTextActive: { color:'#fff', fontWeight:'700' },

  // ── Main macro/calories card ──
  mainCard: {
    backgroundColor:CARD, borderRadius:16,
    shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.07, shadowRadius:10, elevation:4,
    marginBottom:12, overflow:'visible',
  },
  calSection:   { paddingHorizontal:16, paddingTop:18, paddingBottom:4 },
  calNumber:    { fontSize:38, fontWeight:'800', color:HEADER, letterSpacing:-1 },
  calUnit:      { fontSize:12, color:MUTED, marginTop:1, marginBottom:10 },
  calBarSection:{ marginHorizontal:16, paddingTop:4, paddingBottom:4, height:52 },
  calBarBg:     { position:'absolute', left:0, right:0, top:10, height:10, backgroundColor:'#ebebea', borderRadius:5 },
  calBarFill:   { position:'absolute', left:0, top:10, height:10, borderRadius:5, backgroundColor:HEADER },
  calBarThumb:  {
    position:'absolute', width:24, height:24, borderRadius:12, backgroundColor:CARD,
    borderWidth:3, borderColor:HEADER, top:3, marginLeft:-12,
    shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.18, shadowRadius:3, elevation:3,
  },
  calBarLabels: { position:'absolute', bottom:0, left:0, right:0, flexDirection:'row', justifyContent:'space-between' },
  calBarLabel:  { fontSize:9, color:'#bbb' },

  macroCardDivider: { height:1, backgroundColor:BORDER, marginTop:8 },
  macroEmpty:   { fontSize:12, color:MUTED, fontStyle:'italic', paddingHorizontal:16, paddingVertical:14 },
  macroBlock:   { paddingHorizontal:16, paddingTop:14, paddingBottom:6 },
  macroBlockBorder: { borderBottomWidth:1, borderBottomColor:BORDER },
  macroStatsRow:{ flexDirection:'row', alignItems:'center', marginBottom:8 },
  macroName:    { flex:1, fontSize:15, fontWeight:'600', color:TEXT },
  macroPct:     { fontSize:18, fontWeight:'800', minWidth:48, textAlign:'right' },
  macroGrams:   { fontSize:14, color:HEADER, fontWeight:'600', minWidth:54, textAlign:'right' },
  macroGPerKg:  { fontSize:12, color:MUTED, minWidth:58, textAlign:'right' },
  macroPreview: { fontSize:13, color:MUTED, textAlign:'center', marginBottom:12, marginTop:-8 },

  barTrackOuter:{ height:30, justifyContent:'center', overflow:'visible' },
  barTrackBg:   { position:'absolute', left:0, right:0, top:10, height:10, backgroundColor:'#ebebea', borderRadius:5 },
  barFillFull:  { position:'absolute', left:0, top:10, height:10, borderRadius:5 },
  barThumb:     {
    position:'absolute', width:24, height:24, borderRadius:12, backgroundColor:CARD, borderWidth:3,
    top:3, marginLeft:-12,
    shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.18, shadowRadius:3, elevation:3,
  },

  warnRow:{ paddingHorizontal:16, paddingTop:2, paddingBottom:8 },
  warnText:{ fontSize:11, color:WARN_TEXT },

  // ── Calculate button ──
  calcBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:7, borderRadius:100, borderWidth:1.5, borderColor:ACCENT, backgroundColor:CARD, paddingVertical:12, marginBottom:12 },
  calcBtnText: { fontSize:14, fontWeight:'600', color:ACCENT },

  // ── Generic card ──
  card: { backgroundColor:CARD, borderRadius:14, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3, marginBottom:12 },
  summaryCard: { backgroundColor:HEADER, borderWidth:0 },
  sectionLabel: { fontSize:10, fontWeight:'700', color:MUTED, letterSpacing:0.8, paddingHorizontal:16, paddingTop:14, paddingBottom:10 },
  subLabel:     { fontSize:9, fontWeight:'700', color:MUTED, letterSpacing:0.8, textTransform:'uppercase', paddingHorizontal:16, paddingTop:10, paddingBottom:6 },
  divider:      { height:1, backgroundColor:BORDER },
  row:          { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:14 },
  rowBorder:    { borderBottomWidth:1, borderBottomColor:BORDER },
  rowLabel:     { flex:1, fontSize:14, color:TEXT },
  rowRight:     { flexDirection:'row', alignItems:'center', gap:6 },
  rowValue:     { fontSize:14, color:MUTED },
  rowValueSet:  { color:HEADER, fontWeight:'600' },

  // Notes
  notesLabel: { fontSize:11, fontWeight:'700', color:MUTED, letterSpacing:0.6, textTransform:'uppercase', paddingHorizontal:16, paddingTop:10, paddingBottom:6 },
  notesInput: { marginHorizontal:16, marginBottom:10, backgroundColor:BG, borderRadius:10, padding:12, fontSize:14, color:TEXT, minHeight:90, textAlignVertical:'top' },
  saveBtn:    { marginHorizontal:16, marginBottom:14, backgroundColor:ACCENT, borderRadius:100, paddingVertical:11, alignItems:'center' },
  saveBtnDisabled: { opacity:0.45 },
  saveBtnText:{ fontSize:14, fontWeight:'700', color:'#fff' },

  emptyText:{ fontSize:13, color:MUTED, paddingHorizontal:16, paddingVertical:16, fontStyle:'italic', textAlign:'center' },
  macroCellRow:{ flexDirection:'row', paddingHorizontal:16, paddingVertical:14 },
  macroCell:{ flex:1, alignItems:'center' },
  macroCellVal:{ fontSize:17, fontWeight:'700' },
  macroCellLabel:{ fontSize:9, fontWeight:'600', color:MUTED, marginTop:2, letterSpacing:0.3 },
  barTrackDark:{ height:4, backgroundColor:'rgba(255,255,255,0.15)', marginHorizontal:16, borderRadius:2, marginBottom:10, overflow:'hidden' },
  barFillDark:{ height:4, borderRadius:2 },
  summaryCountText:{ fontSize:11, color:'rgba(255,255,255,0.55)', textAlign:'center', paddingBottom:12 },
  weekRow:{ flexDirection:'row', paddingHorizontal:16, paddingVertical:16 },
  weekStat:{ flex:1, alignItems:'center' },
  weekNum:{ fontSize:22, fontWeight:'700', color:HEADER },
  weekLabel:{ fontSize:10, color:MUTED, marginTop:3, textAlign:'center' },
  noteInput:{ marginHorizontal:16, marginTop:8, marginBottom:10, backgroundColor:BG, borderRadius:10, padding:12, fontSize:14, color:TEXT, minHeight:80, textAlignVertical:'top' },
  seeWeekRow:{ flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12 },
  seeWeekText:{ flex:1, fontSize:14, fontWeight:'600', color:ACCENT },
  dateNav:{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:16, paddingVertical:6, marginBottom:8 },
  dateNavLabel:{ fontSize:14, fontWeight:'600', color:TEXT, minWidth:140, textAlign:'center' },
  mealCard:{ backgroundColor:CARD, borderRadius:12, marginBottom:10, overflow:'hidden', shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3 },
  mealHeader:{ flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:14, paddingVertical:11 },
  mealIconWrap:{ width:30, height:30, borderRadius:8, alignItems:'center', justifyContent:'center' },
  mealEmoji:{ fontSize:15 },
  mealTitle:{ flex:1, fontSize:13, fontWeight:'700', color:TEXT },
  mealKcal:{ fontSize:12, color:MUTED },
  mealDivider:{ height:1, backgroundColor:BORDER },
  logRow:{ flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:9, borderBottomWidth:1, borderBottomColor:BORDER },
  logName:{ fontSize:13, color:TEXT, fontWeight:'500' },
  logPortion:{ fontSize:11, color:MUTED, marginTop:1 },
  logRight:{ alignItems:'flex-end', gap:2 },
  logKcal:{ fontSize:13, fontWeight:'700', color:TEXT },
  logPro:{ fontSize:10, color:MUTED },

  overlay:{ flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'center', alignItems:'center' },
  modal:{ backgroundColor:CARD, borderRadius:16, padding:24, width:'84%', maxWidth:360 },
  modalTitle:{ fontSize:17, fontWeight:'700', color:TEXT, textAlign:'center', marginBottom:2 },
  modalSub:{ fontSize:12, color:MUTED, textAlign:'center', marginBottom:12 },
  dietGrid:{ flexDirection:'row', flexWrap:'wrap', gap:8, justifyContent:'center', marginTop:12, marginBottom:4 },
  dietPill:{ borderRadius:100, backgroundColor:'#fff', paddingHorizontal:14, paddingVertical:7, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3, elevation:1 },
  dietPillActive:{ backgroundColor:ACCENT },
  dietPillText:{ fontSize:13, fontWeight:'600', color:MUTED },
  dietPillTextActive:{ color:'#fff' },
  fieldInput:{ borderRadius:10, backgroundColor:'#f5f5f3', padding:12, fontSize:28, fontWeight:'700', color:TEXT, textAlign:'center', marginBottom:16, marginTop:4, alignSelf:'stretch' },
  confirmBtn:{ backgroundColor:ACCENT, borderRadius:100, paddingVertical:12, alignItems:'center', alignSelf:'stretch' },
  confirmBtnDisabled:{ opacity:0.4 },
  confirmBtnText:{ fontSize:15, fontWeight:'700', color:'#fff' },
  calcCard:{ alignSelf:'stretch', borderRadius:12, backgroundColor:'#f9f9f7', overflow:'hidden', marginBottom:14 },
  calcRow:{ flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:11 },
  calcRowBorder:{ borderBottomWidth:1, borderBottomColor:BORDER },
  calcLabel:{ flex:1, fontSize:13, fontWeight:'500', color:TEXT },
  calcValue:{ fontSize:13, fontWeight:'600', color:HEADER },
  calcMissing:{ fontSize:12, color:ACCENT, fontStyle:'italic' },
  calcMeta:{ fontSize:10, color:MUTED },
  calcNote:{ fontSize:11, color:MUTED, textAlign:'center', marginBottom:12 },
  optPill:{ alignSelf:'stretch', paddingVertical:11, paddingHorizontal:14, borderRadius:10, backgroundColor:'#f9f9f7', alignItems:'center', shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3, elevation:1 },
  optPillActive:{ backgroundColor:ACCENT },
  optPillText:{ fontSize:14, fontWeight:'600', color:MUTED },
  optPillTextActive:{ color:'#fff' },
  weekModalHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:20, paddingBottom:14, borderBottomWidth:1, borderBottomColor:BORDER, backgroundColor:CARD },
  weekModalTitle:{ fontSize:16, fontWeight:'700', color:TEXT },
  weekModalStats:{ flexDirection:'row', backgroundColor:HEADER, paddingHorizontal:16, paddingVertical:16 },
  weekModalStatNum:{ fontSize:22, fontWeight:'700', color:'#fff', textAlign:'center' },
  weekModalStatLabel:{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:3, textAlign:'center' },
  weekDayCard:{ flexDirection:'row', alignItems:'center', backgroundColor:CARD, borderRadius:12, paddingHorizontal:14, paddingVertical:12, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:4, elevation:2 },
  weekDayCardActive:{ borderWidth:1, borderColor:ACCENT+'40' },
  weekDayLeft:{ flex:1 },
  weekDayName:{ fontSize:13, fontWeight:'700', color:TEXT },
  weekDayDate:{ fontSize:11, color:MUTED, marginTop:1 },
  weekDayRight:{ alignItems:'flex-end', gap:2 },
  weekDayKcal:{ fontSize:14, fontWeight:'700', color:TEXT },
  weekDayPro:{ fontSize:11, color:MUTED },
  weekDayEmpty:{ fontSize:12, color:MUTED, fontStyle:'italic' },

  // ── Global Analysis / Day Strip ──
  analysisRow:    { marginBottom:14, paddingHorizontal:16 },
  analysisLabels: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  analysisName:   { fontSize:13, fontWeight:'600', color:TEXT },
  analysisVal:    { fontSize:13, fontWeight:'700' },
  analysisMuted:  { fontSize:12, fontWeight:'400', color:MUTED },
  analysisTrack:  { height:6, backgroundColor:BG, borderRadius:3, overflow:'hidden' },
  analysisFill:   { height:6, borderRadius:3 },
  analysisNote:   { fontSize:11, color:MUTED, marginTop:6, textAlign:'center', paddingBottom:4 },

  // ── Dark green modal header ──
  wkHeader:     { backgroundColor: HEADER },
  wkHeaderRow:  { height: 62, flexDirection:'row', alignItems:'center', paddingHorizontal:20 },
  wkHdrSide:    { width:48, alignItems:'flex-start', justifyContent:'center' },
  wkHdrTitle:   { flex:1, fontSize:18, fontWeight:'700', color:'#fff', textAlign:'center' },
  wkNavRow:     { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:12, paddingVertical:11, paddingHorizontal:20, backgroundColor:CARD, borderBottomWidth:1, borderBottomColor:BORDER },
  wkNavLabel:   { flex:1, fontSize:15, fontWeight:'600', color:TEXT, textAlign:'center' },
  wkStatsCard:  { backgroundColor:CARD, borderRadius:14, flexDirection:'row', shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3, marginBottom:12 },
  wkStatCell:   { flex:1, alignItems:'center', paddingVertical:16 },
  wkStatNum:    { fontSize:22, fontWeight:'700' },
  wkStatLabel:  { fontSize:10, color:MUTED, marginTop:3, textAlign:'center' },

  dayDetailHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:4, paddingTop:12, paddingBottom:6 },
  dayDetailTitle:  { fontSize:15, fontWeight:'700', color:HEADER },

  dayStrip:       { flexDirection:'row', gap:4, marginTop:10, marginHorizontal:10 },
  dayBtn:         { flex:1, alignItems:'center', paddingVertical:12, borderRadius:10, backgroundColor:BG },
  dayBtnName:     { fontSize:11, fontWeight:'600', color:MUTED },
  dayBtnDate:     { fontSize:16, fontWeight:'700', color:TEXT, marginTop:3 },
  dayBtnKcal:     { fontSize:10, color:MUTED, marginTop:3 },
  dayStatusLine:  { height:4, width:'65%', borderRadius:2, marginTop:6 },
  dayLegend:      { flexDirection:'row', justifyContent:'center', gap:16, marginTop:10, paddingTop:9, paddingBottom:11, borderTopWidth:1, borderTopColor:BORDER },
  legendItem:     { flexDirection:'row', alignItems:'center', gap:5 },
  legendDot:      { width:8, height:8, borderRadius:4 },
  legendText:     { fontSize:11, color:MUTED },
});
