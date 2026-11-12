import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../hooks/useAuth';
import { colors, font } from '../utils/theme';

import LoginScreen          from '../screens/LoginScreen';
import TablesScreen         from '../screens/TablesScreen';
import StartSessionScreen   from '../screens/StartSessionScreen';
import ActiveSessionScreen  from '../screens/ActiveSessionScreen';
import BillScreen           from '../screens/BillScreen';
import AddPlayerScreen      from '../screens/AddPlayerScreen';
import PlayersScreen        from '../screens/PlayersScreen';
import PlayerDetailScreen   from '../screens/PlayerDetailScreen';
import SettleTabScreen      from '../screens/SettleTabScreen';
import ReportsScreen        from '../screens/ReportsScreen';
import SettingsScreen       from '../screens/SettingsScreen';
import UserManagementScreen from '../screens/UserManagementScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle:      { backgroundColor: colors.surface },
  headerTintColor:  colors.textPrimary,
  headerTitleStyle: { fontWeight: '600' },
};

function TablesStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Tables"        component={TablesScreen}        options={{ title: 'Pool Tables' }} />
      <Stack.Screen name="StartSession"  component={StartSessionScreen}  options={{ title: 'Start Game' }} />
      <Stack.Screen name="ActiveSession" component={ActiveSessionScreen} options={{ title: 'Live Game' }} />
      <Stack.Screen name="Bill"          component={BillScreen}          options={{ title: 'Collect Payment' }} />
      <Stack.Screen name="AddPlayer" component={AddPlayerScreen} options={{ title: 'Add Player' }} />
    </Stack.Navigator>
  );
}

function PlayersStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Players"      component={PlayersScreen}      options={{ title: 'Players' }} />
      <Stack.Screen name="PlayerDetail" component={PlayerDetailScreen} options={{ title: 'Player Profile' }} />
      <Stack.Screen name="AddPlayer"    component={AddPlayerScreen}    options={{ title: 'Add Player' }} />
    </Stack.Navigator>
  );
}

function SettleStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Settle" component={SettleTabScreen} options={{ title: 'Settle Tab' }} />
    </Stack.Navigator>
  );
}

function ReportsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} options={{ title: 'Manage Staff' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor:  colors.border,
          borderTopWidth:  0.5,
        },
        tabBarActiveTintColor:   colors.amber,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: font.sm },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            TablesTab:   'grid-outline',
            PlayersTab:  'people-outline',
            SettleTab:   'cash-outline',
            ReportsTab:  'bar-chart-outline',
            SettingsTab: 'settings-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="TablesTab"   component={TablesStack}   options={{ title: 'Tables' }} />
      <Tab.Screen name="PlayersTab"  component={PlayersStack}  options={{ title: 'Players' }} />
      <Tab.Screen name="SettleTab"   component={SettleStack}   options={{ title: 'Settle' }} />
      <Tab.Screen name="ReportsTab"  component={ReportsStack}  options={{ title: 'Reports' }} />
      <Tab.Screen name="SettingsTab" component={SettingsStack} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}