import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { supabase } from './supabase';

import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import GameSetupModal from './modals/GameSetupModal'; // New Modal

export default function App() {
  const [session, setSession] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSetupVisible, setSetupVisible] = useState(false);

  useEffect(() => {
    // 1. Listen for Auth Changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkActiveGame(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkActiveGame(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Check if this user is already in a live game
  async function checkActiveGame(userId) {
    const { data } = await supabase
      .from('game_participants')
      .select('games(*)')
      .eq('user_id', userId)
      .eq('games.status', 'active')
      .single();

    if (data) setActiveGame(data.games);
    setLoading(false);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  if (!session) return <LoginScreen />;

  return (
    <SafeAreaView style={styles.container}>
      <HomeScreen
        activeGame={activeGame}
        onCreatePress={() => setSetupVisible(true)}
      />

      <GameSetupModal
        visible={isSetupVisible}
        onClose={() => setSetupVisible(false)}
        onCreated={(newGame) => {
          setActiveGame(newGame);
          setSetupVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});