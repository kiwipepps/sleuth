import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

// Use default export to match the HomeScreen import style
export default function ProfileScreen() {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            // Get current session user
            const { data: { user } } = await supabase.auth.getUser();
            
            if (user) {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('first_name, last_name, username, email, avatar_url')
                    .eq('id', user.id)
                    .single();

                if (error) throw error;
                setProfile(data);
            }
        } catch (error) {
            console.error("Profile fetch error:", error.message);
            Alert.alert("Error", "Could not load agent profile.");
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) Alert.alert("Error", "Logout failed.");
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;

    return (
        <View style={styles.container}>
            <View style={styles.profileHeader}>
                <View style={styles.avatarContainer}>
                    <Ionicons name="person-circle" size={100} color="#f0f0f0" />
                    <TouchableOpacity style={styles.editAvatar}>
                        <Ionicons name="camera" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
                <Text style={styles.fullName}>{profile?.first_name} {profile?.last_name}</Text>
                <Text style={styles.handle}>Agent @{profile?.username}</Text>
            </View>

            <View style={styles.infoSection}>
                <Text style={styles.sectionLabel}>Intelligence Credentials</Text>
                
                <View style={styles.infoRow}>
                    <Ionicons name="mail-outline" size={20} color="#666" />
                    <View style={styles.infoText}>
                        <Text style={styles.infoLabel}>Email Address</Text>
                        <Text style={styles.infoValue}>{profile?.email}</Text>
                    </View>
                </View>

                <View style={styles.infoRow}>
                    <Ionicons name="finger-print-outline" size={20} color="#666" />
                    <View style={styles.infoText}>
                        <Text style={styles.infoLabel}>Agent Handle</Text>
                        <Text style={styles.infoValue}>{profile?.username}</Text>
                    </View>
                </View>
            </View>

            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={20} color="#ff3b30" />
                <Text style={styles.signOutText}>Terminate Session</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff', padding: 25 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    profileHeader: { alignItems: 'center', marginVertical: 30 },
    avatarContainer: { position: 'relative', marginBottom: 15 },
    editAvatar: { 
        position: 'absolute', bottom: 5, right: 5, 
        backgroundColor: '#000', padding: 8, borderRadius: 20 
    },
    fullName: { fontSize: 24, fontWeight: '900', color: '#000' },
    handle: { fontSize: 16, color: '#aaa', fontWeight: '600', marginTop: 4 },
    infoSection: { marginTop: 20 },
    sectionLabel: { fontSize: 12, fontWeight: '800', color: '#ccc', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 20 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, gap: 15 },
    infoText: { flex: 1 },
    infoLabel: { fontSize: 12, color: '#aaa', fontWeight: '700' },
    infoValue: { fontSize: 16, color: '#000', fontWeight: '600', marginTop: 2 },
    signOutBtn: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', 
        gap: 10, marginTop: 'auto', padding: 20, borderRadius: 15, backgroundColor: '#fff0f0' 
    },
    signOutText: { color: '#ff3b30', fontWeight: '800', fontSize: 16 }
});