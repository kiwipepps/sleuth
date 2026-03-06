import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { supabase } from '../supabase';

export default function PlayScreen({ gameId, userId }) {
    const [missions, setMissions] = useState([]);

    useEffect(() => {
        fetchMyMissions();
    }, []);

    async function fetchMyMissions() {
        const { data } = await supabase
            .from('user_missions')
            .select('id, is_completed, mission_library(task_description)')
            .eq('game_id', gameId)
            .eq('user_id', userId);

        if (data) setMissions(data);
    }

    async function toggleComplete(id, currentState) {
        await supabase.from('user_missions').update({ is_completed: !currentState }).eq('id', id);
        fetchMyMissions(); // Refresh the list
    }

    return (
        <View style={styles.container}>
            <Text style={styles.header}>My Challenges</Text>
            <FlatList
                data={missions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[styles.card, item.is_completed && styles.completedCard]}
                        onPress={() => toggleComplete(item.id, item.is_completed)}
                    >
                        <Text style={[styles.taskText, item.is_completed && styles.completedText]}>
                            {item.mission_library.task_description}
                        </Text>
                        {item.is_completed && <Text style={styles.check}>✓ Done</Text>}
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    header: { fontSize: 28, fontWeight: 'bold', marginTop: 40, marginBottom: 20 },
    card: { padding: 20, backgroundColor: '#f9f9f9', borderRadius: 15, marginBottom: 15, borderLeftWidth: 5, borderLeftColor: '#000' },
    completedCard: { backgroundColor: '#e8f5e9', borderLeftColor: '#4caf50' },
    taskText: { fontSize: 16, lineHeight: 22 },
    completedText: { textDecorationLine: 'line-through', color: '#888' },
    check: { marginTop: 10, fontWeight: 'bold', color: '#4caf50' }
});