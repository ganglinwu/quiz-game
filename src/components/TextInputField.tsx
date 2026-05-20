import React, { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  onSubmit: (text: string) => void;
  disabled: boolean;
  clearKey: number;
}

export default function TextInputField({ onSubmit, disabled, clearKey }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue('');
  }, [clearKey]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue('');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder="Type an answer..."
        placeholderTextColor="#666"
        editable={!disabled}
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
        autoCorrect={false}
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={[styles.submitBtn, disabled && styles.disabled]}
        onPress={handleSubmit}
        disabled={disabled || !value.trim()}
      >
        <Text style={styles.submitText}>Go</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  input: {
    flex: 1,
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    padding: 14,
    color: '#ffffff',
    fontSize: 16,
  },
  submitBtn: {
    marginLeft: 10,
    backgroundColor: '#4361ee',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  disabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
