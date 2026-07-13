import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

const ACCENT = '#24ac88';
const HEADER = '#244e43';
const TEXT = '#1a1a1a';

type Props = {
  visible: boolean;
  title: string;
  options: readonly string[];
  selected: Set<string>;
  onToggle: (opt: string) => void;
  onClose: () => void;
};

export function ExerciseFilterSheet({
  visible, title, options, selected, onToggle, onClose,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.box}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {selected.size > 0 && (
              <TouchableOpacity
                onPress={() => options.forEach(o => selected.has(o) && onToggle(o))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.scroll}>
            {options.map(opt => {
              const active = selected.has(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={styles.row}
                  onPress={() => onToggle(opt)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{opt}</Text>
                  <View style={[styles.check, active && styles.checkActive]}>
                    {active && <SymbolView name="checkmark" size={11} tintColor="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  box: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    maxHeight: '72%',
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '700', color: TEXT },
  clearText: { fontSize: 13, fontWeight: '600', color: ACCENT },
  scroll: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  rowLabel: { fontSize: 15, color: TEXT },
  rowLabelActive: { color: HEADER, fontWeight: '600' },
  check: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: '#d4d4d0',
    alignItems: 'center', justifyContent: 'center',
  },
  checkActive: { backgroundColor: HEADER, borderColor: HEADER },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  doneBtn: {
    backgroundColor: ACCENT,
    borderRadius: 100,
    paddingVertical: 13,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
