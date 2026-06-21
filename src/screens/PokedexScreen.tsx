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
import ShimmerBadge from '../components/ShimmerBadge';

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
  const [search, setSearch] = useState('');
  const [selectedPokemon, setSelectedPokemon] = useState<PokemonItem | null>(null);

  const pokemon = useMemo(() => {
    if (selectedStat) {
      return queryPokemon({
        generations: selectedGen ? [selectedGen] : undefined,
        statRank: { stat: selectedStat, topN: 20 },
      });
    }
    let list = selectedGen ? getPokemonForGens([selectedGen]) : getAllPokemon();
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(query));
    }
    return list;
  }, [selectedGen, selectedStat, search]);

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
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        keyboardDismissMode="on-drag"
        getItemLayout={(_data, index) => ({
          length: cellSize + 24 + GRID_GAP,
          offset: (cellSize + 24 + GRID_GAP) * Math.floor(index / NUM_COLUMNS),
          index,
        })}
      />

      {selectedPokemon && (
        <PokemonCardModal
          visible
          pokemonName={selectedPokemon.name}
          pokemonId={selectedPokemon.pokedexNumber}
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
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a3e',
    borderRadius: 10,
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
});
