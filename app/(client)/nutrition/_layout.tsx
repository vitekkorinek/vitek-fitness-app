import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

const ACCENT = '#24ac88';
const MUTED  = '#999';
const BG     = '#faf9f7';

export default function NutritionLayout() {
  return (
    <Tabs
      backBehavior="none"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: '#e8e8e4',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Food Log',
          tabBarIcon: ({ color }) => (
            <SymbolView name="fork.knife" size={22} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="favourites"
        options={{
          title: 'Favourites',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView name={focused ? 'heart.fill' : 'heart'} size={22} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="weekly"
        options={{
          title: 'Weekly',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView name={focused ? 'chart.bar.fill' : 'chart.bar'} size={22} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="grocery-list"
        options={{
          title: 'Grocery',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView name={focused ? 'cart.fill' : 'cart'} size={22} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen name="tips" options={{ href: null }} />
      <Tabs.Screen name="recipes" options={{ href: null }} />
      <Tabs.Screen name="recommendations" options={{ href: null }} />
      <Tabs.Screen name="recipe/create" options={{ href: null }} />
      <Tabs.Screen name="recipe/[id]" options={{ href: null }} />
    </Tabs>
  );
}
