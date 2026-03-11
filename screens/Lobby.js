import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, 
    FlatList, Alert, Image, TextInput, KeyboardAvoidingView, Platform 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../supabase';

export default function Lobby({ gameId, isHost, onBack }) {
    const insets = useSafeAreaInsets();
    const [game, setGame] = useState(null);
    const [participants, setParticipants] = useState([]);
    
    // Invite Tab State
    const [friends, setFriends] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('joined'); // 'joined' | 'invite'

    useEffect(() => {
        fetchInitialData();

        // REAL-TIME: Listen for new players joining AND leaving!
        const participantSub = supabase.channel(`lobby-${gameId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_participants', filter: `game_id=eq.${gameId}` }, 
            (payload) => {
                fetchNewParticipantProfile(payload.new.user_id, payload.new.id);
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'game_participants', filter: `game_id=eq.${gameId}` }, 
            (payload) => {
                setParticipants(prev => prev.filter(p => p.id !== payload.old.id));
            }).subscribe();

        return () => supabase.removeChannel(participantSub);
    }, [gameId]);

    const fetchInitialData = async () => {
        try {
            const { data: gameData } = await supabase.from('games').select('*').eq('id', gameId).single();
            setGame(gameData);

            const { data: partData } = await supabase
                .from('game_participants')
                .select('id, user_id, is_ready, profiles(username, avatar_url)')
                .eq('game_id', gameId);
            setParticipants(partData || []);

            if (isHost) {
                const { data: { user } } = await supabase.auth.getUser();
                const { data: added } = await supabase.from('friends').select('profiles!friends_friend_id_fkey(id, username, avatar_url)').eq('user_id', user.id);
                const { data: addedMe } = await supabase.from('friends').select('profiles!friends_user_id_fkey(id, username, avatar_url)').eq('friend_id', user.id);
                
                const combined = [...(added || []).map(f => f.profiles), ...(addedMe || []).map(f => f.profiles)];
                const uniqueFriends = Array.from(new Map(combined.map(item => [item.id, item])).values());
                setFriends(uniqueFriends);
            }
        } catch (error) {
            console.error("Lobby fetch error:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchNewParticipantProfile = async (userId, participantId) => {
        setParticipants(prev => {
            if (prev.some(p => p.id === participantId)) return prev;
            return [...prev, { id: participantId, user_id: userId, profiles: { username: 'Loading...' } }];
        });

        const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();
        
        setParticipants(prev => prev.map(p => p.id === participantId ? { ...p, profiles: profile } : p));
    };

    const handleSearch = async (text) => {
        setSearchQuery(text);
        if (text.length < 2) {
            setSearchResults([]);
            return;
        }
        try {
            const { data } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .ilike('username', `%${text}%`)
                .neq('id', game.host_id) 
                .limit(10);
            
            if (data) setSearchResults(data);
        } catch (err) { console.error(err); }
    };

    const handleInviteUser = async (userId) => {
        try {
            if (participants.some(p => p.user_id === userId)) return; 
            
            // Added .select() to verify insertion and trigger proper errors
            const { data, error } = await supabase.from('game_participants').insert([{
                game_id: gameId,
                user_id: userId,
                is_ready: false
            }]).select();

            if (error) throw error;

            if (!data || data.length === 0) {
                return Alert.alert("Permission Denied", "Database blocked the invite. Check your RLS INSERT policies!");
            }
        } catch (err) {
            console.error("Invite Error:", err);
            Alert.alert("Error", err.message || "Could not add agent.");
        }
    };

    const handleRemoveUser = async (userId) => {
        // OPTIMISTIC UI: Remove instantly from screen
        setParticipants(prev => prev.filter(p => p.user_id !== userId));

        try {
            const { error, data } = await supabase.from('game_participants')
                .delete()
                .eq('game_id', gameId)
                .eq('user_id', userId)
                .select();

            if (error) throw error;

            // Catch RLS blocks
            if (!data || data.length === 0) {
                fetchInitialData(); // Revert the UI
                Alert.alert("Permission Denied", "Database blocked the removal. Check your RLS policies!");
            }
        } catch (err) {
            fetchInitialData(); // Revert the UI on error
            Alert.alert("Error", "Could not remove agent.");
            console.error(err);
        }
    };

    // FIX: Updated to distribute missions to all players before starting the game
    const handleStartGame = async () => {
        if (participants.length < 2) return Alert.alert("Not Enough Agents", "You need at least 2 agents to start.");
        
        try {
            setLoading(true);

            // 1. Fetch available missions from the library based on difficulty
            let missionQuery = supabase.from('mission_library').select('id');
            if (game.difficulty_level && game.difficulty_level !== 'Mixed') {
                missionQuery = missionQuery.eq('difficulty', game.difficulty_level);
            }
            
            const { data: missionPool, error: missionErr } = await missionQuery;
            if (missionErr) throw missionErr;

            const missionsPerPlayer = game.missions_per_player || 3;

            if (!missionPool || missionPool.length < missionsPerPlayer) {
                setLoading(false);
                return Alert.alert("Database Error", "Not enough missions in the library to start.");
            }

            // 2. Generate random missions for EVERY participant in the lobby
            const missionsToInsert = [];
            
            participants.forEach(participant => {
                // Shuffle the mission pool so everyone gets a random assortment
                const shuffledMissions = [...missionPool].sort(() => 0.5 - Math.random());
                const selectedMissions = shuffledMissions.slice(0, missionsPerPlayer);

                selectedMissions.forEach(mission => {
                    missionsToInsert.push({
                        game_id: gameId,
                        participant_id: participant.id,
                        user_id: participant.user_id, // Links the mission directly to the player's account
                        mission_id: mission.id,
                        completed: false,
                        status: 'active'
                    });
                });
            });

            // 3. Batch insert all the assigned missions
            const { error: insertErr } = await supabase.from('user_missions').insert(missionsToInsert);
            if (insertErr) throw insertErr;

            // 4. Flip the game to active!
            const { error: updateErr } = await supabase.from('games').update({ status: 'active' }).eq('id', gameId);
            if (updateErr) throw updateErr;

        } catch (error) {
            console.error("Start Game Error:", error);
            setLoading(false);
            Alert.alert("Error", "Failed to assign missions and start operation.");
        }
    };

    if (loading || !game) return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;

    const inviteListData = searchQuery.length > 1 ? searchResults : friends;

    return (
        <KeyboardAvoidingView 
            style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
                    <Ionicons name="close" size={28} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>OPERATION LOBBY</Text>
                <View style={{ width: 28 }} />
            </View>

            <View style={styles.qrSection}>
                <View style={styles.qrContainer}>
                    <QRCode value={gameId} size={150} />
                </View>
                {!isHost ? (
                    <Text style={styles.waitingText}>Waiting for Host to start...</Text>
                ) : (
                    <Text style={styles.scanText}>Have agents scan this code to join</Text>
                )}
            </View>

            {isHost && (
                <View style={styles.tabsContainer}>
                    <TouchableOpacity style={[styles.tab, activeTab === 'joined' && styles.activeTab]} onPress={() => setActiveTab('joined')}>
                        <Text style={[styles.tabText, activeTab === 'joined' && styles.activeTabText]}>Joined ({participants.length})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tab, activeTab === 'invite' && styles.activeTab]} onPress={() => setActiveTab('invite')}>
                        <Text style={[styles.tabText, activeTab === 'invite' && styles.activeTabText]}>Invite Friends</Text>
                    </TouchableOpacity>
                </View>
            )}

            {isHost && activeTab === 'invite' && (
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#aaa" />
                    <TextInput 
                        style={styles.searchInput}
                        placeholder="Search by username..."
                        placeholderTextColor="#aaa"
                        value={searchQuery}
                        onChangeText={handleSearch}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
            )}

            <View style={styles.listContainer}>
                {activeTab === 'joined' ? (
                    <FlatList
                        data={participants}
                        keyExtractor={item => item.id}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <View style={styles.agentCard}>
                                {item.profiles?.avatar_url ? (
                                    <Image source={{ uri: item.profiles.avatar_url }} style={styles.agentAvatarImg} />
                                ) : (
                                    <View style={styles.agentAvatarPlaceholder}>
                                        <Ionicons name="person" size={20} color="#ccc" />
                                    </View>
                                )}
                                <Text style={styles.agentName}>{item.profiles?.username || 'Unknown Agent'}</Text>
                                
                                {game.host_id === item.user_id ? (
                                    <View style={styles.hostBadge}><Text style={styles.hostBadgeText}>HOST</Text></View>
                                ) : isHost ? (
                                    <TouchableOpacity style={styles.removeIconBtn} onPress={() => handleRemoveUser(item.user_id)}>
                                        <Ionicons name="remove-circle" size={26} color="#ff3b30" />
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        )}
                    />
                ) : (
                    <FlatList
                        data={inviteListData}
                        keyExtractor={item => item.id}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={() => (
                            <Text style={styles.emptyText}>
                                {searchQuery.length > 1 ? "No agents found." : "No friends on your list yet."}
                            </Text>
                        )}
                        renderItem={({ item }) => {
                            const isJoined = participants.some(p => p.user_id === item.id);
                            
                            return (
                                <View style={styles.agentCard}>
                                    {item.avatar_url ? (
                                        <Image source={{ uri: item.avatar_url }} style={styles.agentAvatarImg} />
                                    ) : (
                                        <View style={styles.agentAvatarPlaceholder}>
                                            <Ionicons name="person" size={20} color="#ccc" />
                                        </View>
                                    )}
                                    <Text style={styles.agentName}>{item.username}</Text>
                                    
                                    {isJoined ? (
                                        <View style={[styles.inviteBtn, { backgroundColor: '#e0e0e0' }]}>
                                            <Text style={[styles.inviteBtnText, { color: '#888' }]}>Joined</Text>
                                        </View>
                                    ) : (
                                        <TouchableOpacity 
                                            style={styles.inviteBtn} 
                                            onPress={() => handleInviteUser(item.id)}
                                        >
                                            <Text style={styles.inviteBtnText}>Invite</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            );
                        }}
                    />
                )}
            </View>

            {isHost && (
                <View style={styles.footer}>
                    <TouchableOpacity style={styles.startBtn} onPress={handleStartGame}>
                        <Text style={styles.startBtnText}>START OPERATION</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fdfdfd' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },
    iconBtn: { padding: 5 },
    headerTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 2 },
    
    qrSection: { alignItems: 'center', padding: 30, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    qrContainer: { padding: 15, backgroundColor: '#fff', borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15, elevation: 5, marginBottom: 15 },
    scanText: { fontSize: 14, fontWeight: '600', color: '#888' },
    waitingText: { fontSize: 16, fontWeight: '800', color: '#ff3b30' },

    tabsContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' },
    tab: { flex: 1, paddingVertical: 15, alignItems: 'center' },
    activeTab: { borderBottomWidth: 3, borderBottomColor: '#000' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#aaa' },
    activeTabText: { color: '#000', fontWeight: '900' },

    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, marginHorizontal: 20, marginTop: 15, paddingHorizontal: 15, height: 45 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: '#000' },

    listContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 15 },
    agentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
    agentAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    agentAvatarImg: { width: 40, height: 40, borderRadius: 20, marginRight: 15, backgroundColor: '#eee' },
    agentName: { flex: 1, fontSize: 16, fontWeight: '700' },
    
    hostBadge: { backgroundColor: '#000', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    hostBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
    removeIconBtn: { padding: 10, marginLeft: 5 },
    
    inviteBtn: { backgroundColor: '#007AFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, minWidth: 70, alignItems: 'center' },
    inviteBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    emptyText: { textAlign: 'center', color: '#aaa', marginTop: 30, fontWeight: '500' },

    footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
    startBtn: { backgroundColor: '#000', paddingVertical: 20, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    startBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 }
});