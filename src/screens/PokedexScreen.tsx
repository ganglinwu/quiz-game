import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useBGM } from '../audio';
import { ALL_GENS, getPokemonForGens, getAllPokemon, queryPokemon } from '../data/pokemon-db';
import { getArtworkUrl } from '../utils/pokeApi';
import { PokemonItem, StatName } from '../types';
import NetworkImage from '../components/NetworkImage';
import PokemonCardModal from '../components/PokemonCardModal';
import PokedexFilterModal from '../components/PokedexFilterModal';
import ShimmerBadge from '../components/ShimmerBadge';

// Small funnel glyph drawn with plain Views (no icon library in this project) so
// the "filter" symbol renders identically across platforms.
function FunnelIcon({ active }: { active: boolean }) {
  const color = active ? '#ffffff' : '#a0a0b0';
  return (
    <View style={styles.funnel}>
      <View style={[styles.funnelBar, { width: 16, backgroundColor: color }]} />
      <View style={[styles.funnelBar, { width: 10, backgroundColor: color }]} />
      <View style={[styles.funnelBar, { width: 4, backgroundColor: color }]} />
    </View>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'Pokedex'>;

const NUM_COLUMNS = 3;
const GRID_GAP = 10;
const HORIZONTAL_PADDING = 16;

const STAT_OPTIONS: { key: StatName; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Attack' },
  { key: 'defense', label: 'Defense' },
  { key: 'sp_attack', label: 'Sp. Atk' },
  { key: 'sp_defense', label: 'Sp. Def' },
  { key: 'speed', label: 'Speed' },
];

export default function PokedexScreen({ navigation }: Props) {
  useBGM('pokedex');

  const { width: screenWidth } = useWindowDimensions();
  const cellSize = (screenWidth - HORIZONTAL_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

  const [selectedGen, setSelectedGen] = useState<number | null>(null);
  const [selectedStat, setSelectedStat] = useState<StatName | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [filterVisible, setFilterVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPokemon, setSelectedPokemon] = useState<PokemonItem | null>(null);

  const pokemon = useMemo<PokemonItem[]>(() => {
    // Route through queryPokemon whenever a stat or type filter is active (it
    // can express both); otherwise use the lighter gen/all browse queries.
    // `types` is an INTERSECTION (AND): selecting Fire + Flying shows only
    // Pokémon that are both (e.g. Charizard, Moltres), not the union of the two.
    // Since a Pokémon has at most 2 types, selecting 3+ types yields nothing —
    // the ListEmptyComponent covers that gracefully. (Union semantics live in
    // queryPokemon's separate `hasAnyOfTypes` option, used only by quiz mode.)
    let list: PokemonItem[] =
      selectedStat || selectedTypes.length > 0
        ? queryPokemon({
            generations: selectedGen ? [selectedGen] : undefined,
            types: selectedTypes.length > 0 ? selectedTypes : undefined,
            statRank: selectedStat ? { stat: selectedStat, topN: 20 } : undefined,
          })
        : selectedGen
          ? getPokemonForGens([selectedGen])
          : getAllPokemon();
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(query));
    }
    return list;
  }, [selectedGen, selectedStat, selectedTypes, search]);

  const renderItem = useCallback(
    ({ item }: { item: PokemonItem }) => (
      <TouchableOpacity
        style={[styles.cell, { width: cellSize }]}
        activeOpacity={0.7}
        onPress={() => setSelectedPokemon(item)}
      >
        <NetworkImage
          uri={getArtworkUrl(item.pokedexNumber)}
          style={{ width: cellSize - 16, height: cellSize - 16 }}
          loaderSize={20}
        />
        <Text style={styles.pokemonName} numberOfLines={1}>
          {item.name}
        </Text>
        {!!item.isMythical && <ShimmerBadge label="Mythical" color="#D4A017" />}
        {!!item.isLegendary && <ShimmerBadge label="Legendary" color="#7B2FF7" />}
      </TouchableOpacity>
    ),
    [cellSize],
  );

  const keyExtractor = useCallback((item: PokemonItem) => String(item.pokedexNumber), []);

  // A gen+type combination can legitimately match nothing (e.g. Gen 1 + Dark —
  // the Dark type debuted in Gen 2), and so can a search miss. Without this the
  // grid just goes blank with a bare "0" count, which reads as a broken screen.
  const ListEmpty = (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No Pokémon found</Text>
      <Text style={styles.emptyHint}>Try a different type, generation, or search.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pokédex</Text>
        <Text style={styles.count}>{pokemon.length}</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search…"
            placeholderTextColor="#666"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => setSearch('')}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, selectedTypes.length > 0 && styles.filterBtnActive]}
          onPress={() => setFilterVisible(true)}
          accessibilityLabel="Filter by type"
        >
          <FunnelIcon active={selectedTypes.length > 0} />
          {selectedTypes.length > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{selectedTypes.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        <TouchableOpacity
          style={[styles.filterChip, selectedGen === null && styles.filterChipActive]}
          onPress={() => setSelectedGen(null)}
        >
          <Text style={[styles.filterText, selectedGen === null && styles.filterTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {ALL_GENS.map((gen) => (
          <TouchableOpacity
            key={gen}
            style={[styles.filterChip, selectedGen === gen && styles.filterChipActive]}
            onPress={() => setSelectedGen(gen)}
          >
            <Text style={[styles.filterText, selectedGen === gen && styles.filterTextActive]}>
              Gen {gen}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.statScroll}
      >
        {STAT_OPTIONS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.filterChip, selectedStat === s.key && styles.statChipActive]}
            onPress={() => setSelectedStat(selectedStat === s.key ? null : s.key)}
          >
            <Text style={[styles.filterText, selectedStat === s.key && styles.filterTextActive]}>
              {selectedStat === s.key ? `Top 20 ${s.label}` : s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={pokemon}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={pokemon.length > 0 ? styles.row : undefined}
        contentContainerStyle={styles.grid}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={ListEmpty}
        // No getItemLayout: cells are variable-height (a Legendary/Mythical
        // ShimmerBadge renders inline, ~24px taller, on ~9% of the 1025
        // Pokemon). A fixed-height getItemLayout would mis-predict row offsets,
        // and that error accumulates over the long list into multi-screen drift
        // that makes FlatList window the wrong region (blank gaps on scroll).
        // The screen has no scrollToIndex/initialScrollIndex, so letting
        // FlatList measure natively is both correct and sufficient here.
      />

      <PokedexFilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        selectedTypes={selectedTypes}
        onTypesChange={setSelectedTypes}
      />

      {selectedPokemon && (
        <PokemonCardModal
          visible
          pokemonName={selectedPokemon.name}
          pokemonId={selectedPokemon.pokedexNumber}
          // The Pokédex is a reference browser: always show the full real-world
          // evolution lineage (e.g. Pichu → Pikachu → Raichu) even when a gen
          // filter is active, so members from other gens stay traceable. Only
          // quiz mode (ResultScreen) scopes the chain to the active gens.
          onClose={() => setSelectedPokemon(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 12,
  },
  backBtn: {
    marginRight: 12,
  },
  backText: {
    color: '#a0a0b0',
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1,
  },
  count: {
    fontSize: 14,
    color: '#a0a0b0',
    fontVariant: ['tabular-nums'],
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a3e',
    borderRadius: 10,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2a2a3e',
    borderWidth: 2,
    borderColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    borderColor: '#e63946',
    backgroundColor: '#3a2a3e',
  },
  funnel: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  funnelBar: {
    height: 2.5,
    borderRadius: 2,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#e63946',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 15,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearBtnText: {
    color: '#a0a0b0',
    fontSize: 16,
    fontWeight: '600',
  },
  filterScroll: {
    flexShrink: 0,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 4,
  },
  filterChip: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2a2a3e',
  },
  filterChipActive: {
    borderColor: '#e63946',
    backgroundColor: '#3a2a3e',
  },
  statScroll: {
    flexShrink: 0,
    marginBottom: 12,
  },
  statChipActive: {
    borderColor: '#f4a261',
    backgroundColor: '#3e3a2a',
  },
  filterText: {
    color: '#a0a0b0',
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  grid: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 40,
  },
  row: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  cell: {
    alignItems: 'center',
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  pokemonName: {
    color: '#d0d0e0',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#d0d0e0',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyHint: {
    color: '#a0a0b0',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});
