import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
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
        const { data } = await supabase.from('card_packs').select('*');
        if (data) setPacks(data);
    }

    async function createGame(pack) {
        setLoading(true);
        const { data, error } = await supabase
            .from('games')
            .insert([{ host_id: userId, pack_id: pack.id, status: 'lobby' }])
            .select()
            .single();

        if (error) {
            alert(error.message);
        } else {
            setGameId(data.id);
            setSelectedPack(pack);
        }
        setLoading(false);
    }

    if (gameId) {
        return (
            <View style={styles.container}>
                <GameQR gameId={gameId} gameName={selectedPack.name} />
                <TouchableOpacity
                    style={styles.mainButton}
                    onPress={() => onGameCreated(gameId)}
                >
                    <Text style={styles.buttonText}>Enter Lobby</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Select a Mission Pack</Text>
            {loading ? <ActivityIndicator size="large" color="#000" /> : (
                <FlatList
                    data={packs}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.packCard} onPress={() => createGame(item)}>
                            <Text style={styles.packName}>{item.name}</Text>
                            <Text style={styles.packDesc}>{item.description}</Text>
                        </TouchableOpacity>
                    )}
                />
            )}
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
                <Text>Cancel</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, marginTop: 40 },
    packCard: { padding: 20, borderWidth: 1, borderRadius: 12, marginBottom: 15, borderColor: '#eee' },
    packName: { fontSize: 18, fontWeight: 'bold' },
    packDesc: { color: '#666' },
    mainButton: { backgroundColor: '#000', padding: 18, borderRadius: 10, alignItems: 'center' },
    buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    backButton: { padding: 20, alignItems: 'center' }
});