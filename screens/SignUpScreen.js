import React, { useState } from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../supabase';

export default function SignUpScreen({ onLoginLink }) {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSignUp() {
        if (!email || !password || !username) return Alert.alert("Error", "All fields are required.");

        setLoading(true);
        // 1. Create the Auth User
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username: username } // Stores username in metadata
            }
        });

        if (error) {
            Alert.alert("Sign Up Error", error.message);
        } else {
            Alert.alert("Success", "Account created! Verify your email or sign in.");
            onLoginLink(); // Send them back to login
        }
        setLoading(false);
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <View style={styles.inner}>
                <Text style={styles.logo}>sleuth.</Text>
                <Text style={styles.subtitle}>Join the network.</Text>

                <TextInput
                    placeholder="Agent Username (e.g. 007)"
                    style={styles.input}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                />
                <TextInput
                    placeholder="Email Address"
                    style={styles.input}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    placeholder="Secret Password"
                    style={styles.input}
                    secureTextEntry
                    onChangeText={setPassword}
                />

                <TouchableOpacity style={styles.button} onPress={handleSignUp} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register Agent</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={onLoginLink} style={styles.linkContainer}>
                    <Text style={styles.linkText}>Already an agent? <Text style={styles.linkBold}>Sign In</Text></Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    inner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    logo: { fontSize: 64, fontWeight: '900', marginBottom: 10, letterSpacing: -4 },
    subtitle: { fontSize: 18, color: '#666', marginBottom: 40, fontWeight: '500' },
    input: {
        width: '100%', borderWidth: 2, borderColor: '#f0f0f0', backgroundColor: '#f9f9f9',
        padding: 20, borderRadius: 16, marginBottom: 15, fontSize: 16
    },
    button: { backgroundColor: '#000', padding: 22, borderRadius: 18, width: '100%', alignItems: 'center', marginTop: 10 },
    buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    linkContainer: { marginTop: 25 },
    linkText: { fontSize: 16, color: '#666' },
    linkBold: { color: '#007AFF', fontWeight: 'bold' }
});