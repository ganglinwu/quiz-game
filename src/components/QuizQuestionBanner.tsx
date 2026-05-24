import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { QuizQuestion } from '../types';
import { constraintToLabel, type ConstraintFeedback } from '../utils/quizQuestionGenerator';

interface Props {
  question: QuizQuestion;
  activeGens: number[];
  feedback: ConstraintFeedback | null;
  feedbackName: string | null;
  hardcore: boolean;
}

export default function QuizQuestionBanner({
  question,
  activeGens,
  feedback,
  feedbackName,
  hardcore,
}: Props) {
  const displayRows = useMemo(() => {
    const rows: string[] = [];
    const hasGenConstraint = question.constraints.some((c) => c.kind === 'generation');
    if (!hasGenConstraint) {
      rows.push(
        activeGens.length === 1 ? `Gen ${activeGens[0]}` : `Gen ${activeGens.join(', ')}`,
      );
    }
    for (const c of question.constraints) {
      rows.push(constraintToLabel(c));
    }
    return rows;
  }, [question.constraints, activeGens]);

  const showFeedback = feedback && !hardcore;

  return (
    <View style={styles.banner}>
      {showFeedback && feedbackName && (
        <Text style={styles.feedbackName}>{feedbackName}</Text>
      )}
      <Text style={styles.header}>Name a Pokemon that is...</Text>
      {displayRows.map((label, i) => {
        const fb = showFeedback ? feedback[i] : null;
        const icon = fb ? (fb.passed ? '✓' : '✗') : '·';
        const iconColor = fb ? (fb.passed ? '#4ade80' : '#ef4444') : '#a0a0b0';
        const labelColor = fb ? (fb.passed ? '#4ade80' : '#ef4444') : '#ffffff';
        return (
          <View key={i} style={styles.row}>
            <Text style={[styles.icon, { color: iconColor }]}>{icon}</Text>
            <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
          </View>
        );
      })}
      {!hardcore && (
        <Text style={styles.meta}>{question.validAnswerCount} possible</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#2a4a6e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  feedbackName: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  header: {
    color: '#ffd700',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingLeft: 8,
  },
  icon: {
    fontSize: 16,
    fontWeight: 'bold',
    width: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: '#a0a0b0',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'right',
  },
});
