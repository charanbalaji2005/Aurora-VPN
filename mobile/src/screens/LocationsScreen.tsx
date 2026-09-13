import React, {useMemo, useState} from 'react';
import {FlatList, Pressable, Text, View} from 'react-native';
import {Card} from '../design/Surface';
import {useTheme} from '../design/theme';
import {FlagBadge} from '../components/FlagBadge';
import {Icon, SignalBars} from '../components/Icon';
import {EmptyState, FilterChips, ScreenHeader, SearchField} from '../components/Primitives';
import {Server, isAvailable} from '../domain/models';
import {useStore} from '../state/store';
import {formatLatency} from '../util/format';

const REGIONS: Record<string, string[]> = {
  Asia: ['JP', 'SG', 'IN', 'KR', 'HK', 'TW', 'TH', 'ID', 'MY', 'AE'],
  Europe: ['DE', 'GB', 'FR', 'NL', 'SE', 'CH', 'ES', 'IT', 'PL', 'NO', 'IE'],
  Americas: ['US', 'CA', 'BR', 'MX', 'AR', 'CL'],
};
const FILTERS = ['All', 'Favourites', 'Asia', 'Europe', 'Americas'];

/**
 * Locations.
 *
 * Ordered by what a person actually cares about — how good this server is for
 * them right now — rather than alphabetically. Load is drawn as signal bars so
 * the list is scannable without reading percentages, and a location that has
 * never answered a latency probe shows no number rather than a convincing
 * guess.
 */
export function LocationsScreen({onBack}: {onBack?: () => void}) {
  const {dimens} = useTheme();
  return (
    <View style={{flex: 1, paddingHorizontal: dimens.gutter}}>
      <LocationsPane onBack={onBack} />
    </View>
  );
}

export function LocationsPane({onBack}: {onBack?: () => void}) {
  const {colors, dimens, type} = useTheme();
  const servers = useStore(s => s.servers);
  const refreshing = useStore(s => s.refreshing);
  const refresh = useStore(s => s.refresh);
  const connect = useStore(s => s.connect);
  const toggleFavourite = useStore(s => s.toggleFavourite);
  const activeServer = useStore(s => s.activeServer);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(0);
  const [searching, setSearching] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const region = REGIONS[FILTERS[filter] ?? ''];

    return servers
      .filter(server => {
        if (!needle) return true;
        return (
          server.country.toLowerCase().includes(needle) ||
          server.city.toLowerCase().includes(needle) ||
          server.countryCode.toLowerCase().includes(needle)
        );
      })
      .filter(server => {
        if (filter === 1) return server.isFavourite;
        if (region) return region.includes(server.countryCode.toUpperCase());
        return true;
      })
      .sort((a, b) => {
        if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
        if (isAvailable(a) !== isAvailable(b)) return isAvailable(a) ? -1 : 1;
        return (
          (a.latencyMs ?? Number.POSITIVE_INFINITY) - (b.latencyMs ?? Number.POSITIVE_INFINITY) ||
          a.loadPercent - b.loadPercent
        );
      });
  }, [servers, query, filter]);

  return (
    <View
      style={{
        flex: 1,
        gap: dimens.gapMd,
        width: '100%',
        maxWidth: dimens.contentMaxWidth,
        alignSelf: 'center',
      }}>
      <ScreenHeader
        title="Locations"
        onBack={onBack}
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searching ? 'Close search' : 'Search locations'}
            hitSlop={12}
            onPress={() => {
              setSearching(!searching);
              if (searching) setQuery('');
            }}>
            <Icon name={searching ? 'x' : 'search'} size={20} color={colors.textPrimary} />
          </Pressable>
        }
      />

      {searching ? (
        <SearchField value={query} onChangeText={setQuery} placeholder="Search country or city" />
      ) : null}

      <FilterChips options={FILTERS} selectedIndex={filter} onSelect={setFilter} />

      {filtered.length === 0 ? (
        <EmptyState
          icon="globe"
          title={servers.length === 0 ? 'No locations yet' : 'Nothing matches'}
          body={
            servers.length === 0
              ? 'The server list comes from the control plane. Pull it again once you are online.'
              : 'Try a different country, city or filter.'
          }
          action={
            servers.length === 0
              ? {label: refreshing ? 'Refreshing…' : 'Refresh', onPress: () => void refresh()}
              : undefined
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.gatewayId}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          ItemSeparatorComponent={() => <View style={{height: dimens.gapSm}} />}
          contentContainerStyle={{paddingBottom: 130}}
          renderItem={({item}) => (
            <ServerRow
              server={item}
              selected={item.gatewayId === activeServer?.gatewayId}
              onSelect={() => void connect(item)}
              onFavourite={() => void toggleFavourite(item.gatewayId)}
            />
          )}
        />
      )}

      {filtered.length > 0 ? (
        <Text style={[type.meta, {color: colors.textMuted, textAlign: 'center'}]}>
          Latency is measured per device; locations without a reading show a dash.
        </Text>
      ) : null}
    </View>
  );
}

function ServerRow({
  server,
  selected,
  onSelect,
  onFavourite,
}: {
  server: Server;
  selected: boolean;
  onSelect: () => void;
  onFavourite: () => void;
}) {
  const {colors, dimens, type} = useTheme();
  const available = isAvailable(server);
  const bars = server.loadPercent < 25 ? 4 : server.loadPercent < 50 ? 3 : server.loadPercent < 80 ? 2 : 1;
  const barTint =
    server.loadPercent < 50 ? colors.protected : server.loadPercent < 80 ? colors.negotiating : colors.alert;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Connect to ${server.city}, ${server.country}`}
      accessibilityState={{disabled: !available, selected}}
      disabled={!available}
      onPress={onSelect}>
      <Card
        padding={dimens.gapSm + 2}
        style={{
          borderColor: selected ? colors.protected : colors.line,
          opacity: available ? 1 : 0.55,
        }}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: dimens.gapMd}}>
          <FlagBadge countryCode={server.countryCode} countryName={server.country} size={32} />

          <View style={{flex: 1}}>
            <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{server.country}</Text>
            <Text style={[type.meta, {color: colors.textMuted}]}>
              {available ? server.city : `${server.city} · unavailable`}
            </Text>
          </View>

          <Text style={[type.label, {color: colors.textSecondary, minWidth: 52, textAlign: 'right'}]}>
            {formatLatency(server.latencyMs)}
          </Text>

          {available ? <SignalBars level={bars as 1 | 2 | 3 | 4} color={barTint} /> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              server.isFavourite
                ? `Remove ${server.country} from favourites`
                : `Add ${server.country} to favourites`
            }
            hitSlop={10}
            onPress={onFavourite}>
            <Icon
              name={server.isFavourite ? 'starFilled' : 'star'}
              size={19}
              color={server.isFavourite ? colors.negotiating : colors.textMuted}
            />
          </Pressable>
        </View>
      </Card>
    </Pressable>
  );
}
