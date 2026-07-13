import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

export default function ClientTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#24ac88',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#ffffff',
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
          title: 'Train',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView name={focused ? 'bolt.fill' : 'bolt'} size={22} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView name={focused ? 'chart.line.uptrend.xyaxis' : 'chart.line.uptrend.xyaxis'} size={22} tintColor={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Nutrition',
          tabBarIcon: ({ color }) => (
            <SymbolView name="leaf" size={22} tintColor={color} />
          ),
          tabBarActiveTintColor: '#ccc',
          tabBarInactiveTintColor: '#ccc',
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView name={focused ? 'person.fill' : 'person'} size={22} tintColor={color} />
          ),
        }}
      />
      {/* Full-screen navigated screens — no tab bar */}
      <Tabs.Screen
        name="workout/[id]"
        options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
      />
      <Tabs.Screen name="all-workouts" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="all-routines" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="routine/[routineId]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      {/* Hide boilerplate screens from the tab bar */}
      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
  );
}
