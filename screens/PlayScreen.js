import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
    FlatList, ActivityIndicator, Alert, ScrollView, Platform, StatusBar, Dimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-chart-kit';
import { supabase } from '../supabase';

const screenWidth = Dimensions.get("window").width;

export default function PlayScreen({ gameId, onBack, userId }) {
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [gameData, setGameData] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [activeParticipant, setActiveParticipant] = useState(null);
    const [missions, setMissions] = useState([]);
    const [isBriefingMode, setIsBriefingMode] = useState(true);
    const [timeLeft, setTimeLeft] = useState('');

    const [globalStats, setGlobalStats] = useState({ total: 0, completed: 0, failed: 0 });
    const [isCallOutVisible, setCallOutVisible] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [calloutDescription, setCalloutDescription] = useState('');
    const [userCalloutCount, setUserCalloutCount] = useState(0);
    const [pendingAccusation, setPendingAccusation] = useState(null);
    const [isSelectingFailure, setIsSelectingFailure] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, [gameId]);

    // --- TIMER & AUTO-COMPLETE LOGIC ---
    useEffect(() => {
        if (!gameData?.end_time || gameData?.status === 'completed') return;
        
        const interval = setInterval(() => {
            const now = new Date().getTime();
            const end = new Date(gameData.end_time).getTime();
            const distance = end - now;

            if (distance <= 0) {
                setTimeLeft("EXPIRED");
                handleForceComplete(); // Automatically sync DB
                clearInterval(interval);
                return;
            }
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        }, 1000);
        return () => clearInterval(interval);
    }, [gameData]);

    const handleForceComplete = async () => {
        await supabase.from('games').update({ status: 'completed' }).eq('id', gameId);
        setGameData(prev => ({ ...prev, status: 'completed' }));
    };

    const endMissionEarly = async () => {
        Alert.alert(
            "Abort Operation?",
            "This will end the mission for all agents and lock scoring.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "End Mission", 
                    style: "destructive", 
                    onPress: async () => {
                        const { error } = await supabase.from('games').update({ status: 'completed' }).eq('id', gameId);
                        if (!error) onBack(); 
                    } 
                }
            ]
        );
    };

    async function fetchInitialData() {
        try {
            const { data: game, error: gErr } = await supabase.from('games').select('*').eq('id', gameId).single();
            if (gErr) throw gErr;
            const { data: parts, error: pErr } = await supabase.from('game_participants').select('*').eq('game_id', gameId);
            if (pErr) throw pErr;

            setGameData(game);
            setParticipants(parts);
            await fetchGlobalStats();

            if (game.is_local) {
                setIsBriefingMode(true);
                setActiveParticipant(null);
            } else {
                const me = parts.find(p => p.user_id === userId);
                setActiveParticipant(me);
                setIsBriefingMode(false);
                if (me) {
                    fetchMissions(me.id);
                    fetchUserCalloutCount(me.id);
                }
            }
        } catch (error) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    }

    async function fetchGlobalStats() {
        const { data } = await supabase.from('user_missions').select('completed, status').eq('game_id', gameId);
        if (data) {
            const completedCount = data.filter(m => m.completed).length;
            const failedCount = data.filter(m => m.status === 'failed').length;
            setGlobalStats({ total: data.length, completed: completedCount, failed: failedCount });
        }
    }

    async function fetchMissions(participantId) {
        const { data } = await supabase.from('user_missions')
            .select('id, mission_library(task_description), completed, status')
            .eq('participant_id', participantId);
        if (data) setMissions(data);
    }

    async function fetchUserCalloutCount(participantId) {
        const { count, error } = await supabase
            .from('call_outs')
            .select('*', { count: 'exact', head: true })
            .eq('caller_id', participantId);
        if (!error) setUserCalloutCount(count || 0);
    }

    const toggleMissionCompletion = async (missionId, currentStatus, missionStatus) => {
        if (missionStatus === 'failed' || gameData?.status === 'completed') return;
        const newStatus = !currentStatus;
        setMissions(prev => prev.map(m => m.id === missionId ? { ...m, completed: newStatus } : m));
        try {
            await supabase.from('user_missions').update({ completed: newStatus }).eq('id', missionId);
            fetchGlobalStats();
        } catch (error) {
            Alert.alert("Sync Error", "Could not update status.");
        }
    };

    const handleCallOutSubmit = async () => {
        if (userCalloutCount >= gameData?.callout_limit) return Alert.alert("Limit Reached", "No reports remaining.");
        if (!selectedTarget || !calloutDescription) return Alert.alert("Required", "Select an agent and describe what happened.");

        try {
            const { error } = await supabase.from('call_outs').insert([{
                game_id: gameId,
                caller_id: activeParticipant.id,
                target_id: selectedTarget.id,
                description: calloutDescription,
                status: 'pending'
            }]);
            if (error) throw error;
            setUserCalloutCount(prev => prev + 1);
            setCallOutVisible(false);
            setSelectedTarget(null);
            setCalloutDescription('');
        } catch (err) { Alert.alert("Error", "Report failed."); }
    };

    const handleConfirmHandover = async () => {
        if (!activeParticipant) return;
        await fetchUserCalloutCount(activeParticipant.id);
        const { data: reports } = await supabase.from('call_outs')
            .select('*, game_participants!caller_id(manual_name)')
            .eq('target_id', activeParticipant.id)
            .eq('is_resolved', false).limit(1);

        if (reports && reports.length > 0) {
            setPendingAccusation(reports[0]);
        } else {
            fetchMissions(activeParticipant.id);
            setIsBriefingMode(false);
        }
    };

    const handleResolveAccusation = async (isCorrect) => {
        try {
            await supabase.from('call_outs').update({ is_resolved: true, status: isCorrect ? 'accepted' : 'incorrect' }).eq('id', pendingAccusation.id);
            if (isCorrect) {
                await fetchMissions(activeParticipant.id);
                setIsSelectingFailure(true);
            } else {
                setPendingAccusation(null); fetchMissions(activeParticipant.id); setIsBriefingMode(false);
            }
        } catch (err) { Alert.alert("Error", "Update failed."); }
    };

    const handleMarkMissionFailed = async (missionId) => {
        try {
            await supabase.from('user_missions').update({ status: 'failed', completed: false }).eq('id', missionId);
            setIsSelectingFailure(false); setPendingAccusation(null); fetchMissions(activeParticipant.id); setIsBriefingMode(false);
            fetchGlobalStats();
        } catch (err) { Alert.alert("Error", "Failed to update."); }
    };

    const handleSwitchAgent = (agent) => { 
        if (gameData?.status === 'completed') {
            setActiveParticipant(agent);
            setIsBriefingMode(false);
            fetchMissions(agent.id);
        } else {
            setMissions([]); setActiveParticipant(agent); setIsBriefingMode(true); 
        }
    };

    const chartData = [
        { name: "Passed", population: globalStats.completed, color: "#4CAF50", legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: "Active", population: Math.max(0, globalStats.total - globalStats.completed - globalStats.failed), color: "#2196F3", legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: "Failed", population: globalStats.failed, color: "#ff3b30", legendFontColor: "#7F7F7F", legendFontSize: 12 }
    ];

    const isHost = gameData?.host_id === userId;
    const calloutsRemaining = gameData ? Math.max(0, gameData.callout_limit - userCalloutCount) : 0;

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" />
            
            <View style={styles.timerBanner}>
                <Ionicons name="time-outline" size={18} color="#fff" />
                <Text style={styles.timerText}>
                    {gameData?.status === 'completed' ? "OPERATION CONCLUDED" : `TIME REMAINING: ${timeLeft}`}
                </Text>
            </View>

            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.touchArea}>
                    <Ionicons name="close" size={28} color="#000" />
                </TouchableOpacity>
                
                <View style={styles.headerInfo}>
                    <Text style={styles.gameTitle} numberOfLines={1}>{gameData?.game_name}</Text>
                    <View style={styles.statusRow}>
                        <View style={[styles.pulse, gameData?.status === 'completed' && { backgroundColor: '#aaa' }]} />
                        <Text style={[styles.statusLabel, gameData?.status === 'completed' && { color: '#aaa' }]}>
                            {gameData?.status === 'completed' ? "DEBRIEF MODE" : "LIVE OPERATION"}
                        </Text>
                    </View>
                </View>

                {/* HOST KILL SWITCH  */}
                {isHost && gameData?.status === 'active' ? (
                    <TouchableOpacity onPress={endMissionEarly} style={styles.touchArea}>
                        <Ionicons name="stop-circle" size={28} color="#ff3b30" />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.touchArea} />
                )}
            </View>

            {gameData?.is_local && (
                <View style={styles.agentBar}>
                    <Text style={styles.agentLabel}>Select Agent:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentScroll}>
                        {participants.map((p) => (
                            <TouchableOpacity key={p.id} onPress={() => handleSwitchAgent(p)} style={[styles.agentChip, activeParticipant?.id === p.id && styles.activeChip]}>
                                <Text style={[styles.agentChipText, activeParticipant?.id === p.id && styles.activeChipText]}>{p.manual_name || 'Agent'}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            <View style={styles.content}>
                {!activeParticipant ? (
                    <View style={styles.dashboardContainer}>
                        <Text style={styles.dashboardTitle}>Global Intelligence</Text>
                        <View style={styles.statsGrid}>
                            <View style={styles.statCard}><Text style={[styles.statNumber, { color: '#4CAF50' }]}>{globalStats.completed}</Text><Text style={styles.statLabel}>Passed</Text></View>
                            <View style={styles.statCard}><Text style={[styles.statNumber, { color: '#2196F3' }]}>{globalStats.total - globalStats.completed - globalStats.failed}</Text><Text style={styles.statLabel}>Active</Text></View>
                            <View style={styles.statCard}><Text style={[styles.statNumber, { color: '#ff3b30' }]}>{globalStats.failed}</Text><Text style={styles.statLabel}>Failed</Text></View>
                        </View>
                        <View style={styles.chartContainer}>
                            <PieChart data={chartData} width={screenWidth - 40} height={200} chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }} accessor={"population"} backgroundColor={"transparent"} paddingLeft={"15"} center={[10, 0]} absolute />
                        </View>
                    </View>
                ) : isBriefingMode ? (
                    <View style={styles.briefingContainer}>
                        <Ionicons name="hand-right-outline" size={80} color="#000" />
                        <Text style={styles.briefingTitle}>Pass the Phone</Text>
                        <Text style={styles.briefingSub}>Hand device to <Text style={styles.boldAgent}>{activeParticipant.manual_name}</Text>.</Text>
                        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmHandover}>
                            <Text style={styles.confirmBtnText}>I am {activeParticipant.manual_name}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Objectives</Text>
                            <Text style={styles.agentIdentity}>Agent: {activeParticipant.manual_name}</Text>
                        </View>
                        <FlatList
                            data={missions}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.listPadding}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    style={[styles.missionCard, item.status === 'failed' && styles.failedCard]} 
                                    onPress={() => toggleMissionCompletion(item.id, item.completed, item.status)} 
                                    activeOpacity={item.status === 'failed' || gameData?.status === 'completed' ? 1 : 0.7}
                                >
                                    <Ionicons name={item.status === 'failed' ? "close-circle" : (item.completed ? "checkmark-circle" : "ellipse-outline")} size={26} color={item.status === 'failed' ? "#ccc" : (item.completed ? "#4CAF50" : "#000")} />
                                    <Text style={[styles.missionText, item.completed && styles.completedText, item.status === 'failed' && styles.failedText]}>{item.mission_library?.task_description}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    </>
                )}
            </View>

            {!isBriefingMode && activeParticipant && gameData?.status === 'active' && (
                <View style={styles.footer}>
                    <TouchableOpacity style={[styles.callOutBtn, calloutsRemaining <= 0 && { backgroundColor: '#666' }]} onPress={() => setCallOutVisible(true)} disabled={calloutsRemaining <= 0}>
                        <Ionicons name="warning-outline" size={22} color="#fff" />
                        <Text style={styles.callOutText}>CALL OUT ({calloutsRemaining})</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* MODALS REMAIN THE SAME... */}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    timerBanner: { backgroundColor: '#000', paddingVertical: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    timerText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    touchArea: { width: 50, height: 50, justifyContent: 'center', alignItems: 'center' },
    headerInfo: { flex: 1, alignItems: 'center' },
    gameTitle: { fontSize: 16, fontWeight: '800', textTransform: 'uppercase' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    pulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff3b30', marginRight: 6 },
    statusLabel: { fontSize: 10, fontWeight: '700', color: '#ff3b30' },
    agentBar: { paddingVertical: 15, backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    agentLabel: { fontSize: 10, fontWeight: '800', color: '#aaa', paddingHorizontal: 20, marginBottom: 10, textTransform: 'uppercase' },
    agentScroll: { paddingHorizontal: 20 },
    agentChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#eee', marginRight: 8 },
    activeChip: { backgroundColor: '#000' },
    agentChipText: { fontSize: 14, fontWeight: '700', color: '#666' },
    activeChipText: { color: '#fff' },
    content: { flex: 1 },
    dashboardContainer: { flex: 1, padding: 25, alignItems: 'center' },
    dashboardTitle: { fontSize: 22, fontWeight: '900', marginVertical: 20 },
    statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    statCard: { flex: 1, backgroundColor: '#f9f9f9', padding: 12, borderRadius: 15, alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
    statNumber: { fontSize: 22, fontWeight: '900' },
    statLabel: { fontSize: 9, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', marginTop: 4 },
    chartContainer: { alignItems: 'center', marginVertical: 10 },
    briefingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    briefingTitle: { fontSize: 28, fontWeight: '900' },
    briefingSub: { fontSize: 18, color: '#666', textAlign: 'center', marginVertical: 20 },
    boldAgent: { fontWeight: '900', color: '#000' },
    confirmBtn: { backgroundColor: '#000', paddingVertical: 18, paddingHorizontal: 35, borderRadius: 100 },
    confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    sectionHeader: { padding: 25, paddingBottom: 10 },
    sectionTitle: { fontSize: 28, fontWeight: '900' },
    agentIdentity: { fontSize: 14, color: '#888', marginTop: 4 },
    listPadding: { padding: 20 },
    missionCard: { flexDirection: 'row', padding: 22, backgroundColor: '#fff', borderRadius: 20, marginBottom: 15, borderWidth: 1.5, borderColor: '#f0f0f0', alignItems: 'center', gap: 15 },
    failedCard: { opacity: 0.5, backgroundColor: '#f5f5f5', borderColor: '#eee' },
    missionText: { fontSize: 16, fontWeight: '600', flex: 1 },
    failedText: { color: '#bbb', textDecorationLine: 'line-through' },
    completedText: { textDecorationLine: 'line-through', color: '#bbb' },
    footer: { padding: 20 },
    callOutBtn: { backgroundColor: '#ff3b30', padding: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
    callOutText: { color: '#fff', fontWeight: '900', fontSize: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#fff', width: '90%', borderRadius: 25, padding: 25 },
    modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 15 }
});