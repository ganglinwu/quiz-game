import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Category, HintLimit, HintRecord, TurnRecord } from '../types';
import HomeScreen from '../screens/HomeScreen';
import PlayerSetupScreen from '../screens/PlayerSetupScreen';
import GameScreen from '../screens/GameScreen';
import ResultScreen from '../screens/ResultScreen';
import PokedexScreen from '../screens/PokedexScreen';

export type RootStackParamList = {
  Home: undefined;
  Pokedex: undefined;
  PlayerSetup: { category: Category };
  Game: { category: Category; players: string[]; hintLimit?: HintLimit };
  Result: {
    winner: string | null;
    isDraw: boolean;
    eliminatedPlayers: string[];
    players: string[];
    turnRecords: TurnRecord[];
    gameStartTime: number;
    revealedHints: HintRecord[];
    activeGenerations: number[];
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Pokedex" component={PokedexScreen} />
      <Stack.Screen name="PlayerSetup" component={PlayerSetupScreen} />
      <Stack.Screen name="Game" component={GameScreen} />
      <Stack.Screen
        name="Result"
        component={ResultScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
