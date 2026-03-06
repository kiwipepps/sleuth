import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { supabase } from '../supabase';

export default function GameView({ gameId, userId }) {
    const [missions, setMissions] = useState([]);

    useEffect(() => {
        const fetchMissions = async () => {
            const { data } = await supabase
                .from('user_missions')
                .select('id, is_completed, mission_library(task_text)')
                .eq('game_id', gameId)
                .eq('user_id', userId);
            if (data) setMissions(data);
        };
        fetchMissions();
    }, []);

    async function completeMission(id) {
        await supabase.from('user_missions').update({ is_completed: true }).eq('id', id);
        setMissions(prev => prev.map(m => m.id === id ? { ...m, is_completed: true } : m));
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Your Missions</Text>
            <FlatList
                data={missions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <View style={[styles.card, item.is_completed && { backgroundColor: '#e6fffa' }]}>
                        <Text style={styles.text}>{item.mission_library.task_text}</Text>
                        {!item.is_completed && (
                            <TouchableOpacity style={styles.btn} onPress={() => completeMission(item.id)}>
                                <Text style={{ color: '#fff' }}>I'm Done</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    title: { fontSize: 24, fontWeight: 'bold', marginTop: 40, marginBottom: 20 },
    card: { padding: 20, backgroundColor: '#f9f9f9', borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#eee' },
    text: { fontSize: 16, marginBottom: 10 },
    btn: { backgroundColor: '#000', padding: 10, borderRadius: 8, alignItems: 'center' }
});