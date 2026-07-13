import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Polygon } from 'react-native-svg';
import { VFIcon } from '@/components/VFIcon';

const HEADER = '#244e43';
const ACCENT = '#24ac88';
const BG = '#faf9f7';

interface Props {
  clientId: string;
  clientName: string;
  isTrainer: boolean;
}

function starPoints(outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${r * Math.cos(angle)},${r * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

function Star({ size = 14, opacity = 1, style }: { size?: number; opacity?: number; style?: object }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`} style={[{ opacity }, style]}>
      <Polygon points={starPoints(r, r * 0.4)} fill={ACCENT} />
    </Svg>
  );
}

export function StretchCompleteScreen({ clientId, clientName, isTrainer }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleDone = () => {
    if (isTrainer) {
      router.replace({ pathname: '/(trainer)/client/[id]', params: { id: clientId } } as any);
    } else {
      router.replace('/(client)/(tabs)/train' as any);
    }
  };

  return (
    <View style={[s.root, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 24 }]}>
        <View style={s.logoWrap}>
          <Star size={18} opacity={0.4} style={{ position: 'absolute', left: 10, top: 18 }} />
          <Star size={13} opacity={0.4} style={{ position: 'absolute', left: 25, top: 5 }} />
          <Star size={22} opacity={0.7} style={{ position: 'absolute', right: 4, top: 10 }} />
          <Star size={10} opacity={0.4} style={{ position: 'absolute', right: 26, top: 2 }} />
          <Star size={10} opacity={0.4} style={{ position: 'absolute', left: 0, top: 58 }} />
          <VFIcon size={64} color="rgba(255,255,255,0.85)" />
        </View>
        <Text style={s.title}>{"That felt good,\ndidn't it?"}</Text>
        <Text style={s.subtitle}>Stretching complete</Text>
      </View>

      {/* Body */}
      <View style={s.body}>
        <View style={s.card}>
          <Text style={s.quote}>"5 minutes of stretching a day keeps the soreness away!"</Text>
          <Text style={s.seeYou}>See you next session, {clientName}.</Text>
        </View>
      </View>

      {/* Done button */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={s.doneBtn} onPress={handleDone} activeOpacity={0.85}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER,
    alignItems: 'center',
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  logoWrap: {
    width: 130,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 8,
  },
  subtitle: { fontSize: 11, color: 'rgba(255,255,255,0.38)', textAlign: 'center' },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  quote: {
    fontSize: 14,
    fontWeight: '500',
    fontStyle: 'italic',
    color: '#244e43',
    textAlign: 'center',
    lineHeight: 22,
  },
  seeYou: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: BG,
  },
  doneBtn: {
    backgroundColor: HEADER,
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
