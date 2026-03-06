import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { supabase } from './supabase';

// Import custom screens
import HostGame from './screens/HostGame';
import Lobby from './screens/Lobby';
import Scanner from './components/Scanner';

export default function App() {
  const [session, setSession] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('menu'); // menu, host, join, lobby
  const [activeGameId, setActiveGameId] = useState(null);

  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Monitor Auth Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Auth Handlers
  async function handleLogin() {
    if (!email || !password) return Alert.alert("Error", "Please fill in all fields");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert("Login Failed", error.message);
    setLoading(false);
  }

  async function handleSignUp() {
    if (!email || !password) return Alert.alert("Error", "Please fill in all fields");
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      Alert.alert("Sign Up Error", error.message);
    } else {
      Alert.alert("Success", "Account created! You can now sign in.");
    }
    setLoading(false);
  }

  // 3. Player Joining Logic
  const joinGame = async (gameId) => {
    setLoading(true);
    // Attempt to add the player to the participants table
    const { error } = await supabase
      .from('game_participants')
      .insert([{
        game_id: gameId,
        user_id: session.user.id
      }]);

    if (error) {
      // code 23505 means the player is already in this game's lobby
      if (error.code !== '23505') {
        Alert.alert("Error Joining", error.message);
        setLoading(false);
        return;
      }
    }

    setActiveGameId(gameId);
    setCurrentScreen('lobby');
    setLoading(false);
  };

  // --- RENDER LOGIC ---

  // Auth Screen (Sign In / Sign Up)
  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>sleuth.</Text>
          <TextInput
            placeholder="Email"
            style={styles.input}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
          <TextInput
            placeholder="Password"
            style={styles.input}
            secureTextEntry
            onChangeText={setPassword}
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

  // Authenticated Screen Flow
  return (
    <SafeAreaView style={styles.container}>
      {currentScreen === 'menu' && (
        <View style={styles.inner}>
          <Text style={styles.logo}>sleuth.</Text>

          <TouchableOpacity style={styles.button} onPress={() => setCurrentScreen('host')}>
            <Text style={styles.buttonText}>Host a Game</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#444', marginTop: 15 }]}
            onPress={() => setCurrentScreen('join')}
          >
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
  logo: { fontSize: 56, fontWeight: 'bold', marginBottom: 50, letterSpacing: -3 },
  input: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#eee',
    padding: 18,
    borderRadius: 15,
    marginBottom: 15,
    fontSize: 16
  },
  button: {
    backgroundColor: '#000',
    padding: 20,
    borderRadius: 15,
    width: '100%',
    alignItems: 'center'
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  link: { fontSize: 16, fontWeight: '600', color: '#007AFF' }
});