import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    Image, ActivityIndicator, RefreshControl, Platform, StatusBar, Alert, Dimensions, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../supabase';
import ProfileScreen from './ProfileScreen';

const screenWidth = Dimensions.get("window").width;

// --- SUB-COMPONENT: LIVE TIMER ---
const GameTimer = ({ endTime, onExpire }) => {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const calculateTime = () => {
            const now = new Date().getTime();
            const end = new Date(endTime).getTime();
            const distance = end - now;

            if (distance <= 0) {
                setTimeLeft("EXPIRED");
                if (onExpire) onExpire(); 
                return;
            }

            const hours = Math.floor(distance / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    }, [endTime]);

    return (
        <View style={[styles.timerBadge, timeLeft === "EXPIRED" && styles.expiredBadge]}>
            <Ionicons name="time-outline" size={12} color="#fff" />
            <Text style={styles.timerText}>{timeLeft}</Text>
        </View>
    );
};

export default function HomeScreen({ onCreatePress, onJoinGame }) {
    const [activeTab, setActiveTab] = useState('home'); 
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [userId, setUserId] = useState(null);

    // Scanner State
    const [permission, requestPermission] = useCameraPermissions();
    const [isScannerVisible, setScannerVisible] = useState(false);
    const [scanned, setScanned] = useState(false);

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

    const handleAutoArchive = async (gameId) => {
        await supabase
            .from('games')
            .update({ status: 'completed' })
            .eq('id', gameId)
            .eq('status', 'active'); 
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

    const handleDeleteGame = async (gameId, gameName) => {
        Alert.alert(
            "Terminate Operation?",
            `Are you sure you want to delete "${gameName}"?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const { error } = await supabase.from('games').delete().eq('id', gameId);
                            if (error) throw error;
                            setGames(prev => prev.filter(g => g.id !== gameId));
                        } catch (err) {
                            Alert.alert("Error", "Could not delete game.");
                        }
                    }
                }
            ]
        );
    };

    // --- SCANNER LOGIC ---
    const openScanner = async () => {
        if (!permission?.granted) {
            const { granted } = await requestPermission();
            if (!granted) {
                return Alert.alert("Permission Required", "Camera access is needed to scan Operation codes.");
            }
        }
        setScanned(false);
        setScannerVisible(true);
    };

    const handleBarCodeScanned = async ({ type, data }) => {
        if (scanned) return; // Prevent rapid-fire scanning
        setScanned(true);
        
        try {
            // 1. Validate that the QR code is an actual game in the database
            const { data: game, error: gameErr } = await supabase.from('games').select('*').eq('id', data).single();
            if (gameErr || !game) throw new Error("Invalid or expired Operation Code.");
            if (game.status !== 'lobby') throw new Error("This Operation has already begun or ended.");

            // 2. CHECK IF ALREADY JOINED
            const { data: existingParticipant } = await supabase
                .from('game_participants')
                .select('id')
                .eq('game_id', data)
                .eq('user_id', userId)
                .maybeSingle();

            if (existingParticipant) {
                setScannerVisible(false);
                Alert.alert("Already Joined", "You are already in this Operation.");
                onJoinGame(data, 'lobby', game.host_id);
                return;
            }

            // 3. Insert the user into the game
            const { error: insertErr } = await supabase.from('game_participants').insert([{
                game_id: data,
                user_id: userId,
                is_ready: false
            }]);

            if (insertErr) throw insertErr;

            // 4. Close scanner and route them into the lobby!
            setScannerVisible(false);
            onJoinGame(data, 'lobby', game.host_id);
            
        } catch (err) {
            Alert.alert("Scan Failed", err.message || "Could not join the Operation.");
            // Reset the scanner after a short delay so they can try again
            setTimeout(() => setScanned(false), 2000); 
        }
    };

    const renderGameItem = ({ item }) => {
        const isHost = item.host_id === userId;
        const isExpired = new Date(item.end_time).getTime() < new Date().getTime();
        const displayStatus = (item.status === 'completed' || (item.status === 'active' && isExpired)) 
            ? 'completed' 
            : (item.status || 'lobby');

        return (
            <View style={styles.cardWrapper}>
                <TouchableOpacity
                    style={styles.gameCard}
                    onPress={() => onJoinGame(item.id, displayStatus === 'active' ? 'play' : displayStatus === 'completed' ? 'debrief' : 'lobby', item.host_id)}
                >
                    {item.cover_image ? (
                        <Image source={{ uri: item.cover_image }} style={styles.cardImage} />
                    ) : (
                        <View style={[styles.cardImage, styles.placeholderContainer]}>
                            <Ionicons name="map-outline" size={40} color="#ccc" />
                        </View>
                    )}

                    <View style={styles.cardOverlay}>
                        {displayStatus === 'active' && (
                            <GameTimer 
                                endTime={item.end_time} 
                                onExpire={() => handleAutoArchive(item.id)} 
                            />
                        )}
                        
                        <View style={[
                            styles.statusBadge, 
                            displayStatus === 'active' ? styles.activeBadge : 
                            displayStatus === 'completed' ? styles.completedBadge : styles.lobbyBadge
                        ]}>
                            <Text style={[styles.statusText, displayStatus === 'completed' && styles.completedText]}>
                                {displayStatus.toUpperCase()}
                            </Text>
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

    const renderContent = () => {
        if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;

        switch (activeTab) {
            case 'packs':
                return <View style={styles.center}><Ionicons name="layers" size={60} color="#eee" /><Text style={styles.comingSoon}>Mission Packs Coming Soon</Text></View>;
            case 'achievements':
                return <View style={styles.center}><Ionicons name="trophy" size={60} color="#eee" /><Text style={styles.comingSoon}>Awards Coming Soon</Text></View>;
            case 'profile':
                return <ProfileScreen />;
            default:
                return (
                    <FlatList
                        data={games}
                        keyExtractor={(item) => item.id}
                        renderItem={renderGameItem}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchUserGames(userId)} tintColor="#000" />}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="document-text-outline" size={60} color="#f0f0f0" />
                                <Text style={styles.emptyTitle}>No Missions Yet</Text>
                                <Text style={styles.emptySub}>Create an operation to begin.</Text>
                            </View>
                        }
                    />
                );
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.container}>
                
                {activeTab === 'home' && (
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.headerLabel}>Intelligence Brief</Text>
                            <Text style={styles.headerTitle}>Operations</Text>
                        </View>
                        <View style={styles.headerActions}>
                            <TouchableOpacity onPress={openScanner} style={styles.scanBtn}>
                                <Ionicons name="qr-code-outline" size={24} color="#000" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onCreatePress} style={styles.addBtn}>
                                <Ionicons name="add" size={28} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <View style={styles.content}>
                    {renderContent()}
                </View>

                <View style={styles.navBar}>
                    <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('home')}>
                        <Ionicons name={activeTab === 'home' ? "home" : "home-outline"} size={22} color={activeTab === 'home' ? "#000" : "#aaa"} />
                        <Text style={[styles.navText, activeTab === 'home' && styles.navTextActive]}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('packs')}>
                        <Ionicons name={activeTab === 'packs' ? "layers" : "layers-outline"} size={22} color={activeTab === 'packs' ? "#000" : "#aaa"} />
                        <Text style={[styles.navText, activeTab === 'packs' && styles.navTextActive]}>Packs</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('achievements')}>
                        <Ionicons name={activeTab === 'achievements' ? "trophy" : "trophy-outline"} size={22} color={activeTab === 'achievements' ? "#000" : "#aaa"} />
                        <Text style={[styles.navText, activeTab === 'achievements' && styles.navTextActive]}>Awards</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('profile')}>
                        <Ionicons name={activeTab === 'profile' ? "person" : "person-outline"} size={22} color={activeTab === 'profile' ? "#000" : "#aaa"} />
                        <Text style={[styles.navText, activeTab === 'profile' && styles.navTextActive]}>Profile</Text>
                    </TouchableOpacity>
                </View>

                {/* SCANNER MODAL */}
                <Modal visible={isScannerVisible} animationType="slide" transparent={false}>
                    <View style={styles.scannerContainer}>
                        {isScannerVisible && permission?.granted && (
                            <CameraView 
                                style={StyleSheet.absoluteFillObject} 
                                facing="back"
                                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                            />
                        )}
                        
                        {/* Scanner UI Overlay */}
                        <SafeAreaView style={styles.scannerOverlay}>
                            <View style={styles.scannerHeader}>
                                <TouchableOpacity onPress={() => setScannerVisible(false)} style={styles.scannerCloseBtn}>
                                    <Ionicons name="close" size={30} color="#fff" />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.scannerTargetArea}>
                                <View style={styles.targetBox} />
                                <Text style={styles.scannerInstruction}>Scan an Operation Code to join</Text>
                            </View>
                        </SafeAreaView>
                    </View>
                </Modal>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#fff' },
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, paddingTop: 10, paddingBottom: 15 },
    headerLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 },
    headerTitle: { fontSize: 32, fontWeight: '900', color: '#000', letterSpacing: -1 },
    
    headerActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    scanBtn: { backgroundColor: '#f0f0f0', width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    addBtn: { backgroundColor: '#000', width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    
    content: { flex: 1 },
    list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 },
    cardWrapper: { position: 'relative', marginBottom: 20 },
    gameCard: { backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#f0f0f0', overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
    deleteIconBtn: { position: 'absolute', bottom: 100, right: 15, backgroundColor: 'rgba(255,255,255,0.9)', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 1, borderColor: '#eee' },
    cardImage: { width: '100%', height: 180 },
    placeholderContainer: { backgroundColor: '#f9f9f9', justifyContent: 'center', alignItems: 'center' },
    cardOverlay: { position: 'absolute', top: 15, right: 15, flexDirection: 'row', gap: 8, alignItems: 'center' },
    timerBadge: { backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
    expiredBadge: { backgroundColor: 'rgba(255, 59, 48, 0.8)' },
    timerText: { color: '#fff', fontSize: 11, fontWeight: '900' },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    activeBadge: { backgroundColor: '#E8F5E9' },
    lobbyBadge: { backgroundColor: '#FFF3E0' },
    completedBadge: { backgroundColor: '#F5F5F5' },
    statusText: { fontSize: 10, fontWeight: '900', color: '#444' },
    completedText: { color: '#aaa' },
    cardFooter: { padding: 20, flexDirection: 'row', alignItems: 'center' },
    gameName: { fontSize: 20, fontWeight: '800', color: '#000', marginBottom: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center' },
    metaText: { fontSize: 13, color: '#888', fontWeight: '500' },
    hostIndicator: { backgroundColor: '#000', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 10 },
    hostIndicatorText: { color: '#fff', fontSize: 9, fontWeight: '900' },
    
    navBar: { flexDirection: 'row', backgroundColor: '#fff', paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 25 : 15, borderTopWidth: 1, borderTopColor: '#f0f0f0', justifyContent: 'space-around', alignItems: 'center' },
    navItem: { alignItems: 'center', gap: 4 },
    navText: { fontSize: 10, fontWeight: '800', color: '#aaa' },
    navTextActive: { color: '#000' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    comingSoon: { marginTop: 15, color: '#ccc', fontWeight: '700' },
    emptyContainer: { alignItems: 'center', marginTop: 50, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 20, fontWeight: '900', marginTop: 15 },
    emptySub: { fontSize: 14, color: '#aaa', textAlign: 'center', marginTop: 10 },

    // Scanner Styles
    scannerContainer: { flex: 1, backgroundColor: '#000' },
    scannerOverlay: { flex: 1, justifyContent: 'space-between' },
    scannerHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 20 },
    scannerCloseBtn: { width: 44, height: 44, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    scannerTargetArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    targetBox: { width: 250, height: 250, borderWidth: 2, borderColor: '#fff', borderRadius: 20, backgroundColor: 'transparent' },
    scannerInstruction: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 30, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 }
});