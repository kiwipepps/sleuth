import React, { useState, useEffect } from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function SignUpScreen({ onLoginLink }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [isUsernameAvailable, setIsUsernameAvailable] = useState(null); 
    const [checkingUsername, setCheckingUsername] = useState(false);

    // --- USERNAME AVAILABILITY CHECK ---
    useEffect(() => {
        const timer = setTimeout(() => {
            if (username.length >= 3) {
                checkUsername(username);
            } else {
                setIsUsernameAvailable(null);
            }
        }, 500); 

        return () => clearTimeout(timer);
    }, [username]);

    const checkUsername = async (name) => {
        setCheckingUsername(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', name.toLowerCase().trim())
            .maybeSingle(); 

        if (!error) {
            setIsUsernameAvailable(data ? false : true);
        }
        setCheckingUsername(false);
    };

    async function handleSignUp() {
        if (!firstName || !lastName || !username || !email || !password || !confirmPassword) {
            return Alert.alert("Error", "All fields are required to register an agent.");
        }

        if (isUsernameAvailable === false) {
            return Alert.alert("Error", "This Agent Handle is already taken.");
        }

        if (password !== confirmPassword) {
            return Alert.alert("Error", "Passwords do not match.");
        }

        if (password.length < 6) {
            return Alert.alert("Error", "Security protocol requires at least 6 characters.");
        }

        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { 
                        username: username.toLowerCase().trim(),
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                    }
                }
            });

            if (error) {
                if (error.message.includes('unique_username')) {
                    throw new Error("Handle taken. Please choose another.");
                }
                throw error;
            }

            Alert.alert("Success", "Intelligence account created! Please verify your email.");
            onLoginLink(); 
        } catch (error) {
            Alert.alert("Sign Up Error", error.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
                <Text style={styles.logo}>sleuth.</Text>
                <Text style={styles.subtitle}>Create your agent profile.</Text>

                <View style={styles.nameRow}>
                    <TextInput
                        placeholder="First Name"
                        style={[styles.input, styles.halfInput]}
                        onChangeText={setFirstName}
                        value={firstName}
                    />
                    <TextInput
                        placeholder="Last Name"
                        style={[styles.input, styles.halfInput]}
                        onChangeText={setLastName}
                        value={lastName}
                    />
                </View>

                <View style={styles.inputWrapper}>
                    <TextInput
                        placeholder="Agent Handle (Username)"
                        style={[styles.input, 
                            isUsernameAvailable === false && {borderColor: '#ff3b30'},
                            isUsernameAvailable === true && {borderColor: '#4CAF50'}
                        ]}
                        onChangeText={setUsername}
                        value={username}
                        autoCapitalize="none"
                    />
                    <View style={styles.statusIcon}>
                        {checkingUsername ? <ActivityIndicator size="small" /> : (
                            isUsernameAvailable === true && <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                        )}
                        {isUsernameAvailable === false && <Ionicons name="close-circle" size={24} color="#ff3b30" />}
                    </View>
                </View>

                <TextInput
                    placeholder="Email Address"
                    style={styles.input}
                    onChangeText={setEmail}
                    value={email}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TextInput
                    placeholder="Secret Password"
                    style={styles.input}
                    secureTextEntry
                    onChangeText={setPassword}
                    value={password}
                />

                <View style={styles.inputWrapper}>
                    <TextInput
                        placeholder="Confirm Secret Password"
                        style={[styles.input, 
                            confirmPassword.length > 0 && password !== confirmPassword && {borderColor: '#ff3b30'},
                            confirmPassword.length > 0 && password === confirmPassword && {borderColor: '#4CAF50'}
                        ]}
                        secureTextEntry
                        onChangeText={setConfirmPassword}
                        value={confirmPassword}
                    />
                    <View style={styles.statusIcon}>
                        {confirmPassword.length > 0 && (
                            password === confirmPassword 
                            ? <Ionicons name="shield-checkmark" size={24} color="#4CAF50" />
                            : <Ionicons name="alert-circle" size={24} color="#ff3b30" />
                        )}
                    </View>
                </View>

                <TouchableOpacity style={styles.button} onPress={handleSignUp} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register Agent</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={onLoginLink} style={styles.linkContainer}>
                    <Text style={styles.linkText}>Already an agent? <Text style={styles.linkBold}>Sign In</Text></Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    scrollInner: { justifyContent: 'center', alignItems: 'center', padding: 30, paddingTop: 60 },
    logo: { fontSize: 64, fontWeight: '900', marginBottom: 10, letterSpacing: -4 },
    subtitle: { fontSize: 18, color: '#666', marginBottom: 40, fontWeight: '500' },
    nameRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    halfInput: { width: '48%' },
    inputWrapper: { width: '100%', position: 'relative' },
    input: {
        width: '100%', borderWidth: 2, borderColor: '#f0f0f0', backgroundColor: '#f9f9f9',
        padding: 20, borderRadius: 16, marginBottom: 15, fontSize: 16
    },
    statusIcon: { position: 'absolute', right: 15, top: 20 },
    button: { backgroundColor: '#000', padding: 22, borderRadius: 18, width: '100%', alignItems: 'center', marginTop: 10 },
    buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    linkContainer: { marginTop: 25 },
    linkText: { fontSize: 16, color: '#666' },
    linkBold: { color: '#007AFF', fontWeight: 'bold' }
});