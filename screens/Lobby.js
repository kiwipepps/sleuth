import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../supabase';

export default function Lobby({ gameId, onBack, onGameStart }) {
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        fetchPlayers();

        // Listen for players joining
        const lobbyChannel = supabase.channel(`lobby-${gameId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_participants', filter: `game_id=eq.${gameId}` }, fetchPlayers)
            .subscribe();

        // Listen for Host starting the game
        const gameChannel = supabase.channel(`game-status-${gameId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload) => {
                if (payload.new.status === 'active') onGameStart();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(lobbyChannel);
            supabase.removeChannel(gameChannel);
        };
    }, [gameId]);

    async function fetchPlayers() {
        const { data } = await supabase.from('game_participants').select('profiles(username)').eq('game_id', gameId);
        if (data) setPlayers(data.map(p => p.profiles.username));
    }

    async function handleStartGame() {
        const { data: participants } = await supabase.from('game_participants').select('user_id').eq('game_id', gameId);
        const { data: missions } = await supabase.from('mission_library').select('id'); // Simplified: select all available missions

        for (const player of participants) {
            const shuffled = [...missions].sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, 3).map(m => ({
                game_id: gameId,
                user_id: player.user_id,
                mission_id: m.id
            }));
            await supabase.from('user_missions').insert(selected);
        }

        await supabase.from('games').update({ status: 'active' }).eq('id', gameId);
    }

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Game Lobby</Text>
            <FlatList
                data={players}
                renderItem={({ item }) => <View style={styles.card}><Text>👤 {item}</Text></View>}
            />
            <TouchableOpacity style={styles.startBtn} onPress={handleStartGame}>
                <Text style={styles.startText}>Start Game</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onBack}><Text style={{ color: 'red', textAlign: 'center' }}>Cancel</Text></TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    header: { fontSize: 32, fontWeight: 'bold', marginTop: 40, marginBottom: 20 },
    card: { padding: 15, backgroundColor: '#f0f0f0', borderRadius: 10, marginBottom: 10 },
    startBtn: { backgroundColor: '#000', padding: 20, borderRadius: 12, marginBottom: 20 },
    startText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' }
});