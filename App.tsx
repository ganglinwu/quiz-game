import { Suspense } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import RootNavigator from './src/navigation/RootNavigator';
import { AudioProvider } from './src/audio';
import { runMigrations } from './src/data/migrations';

async function onInit(db: SQLiteDatabase) {
  runMigrations(db);
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <SQLiteProvider
        databaseName="quiz.db"
        assetSource={{ assetId: require('./assets/quiz.db'), forceOverwrite: true }}
        onInit={onInit}
        useSuspense
      >
        <AudioProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </AudioProvider>
      </SQLiteProvider>
    </Suspense>
  );
}
