import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../supabase';

export default function Lobby({ gameId, onBack, isHost }) {
    const [players, setPlayers] = useState([]);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        fetchPlayers();

        // Listen for new agents scanning in
        const channel = supabase.channel(`lobby-${gameId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'game_participants',
                filter: `game_id=eq.${gameId}`
            }, () => fetchPlayers())
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [gameId]);

    async function fetchPlayers() {
        const { data } = await supabase
            .from('game_participants')
            .select('profiles(username)')
            .eq('game_id', gameId);

        if (data) setPlayers(data.map(p => p.profiles?.username || 'Unknown Agent'));
    }

    async function handleStartGame() {
        setStarting(true);
        try {
            const { data: participants } = await supabase.from('game_participants').select('user_id').eq('game_id', gameId);
            const { data: missions } = await supabase.from('mission_library').select('id');

            for (const player of participants) {
                const selected = [...missions].sort(() => 0.5 - Math.random()).slice(0, 3).map(m => ({
                    game_id: gameId,
                    user_id: player.user_id,
                    mission_id: m.id
                }));
                await supabase.from('user_missions').insert(selected);
            }

            // Update status triggers the screen switch for EVERYONE
            await supabase.from('games').update({ status: 'active' }).eq('id', gameId);
        } catch (e) {
            Alert.alert("Error", "Failed to start mission.");
        }
        setStarting(false);
    }

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Recruitment</Text>
            <FlatList
                data={players}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                    <View style={styles.card}><Text style={styles.playerText}>👤 {item}</Text></View>
                )}
                ListEmptyComponent={<Text style={styles.empty}>Waiting for agents...</Text>}
            />

            <View style={styles.footer}>
                {isHost ? (
                    <TouchableOpacity style={styles.startBtn} onPress={handleStartGame} disabled={starting}>
                        {starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.startText}>BEGIN MISSION</Text>}
                    </TouchableOpacity>
                ) : (
                    <View style={styles.waitingBox}>
                        <ActivityIndicator color="#000" />
                        <Text style={styles.waitingText}>Waiting for host to start...</Text>
                    </View>
                )}
                <TouchableOpacity onPress={onBack}><Text style={styles.cancel}>Abort</Text></TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 30, backgroundColor: '#fff' },
    header: { fontSize: 42, fontWeight: '900', marginTop: 50, letterSpacing: -2, marginBottom: 20 },
    card: { padding: 20, backgroundColor: '#f9f9f9', borderRadius: 15, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
    playerText: { fontSize: 18, fontWeight: '600' },
    startBtn: { backgroundColor: '#000', padding: 22, borderRadius: 18, marginBottom: 15 },
    startText: { color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 18 },
    waitingBox: { padding: 20, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 18, marginBottom: 15 },
    waitingText: { marginTop: 10, fontWeight: '600', color: '#666' },
    cancel: { color: 'red', textAlign: 'center', fontWeight: 'bold', marginTop: 10 },
    empty: { textAlign: 'center', marginTop: 50, color: '#999' }
});