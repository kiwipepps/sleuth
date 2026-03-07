import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, SafeAreaView, ActivityIndicator, Alert, ScrollView, Platform, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function PlayScreen({ gameId, onBack, userId }) {
    const [loading, setLoading] = useState(true);
    const [gameData, setGameData] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [activeParticipant, setActiveParticipant] = useState(null);
    const [missions, setMissions] = useState([]);
    const [isBriefingMode, setIsBriefingMode] = useState(true);
    const [timeLeft, setTimeLeft] = useState('');

    // --- NEW: GLOBAL STATS STATE ---
    const [globalStats, setGlobalStats] = useState({ total: 0, completed: 0 });

    useEffect(() => {
        fetchInitialData();
    }, [gameId]);

    useEffect(() => {
        if (!gameData?.end_time) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const end = new Date(gameData.end_time).getTime();
            const distance = end - now;

            if (distance < 0) {
                setTimeLeft("EXPIRED");
                clearInterval(interval);
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            let timeString = '';
            if (days > 0) timeString += `${days}d `;
            timeString += `${hours}h ${minutes}m ${seconds}s`;
            setTimeLeft(timeString);
        }, 1000);

        return () => clearInterval(interval);
    }, [gameData]);

    async function fetchInitialData() {
        try {
            const { data: game, error: gErr } = await supabase
                .from('games')
                .select('*')
                .eq('id', gameId)
                .single();
            if (gErr) throw gErr;

            const { data: parts, error: pErr } = await supabase
                .from('game_participants')
                .select('*')
                .eq('game_id', gameId);
            if (pErr) throw pErr;

            setGameData(game);
            setParticipants(parts);

            // Fetch global stats for the dashboard
            await fetchGlobalStats();

            if (game.is_local) {
                setIsBriefingMode(true);
                setActiveParticipant(null);
            } else {
                const me = parts.find(p => p.user_id === userId);
                setActiveParticipant(me);
                setIsBriefingMode(false);
                if (me) fetchMissions(me.id);
            }
        } catch (error) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    }

    async function fetchGlobalStats() {
        const { data, error } = await supabase
            .from('user_missions')
            .select('completed')
            .eq('game_id', gameId);

        if (!error && data) {
            const completedCount = data.filter(m => m.completed).length;
            setGlobalStats({ total: data.length, completed: completedCount });
        }
    }

    async function fetchMissions(participantId) {
        const { data, error } = await supabase
            .from('user_missions')
            .select('id, mission_library(task_description), completed')
            .eq('participant_id', participantId);

        if (!error) setMissions(data || []);
    }

    const toggleMissionCompletion = async (missionId, currentStatus) => {
        const newStatus = !currentStatus;
        setMissions(prevMissions =>
            prevMissions.map(m =>
                m.id === missionId ? { ...m, completed: newStatus } : m
            )
        );

        try {
            const { error } = await supabase
                .from('user_missions')
                .update({ completed: newStatus })
                .eq('id', missionId);
            if (error) throw error;

            // Refresh global stats after a change
            fetchGlobalStats();
        } catch (error) {
            setMissions(prevMissions =>
                prevMissions.map(m =>
                    m.id === missionId ? { ...m, completed: currentStatus } : m
                )
            );
            Alert.alert("Sync Error", "Could not update mission status.");
        }
    };

    const handleSwitchAgent = (agent) => {
        setMissions([]);
        setActiveParticipant(agent);
        setIsBriefingMode(true);
    };

    const handleConfirmHandover = () => {
        if (activeParticipant) {
            fetchMissions(activeParticipant.id);
            setIsBriefingMode(false);
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.timerBanner}>
                    <Ionicons name="time-outline" size={18} color="#fff" />
                    <Text style={styles.timerText}>TIME REMAINING: {timeLeft}</Text>
                </View>

                <View style={styles.header}>
                    <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
                        <Ionicons name="close" size={28} color="#000" />
                    </TouchableOpacity>
                    <View style={styles.headerInfo}>
                        <Text style={styles.gameTitle} numberOfLines={1}>{gameData?.game_name}</Text>
                        <View style={styles.statusRow}>
                            <View style={styles.pulse} />
                            <Text style={styles.statusText}>LIVE OPERATION</Text>
                        </View>
                    </View>
                    <View style={styles.iconBtn}>
                        <Ionicons name="information-circle-outline" size={24} color="#ccc" />
                    </View>
                </View>

                {gameData?.is_local && (
                    <View style={styles.agentBar}>
                        <Text style={styles.agentLabel}>Select Agent to Brief:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentScroll}>
                            {participants.map((p) => (
                                <TouchableOpacity
                                    key={p.id}
                                    onPress={() => handleSwitchAgent(p)}
                                    style={[styles.agentChip, activeParticipant?.id === p.id && styles.activeChip]}
                                >
                                    <Text style={[styles.agentChipText, activeParticipant?.id === p.id && styles.activeChipText]}>
                                        {p.manual_name || 'Agent'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                <View style={styles.content}>
                    {!activeParticipant ? (
                        /* NEW: GLOBAL INTELLIGENCE DASHBOARD */
                        <View style={styles.dashboardContainer}>
                            <Text style={styles.dashboardTitle}>Global Intelligence</Text>

                            <View style={styles.statsGrid}>
                                <View style={styles.statCard}>
                                    <Text style={styles.statNumber}>{globalStats.completed}</Text>
                                    <Text style={styles.statLabel}>Passed</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statNumber}>{globalStats.total - globalStats.completed}</Text>
                                    <Text style={styles.statLabel}>Remaining</Text>
                                </View>
                            </View>

                            <View style={styles.chartPlaceholder}>
                                <Ionicons name="pie-chart" size={100} color="#000" />
                                <Text style={styles.chartText}>
                                    Operation Progress: {globalStats.total > 0 ? Math.round((globalStats.completed / globalStats.total) * 100) : 0}%
                                </Text>
                            </View>

                            <Text style={styles.dashboardInstruction}>
                                Tap an Agent profile above to reveal classified individual orders.
                            </Text>
                        </View>
                    ) : isBriefingMode ? (
                        <View style={styles.briefingContainer}>
                            <Ionicons name="hand-right-outline" size={80} color="#000" />
                            <Text style={styles.briefingTitle}>Pass the Phone</Text>
                            <Text style={styles.briefingSub}>Hand the device to <Text style={styles.boldAgent}>{activeParticipant.manual_name}</Text>.</Text>
                            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmHandover}>
                                <Text style={styles.confirmBtnText}>I am {activeParticipant.manual_name}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Your Objectives</Text>
                                <Text style={styles.agentIdentity}>Agent: {activeParticipant.manual_name}</Text>
                            </View>

                            <FlatList
                                data={missions}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={styles.listPadding}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.missionCard}
                                        onPress={() => toggleMissionCompletion(item.id, item.completed)}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons
                                            name={item.completed ? "checkmark-circle" : "ellipse-outline"}
                                            size={26}
                                            color={item.completed ? "#4CAF50" : "#000"}
                                        />
                                        <Text style={[styles.missionText, item.completed && styles.completedText]}>
                                            {item.mission_library?.task_description}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </>
                    )}
                </View>

                {!isBriefingMode && activeParticipant && (
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.callOutBtn}
                            onPress={() => Alert.alert("Sleuth Identified?", "Who are you accusing?")}
                        >
                            <Ionicons name="warning-outline" size={22} color="#fff" />
                            <Text style={styles.callOutText}>CALL OUT</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    safeArea: { flex: 1 },
    timerBanner: { backgroundColor: '#000', paddingVertical: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    timerText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 15, paddingTop: Platform.OS === 'android' ? 10 : 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    iconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerInfo: { flex: 1, alignItems: 'center' },
    gameTitle: { fontSize: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    pulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff3b30', marginRight: 6 },
    statusText: { fontSize: 10, fontWeight: '700', color: '#ff3b30' },
    agentBar: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fafafa' },
    agentLabel: { fontSize: 10, fontWeight: '800', color: '#aaa', paddingHorizontal: 20, marginBottom: 10, textTransform: 'uppercase' },
    agentScroll: { paddingHorizontal: 20 },
    agentChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#eee', marginRight: 8 },
    activeChip: { backgroundColor: '#000' },
    agentChipText: { fontSize: 14, fontWeight: '700', color: '#666' },
    activeChipText: { color: '#fff' },
    content: { flex: 1 },

    // --- DASHBOARD STYLES ---
    dashboardContainer: { flex: 1, padding: 25, alignItems: 'center', justifyContent: 'center' },
    dashboardTitle: { fontSize: 24, fontWeight: '900', marginBottom: 30, letterSpacing: -1 },
    statsGrid: { flexDirection: 'row', gap: 15, marginBottom: 40 },
    statCard: { flex: 1, backgroundColor: '#f9f9f9', padding: 20, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
    statNumber: { fontSize: 32, fontWeight: '900', color: '#000' },
    statLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', marginTop: 5 },
    chartPlaceholder: { alignItems: 'center', marginBottom: 40 },
    chartText: { marginTop: 15, fontWeight: '800', fontSize: 16, color: '#333' },
    dashboardInstruction: { color: '#bbb', textAlign: 'center', fontSize: 14, paddingHorizontal: 40, lineHeight: 20 },

    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyText: { color: '#ccc', textAlign: 'center', marginTop: 20, fontSize: 16, fontWeight: '600' },
    briefingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    briefingTitle: { fontSize: 28, fontWeight: '900', marginTop: 25 },
    briefingSub: { fontSize: 18, color: '#666', textAlign: 'center', marginTop: 10, marginBottom: 40 },
    boldAgent: { fontWeight: '900', color: '#000' },
    confirmBtn: { backgroundColor: '#000', paddingVertical: 18, paddingHorizontal: 35, borderRadius: 100 },
    confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    sectionHeader: { padding: 25, paddingBottom: 10 },
    sectionTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
    agentIdentity: { fontSize: 14, color: '#888', fontWeight: '600', marginTop: 4 },
    listPadding: { padding: 20, paddingTop: 10 },
    missionCard: { flexDirection: 'row', padding: 22, backgroundColor: '#fff', borderRadius: 20, marginBottom: 15, borderWidth: 1.5, borderColor: '#f0f0f0', alignItems: 'center', gap: 15 },
    missionText: { fontSize: 16, fontWeight: '600', flex: 1, color: '#000', lineHeight: 22 },
    completedText: { textDecorationLine: 'line-through', color: '#bbb' },
    footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 0 : 20 },
    callOutBtn: { backgroundColor: '#ff3b30', padding: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
    callOutText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});