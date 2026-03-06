import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    Alert
} from 'react-native';
import { supabase } from '../supabase';
import GameQR from '../components/GameQR';

export default function HostGame({ userId, onBack, onGameCreated }) {
    const [packs, setPacks] = useState([]);
    const [selectedPack, setSelectedPack] = useState(null);
    const [gameId, setGameId] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchPacks();
    }, []);

    async function fetchPacks() {
        setLoading(true);
        console.log("DEBUG: Fetching mission packs from Supabase...");

        // 1. Check connection and fetch data
        const { data, error } = await supabase
            .from('card_packs')
            .select('*');

        if (error) {
            console.error("DEBUG ERROR:", error.message);
            Alert.alert("Database Error", error.message);
        } else {
            console.log("DEBUG SUCCESS: Packs found in DB:", data.length);
            setPacks(data);
        }
        setLoading(false);
    }

    async function createGame(pack) {
        setLoading(true);
        // This creates the game session based on the Storyboard logic
        const { data, error } = await supabase
            .from('games')
            .insert([{
                host_id: userId,
                pack_id: pack.id,
                status: 'lobby'
            }])
            .select()
            .single();

        if (error) {
            Alert.alert("Error Creating Game", error.message);
        } else {
            setGameId(data.id);
            setSelectedPack(pack);
        }
        setLoading(false);
    }

    // VIEW 2: Show QR Code once game is created
    if (gameId) {
        return (
            <View style={styles.container}>
                <GameQR gameId={gameId} gameName={selectedPack.name} />

                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>Step 1: Invite Friends</Text>
                    <Text style={styles.infoText}>Have your friends scan the code above to join the lobby.</Text>
                </View>

                <TouchableOpacity
                    style={styles.mainButton}
                    onPress={() => onGameCreated(gameId)}
                >
                    <Text style={styles.buttonText}>Open Lobby List</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setGameId(null)} style={styles.cancelLink}>
                    <Text style={{ color: 'red' }}>Cancel and Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // VIEW 1: Mission Pack Selection (Storyboard Screen 12-14)
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Select a Mission Pack</Text>

            {loading ? (
                <ActivityIndicator size="large" color="#000" />
            ) : (
                <FlatList
                    data={packs}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.packCard} onPress={() => createGame(item)}>
                            <Text style={styles.packName}>{item.name}</Text>
                            <Text style={styles.packDesc}>{item.description}</Text>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No Mission Packs found.</Text>
                            <Text style={styles.emptySub}>Check your Supabase 'card_packs' table!</Text>
                            <TouchableOpacity onPress={fetchPacks} style={styles.retryBtn}>
                                <Text>Retry Fetch</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            <TouchableOpacity onPress={onBack} style={styles.backButton}>
                <Text style={styles.backText}>← Back to Menu</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 25, marginTop: 40, letterSpacing: -1 },
    packCard: {
        padding: 25,
        borderWidth: 2,
        borderRadius: 16,
        marginBottom: 15,
        borderColor: '#000',
        backgroundColor: '#fff'
    },
    packName: { fontSize: 20, fontWeight: 'bold' },
    packDesc: { color: '#666', marginTop: 5, fontSize: 14 },
    mainButton: { backgroundColor: '#000', padding: 20, borderRadius: 12, alignItems: 'center', marginTop: 20 },
    buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    infoBox: { padding: 20, backgroundColor: '#f0f0f0', borderRadius: 12, marginVertical: 20 },
    infoTitle: { fontWeight: 'bold', marginBottom: 5 },
    infoText: { color: '#444' },
    cancelLink: { alignSelf: 'center', marginTop: 20 },
    backButton: { padding: 20, alignItems: 'center', marginTop: 10 },
    backText: { fontWeight: '600', color: '#666' },
    empty: { marginTop: 50, alignItems: 'center' },
    emptyText: { fontSize: 18, fontWeight: 'bold' },
    emptySub: { color: '#999', marginTop: 5 },
    retryBtn: { marginTop: 20, padding: 10, borderWidth: 1, borderRadius: 8 }
});