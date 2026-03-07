import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function LocalRevealScreen({ gameId, onFinish }) {
    const [participants, setParticipants] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevealed, setIsRevealed] = useState(false);
    const [missions, setMissions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true); // Ensure loading is true at start
        try {
            // 1. Get all participants
            const { data: pData, error: pError } = await supabase
                .from('game_participants')
                .select('id, manual_name')
                .eq('game_id', gameId);

            if (pError) throw pError;

            // 2. Get missions
            const { data: mData, error: mError } = await supabase
                .from('user_missions')
                .select('id, participant_id, mission_library(task_description)')
                .eq('game_id', gameId);

            if (mError) throw mError;

            setParticipants(pData || []);
            setMissions(mData || []);
        } catch (error) {
            console.error("Error fetching missions:", error.message);
        } finally {
            setLoading(false);
        }
    }

    const currentPlayer = participants[currentIndex];
    const playerMissions = missions.filter(m => m.participant_id === currentPlayer?.id);

    const handleNext = () => {
        if (currentIndex < participants.length - 1) {
            setIsRevealed(false);
            setCurrentIndex(currentIndex + 1);
        } else {
            onFinish(); // All players have seen their missions, start the game!
        }
    };

    if (loading || !currentPlayer) return null;

    return (
        <SafeAreaView style={styles.container}>
            {!isRevealed ? (
                // STATE 1: PASS THE PHONE
                <View style={styles.center}>
                    <Ionicons name="hand-right-outline" size={80} color="#000" />
                    <Text style={styles.instruction}>Pass phone to</Text>
                    <Text style={styles.playerName}>{currentPlayer.manual_name}</Text>

                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => setIsRevealed(true)}
                    >
                        <Text style={styles.btnText}>I am {currentPlayer.manual_name}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                // STATE 2: REVEAL INTEL
                <View style={styles.intelContainer}>
                    <Text style={styles.intelHeader}>Top Secret Orders</Text>
                    <Text style={styles.intelSub}>Memorize these, Agent {currentPlayer.manual_name}.</Text>

                    {playerMissions.map((m, i) => (
                        <View key={m.id} style={styles.missionCard}>
                            <Text style={styles.missionNumber}>MISSION 0{i + 1}</Text>
                            <Text style={styles.missionText}>{m.mission_library.task_description}</Text>
                        </View>
                    ))}

                    <TouchableOpacity style={styles.doneBtn} onPress={handleNext}>
                        <Text style={styles.btnText}>
                            {currentIndex < participants.length - 1 ? "Next Agent" : "Start Operation"}
                        </Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    instruction: { fontSize: 18, color: '#666', marginBottom: 10 },
    playerName: { fontSize: 48, fontWeight: '900', textAlign: 'center', marginBottom: 50 },
    actionBtn: { backgroundColor: '#000', paddingVertical: 20, paddingHorizontal: 40, borderRadius: 100 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },

    intelContainer: { flex: 1, padding: 30, justifyContent: 'center' },
    intelHeader: { fontSize: 32, fontWeight: '900', marginBottom: 5 },
    intelSub: { fontSize: 16, color: '#666', marginBottom: 40 },
    missionCard: { backgroundColor: '#f9f9f9', padding: 25, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: '#eee' },
    missionNumber: { fontSize: 10, fontWeight: '900', color: '#aaa', marginBottom: 5 },
    missionText: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
    doneBtn: { backgroundColor: '#000', padding: 22, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 20 }
});