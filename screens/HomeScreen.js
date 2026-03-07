import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    Image, ActivityIndicator, RefreshControl, SafeAreaView, Platform, StatusBar, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function HomeScreen({ onCreatePress, onJoinGame }) {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        getInitialData();
    }, []);

    const getInitialData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUserId(user.id);
            fetchUserGames(user.id);
        }
    };

    const fetchUserGames = async (currentUserId) => {
        if (!currentUserId) return;
        try {
            const { data: hostedGames } = await supabase
                .from('games')
                .select('*')
                .eq('host_id', currentUserId);

            const { data: participantData } = await supabase
                .from('game_participants')
                .select('games(*)')
                .eq('user_id', currentUserId);

            const joinedGames = participantData?.map(item => item.games).filter(Boolean) || [];
            const combined = [...(hostedGames || []), ...joinedGames];
            const uniqueGamesMap = new Map();

            combined.forEach(game => uniqueGamesMap.set(game.id, game));
            const uniqueGames = Array.from(uniqueGamesMap.values());
            uniqueGames.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setGames(uniqueGames);
        } catch (error) {
            console.error("Error fetching games:", error.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // --- NEW: DELETE FUNCTION ---
    const handleDeleteGame = async (gameId, gameName) => {
        Alert.alert(
            "Terminate Operation?",
            `Are you sure you want to delete "${gameName}"? All mission data will be lost.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('games')
                                .delete()
                                .eq('id', gameId);

                            if (error) throw error;

                            // Remove from local state
                            setGames(prev => prev.filter(g => g.id !== gameId));
                        } catch (err) {
                            Alert.alert("Error", "Could not delete game.");
                        }
                    }
                }
            ]
        );
    };

    const renderGameItem = ({ item }) => {
        const isHost = item.host_id === userId;
        const status = item.status || 'lobby';

        return (
            <View style={styles.cardWrapper}>
                <TouchableOpacity
                    style={styles.gameCard}
                    onPress={() => onJoinGame(item.id, status === 'active' ? 'play' : 'lobby', item.host_id)}
                >
                    {item.cover_image ? (
                        <Image source={{ uri: item.cover_image }} style={styles.cardImage} />
                    ) : (
                        <View style={[styles.cardImage, styles.placeholderContainer]}>
                            <Ionicons name="map-outline" size={40} color="#ccc" />
                        </View>
                    )}

                    <View style={styles.cardOverlay}>
                        <View style={[styles.statusBadge, status === 'active' ? styles.activeBadge : styles.lobbyBadge]}>
                            <Text style={styles.statusText}>{status.toUpperCase()}</Text>
                        </View>
                    </View>

                    <View style={styles.cardFooter}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.gameName} numberOfLines={1}>{item.game_name}</Text>
                            <View style={styles.metaRow}>
                                <Ionicons name={item.is_local ? "phone-portrait-outline" : "globe-outline"} size={12} color="#888" />
                                <Text style={styles.metaText}>{item.is_local ? " Local" : " Online"}</Text>
                                {isHost && (
                                    <View style={styles.hostIndicator}>
                                        <Text style={styles.hostIndicatorText}>HOST</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </View>
                </TouchableOpacity>

                {/* DELETE ICON (Visible only to Host) */}
                {isHost && (
                    <TouchableOpacity
                        style={styles.deleteIconBtn}
                        onPress={() => handleDeleteGame(item.id, item.game_name)}
                    >
                        <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.container}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerLabel}>Intelligence Brief</Text>
                        <Text style={styles.headerTitle}>Operations</Text>
                    </View>
                    <TouchableOpacity onPress={onCreatePress} style={styles.addBtn}>
                        <Ionicons name="add" size={28} color="#fff" />
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>
                ) : (
                    <FlatList
                        data={games}
                        keyExtractor={(item) => item.id}
                        renderItem={renderGameItem}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={() => fetchUserGames(userId)} tintColor="#000" />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="document-text-outline" size={60} color="#f0f0f0" />
                                <Text style={styles.emptyTitle}>No Missions Yet</Text>
                                <Text style={styles.emptySub}>Create an operation to begin.</Text>
                                <TouchableOpacity style={styles.emptyBtn} onPress={onCreatePress}>
                                    <Text style={styles.emptyBtnText}>New Operation</Text>
                                </TouchableOpacity>
                            </View>
                        }
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#fff' },
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 25,
        paddingTop: Platform.OS === 'android' ? 15 : 10,
        paddingBottom: 20
    },
    headerLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 },
    headerTitle: { fontSize: 32, fontWeight: '900', color: '#000', letterSpacing: -1 },
    addBtn: { backgroundColor: '#000', width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    cardWrapper: { position: 'relative', marginBottom: 20 },
    gameCard: {
        backgroundColor: '#fff', borderRadius: 24,
        borderWidth: 1, borderColor: '#f0f0f0', overflow: 'hidden',
        elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12
    },
    deleteIconBtn: {
        position: 'absolute',
        top: 15,
        left: 15,
        backgroundColor: 'rgba(255,255,255,0.9)',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10
    },
    cardImage: { width: '100%', height: 180 },
    placeholderContainer: { backgroundColor: '#f9f9f9', justifyContent: 'center', alignItems: 'center' },
    cardOverlay: { position: 'absolute', top: 15, right: 15 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    activeBadge: { backgroundColor: '#E8F5E9' },
    lobbyBadge: { backgroundColor: '#FFF3E0' },
    statusText: { fontSize: 10, fontWeight: '900', color: '#444' },
    cardFooter: { padding: 20, flexDirection: 'row', alignItems: 'center' },
    gameName: { fontSize: 20, fontWeight: '800', color: '#000', marginBottom: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center' },
    metaText: { fontSize: 13, color: '#888', fontWeight: '500' },
    hostIndicator: { backgroundColor: '#000', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 10 },
    hostIndicatorText: { color: '#fff', fontSize: 9, fontWeight: '900' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 22, fontWeight: '900', marginTop: 15 },
    emptySub: { fontSize: 15, color: '#aaa', textAlign: 'center', marginTop: 10, lineHeight: 22 },
    emptyBtn: { marginTop: 30, backgroundColor: '#000', paddingHorizontal: 35, paddingVertical: 18, borderRadius: 20 },
    emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 }
});