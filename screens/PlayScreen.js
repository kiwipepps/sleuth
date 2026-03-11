import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
    FlatList, ActivityIndicator, Alert, ScrollView, StatusBar, Dimensions,
    KeyboardAvoidingView, Platform, Image
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

    // Online Mode State
    const [activeTab, setActiveTab] = useState('missions'); // 'missions' | 'intel'
    const [globalIntel, setGlobalIntel] = useState([]);

    useEffect(() => {
        if (gameId) fetchInitialData();
    }, [gameId, userId]);

    useEffect(() => {
        if (!gameData || gameData.is_local) return;

        const intelSub = supabase.channel(`intel-${gameId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_outs', filter: `game_id=eq.${gameId}` }, 
            (payload) => {
                setGlobalIntel(prev => [payload.new, ...prev]);
            }).subscribe();

        const missionSub = supabase.channel(`missions-${gameId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_missions', filter: `game_id=eq.${gameId}` }, 
            (payload) => {
                fetchGlobalStats(); 
            }).subscribe();

        return () => {
            supabase.removeChannel(intelSub);
            supabase.removeChannel(missionSub);
        };
    }, [gameData]);

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
            const { data: parts, error: pErr } = await supabase.from('game_participants').select('*, profiles(username)').eq('game_id', gameId);
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
                    fetchGlobalIntel();
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

    async function fetchGlobalIntel() {
        const { data } = await supabase
            .from('call_outs')
            .select('*')
            .eq('game_id', gameId)
            .order('created_at', { ascending: false });
        if (data) setGlobalIntel(data);
    }

    async function fetchUserCalloutCount(participantId) {
        const { count } = await supabase.from('call_outs').select('*', { count: 'exact', head: true }).eq('caller_id', participantId);
        setUserCalloutCount(count || 0);
    }

    const toggleMissionCompletion = async (missionId, currentStatus, missionStatus) => {
        if (missionStatus === 'failed' || gameData?.status === 'completed') return;
        
        if (currentStatus) {
            setMissions(prev => prev.map(m => m.id === missionId ? { ...m, completed: false } : m));
            await supabase.from('user_missions').update({ completed: false }).eq('id', missionId);
            fetchGlobalStats();
        } else {
            Alert.alert("Confirm", "Did you successfully complete this order?", [
                { text: "Cancel", style: "cancel" },
                { text: "Confirm", onPress: async () => {
                    setMissions(prev => prev.map(m => m.id === missionId ? { ...m, completed: true } : m));
                    await supabase.from('user_missions').update({ completed: true }).eq('id', missionId);
                    fetchGlobalStats();
                }}
            ]);
        }
    };

    const handleCallOutSubmit = async () => {
        if (userCalloutCount >= gameData?.callout_limit) return Alert.alert("Limit Reached", "No reports remaining.");
        if (!selectedTarget || !calloutDescription) return Alert.alert("Required", "Select an agent and describe what happened.");

        try {
            const payload = {
                game_id: gameId,
                caller_id: activeParticipant.id,
                target_id: selectedTarget.id, 
                description: calloutDescription,
                status: 'pending'
            };

            const { data, error } = await supabase.from('call_outs').insert([payload]).select();
            if (error) throw error;
            if (!data || data.length === 0) return Alert.alert("Permission Denied", "Database blocked the report.");
            
            setUserCalloutCount(prev => prev + 1);
            setCallOutVisible(false);
            setSelectedTarget(null);
            setCalloutDescription('');
            
            if (!gameData.is_local) setActiveTab('intel');
        } catch (err) { 
            console.error("Callout Error:", err);
            Alert.alert("Error", err.message || "Report failed."); 
        }
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

    const getUsername = (uid) => {
        const p = participants.find(part => part.id === uid);
        if (!p) return 'Unknown Agent';
        return gameData?.is_local ? p.manual_name : p.profiles?.username;
    };

    const chartData = [
        { name: "Passed", population: globalStats.completed, color: "#4CAF50", legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: "Active", population: Math.max(0, globalStats.total - globalStats.completed - globalStats.failed), color: "#2196F3", legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: "Failed", population: globalStats.failed, color: "#ff3b30", legendFontColor: "#7F7F7F", legendFontSize: 12 }
    ];

    const isHost = gameData?.host_id === userId;
    const calloutsRemaining = gameData ? Math.max(0, gameData.callout_limit - userCalloutCount) : 0;

    // --- REUSABLE DASHBOARD COMPONENT ---
    const renderDashboard = () => (
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
    );

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

            {/* --- LOCAL MODE NAVIGATION --- */}
            {gameData?.is_local && (
                <View style={styles.agentBar}>
                    <Text style={styles.agentLabel}>Select Agent:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentScroll}>
                        <TouchableOpacity onPress={() => setActiveParticipant(null)} style={[styles.agentChip, !activeParticipant && styles.activeChip]}>
                            <Text style={[styles.agentChipText, !activeParticipant && styles.activeChipText]}>Global</Text>
                        </TouchableOpacity>
                        {participants.map((p) => (
                            <TouchableOpacity key={p.id} onPress={() => handleSwitchAgent(p)} style={[styles.agentChip, activeParticipant?.id === p.id && styles.activeChip]}>
                                <Text style={[styles.agentChipText, activeParticipant?.id === p.id && styles.activeChipText]}>{p.manual_name || 'Agent'}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* --- ONLINE MODE NAVIGATION --- */}
            {!gameData?.is_local && (
                <View style={styles.onlineTabsContainer}>
                    <TouchableOpacity style={[styles.onlineTab, activeTab === 'missions' && styles.onlineActiveTab]} onPress={() => setActiveTab('missions')}>
                        <Text style={[styles.onlineTabText, activeTab === 'missions' && styles.onlineActiveTabText]}>My Orders</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.onlineTab, activeTab === 'intel' && styles.onlineActiveTab]} onPress={() => setActiveTab('intel')}>
                        <Text style={[styles.onlineTabText, activeTab === 'intel' && styles.onlineActiveTabText]}>Global Intel</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.content}>
                
                {/* GLOBAL DASHBOARD (Local Mode Only) */}
                {gameData?.is_local && !activeParticipant && (
                    <ScrollView contentContainerStyle={styles.listPadding} showsVerticalScrollIndicator={false}>
                        {renderDashboard()}
                    </ScrollView>
                )}

                {/* HANDOVER SCREEN (Local Mode Only) */}
                {gameData?.is_local && activeParticipant && isBriefingMode ? (
                    <View style={styles.briefingContainer}>
                        <Ionicons name="hand-right-outline" size={80} color="#000" />
                        <Text style={styles.briefingTitle}>Pass the Phone</Text>
                        <Text style={styles.briefingSub}>Hand device to <Text style={styles.boldAgent}>{activeParticipant.manual_name}</Text>.</Text>
                        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmHandover}>
                            <Text style={styles.confirmBtnText}>I am {activeParticipant.manual_name}</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* MISSIONS LIST */}
                {(gameData?.is_local && activeParticipant && !isBriefingMode) || (!gameData?.is_local && activeTab === 'missions') ? (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Objectives</Text>
                            <Text style={styles.agentIdentity}>Agent: {activeParticipant?.manual_name || activeParticipant?.profiles?.username}</Text>
                        </View>
                        <FlatList
                            data={missions}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.listPadding}
                            ListEmptyComponent={<Text style={styles.emptyText}>No missions assigned.</Text>}
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
                ) : null}

                {/* GLOBAL INTEL LIST (Online 'intel' tab only) */}
                {!gameData?.is_local && activeTab === 'intel' && (
                    <FlatList
                        ListHeaderComponent={renderDashboard}
                        data={globalIntel}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.listPadding}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={<Text style={styles.emptyText}>No reports filed yet. Stay sharp.</Text>}
                        renderItem={({ item }) => (
                            <View style={styles.intelCard}>
                                <View style={styles.intelHeader}>
                                    <Ionicons name="warning" size={16} color="#ff3b30" />
                                    <Text style={styles.intelTarget}>TARGET: {getUsername(item.target_id)}</Text>
                                </View>
                                <Text style={styles.intelDesc}>"{item.description}"</Text>
                                <Text style={styles.intelReporter}>Reported by {getUsername(item.caller_id)}</Text>
                            </View>
                        )}
                    />
                )}
            </View>

            {/* CALL OUT BUTTON */}
            {activeParticipant && gameData?.status === 'active' && (!gameData?.is_local || !isBriefingMode) && (
                <View style={styles.footer}>
                    <TouchableOpacity style={[styles.callOutBtn, calloutsRemaining <= 0 && { backgroundColor: '#666', shadowColor: 'transparent' }]} onPress={() => setCallOutVisible(true)} disabled={calloutsRemaining <= 0}>
                        <Ionicons name="warning-outline" size={24} color="#fff" />
                        <Text style={styles.callOutText}>REPORT AGENT ({calloutsRemaining})</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* CALL OUT MODAL */}
            <Modal visible={isCallOutVisible} transparent animationType="fade">
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Report Agent</Text>
                            <Text style={styles.modalSubTitle}>Who broke cover?</Text>
                            
                            <ScrollView style={{maxHeight: 150, marginBottom: 15}} keyboardShouldPersistTaps="handled">
                                {participants.filter(p => (gameData?.is_local ? p.id !== activeParticipant?.id : p.user_id !== userId)).map(p => (
                                    <TouchableOpacity 
                                        key={p.id} 
                                        style={[styles.targetBtn, selectedTarget?.id === p.id && styles.targetBtnActive]} 
                                        onPress={() => setSelectedTarget(p)}
                                    >
                                        <Text style={[styles.targetBtnText, selectedTarget?.id === p.id && {color: '#fff'}]}>
                                            {gameData?.is_local ? p.manual_name : p.profiles?.username}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <TextInput 
                                style={styles.input} 
                                placeholder="What did they do?" 
                                placeholderTextColor="#999" 
                                value={calloutDescription} 
                                onChangeText={setCalloutDescription} 
                                multiline 
                            />

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
                </KeyboardAvoidingView>
            </Modal>

            {/* PENALTY MODALS (Local Only) */}
            <Modal visible={!!pendingAccusation && isBriefingMode && gameData?.is_local} transparent animationType="slide">
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

            <Modal visible={isSelectingFailure && gameData?.is_local} transparent animationType="fade">
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
                        </ScrollView>
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

    onlineTabsContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' },
    onlineTab: { flex: 1, paddingVertical: 15, alignItems: 'center' },
    onlineActiveTab: { borderBottomWidth: 3, borderBottomColor: '#000' },
    onlineTabText: { fontSize: 14, fontWeight: '600', color: '#aaa' },
    onlineActiveTabText: { color: '#000', fontWeight: '900' },

    content: { flex: 1 },
    dashboardContainer: { width: '100%', alignItems: 'center', paddingBottom: 20 },
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
    
    intelCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#ff3b30', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
    intelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    intelTarget: { fontSize: 12, fontWeight: '900', color: '#ff3b30', letterSpacing: 1 },
    intelDesc: { fontSize: 16, fontWeight: '600', color: '#000', fontStyle: 'italic', marginBottom: 10 },
    intelReporter: { fontSize: 12, color: '#888', fontWeight: '500' },
    emptyText: { textAlign: 'center', color: '#aaa', marginTop: 40, fontWeight: '500' },

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