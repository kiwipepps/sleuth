import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen({ activeGame, onCreatePress }) {
    if (activeGame) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Current Intel</Text>
                    <Text style={styles.subtitle}>Operation in progress</Text>
                </View>

                {/* ACTIVE GAME CARD */}
                <TouchableOpacity style={styles.activeCard}>
                    <View style={styles.badge}><Text style={styles.badgeText}>LIVE</Text></View>
                    <Text style={styles.gameName}>{activeGame.game_name || "Untitled Operation"}</Text>
                    <Text style={styles.gameInfo}>📍 {activeGame.location_type || 'Local'}</Text>

                    <View style={styles.footer}>
                        <Text style={styles.actionLink}>Re-enter Game</Text>
                        <Ionicons name="chevron-forward" size={20} color="#000" />
                    </View>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.idleContainer}>
            <View style={styles.iconCircle}>
                <Ionicons name="finger-print" size={80} color="#000" />
            </View>

            <Text style={styles.idleTitle}>No Active Missions</Text>
            <Text style={styles.idleSub}>Start a new operation with your team.</Text>

            <TouchableOpacity style={styles.createBtn} onPress={onCreatePress}>
                <Text style={styles.createBtnText}>Create New Game</Text>
                <Ionicons name="add-circle" size={24} color="#fff" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 25 },
    header: { marginTop: 40, marginBottom: 30 },
    title: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
    subtitle: { fontSize: 16, color: '#666' },

    activeCard: {
        backgroundColor: '#FFD700', borderRadius: 24, padding: 25,
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
    },
    badge: { backgroundColor: '#000', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 15 },
    badgeText: { color: '#FFD700', fontWeight: '900', fontSize: 10 },
    gameName: { fontSize: 26, fontWeight: '800', marginBottom: 5 },
    gameInfo: { fontSize: 16, color: '#333', fontWeight: '500' },
    footer: { flexDirection: 'row', alignItems: 'center', marginTop: 30, justifyContent: 'space-between' },
    actionLink: { fontWeight: '700', fontSize: 18 },

    idleContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    iconCircle: { width: 160, height: 160, borderRadius: 80, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
    idleTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
    idleSub: { fontSize: 16, color: '#999', textAlign: 'center', marginTop: 10, marginBottom: 40 },
    createBtn: { backgroundColor: '#000', paddingVertical: 18, paddingHorizontal: 30, borderRadius: 100, flexDirection: 'row', gap: 10, alignItems: 'center' },
    createBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});