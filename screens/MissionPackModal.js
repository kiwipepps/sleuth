import React, { useState, useEffect } from 'react';
import {
    Modal, View, Text, FlatList, StyleSheet,
    TouchableOpacity, TextInput, Image, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function MissionPackModal({ visible, onClose, onSelect }) {
    const [packs, setPacks] = useState([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (visible) fetchPacks();
    }, [visible]);

    async function fetchPacks() {
        const { data } = await supabase.from('mission_packs').select('*');
        if (data) setPacks(data);
    }

    const filteredPacks = packs.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Select Intel Pack</Text>
                    <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={30} color="#ccc" /></TouchableOpacity>
                </View>

                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color="#999" />
                    <TextInput
                        placeholder="Search packs..."
                        style={styles.searchInput}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>

                <FlatList
                    data={filteredPacks}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 20 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.packCard}
                            onPress={() => {
                                onSelect(item);
                                onClose();
                            }}
                        >
                            <View style={styles.packInfo}>
                                <Text style={styles.packName}>{item.name}</Text>
                                <Text style={styles.packDesc} numberOfLines={2}>{item.description}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#000" />
                        </TouchableOpacity>
                    )}
                />
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 25, alignItems: 'center' },
    title: { fontSize: 24, fontWeight: '900' },
    searchBar: {
        flexDirection: 'row', backgroundColor: '#F0F0F0', marginHorizontal: 25,
        padding: 15, borderRadius: 12, alignItems: 'center', gap: 10
    },
    searchInput: { flex: 1, fontSize: 16 },
    packCard: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
        padding: 20, borderRadius: 20, marginBottom: 15,
        borderWidth: 1, borderColor: '#eee', shadowColor: '#000', shadowOpacity: 0.05
    },
    packInfo: { flex: 1 },
    packName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    packDesc: { color: '#666', fontSize: 14 }
});