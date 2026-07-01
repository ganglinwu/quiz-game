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
      <Stack.Screen
        name="Game"
        component={GameScreen}
        // Once a game is in progress there is no in-app "back" (GameScreen only
        // ever navigation.replace()s forward to Result). Disable the iOS edge-
        // swipe gesture so a stray swipe can't drop the player back to
        // PlayerSetup and silently discard the whole in-progress game — same
        // rationale as the Result screen below.
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="Result"
        component={ResultScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
