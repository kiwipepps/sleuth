import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
    FlatList, ActivityIndicator, Alert, ScrollView, StatusBar, Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
        if (gameId) fetchInitialData();
    }, [gameId]);

    // Self-heal if the screen loads too fast and sees the old 'lobby' status
    useEffect(() => {
        if (gameData?.status === 'lobby') {
            const timer = setTimeout(() => fetchInitialData(), 1500);
            return () => clearTimeout(timer);
        }
    }, [gameData]);

    useEffect(() => {
        if (!gameData?.end_time || gameData?.status === 'completed') return;
        
        const interval = setInterval(() => {
            const now = new Date().getTime();
            const end = new Date(gameData.end_time).getTime();
            const distance = end - now;

            if (distance <= 0) {
                setTimeLeft("EXPIRED");
                handleForceComplete();
                clearInterval(interval);
                return;
            }
            
            // Removed 24h modulo to allow for multi-day timers
            const hours = Math.floor(distance / (1000 * 60 * 60));
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
        Alert.alert("Abort Operation?", "This will end the mission for all agents.", [
            { text: "Cancel", style: "cancel" },
            { text: "End Mission", style: "destructive", onPress: async () => {
                await supabase.from('games').update({ status: 'completed' }).eq('id', gameId);
                onBack();
            }}
        ]);
    };

    async function fetchInitialData() {
        setLoading(true);
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
            console.error(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function fetchGlobalStats() {
        const { data } = await supabase.from('user_missions').select('completed, status').eq('game_id', gameId);
        if (data) {
            setGlobalStats({ 
                total: data.length, 
                completed: data.filter(m => m.completed).length, 
                failed: data.filter(m => m.status === 'failed').length 
            });
        }
    }

    async function fetchMissions(participantId) {
        const { data } = await supabase.from('user_missions').select('id, mission_library(task_description), completed, status').eq('participant_id', participantId);
        if (data) setMissions(data);
    }

    async function fetchUserCalloutCount(participantId) {
        const { count } = await supabase.from('call_outs').select('*', { count: 'exact', head: true }).eq('caller_id', participantId);
        setUserCalloutCount(count || 0);
    }

    const toggleMissionCompletion = async (missionId, currentStatus, missionStatus) => {
        if (missionStatus === 'failed' || gameData?.status === 'completed') return;
        const newStatus = !currentStatus;
        setMissions(prev => prev.map(m => m.id === missionId ? { ...m, completed: newStatus } : m));
        await supabase.from('user_missions').update({ completed: newStatus }).eq('id', missionId);
        fetchGlobalStats();
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
            
            setPendingAccusation(null);
            setIsBriefingMode(false);

            if (isCorrect) {
                await fetchMissions(activeParticipant.id);
                setIsSelectingFailure(true); 
            } else {
                fetchMissions(activeParticipant.id);
            }
        } catch (err) { Alert.alert("Error", "Update failed."); }
    };

    const handleMarkMissionFailed = async (missionId) => {
        try {
            await supabase.from('user_missions').update({ status: 'failed', completed: false }).eq('id', missionId);
            setIsSelectingFailure(false); 
            fetchMissions(activeParticipant.id); 
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
    if (!gameData) return <View style={styles.center}><Text>Intelligence Missing</Text><TouchableOpacity onPress={onBack}><Text style={{color: 'blue', marginTop: 15}}>Back</Text></TouchableOpacity></View>;

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.timerBanner}>
                <Ionicons name="time-outline" size={18} color="#fff" />
                <Text style={styles.timerText}>
                    {gameData?.status === 'completed' ? "OPERATION CONCLUDED" : `TIME REMAINING: ${timeLeft}`}
                </Text>
            </View>

            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.touchArea}><Ionicons name="close" size={28} color="#000" /></TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.gameTitle} numberOfLines={1}>{gameData?.game_name}</Text>
                    <View style={styles.statusRow}>
                        <View style={[styles.pulse, gameData?.status === 'completed' && { backgroundColor: '#aaa' }]} />
                        <Text style={[styles.statusLabel, gameData?.status === 'completed' && { color: '#aaa' }]}>
                            {gameData?.status === 'completed' ? "DEBRIEF MODE" : "LIVE OPERATION"}
                        </Text>
                    </View>
                </View>
                {isHost && gameData?.status === 'active' ? (
                    <TouchableOpacity onPress={endMissionEarly} style={styles.touchArea}><Ionicons name="stop-circle" size={28} color="#ff3b30" /></TouchableOpacity>
                ) : <View style={styles.touchArea} />}
            </View>

            {gameData?.is_local && (
                <View style={styles.agentBar}>
                    <Text style={styles.agentLabel}>Select Agent:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentScroll}>
                        
                        {/* FIX: New Global Overview Button */}
                        <TouchableOpacity 
                            onPress={() => setActiveParticipant(null)} 
                            style={[styles.agentChip, !activeParticipant && styles.activeChip]}
                        >
                            <Text style={[styles.agentChipText, !activeParticipant && styles.activeChipText]}>Global</Text>
                        </TouchableOpacity>

                        {/* Agent List */}
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
                            <View style={styles.statCard}><Text style={[styles.statNumber, { color: '#2196F3' }]}>{Math.max(0, globalStats.total - globalStats.completed - globalStats.failed)}</Text><Text style={styles.statLabel}>Active</Text></View>
                            <View style={styles.statCard}><Text style={[styles.statNumber, { color: '#ff3b30' }]}>{globalStats.failed}</Text><Text style={styles.statLabel}>Failed</Text></View>
                        </View>
                        {globalStats.total > 0 && (
                            <View style={styles.chartContainer}>
                                <PieChart data={chartData} width={screenWidth - 40} height={200} chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }} accessor={"population"} backgroundColor={"transparent"} paddingLeft={"15"} center={[10, 0]} absolute />
                            </View>
                        )}
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
                        <Ionicons name="warning-outline" size={24} color="#fff" />
                        <Text style={styles.callOutText}>CALL OUT ({calloutsRemaining})</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* MODALS */}
            <Modal visible={isCallOutVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Report Agent</Text>
                        <Text style={styles.modalSubTitle}>Who broke cover?</Text>
                        
                        <ScrollView style={{maxHeight: 150, marginBottom: 15}}>
                            {participants.filter(p => p.id !== activeParticipant?.id).map(p => (
                                <TouchableOpacity key={p.id} style={[styles.targetBtn, selectedTarget?.id === p.id && styles.targetBtnActive]} onPress={() => setSelectedTarget(p)}>
                                    <Text style={[styles.targetBtnText, selectedTarget?.id === p.id && {color: '#fff'}]}>{p.manual_name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TextInput style={styles.input} placeholder="What did they do?" placeholderTextColor="#999" value={calloutDescription} onChangeText={setCalloutDescription} multiline />

                        <View style={styles.modalActionRow}>
                            <TouchableOpacity style={[styles.modalActionBtn, {backgroundColor: '#eee'}]} onPress={() => { setCallOutVisible(false); setSelectedTarget(null); setCalloutDescription(''); }}>
                                <Text style={{color: '#000', fontWeight: 'bold'}}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalActionBtn, {backgroundColor: '#ff3b30'}]} onPress={handleCallOutSubmit}>
                                <Text style={{color: '#fff', fontWeight: 'bold'}}>Submit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={!!pendingAccusation && isBriefingMode} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Ionicons name="alert-circle" size={60} color="#ff3b30" style={{alignSelf: 'center', marginBottom: 10}} />
                        <Text style={[styles.modalTitle, {textAlign: 'center'}]}>Cover Blown!</Text>
                        <Text style={{textAlign: 'center', marginBottom: 20, fontSize: 16}}>
                            <Text style={{fontWeight: '900'}}>{pendingAccusation?.game_participants?.manual_name}</Text> reported you for:{"\n\n"}
                            "{pendingAccusation?.description}"
                        </Text>
                        <Text style={{textAlign: 'center', fontWeight: 'bold', marginBottom: 20}}>Is this correct?</Text>
                        
                        <View style={styles.modalActionRow}>
                            <TouchableOpacity style={[styles.modalActionBtn, {backgroundColor: '#4CAF50'}]} onPress={() => handleResolveAccusation(false)}>
                                <Text style={{color: '#fff', fontWeight: 'bold'}}>No</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalActionBtn, {backgroundColor: '#ff3b30'}]} onPress={() => handleResolveAccusation(true)}>
                                <Text style={{color: '#fff', fontWeight: 'bold'}}>Yes</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={isSelectingFailure} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Mission Failed</Text>
                        <Text style={{marginBottom: 15, color: '#666'}}>Select an active objective to forfeit:</Text>
                        
                        <ScrollView style={{maxHeight: 250}}>
                            {missions.filter(m => !m.completed && m.status !== 'failed').map(m => (
                                <TouchableOpacity key={m.id} style={styles.missionCardSelect} onPress={() => handleMarkMissionFailed(m.id)}>
                                    <Text style={styles.missionText}>{m.mission_library?.task_description}</Text>
                                </TouchableOpacity>
                            ))}
                            {missions.filter(m => !m.completed && m.status !== 'failed').length === 0 && (
                                <Text style={{textAlign: 'center', marginTop: 20, fontStyle: 'italic', color: '#999'}}>No active missions to fail.</Text>
                            )}
                        </ScrollView>

                        {missions.filter(m => !m.completed && m.status !== 'failed').length === 0 && (
                            <TouchableOpacity style={[styles.modalActionBtn, {backgroundColor: '#000', marginTop: 20}]} onPress={() => setIsSelectingFailure(false)}>
                                <Text style={{color: '#fff', fontWeight: 'bold', textAlign: 'center'}}>Continue</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fdfdfd' },
    timerBanner: { backgroundColor: '#000', paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    timerText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
    touchArea: { width: 50, height: 50, justifyContent: 'center', alignItems: 'center' },
    headerInfo: { flex: 1, alignItems: 'center' },
    gameTitle: { fontSize: 16, fontWeight: '800', textTransform: 'uppercase' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    pulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff3b30', marginRight: 6 },
    statusLabel: { fontSize: 10, fontWeight: '700', color: '#ff3b30' },
    agentBar: { paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
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
    statCard: { flex: 1, backgroundColor: '#fff', padding: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#eee', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 },
    statNumber: { fontSize: 24, fontWeight: '900' },
    statLabel: { fontSize: 9, fontWeight: '800', color: '#aaa', textTransform: 'uppercase', marginTop: 4 },
    chartContainer: { alignItems: 'center', marginVertical: 10 },
    briefingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    briefingTitle: { fontSize: 28, fontWeight: '900' },
    briefingSub: { fontSize: 18, color: '#666', textAlign: 'center', marginVertical: 20 },
    boldAgent: { fontWeight: '900', color: '#000' },
    confirmBtn: { backgroundColor: '#000', paddingVertical: 18, paddingHorizontal: 35, borderRadius: 100 },
    confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    sectionHeader: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 5 },
    sectionTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
    agentIdentity: { fontSize: 14, color: '#888', marginTop: 2, fontWeight: '600' },
    listPadding: { padding: 20 },
    missionCard: { flexDirection: 'row', padding: 20, backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#eee', alignItems: 'center', gap: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
    missionCardSelect: { padding: 20, backgroundColor: '#f9f9f9', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
    failedCard: { opacity: 0.5, backgroundColor: '#fafafa', borderColor: '#eee' },
    missionText: { fontSize: 16, fontWeight: '600', flex: 1, lineHeight: 22, color: '#111' },
    failedText: { color: '#bbb', textDecorationLine: 'line-through' },
    completedText: { textDecorationLine: 'line-through', color: '#bbb' },
    footer: { padding: 20, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
    callOutBtn: { backgroundColor: '#ff3b30', paddingVertical: 18, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: '#ff3b30', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    callOutText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', width: '100%', borderRadius: 24, padding: 25 },
    modalTitle: { fontSize: 24, fontWeight: '900', marginBottom: 5 },
    modalSubTitle: { fontSize: 14, color: '#666', marginBottom: 15, fontWeight: '700' },
    targetBtn: { padding: 15, backgroundColor: '#f9f9f9', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
    targetBtnActive: { backgroundColor: '#000', borderColor: '#000' },
    targetBtnText: { fontWeight: '700', color: '#555' },
    input: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 12, height: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#eee', marginBottom: 20, fontSize: 16 },
    modalActionRow: { flexDirection: 'row', gap: 10 },
    modalActionBtn: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center' }
});