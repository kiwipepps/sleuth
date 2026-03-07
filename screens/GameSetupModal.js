import React, { useState } from 'react';
import {
    Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, Image, Switch, Alert, SafeAreaView, FlatList
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import MissionPackModal from './MissionPackModal';

export default function GameSetupModal({ visible, onClose, onCreated, userId }) {
    // --- Form State ---
    const [step, setStep] = useState(1); // 1: Settings, 2: Local Player Entry
    const [gameName, setGameName] = useState('');
    const [image, setImage] = useState(null);
    const [isLocal, setIsLocal] = useState(false);
    const [missionCount, setMissionCount] = useState('3');
    const [calloutCount, setCalloutCount] = useState('2');
    const [selectedPack, setSelectedPack] = useState(null);
    const [endDate, setEndDate] = useState(new Date());

    // --- Local Players State ---
    const [localPlayers, setLocalPlayers] = useState(['', '']); // Start with 2 empty slots

    // --- UI Helpers ---
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [isPackModalVisible, setPackModalVisible] = useState(false);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.5,
        });
        if (!result.canceled) setImage(result.assets[0].uri);
    };

    const addPlayerSlot = () => setLocalPlayers([...localPlayers, '']);

    const updatePlayerName = (text, index) => {
        const updated = [...localPlayers];
        updated[index] = text;
        setLocalPlayers(updated);
    };

    const handleNext = () => {
        if (!gameName || !selectedPack) {
            return Alert.alert("Required", "Please name your game and pick a mission pack.");
        }
        if (isLocal) setStep(2);
        else finalizeGame();
    };

    const finalizeGame = async () => {
        try {
            // 1. Create the Game
            const { data: game, error } = await supabase.from('games').insert([{
                host_id: userId,
                game_name: gameName,
                cover_image: image,
                is_local: isLocal,
                end_time: endDate.toISOString(),
                pack_id: selectedPack.id,
                mission_limit: parseInt(missionCount),
                callout_limit: parseInt(calloutCount),
                status: 'lobby'
            }]).select().single();

            if (error) throw error;

            // 2. If Local, Add the manual names to participants
            if (isLocal) {
                const participantEntries = localPlayers
                    .filter(name => name.trim() !== '')
                    .map(name => ({ game_id: game.id, manual_name: name }));

                await supabase.from('game_participants').insert(participantEntries);
            }

            onCreated(game);
            resetForm();
        } catch (e) {
            Alert.alert("Error", e.message);
        }
    };

    const resetForm = () => {
        setStep(1);
        setGameName('');
        setLocalPlayers(['', '']);
        setIsLocal(false);
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
            <SafeAreaView style={styles.container}>
                {/* HEADER */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={step === 1 ? onClose : () => setStep(1)}>
                        <Ionicons name={step === 1 ? "close" : "arrow-back"} size={28} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{step === 1 ? "New Operation" : "Identify Agents"}</Text>
                    <TouchableOpacity onPress={step === 1 ? handleNext : finalizeGame}>
                        <Text style={styles.saveBtn}>{step === 1 ? (isLocal ? "Next" : "Create") : "Start"}</Text>
                    </TouchableOpacity>
                </View>

                {step === 1 ? (
                    <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
                        {/* Cover Photo */}
                        <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                            {image ? <Image source={{ uri: image }} style={styles.preview} /> :
                                <View style={styles.imagePlaceholder}>
                                    <Ionicons name="camera-outline" size={40} color="#ccc" />
                                    <Text style={styles.placeholderText}>Add Cover Photo</Text>
                                </View>}
                        </TouchableOpacity>

                        <Text style={styles.label}>Operation Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. The Cotswolds Heist"
                            value={gameName}
                            onChangeText={setGameName}
                        />

                        <View style={styles.row}>
                            <View>
                                <Text style={styles.rowTitle}>Local Game</Text>
                                <Text style={styles.rowSub}>Pass-and-play on this device</Text>
                            </View>
                            <Switch
                                value={isLocal}
                                onValueChange={setIsLocal}
                                trackColor={{ false: "#ddd", true: "#000" }}
                            />
                        </View>

                        <Text style={styles.label}>Selected Intelligence</Text>
                        <TouchableOpacity style={styles.packSelector} onPress={() => setPackModalVisible(true)}>
                            <Text style={selectedPack ? styles.packText : styles.packPlaceholder}>
                                {selectedPack ? selectedPack.name : "Choose a Mission Pack..."}
                            </Text>
                            <Ionicons name="layers-outline" size={20} color={selectedPack ? "#000" : "#ccc"} />
                        </TouchableOpacity>

                        <View style={styles.statsRow}>
                            <View style={styles.statBox}>
                                <Text style={styles.label}>Missions</Text>
                                <TextInput style={styles.smallInput} keyboardType="numeric" value={missionCount} onChangeText={setMissionCount} />
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.label}>Callouts</Text>
                                <TextInput style={styles.smallInput} keyboardType="numeric" value={calloutCount} onChangeText={setCalloutCount} />
                            </View>
                        </View>

                        <Text style={styles.label}>Mission Deadline</Text>
                        <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
                            <Text style={{ fontSize: 16 }}>{endDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
                        </TouchableOpacity>

                        {showDatePicker && (
                            <DateTimePicker
                                value={endDate}
                                mode="datetime"
                                display="spinner"
                                onChange={(e, date) => { setShowDatePicker(false); if (date) setEndDate(date); }}
                            />
                        )}

                        <View style={{ height: 50 }} />
                    </ScrollView>
                ) : (
                    <View style={styles.form}>
                        <Text style={styles.stepTitle}>Enter Agent Names</Text>
                        <Text style={styles.stepSub}>These players will share this device to see their missions.</Text>

                        <FlatList
                            data={localPlayers}
                            keyExtractor={(_, index) => index.toString()}
                            renderItem={({ item, index }) => (
                                <TextInput
                                    style={styles.playerInput}
                                    placeholder={`Agent ${index + 1} Name`}
                                    value={item}
                                    onChangeText={(text) => updatePlayerName(text, index)}
                                    autoFocus={index === localPlayers.length - 1}
                                />
                            )}
                            ListFooterComponent={
                                <TouchableOpacity style={styles.addPlayerBtn} onPress={addPlayerSlot}>
                                    <Ionicons name="add-circle-outline" size={20} color="#666" />
                                    <Text style={styles.addPlayerText}>Add Another Agent</Text>
                                </TouchableOpacity>
                            }
                        />
                    </View>
                )}

                <MissionPackModal
                    visible={isPackModalVisible}
                    onClose={() => setPackModalVisible(false)}
                    onSelect={(pack) => setSelectedPack(pack)}
                />
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', padding: 20,
        alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f0f0'
    },
    headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
    saveBtn: { color: '#000', fontWeight: '900', fontSize: 16 },
    form: { padding: 25, flex: 1 },
    imagePicker: {
        width: '100%', height: 200, backgroundColor: '#f5f5f5',
        borderRadius: 20, marginBottom: 25, overflow: 'hidden',
        borderWidth: 1, borderColor: '#eee', borderStyle: 'dashed'
    },
    preview: { width: '100%', height: '100%' },
    imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    placeholderText: { marginTop: 10, color: '#aaa', fontWeight: '500' },
    label: { fontSize: 13, fontWeight: '700', color: '#999', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    input: {
        width: '100%', backgroundColor: '#f9f9f9', padding: 18,
        borderRadius: 15, marginBottom: 25, fontSize: 16, fontWeight: '500'
    },
    row: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 30, backgroundColor: '#f9f9f9',
        padding: 15, borderRadius: 15
    },
    rowTitle: { fontSize: 16, fontWeight: '700' },
    rowSub: { fontSize: 12, color: '#888' },
    packSelector: {
        flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f9f9f9',
        padding: 18, borderRadius: 15, marginBottom: 25, alignItems: 'center',
        borderWidth: 1, borderColor: '#eee'
    },
    packText: { fontSize: 16, fontWeight: '700', color: '#000' },
    packPlaceholder: { fontSize: 16, color: '#ccc' },
    statsRow: { flexDirection: 'row', gap: 15, marginBottom: 25 },
    statBox: { flex: 1 },
    smallInput: {
        backgroundColor: '#f9f9f9', padding: 18, borderRadius: 15,
        textAlign: 'center', fontSize: 20, fontWeight: '800'
    },
    stepTitle: { fontSize: 28, fontWeight: '900', marginBottom: 10 },
    stepSub: { fontSize: 16, color: '#666', marginBottom: 30 },
    playerInput: {
        backgroundColor: '#f9f9f9', padding: 18, borderRadius: 15,
        marginBottom: 12, fontSize: 16, fontWeight: '600'
    },
    addPlayerBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        padding: 20, gap: 8
    },
    addPlayerText: { color: '#666', fontWeight: '600' }
});