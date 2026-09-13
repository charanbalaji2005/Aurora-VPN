import React, {useEffect, useState} from 'react';
import {Pressable, StatusBar, Text, View} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme, ThemeProvider} from './design/theme';
import {Icon, IconName} from './components/Icon';
import {AccountScreen} from './screens/AccountScreen';
import {ConnectionDetailsScreen} from './screens/ConnectionDetailsScreen';
import {DiagnosticsScreen} from './screens/DiagnosticsScreen';
import {HomeScreen} from './screens/HomeScreen';
import {LocationsPane, LocationsScreen} from './screens/LocationsScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {SignInScreen} from './screens/SignInScreen';
import {SplashScreen} from './screens/SplashScreen';
import {StatsScreen} from './screens/StatsScreen';
import {useStore} from './state/store';

import {SplitTunnelingScreen} from './screens/SplitTunnelingScreen';
import {LegalScreen} from './screens/LegalScreen';

type Tab = 'home' | 'locations' | 'stats' | 'settings';
type Modal = 'details' | 'diagnostics' | 'account' | 'split_tunneling' | 'legal' | null;

/**
 * Four tabs, no more.
 *
 * Everything a free user does is on Home. Locations, Statistics and Settings
 * are the three places they might go next; anything deeper — connection
 * details, diagnostics, split tunnelling, legal, the account page — is pushed
 * over the top and comes back with one tap.
 */
const TABS: {id: Tab; label: string; icon: IconName}[] = [
  {id: 'home', label: 'Home', icon: 'shield'},
  {id: 'locations', label: 'Locations', icon: 'globe'},
  {id: 'stats', label: 'Stats', icon: 'chart'},
  {id: 'settings', label: 'Settings', icon: 'settings'},
];

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const {colors, dimens} = useTheme();
  const insets = useSafeAreaInsets();

  const bootstrap = useStore(s => s.bootstrap);
  const ready = useStore(s => s.ready);
  const signedIn = useStore(s => s.signedIn);

  const [tab, setTab] = useState<Tab>('home');
  const [modal, setModal] = useState<Modal>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const page = (children: React.ReactNode, withTabs = true) => (
    <View style={{flex: 1, backgroundColor: colors.base}}>
      <StatusBar
        barStyle={colors.isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <View style={{flex: 1, paddingTop: insets.top}}>{children}</View>
      {withTabs ? (
        <TabBar
          tab={tab}
          onSelect={next => {
            setModal(null);
            setTab(next);
          }}
        />
      ) : null}
    </View>
  );

  if (!ready) return <SplashScreen />;
  if (!signedIn) return page(<SignInScreen />, false);

  if (modal) {
    const close = () => setModal(null);
    if (modal === 'details') return page(<ConnectionDetailsScreen onBack={close} />);
    if (modal === 'diagnostics') return page(<DiagnosticsScreen onBack={close} />);
    if (modal === 'split_tunneling') return page(<SplitTunnelingScreen onBack={close} />);
    if (modal === 'legal') return page(<LegalScreen onBack={close} />);
    return page(<AccountScreen onBack={close} onOpenLegal={() => setModal('legal')} />);
  }

  // From 600dp the home screen shows the connection panel and the location
  // list together: on a tablet, changing country should not mean leaving the
  // screen that tells you whether you are protected.
  const twoPane = dimens.twoPane;

  switch (tab) {
    case 'home':
      return page(
        <HomeScreen
          sideBySide={twoPane}
          renderLocations={() => <LocationsPane />}
          onOpenLocations={() => setTab('locations')}
          onOpenDetails={() => setModal('details')}
        />,
      );
    case 'locations':
      return page(<LocationsScreen />);
    case 'stats':
      return page(<StatsScreen />);
    case 'settings':
      return page(
        <SettingsScreen
          onOpenAccount={() => setModal('account')}
          onOpenDiagnostics={() => setModal('diagnostics')}
          onOpenSplitTunneling={() => setModal('split_tunneling')}
          onOpenLegal={() => setModal('legal')}
        />,
      );
  }
}

/**
 * The tab bar: a flat strip with a hairline above it, docked to the safe area.
 * No floating pill, no blur — the content behind it is a solid surface, and a
 * translucent bar over a scrolling list is harder to read for no benefit.
 */
function TabBar({tab, onSelect}: {tab: Tab; onSelect: (next: Tab) => void}) {
  const {colors, type} = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.surface,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 10),
      }}>
      {TABS.map(item => {
        const active = item.id === tab;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{selected: active}}
            accessibilityLabel={item.label}
            onPress={() => onSelect(item.id)}
            style={{flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4}}>
            <Icon
              name={item.icon}
              size={21}
              color={active ? colors.accent : colors.textMuted}
              filled={false}
            />
            <Text style={[type.meta, {color: active ? colors.accent : colors.textMuted}]}>
              {item.label}
            </Text>
            {/* An active indicator as well as colour: state never depends on
                hue alone. */}
            <View
              style={{
                height: 2,
                width: 18,
                borderRadius: 2,
                backgroundColor: active ? colors.accent : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
