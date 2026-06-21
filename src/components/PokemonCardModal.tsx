import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { getArtworkUrl } from '../utils/pokeApi';
import { getEvolutionChain, type EvolutionChainMember } from '../data/pokemon-db';
import { useAudio } from '../audio';
import PokeballLoader from './PokeballLoader';
import NetworkImage from './NetworkImage';

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

function getCryUrl(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `https://play.pokemonshowdown.com/audio/cries/${slug}.mp3`;
}

export default function PokemonCardModal({ visible, pokemonName, pokemonId, onClose }: Props) {
  const { manager } = useAudio();
  const [displayId, setDisplayId] = useState(pokemonId);
  const [displayName, setDisplayName] = useState(pokemonName);
  const [data, setData] = useState<PokemonApiData | null>(null);
  const [flavorText, setFlavorText] = useState('');
  const [loading, setLoading] = useState(true);
  const [chain, setChain] = useState<EvolutionChainMember[]>([]);
  const [cryPlaying, setCryPlaying] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDisplayId(pokemonId);
    setDisplayName(pokemonName);
    setChain(getEvolutionChain(pokemonId));
  }, [visible, pokemonId, pokemonName]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setData(null);
    setFlavorText('');

    Promise.all([
      fetch(`https://pokeapi.co/api/v2/pokemon/${displayId}`).then((r) => r.json()),
      fetch(`https://pokeapi.co/api/v2/pokemon-species/${displayId}`).then((r) => r.json()),
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
  }, [visible, displayId]);

  const switchToEvolution = useCallback((member: EvolutionChainMember) => {
    setDisplayId(member.id);
    setDisplayName(member.name);
  }, []);

  const playCry = useCallback(() => {
    if (cryPlaying) return;
    setCryPlaying(true);
    manager.playSfx({ uri: getCryUrl(displayName) }, () => setCryPlaying(false));
  }, [displayName, cryPlaying, manager]);

  const primaryType = data?.types[0] ?? 'normal';
  const cardColor = TYPE_COLORS[primaryType] ?? TYPE_COLORS.normal;
  const hp = data?.stats.find((s) => s.name === 'hp')?.value ?? '??';
  const showChain = chain.length > 1;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.card, { borderColor: cardColor }]}>
          <View style={[styles.header, { backgroundColor: cardColor }]}>
            <Text style={styles.headerName}>{displayName}</Text>
            <Text style={styles.headerHp}>HP {hp}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <PokeballLoader size={52} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.cardBody} bounces={false}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={playCry}
                style={[styles.artFrame, { borderColor: cardColor }]}
              >
                <NetworkImage uri={getArtworkUrl(displayId)} style={styles.artwork} loaderSize={36} />
                <View style={styles.cryIndicator}>
                  <Text style={styles.cryIcon}>{cryPlaying ? '🔊' : '🔈'}</Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.dexNumber}>#{String(displayId).padStart(3, '0')}</Text>

              {showChain && (
                <View style={styles.chainRow}>
                  {chain.map((member, i) => (
                    <React.Fragment key={member.id}>
                      {i > 0 && <Text style={styles.chainArrow}>→</Text>}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => switchToEvolution(member)}
                        style={[
                          styles.chainItem,
                          member.id === displayId && styles.chainItemActive,
                          member.id === displayId && { borderColor: cardColor },
                        ]}
                      >
                        <NetworkImage
                          uri={getArtworkUrl(member.id)}
                          style={styles.chainImage}
                          loaderSize={12}
                        />
                        <Text
                          style={[
                            styles.chainName,
                            member.id === displayId && styles.chainNameActive,
                          ]}
                          numberOfLines={1}
                        >
                          {member.name}
                        </Text>
                      </TouchableOpacity>
                    </React.Fragment>
                  ))}
                </View>
              )}

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
  cryIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cryIcon: {
    fontSize: 11,
  },
  dexNumber: {
    fontSize: 13,
    color: '#777',
    fontWeight: '700',
    marginBottom: 6,
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  chainArrow: {
    fontSize: 14,
    color: '#999',
    marginHorizontal: 2,
  },
  chainItem: {
    alignItems: 'center',
    padding: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chainItemActive: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  chainImage: {
    width: 40,
    height: 40,
  },
  chainName: {
    fontSize: 9,
    color: '#999',
    fontWeight: '600',
    maxWidth: 56,
  },
  chainNameActive: {
    color: '#444',
    fontWeight: '700',
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
