import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function LocalRevealScreen({ gameId, onFinish }) {
    const insets = useSafeAreaInsets(); // Precise notch handling
    const [participants, setParticipants] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevealed, setIsRevealed] = useState(false);
    const [missions, setMissions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        try {
            const { data: pData, error: pError } = await supabase
                .from('game_participants')
                .select('id, manual_name')
                .eq('game_id', gameId);

            if (pError) throw pError;

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

    const handleNext = async () => {
        if (currentIndex < participants.length - 1) {
            setIsRevealed(false);
            setCurrentIndex(currentIndex + 1);
        } else {
            setLoading(true);
            try {
                const { error } = await supabase
                    .from('games')
                    .update({ status: 'active' })
                    .eq('id', gameId);
                
                if (error) throw error;
                onFinish(); 
            } catch (err) {
                setLoading(false);
                alert("Failed to start operation.");
            }
        }
    };

    if (loading || !currentPlayer) return (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#000" />
        </View>
    );

    return (
        // Applying precise padding for the notch and home indicator
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            {!isRevealed ? (
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
                // FIX: Changed View to ScrollView to handle large numbers of missions
                <ScrollView 
                    contentContainerStyle={styles.intelScrollContainer}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.intelHeader}>Top Secret Orders</Text>
                    <Text style={styles.intelSub}>Memorize these, Agent {currentPlayer.manual_name}.</Text>

                    {playerMissions.map((m, i) => (
                        <View key={m.id} style={styles.missionCard}>
                            <Text style={styles.missionNumber}>MISSION 0{i + 1}</Text>
                            <Text style={styles.missionText}>{m.mission_library?.task_description}</Text>
                        </View>
                    ))}
                    
                    <TouchableOpacity style={styles.doneBtn} onPress={handleNext}>
                        <Text style={styles.btnText}>
                            {currentIndex < participants.length - 1 ? "Next Agent" : "Start Operation"}
                        </Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </TouchableOpacity>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    instruction: { fontSize: 18, color: '#666', marginBottom: 10 },
    playerName: { fontSize: 48, fontWeight: '900', textAlign: 'center', marginBottom: 50 },
    actionBtn: { backgroundColor: '#000', paddingVertical: 20, paddingHorizontal: 40, borderRadius: 100 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
    
    // FIX: Use flexGrow instead of flex. Centers when few items, scrolls when many.
    intelScrollContainer: { flexGrow: 1, padding: 30, justifyContent: 'center' }, 
    
    intelHeader: { fontSize: 36, fontWeight: '900', marginBottom: 5, letterSpacing: -1, color: '#000' },
    intelSub: { fontSize: 16, color: '#666', marginBottom: 30, fontWeight: '600' },
    missionCard: { backgroundColor: '#f9f9f9', padding: 25, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: '#eee' },
    missionNumber: { fontSize: 10, fontWeight: '900', color: '#aaa', marginBottom: 5, letterSpacing: 1 },
    missionText: { fontSize: 18, fontWeight: '600', lineHeight: 24, color: '#111' },
    doneBtn: { backgroundColor: '#000', padding: 22, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 20 }
});