import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

const ACCENT = '#24ac88';

export default function TrainerTabsLayout() {
  return (
    // Native iOS tab bar (real Liquid Glass + vibrancy on iOS 26). The accent-green
    // `tintColor` is the active tint (matching the client side); iOS adapts the
    // inactive glyph/label colour to the content behind the bar automatically. Each
    // trainer tab screen renders its OWN header, so — unlike the client tabs — there
    // is no shared glass header to overlay here.
    <NativeTabs tintColor={ACCENT}>
      <NativeTabs.Trigger name="clients">
        <Label>Clients</Label>
        <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
      </NativeTabs.Trigger>
      {/* `calendar.fill` does not exist as an SF Symbol — use `calendar` for both states */}
      <NativeTabs.Trigger name="schedule">
        <Label>Schedule</Label>
        <Icon sf="calendar" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <Label>Library</Label>
        <Icon sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="finance">
        <Label>Finance</Label>
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <Label>Account</Label>
        <Icon sf={{ default: 'person.circle', selected: 'person.circle.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
