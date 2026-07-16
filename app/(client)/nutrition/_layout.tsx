import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

const ACCENT = '#24ac88';

export default function NutritionLayout() {
  return (
    <NativeTabs tintColor={ACCENT} backBehavior="none">
      <NativeTabs.Trigger name="index">
        <Label>Food Log</Label>
        <Icon sf="fork.knife" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="favourites">
        <Label>Favourites</Label>
        <Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="weekly">
        <Label>Weekly</Label>
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="grocery-list">
        <Label>Grocery</Label>
        <Icon sf={{ default: 'cart', selected: 'cart.fill' }} />
      </NativeTabs.Trigger>

      {/* Suppressed routes — mounted but hidden from the bar */}
      <NativeTabs.Trigger name="tips" hidden />
      <NativeTabs.Trigger name="recipes" hidden />
      <NativeTabs.Trigger name="recommendations" hidden />
      <NativeTabs.Trigger name="recipe/create" hidden />
      <NativeTabs.Trigger name="recipe/[id]" hidden />
    </NativeTabs>
  );
}
