import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function DebriefScreen({ gameId, onBack }) {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchResults = async () => {
            try {
                // 1. Check if the game is local or online
                const { data: game } = await supabase
                    .from('games')
                    .select('is_local')
                    .eq('id', gameId)
                    .single();

                // 2. Fetch participants WITH their profile data for online mode
                const { data } = await supabase
                    .from('game_participants')
                    .select(`
                        manual_name, 
                        profiles(username),
                        user_missions(completed)
                    `)
                    .eq('game_id', gameId);

                if (data) {
                    // 3. Process and map the correct names based on game mode
                    const processed = data.map(p => ({
                        // FIX: Dynamically assign name based on game type
                        name: game?.is_local 
                            ? (p.manual_name || 'Unknown Agent') 
                            : (p.profiles?.username || 'Unknown Agent'),
                        score: p.user_missions?.filter(m => m.completed).length || 0,
                        total: p.user_missions?.length || 0
                    })).sort((a, b) => b.score - a.score);
                    
                    setResults(processed);
                }
            } catch (error) {
                console.error("Error fetching debrief:", error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchResults();
    }, [gameId]);

    if (loading) return <View style={styles.center}><ActivityIndicator color="#000" /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerLabel}>Operation Concluded</Text>
                    <Text style={styles.headerTitle}>Intelligence Debrief</Text>
                </View>
                <TouchableOpacity onPress={onBack} style={styles.closeBtn}>
                    <Ionicons name="close" size={28} color="#000" />
                </TouchableOpacity>
            </View>

            <FlatList
                data={results}
                keyExtractor={(_, index) => index.toString()}
                contentContainerStyle={{ padding: 20 }}
                renderItem={({ item, index }) => (
                    <View style={styles.card}>
                        <View style={styles.rankBadge}>
                            <Text style={styles.rankText}>{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.name}>{item.name}</Text>
                            <Text style={styles.subText}>{item.score} / {item.total} Objectives Met</Text>
                        </View>
                        <View style={styles.scoreContainer}>
                            <Text style={styles.percentage}>
                                {item.total > 0 ? Math.round((item.score / item.total) * 100) : 0}%
                            </Text>
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    <View style={styles.center}>
                        <Text style={styles.subText}>No agent intelligence found for this operation.</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 25, alignItems: 'center' },
    headerLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', textTransform: 'uppercase' },
    headerTitle: { fontSize: 28, fontWeight: '900', color: '#000', letterSpacing: -1 },
    closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
    card: { 
        flexDirection: 'row', 
        padding: 20, 
        backgroundColor: '#f9f9f9', 
        borderRadius: 20, 
        marginBottom: 12, 
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#eee'
    },
    rankBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    rankText: { color: '#fff', fontWeight: '900', fontSize: 14 },
    name: { fontSize: 18, fontWeight: '800', color: '#000' },
    subText: { fontSize: 13, color: '#888', marginTop: 2 },
    scoreContainer: { alignItems: 'flex-end' },
    percentage: { fontSize: 20, fontWeight: '900', color: '#4CAF50' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }
});