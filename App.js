import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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

  // 1. Handle Authentication State
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

  // 2. Real-time Listener for Online Game Starts
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

  // 3. Navigation Handlers
  const handleJoinGame = (gameId, screen, hostId = null) => {
    setActiveGameId(gameId);
    if (hostId) setActiveGameHostId(hostId);
    setCurrentScreen(screen);
  };

  const handleCreateSuccess = (gameId, nextScreen, hostId) => {
    setActiveGameId(gameId);
    setActiveGameHostId(hostId);
    setSetupVisible(false);
    setCurrentScreen(nextScreen);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  // Auth Guard
  if (!session) {
    return authMode === 'login' ? (
      <LoginScreen onSignUpLink={() => setAuthMode('signup')} />
    ) : (
      <SignUpScreen onLoginLink={() => setAuthMode('login')} />
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['right', 'left']}>
        <StatusBar barStyle="dark-content" />

        {/* Home Feed: Shows your ongoing games */}
        {currentScreen === 'home' && (
          <HomeScreen
            onCreatePress={() => setSetupVisible(true)}
            onJoinGame={handleJoinGame}
          />
        )}

        {/* Lobby: Wait for online players */}
        {currentScreen === 'lobby' && (
          <Lobby
            gameId={activeGameId}
            isHost={session.user.id === activeGameHostId}
            onBack={() => setCurrentScreen('home')}
          />
        )}

        {/* Local Reveal: Pass the phone to see missions */}
        {currentScreen === 'local-reveal' && (
          <LocalRevealScreen
            gameId={activeGameId}
            onFinish={() => setCurrentScreen('play')}
          />
        )}

        {/* Play: The Active Dashboard */}
        {currentScreen === 'play' && (
          <PlayScreen
            gameId={activeGameId}
            userId={session.user.id}
            onBack={() => setCurrentScreen('home')}
          />
        )}

        {/* Creation Modal */}
        <GameSetupModal
          visible={isSetupVisible}
          userId={session.user.id}
          onClose={() => setSetupVisible(false)}
          onCreated={handleCreateSuccess}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});