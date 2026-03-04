import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '../supabase';

export default function Lobby({ gameId, onBack }) {
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        fetchPlayers();

        // REAL-TIME SUBSCRIPTION: Listen for people scanning in
        const channel = supabase
            .channel(`lobby-${gameId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'game_participants',
                filter: `game_id=eq.${gameId}`
            }, () => {
                fetchPlayers(); // Refresh list when a new row is detected
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [gameId]);

    async function fetchPlayers() {
        const { data, error } = await supabase
            .from('game_participants')
            .select('profiles(username)')
            .eq('game_id', gameId);

        if (data) setPlayers(data.map(p => p.profiles?.username || 'Guest'));
    }

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Game Lobby</Text>
            <Text style={styles.subHeader}>Game ID: {gameId.split('-')[0]}...</Text>

            <FlatList
                data={players}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                    <View style={styles.playerCard}>
                        <Text style={styles.playerName}>👤 {item}</Text>
                    </View>
                )}
            />

            <TouchableOpacity style={styles.backButton} onPress={onBack}>
                <Text style={styles.backText}>Exit Lobby</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    header: { fontSize: 32, fontWeight: 'bold', marginTop: 40 },
    subHeader: { fontSize: 14, color: '#666', marginBottom: 20 },
    playerCard: { padding: 15, backgroundColor: '#f0f0f0', borderRadius: 10, marginBottom: 10 },
    playerName: { fontSize: 18, fontWeight: '500' },
    backButton: { marginTop: 'auto', padding: 20, alignItems: 'center' },
    backText: { color: 'red', fontWeight: 'bold' }
});