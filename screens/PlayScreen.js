import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
    FlatList, SafeAreaView, ActivityIndicator, Alert, ScrollView, Platform, StatusBar, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-chart-kit';
import { supabase } from '../supabase';

const screenWidth = Dimensions.get("window").width;

export default function PlayScreen({ gameId, onBack, userId }) {
    const [loading, setLoading] = useState(true);
    const [gameData, setGameData] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [activeParticipant, setActiveParticipant] = useState(null);
    const [missions, setMissions] = useState([]);
    const [isBriefingMode, setIsBriefingMode] = useState(true);
    const [timeLeft, setTimeLeft] = useState('');

    // UI & Global Stats
    const [globalStats, setGlobalStats] = useState({ total: 0, completed: 0, failed: 0 });

    // Call Out Submission State
    const [isCallOutVisible, setCallOutVisible] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [calloutDescription, setCalloutDescription] = useState('');
    const [userCalloutCount, setUserCalloutCount] = useState(0);

    // Accusation Review & Failure Mode States
    const [pendingAccusation, setPendingAccusation] = useState(null);
    const [isSelectingFailure, setIsSelectingFailure] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, [gameId]);

    // --- TIMER LOGIC ---
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
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        }, 1000);
        return () => clearInterval(interval);
    }, [gameData]);

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
        if (missionStatus === 'failed') return;

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
        if (userCalloutCount >= gameData?.callout_limit) {
            return Alert.alert("Limit Reached", "You have used all your intelligence reports.");
        }
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
            Alert.alert("Intelligence Logged", "Report filed successfully.");
        } catch (err) {
            Alert.alert("Error", "Report failed to send.");
        }
    };

    const handleConfirmHandover = async () => {
        if (!activeParticipant) return;

        // Refresh local player specific data upon handover
        await fetchUserCalloutCount(activeParticipant.id);

        const { data: reports } = await supabase
            .from('call_outs')
            .select('*, game_participants!caller_id(manual_name)')
            .eq('target_id', activeParticipant.id)
            .eq('is_resolved', false)
            .limit(1);

        if (reports && reports.length > 0) {
            setPendingAccusation(reports[0]);
        } else {
            fetchMissions(activeParticipant.id);
            setIsBriefingMode(false);
        }
    };

    const handleResolveAccusation = async (isCorrect) => {
        try {
            await supabase.from('call_outs')
                .update({ is_resolved: true, status: isCorrect ? 'accepted' : 'incorrect' })
                .eq('id', pendingAccusation.id);

            if (isCorrect) {
                await fetchMissions(activeParticipant.id);
                setIsSelectingFailure(true);
            } else {
                setPendingAccusation(null);
                fetchMissions(activeParticipant.id);
                setIsBriefingMode(false);
            }
        } catch (err) {
            Alert.alert("Error", "Could not update report status.");
        }
    };

    const handleMarkMissionFailed = async (missionId) => {
        try {
            await supabase.from('user_missions')
                .update({ status: 'failed', completed: false })
                .eq('id', missionId);

            setIsSelectingFailure(false);
            setPendingAccusation(null);
            fetchMissions(activeParticipant.id);
            setIsBriefingMode(false);
            fetchGlobalStats();
        } catch (err) {
            Alert.alert("Error", "Could not terminate mission.");
        }
    };

    const handleSwitchAgent = (agent) => {
        setMissions([]);
        setActiveParticipant(agent);
        setIsBriefingMode(true);
    };

    const chartData = [
        { name: "Passed", population: globalStats.completed, color: "#4CAF50", legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: "Active", population: Math.max(0, globalStats.total - globalStats.completed - globalStats.failed), color: "#2196F3", legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: "Failed", population: globalStats.failed, color: "#ff3b30", legendFontColor: "#7F7F7F", legendFontSize: 12 }
    ];

    const calloutsRemaining = gameData ? Math.max(0, gameData.callout_limit - userCalloutCount) : 0;

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
                    <TouchableOpacity onPress={onBack} style={styles.iconBtn}><Ionicons name="close" size={28} color="#000" /></TouchableOpacity>
                    <View style={styles.headerInfo}>
                        <Text style={styles.gameTitle} numberOfLines={1}>{gameData?.game_name}</Text>
                        <View style={styles.statusRow}><View style={styles.pulse} /><Text style={styles.statusText}>LIVE OPERATION</Text></View>
                    </View>
                    <View style={styles.iconBtn}><Ionicons name="information-circle-outline" size={24} color="#ccc" /></View>
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
                                <PieChart
                                    data={chartData}
                                    width={screenWidth - 40}
                                    height={200}
                                    chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }}
                                    accessor={"population"}
                                    backgroundColor={"transparent"}
                                    paddingLeft={"15"}
                                    center={[10, 0]}
                                    absolute
                                />
                                <Text style={styles.chartText}>Operation Distribution</Text>
                            </View>
                            <Text style={styles.dashboardInstruction}>Tap an Agent profile above to reveal classified orders.</Text>
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
                                <Text style={styles.sectionTitle}>Your Objectives</Text>
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
                                        activeOpacity={item.status === 'failed' ? 1 : 0.7}
                                    >
                                        <Ionicons
                                            name={item.status === 'failed' ? "close-circle" : (item.completed ? "checkmark-circle" : "ellipse-outline")}
                                            size={26}
                                            color={item.status === 'failed' ? "#ccc" : (item.completed ? "#4CAF50" : "#000")}
                                        />
                                        <Text style={[styles.missionText, item.completed && styles.completedText, item.status === 'failed' && styles.failedText]}>{item.mission_library?.task_description}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </>
                    )}
                </View>

                {!isBriefingMode && activeParticipant && (
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.callOutBtn, calloutsRemaining <= 0 && { backgroundColor: '#666' }]}
                            onPress={() => setCallOutVisible(true)}
                            disabled={calloutsRemaining <= 0}
                        >
                            <Ionicons name="warning-outline" size={22} color="#fff" />
                            <Text style={styles.callOutText}>CALL OUT ({calloutsRemaining})</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* CALL OUT SUBMISSION MODAL */}
                <Modal visible={isCallOutVisible} animationType="slide" transparent>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeaderRow}>
                                <Text style={styles.modalTitle}>File Accusation</Text>
                                <View style={styles.limitBadge}><Text style={styles.limitBadgeText}>{calloutsRemaining} LEFT</Text></View>
                            </View>
                            <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                                {participants.filter(p => p.id !== activeParticipant?.id).map(p => (
                                    <TouchableOpacity key={p.id} onPress={() => setSelectedTarget(p)} style={[styles.targetCard, selectedTarget?.id === p.id && styles.selectedTargetCard]}>
                                        <Text style={[styles.targetName, selectedTarget?.id === p.id && { color: '#fff' }]}>{p.manual_name}</Text>
                                        {selectedTarget?.id === p.id && <Ionicons name="checkmark-circle" size={18} color="#fff" />}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                            <TextInput
                                style={styles.descInput}
                                placeholder="What did you catch them doing?"
                                multiline
                                value={calloutDescription}
                                onChangeText={setCalloutDescription}
                            />
                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setCallOutVisible(false)}><Text style={styles.btnText}>Abort</Text></TouchableOpacity>
                                <TouchableOpacity style={styles.submitBtn} onPress={handleCallOutSubmit}><Text style={[styles.btnText, { color: '#fff' }]}>Submit</Text></TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* ACCUSATION REVIEW MODAL */}
                <Modal visible={!!pendingAccusation} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        {!isSelectingFailure ? (
                            <View style={styles.trialContent}>
                                <Ionicons name="eye-outline" size={50} color="#ff3b30" />
                                <Text style={styles.modalTitle}>Reported Activity</Text>
                                <Text style={styles.trialSub}>Agent <Text style={{ fontWeight: '900' }}>{pendingAccusation?.game_participants?.manual_name}</Text> claims:</Text>
                                <View style={styles.descriptionBox}><Text style={styles.descriptionText}>{pendingAccusation?.description}</Text></View>
                                <Text style={styles.questionText}>Is this intelligence accurate?</Text>
                                <View style={styles.modalActions}>
                                    <TouchableOpacity style={styles.cancelBtn} onPress={() => handleResolveAccusation(false)}><Text style={styles.btnText}>Incorrect</Text></TouchableOpacity>
                                    <TouchableOpacity style={styles.submitBtn} onPress={() => handleResolveAccusation(true)}><Text style={[styles.btnText, { color: '#fff' }]}>Accurate</Text></TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.trialContent}>
                                <Ionicons name="list" size={50} color="#000" />
                                <Text style={styles.modalTitle}>Objective Failed</Text>
                                <Text style={styles.trialSub}>Select which objective was compromised:</Text>
                                <ScrollView style={{ width: '100%', marginTop: 20, maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                                    {missions.filter(m => m.status !== 'failed').map(m => (
                                        <TouchableOpacity key={m.id} style={styles.failureSelectCard} onPress={() => handleMarkMissionFailed(m.id)}>
                                            <Text style={styles.targetName}>{m.mission_library?.task_description}</Text>
                                            <Ionicons name="arrow-forward" size={18} color="#ccc" />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                </Modal>
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
    gameTitle: { fontSize: 16, fontWeight: '800', textTransform: 'uppercase' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    pulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff3b30', marginRight: 6 },
    statusText: { fontSize: 10, fontWeight: '700', color: '#ff3b30' },
    agentBar: { paddingVertical: 15, backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    agentLabel: { fontSize: 10, fontWeight: '800', color: '#aaa', paddingHorizontal: 20, marginBottom: 10, textTransform: 'uppercase' },
    agentScroll: { paddingHorizontal: 20 },
    agentChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#eee', marginRight: 8 },
    activeChip: { backgroundColor: '#000' },
    agentChipText: { fontSize: 14, fontWeight: '700', color: '#666' },
    activeChipText: { color: '#fff' },
    content: { flex: 1 },
    dashboardContainer: { flex: 1, padding: 25, alignItems: 'center', justifyContent: 'center' },
    dashboardTitle: { fontSize: 24, fontWeight: '900', marginBottom: 30 },
    statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    statCard: { flex: 1, backgroundColor: '#f9f9f9', padding: 12, borderRadius: 15, alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
    statNumber: { fontSize: 22, fontWeight: '900' },
    statLabel: { fontSize: 9, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', marginTop: 4 },
    chartContainer: { alignItems: 'center', marginVertical: 10 },
    chartText: { marginTop: -10, fontWeight: '800', fontSize: 16, color: '#333' },
    dashboardInstruction: { color: '#bbb', textAlign: 'center', fontSize: 14, paddingHorizontal: 40 },
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
    failureSelectCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#f9f9f9', borderRadius: 15, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
    missionText: { fontSize: 16, fontWeight: '600', flex: 1 },
    failedText: { color: '#bbb', textDecorationLine: 'line-through' },
    completedText: { textDecorationLine: 'line-through', color: '#bbb' },
    footer: { padding: 20 },
    callOutBtn: { backgroundColor: '#ff3b30', padding: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
    callOutText: { color: '#fff', fontWeight: '900', fontSize: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#fff', width: '90%', borderRadius: 25, padding: 25 },
    modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 15 },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    limitBadge: { backgroundColor: '#000', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    limitBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
    targetCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#f0f0f0', borderRadius: 12, marginBottom: 8 },
    selectedTargetCard: { backgroundColor: '#000' },
    targetName: { fontSize: 16, fontWeight: '700', flex: 1 },
    descInput: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 15, height: 100, textAlignVertical: 'top', marginTop: 15, borderWidth: 1, borderColor: '#eee' },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelBtn: { flex: 1, padding: 18, borderRadius: 15, backgroundColor: '#eee', alignItems: 'center' },
    submitBtn: { flex: 1, padding: 18, borderRadius: 15, backgroundColor: '#ff3b30', alignItems: 'center' },
    btnText: { fontWeight: '800', fontSize: 16 },
    trialContent: { backgroundColor: '#fff', borderRadius: 30, padding: 30, width: '90%', alignItems: 'center' },
    trialSub: { fontSize: 16, color: '#444', textAlign: 'center', marginTop: 15 },
    descriptionBox: { backgroundColor: '#f5f5f5', padding: 20, borderRadius: 15, marginVertical: 20, width: '100%', borderLeftWidth: 5, borderLeftColor: '#ff3b30' },
    descriptionText: { fontSize: 16, fontStyle: 'italic' },
    questionText: { fontSize: 14, fontWeight: '700', color: '#999', marginBottom: 20 }
});