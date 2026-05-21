import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { getArtworkUrl } from '../utils/pokeApi';

const TYPE_COLORS: Record<string, string> = {
  normal: '#A8A77A',
  fire: '#EE8130',
  water: '#6390F0',
  electric: '#F7D02C',
  grass: '#7AC74C',
  ice: '#96D9D6',
  fighting: '#C22E28',
  poison: '#A33EA1',
  ground: '#E2BF65',
  flying: '#A98FF3',
  psychic: '#F95587',
  bug: '#A6B91A',
  rock: '#B6A136',
  ghost: '#735797',
  dragon: '#6F35FC',
  dark: '#705746',
  steel: '#B7B7CE',
  fairy: '#D685AD',
};

interface PokemonApiData {
  types: string[];
  stats: { name: string; value: number }[];
  height: number;
  weight: number;
}

interface Props {
  visible: boolean;
  pokemonName: string;
  pokemonId: number;
  onClose: () => void;
}

export default function PokemonCardModal({ visible, pokemonName, pokemonId, onClose }: Props) {
  const [data, setData] = useState<PokemonApiData | null>(null);
  const [flavorText, setFlavorText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setData(null);
    setFlavorText('');

    Promise.all([
      fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`).then((r) => r.json()),
      fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonId}`).then((r) => r.json()),
    ])
      .then(([pokemon, species]) => {
        setData({
          types: pokemon.types.map((t: any) => t.type.name),
          stats: pokemon.stats.map((s: any) => ({
            name: s.stat.name,
            value: s.base_stat,
          })),
          height: pokemon.height,
          weight: pokemon.weight,
        });
        const entry = species.flavor_text_entries.find(
          (e: any) => e.language.name === 'en'
        );
        if (entry) {
          setFlavorText(entry.flavor_text.replace(/[\n\f]/g, ' '));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [visible, pokemonId]);

  const primaryType = data?.types[0] ?? 'normal';
  const cardColor = TYPE_COLORS[primaryType] ?? TYPE_COLORS.normal;
  const hp = data?.stats.find((s) => s.name === 'hp')?.value ?? '??';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.card, { borderColor: cardColor }]}>
          <View style={[styles.header, { backgroundColor: cardColor }]}>
            <Text style={styles.headerName}>{pokemonName}</Text>
            <Text style={styles.headerHp}>HP {hp}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={cardColor} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.cardBody} bounces={false}>
              <View style={[styles.artFrame, { borderColor: cardColor }]}>
                <Image source={{ uri: getArtworkUrl(pokemonId) }} style={styles.artwork} />
              </View>

              <Text style={styles.dexNumber}>#{String(pokemonId).padStart(3, '0')}</Text>

              <View style={styles.typesRow}>
                {data?.types.map((type) => (
                  <View key={type} style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[type] ?? '#888' }]}>
                    <Text style={styles.typeText}>{type.toUpperCase()}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>HEIGHT</Text>
                  <Text style={styles.infoValue}>{((data?.height ?? 0) / 10).toFixed(1)} m</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>WEIGHT</Text>
                  <Text style={styles.infoValue}>{((data?.weight ?? 0) / 10).toFixed(1)} kg</Text>
                </View>
              </View>

              <View style={styles.statsContainer}>
                {data?.stats.map((stat) => (
                  <View key={stat.name} style={styles.statRow}>
                    <Text style={styles.statName}>{STAT_LABELS[stat.name] ?? stat.name}</Text>
                    <Text style={styles.statValue}>{stat.value}</Text>
                    <View style={styles.statBarBg}>
                      <View
                        style={[
                          styles.statBarFill,
                          {
                            width: `${Math.min((stat.value / 255) * 100, 100)}%`,
                            backgroundColor: statColor(stat.value),
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>

              {flavorText !== '' && <Text style={styles.flavorText}>{flavorText}</Text>}
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  'special-attack': 'SP.ATK',
  'special-defense': 'SP.DEF',
  speed: 'SPD',
};

function statColor(value: number): string {
  if (value >= 100) return '#4CAF50';
  if (value >= 60) return '#FFC107';
  return '#F44336';
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 300,
    maxHeight: '80%',
    backgroundColor: '#f5f0e1',
    borderRadius: 16,
    borderWidth: 5,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flexShrink: 1,
  },
  headerHp: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  loadingContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    padding: 14,
    alignItems: 'center',
  },
  artFrame: {
    borderWidth: 3,
    borderRadius: 10,
    padding: 6,
    backgroundColor: '#ddd8c4',
    marginBottom: 8,
  },
  artwork: {
    width: 160,
    height: 160,
  },
  dexNumber: {
    fontSize: 13,
    color: '#777',
    fontWeight: '700',
    marginBottom: 6,
  },
  typesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  typeBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 10,
  },
  typeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoItem: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  infoLabel: {
    fontSize: 10,
    color: '#999',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    color: '#333',
    fontWeight: 'bold',
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: '#ccc',
  },
  statsContainer: {
    width: '100%',
    marginBottom: 10,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  statName: {
    width: 48,
    fontSize: 10,
    color: '#777',
    fontWeight: '700',
  },
  statValue: {
    width: 28,
    fontSize: 11,
    color: '#444',
    fontWeight: 'bold',
    textAlign: 'right',
    marginRight: 8,
  },
  statBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#e0ddd0',
    borderRadius: 3,
  },
  statBarFill: {
    height: 6,
    borderRadius: 3,
  },
  flavorText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },
});
