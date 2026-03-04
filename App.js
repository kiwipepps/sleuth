import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { supabase } from './supabase';

// Import your custom screens
import HostGame from './screens/HostGame';
import Lobby from './screens/Lobby';
import Scanner from './components/Scanner';

export default function App() {
  const [session, setSession] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('menu');
  const [activeGameId, setActiveGameId] = useState(null);

  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Listen for Auth Changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Robust Auth Handlers
  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });

    if (error) Alert.alert("Login Failed", error.message);
    else setSession(data.session);
    setLoading(false);
  }

  async function handleSignUp() {
    if (!email || !password) {
      Alert.alert("Error", "Please provide email and password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password
    });

    if (error) Alert.alert("Sign Up Error", error.message);
    else Alert.alert("Success", "Account created! You can now sign in.");
    setLoading(false);
  }

  // 3. Joining Logic
  const joinGame = async (gameId) => {
    const { error } = await supabase
      .from('game_participants')
      .insert([{ game_id: gameId, user_id: session.user.id }]);

    if (error && error.code !== '23505') {
      Alert.alert("Join Error", error.message);
    } else {
      setActiveGameId(gameId);
      setCurrentScreen('lobby');
    }
  };

  // --- RENDERING ---

  // Auth Screen (Gatekeeper)
  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>sleuth.</Text>
          <TextInput
            placeholder="Email"
            style={styles.input}
            onChangeText={(text) => setEmail(text)}
            value={email}
            autoCapitalize="none"
          />
          <TextInput
            placeholder="Password"
            style={styles.input}
            secureTextEntry
            onChangeText={(text) => setPassword(text)}
            value={password}
          />
          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSignUp} style={{ marginTop: 20 }}>
            <Text style={styles.link}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Main Game Menu
  return (
    <SafeAreaView style={styles.container}>
      {currentScreen === 'menu' && (
        <View style={styles.inner}>
          <Text style={styles.logo}>sleuth.</Text>
          <TouchableOpacity style={styles.button} onPress={() => setCurrentScreen('host')}>
            <Text style={styles.buttonText}>Host a Game</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setCurrentScreen('join')}>
            <Text style={styles.buttonText}>Join a Game</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 50 }} onPress={() => supabase.auth.signOut()}>
            <Text style={[styles.link, { color: 'red' }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {currentScreen === 'host' && (
        <HostGame
          userId={session.user.id}
          onBack={() => setCurrentScreen('menu')}
          onGameCreated={(id) => {
            setActiveGameId(id);
            setCurrentScreen('lobby');
          }}
        />
      )}

      {currentScreen === 'join' && (
        <Scanner
          onScan={(id) => joinGame(id)}
          onCancel={() => setCurrentScreen('menu')}
        />
      )}

      {currentScreen === 'lobby' && (
        <Lobby
          gameId={activeGameId}
          onBack={() => setCurrentScreen('menu')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  logo: { fontSize: 48, fontWeight: 'bold', marginBottom: 50, letterSpacing: -2 },
  input: { width: '100%', borderBottomWidth: 2, borderColor: '#000', padding: 15, fontSize: 18, marginBottom: 20 },
  button: { backgroundColor: '#000', padding: 18, borderRadius: 10, width: '100%', alignItems: 'center' },
  secondaryButton: { backgroundColor: '#444', marginTop: 15 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  link: { fontSize: 16, fontWeight: '600', color: 'blue' }
});