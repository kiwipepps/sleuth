import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, View, ActivityIndicator, StatusBar } from 'react-native';
import { supabase } from './supabase';

// Screens
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import HomeScreen from './screens/HomeScreen';
import Lobby from './screens/Lobby';
import PlayScreen from './screens/PlayScreen';
import LocalRevealScreen from './screens/LocalRevealScreen';

// Modals
import GameSetupModal from './screens/GameSetupModal';

export default function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [currentScreen, setCurrentScreen] = useState('home');
  const [activeGameId, setActiveGameId] = useState(null);
  const [activeGameHostId, setActiveGameHostId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSetupVisible, setSetupVisible] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Listen for Game Start (For Online Games)
  useEffect(() => {
    if (!activeGameId || currentScreen !== 'lobby') return;

    const gameChannel = supabase.channel(`game-status-${activeGameId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${activeGameId}`
      }, (payload) => {
        if (payload.new.status === 'active') {
          setCurrentScreen('play');
        }
      })
      .subscribe();

    return () => supabase.removeChannel(gameChannel);
  }, [activeGameId, currentScreen]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;
  }

  if (!session) {
    return authMode === 'login' ? (
      <LoginScreen onSignUpLink={() => setAuthMode('signup')} />
    ) : (
      <SignUpScreen onLoginLink={() => setAuthMode('login')} />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {currentScreen === 'home' && (
        <HomeScreen
          activeGame={null} // You can add logic to fetch an existing live game here
          onCreatePress={() => setSetupVisible(true)}
        />
      )}

      {currentScreen === 'lobby' && (
        <Lobby
          gameId={activeGameId}
          isHost={session.user.id === activeGameHostId}
          onBack={() => setCurrentScreen('home')}
        />
      )}

      {currentScreen === 'local-reveal' && (
        <LocalRevealScreen
          gameId={activeGameId}
          onFinish={() => setCurrentScreen('play')}
        />
      )}

      {currentScreen === 'play' && (
        <PlayScreen
          gameId={activeGameId}
          userId={session.user.id}
        />
      )}

      <GameSetupModal
        visible={isSetupVisible}
        userId={session.user.id}
        onClose={() => setSetupVisible(false)}
        onCreated={(gameId, nextScreen, hostId) => {
          setActiveGameId(gameId);
          setActiveGameHostId(hostId);
          setSetupVisible(false);
          setCurrentScreen(nextScreen);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});