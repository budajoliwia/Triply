import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow, typography } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          ...typography.micro,
          fontWeight: '700',
        },
        tabBarStyle: {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 10,
          ...shadow.card,
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Główna',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Szukaj',
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Dodaj',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
