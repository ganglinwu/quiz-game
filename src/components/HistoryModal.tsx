import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { TurnRecord } from '../types';
import { getPlayerColor } from '../utils/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  turnRecords: TurnRecord[];
  highlightItem: string | null;
  players: string[];
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function HistoryModal({
  visible,
  onClose,
  turnRecords,
  highlightItem,
  players,
}: Props) {
  const listRef = useRef<FlatList>(null);
  const highlightIndex = highlightItem
    ? turnRecords.findIndex((r) => r.item === highlightItem)
    : -1;

  useEffect(() => {
    if (visible && highlightIndex >= 0 && listRef.current) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: highlightIndex,
          animated: true,
          viewPosition: 0.5,
        });
      }, 300);
    }
  }, [visible, highlightIndex]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>
            History ({turnRecords.length} items)
          </Text>
          <FlatList
            ref={listRef}
            data={turnRecords}
            keyExtractor={(_, i) => i.toString()}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                listRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.5,
                });
              }, 500);
            }}
            renderItem={({ item, index }) => {
              const color = getPlayerColor(item.player, players);
              const isHighlighted = index === highlightIndex;
              return (
                <View style={[styles.row, isHighlighted && styles.highlightedRow]}>
                  <Text style={[styles.index, { color }]}>{index + 1}.</Text>
                  <Text style={[styles.item, { color }]}>{item.item}</Text>
                  <Text style={styles.timestamp}>
                    {formatTime(item.timestamp)}
                  </Text>
                  <Text style={[styles.player, { color }]}>{item.player}</Text>
                </View>
              );
            }}
            style={styles.list}
          />
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  highlightedRow: {
    backgroundColor: '#3a3a5e',
    borderRadius: 8,
  },
  index: {
    width: 30,
    fontSize: 14,
  },
  item: {
    flex: 1,
    fontSize: 16,
  },
  timestamp: {
    color: '#666',
    fontSize: 11,
    marginRight: 8,
  },
  player: {
    fontSize: 12,
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: '#4361ee',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
