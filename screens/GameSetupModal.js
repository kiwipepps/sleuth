import React, { useState, useRef } from 'react';
import {
    Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, Image, Switch, Alert, KeyboardAvoidingView, Platform, StatusBar
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../supabase';
import MissionPackModal from './MissionPackModal';

export default function GameSetupModal({ visible, onClose, onCreated, userId }) {
    const insets = useSafeAreaInsets(); // Precise notch height calculation
    const scrollRef = useRef(null);
    
    // FORM STATES
    const [step, setStep] = useState(1);
    const [gameName, setGameName] = useState('');
    const [image, setImage] = useState(null);
    const [isLocal, setIsLocal] = useState(false);
    const [missionCount, setMissionCount] = useState(3);
    const [calloutCount, setCalloutCount] = useState(2);
    const [selectedPack, setSelectedPack] = useState(null);
    const [endDate, setEndDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const [localPlayers, setLocalPlayers] = useState(['', '']);
    const [loading, setLoading] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [isPackModalVisible, setPackModalVisible] = useState(false);

    const selectionRange = [1, 2, 3, 4, 5];

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], 
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.5,
            base64: true,
        });
        if (!result.canceled) setImage(result.assets[0]);
    };

    // RESTORED: Scroll-to-bottom logic for Deadline
    const toggleDatePicker = () => {
        const nextState = !showDatePicker;
        setShowDatePicker(nextState);
        if (nextState) {
            setTimeout(() => {
                scrollRef.current?.scrollToEnd({ animated: true });
            }, 150);
        }
    };

    const uploadCoverImage = async (asset) => {
        try {
            const fileExt = asset.uri.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `covers/${userId}/${fileName}`;
            const { error: uploadError } = await supabase.storage
                .from('game-covers')
                .upload(filePath, decode(asset.base64), {
                    contentType: `image/${fileExt}`,
                    upsert: true
                });
            if (uploadError) throw uploadError;
            const { data } = supabase.storage.from('game-covers').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (error) {
            return null;
        }
    };

    const handleNext = () => {
        if (!gameName || !selectedPack) return Alert.alert("Required", "Please name your game and pick a mission pack.");
        if (isLocal) setStep(2);
        else finalizeGame();
    };

    const finalizeGame = async () => {
        setLoading(true);
        try {
            let publicImageUrl = image ? await uploadCoverImage(image) : null;
            const { data: game, error: gameError } = await supabase.from('games').insert([{
                host_id: userId,
                game_name: gameName,
                cover_image: publicImageUrl,
                is_local: isLocal,
                end_time: endDate.toISOString(),
                pack_id: selectedPack.id,
                mission_limit: missionCount,
                callout_limit: calloutCount,
                status: isLocal ? 'active' : 'lobby'
            }]).select().single();

            if (gameError) throw gameError;

            if (isLocal) {
                const participantEntries = localPlayers.filter(name => name.trim() !== '').map(name => ({ game_id: game.id, manual_name: name }));
                const { data: participants } = await supabase.from('game_participants').insert(participantEntries).select();
                const { data: missionPool } = await supabase.from('mission_library').select('id').eq('pack_id', selectedPack.id);

                const assignmentPromises = participants.map(participant => {
                    const shuffled = [...missionPool].sort(() => 0.5 - Math.random());
                    const selected = shuffled.slice(0, missionCount);
                    const missionEntries = selected.map(m => ({
                        game_id: game.id,
                        participant_id: participant.id,
                        mission_id: m.id,
                        completed: false 
                    }));
                    return supabase.from('user_missions').insert(missionEntries);
                });
                await Promise.all(assignmentPromises);
                onCreated(game.id, 'local-reveal', userId);
            } else {
                await supabase.from('game_participants').insert([{ game_id: game.id, user_id: userId }]);
                onCreated(game.id, 'lobby', userId);
            }
            resetForm();
        } catch (e) {
            Alert.alert("Error", e.message);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setStep(1); setGameName(''); setImage(null); setLocalPlayers(['', '']); setIsLocal(false); 
        setEndDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
        onClose();
    };

    const updatePlayerName = (text, index) => {
        const updated = [...localPlayers];
        updated[index] = text;
        setLocalPlayers(updated);
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
            {/* CONTAINER WITH TOP INSET FIX */}
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <StatusBar barStyle="dark-content" />
                
                <View style={styles.headerWrapper}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={step === 1 ? onClose : () => setStep(1)} style={styles.touchArea}>
                            <Ionicons name={step === 1 ? "close" : "arrow-back"} size={28} color="#000" />
                        </TouchableOpacity>
                        
                        <Text style={styles.headerTitle}>{step === 1 ? "New Operation" : "Identify Agents"}</Text>
                        
                        <TouchableOpacity onPress={step === 1 ? handleNext : finalizeGame} disabled={loading} style={styles.touchArea}>
                            <Text style={styles.saveBtn}>
                                {loading ? "..." : (step === 1 ? (isLocal ? "Next" : "Create") : "Start")}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                    style={{ flex: 1 }}
                >
                    <ScrollView 
                        ref={scrollRef} 
                        style={styles.form} 
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 100 }}
                    >
                        {step === 1 ? (
                            <>
                                <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                                    {image ? <Image source={{ uri: image.uri }} style={styles.preview} /> :
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
                                        <View style={styles.selectorGrid}>
                                            {selectionRange.map((num) => (
                                                <TouchableOpacity 
                                                    key={num} 
                                                    style={[styles.selectorItem, missionCount === num && styles.selectorItemActive]}
                                                    onPress={() => setMissionCount(num)}
                                                >
                                                    <Text style={[styles.selectorText, missionCount === num && styles.selectorTextActive]}>{num}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                    <View style={styles.statBox}>
                                        <Text style={styles.label}>Callouts</Text>
                                        <View style={styles.selectorGrid}>
                                            {selectionRange.map((num) => (
                                                <TouchableOpacity 
                                                    key={num} 
                                                    style={[styles.selectorItem, calloutCount === num && styles.selectorItemActive]}
                                                    onPress={() => setCalloutCount(num)}
                                                >
                                                    <Text style={[styles.selectorText, calloutCount === num && styles.selectorTextActive]}>{num}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                </View>

                                <Text style={styles.label}>Deadline</Text>
                                <TouchableOpacity style={styles.input} onPress={toggleDatePicker}>
                                    <Text style={{ fontSize: 16 }}>
                                        {endDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                    </Text>
                                </TouchableOpacity>

                                {showDatePicker && (
                                    <View style={styles.pickerWrapper}>
                                        <DateTimePicker
                                            value={endDate}
                                            mode="datetime"
                                            display={Platform.OS === 'ios' ? "spinner" : "default"}
                                            onChange={(e, date) => { if (date) setEndDate(date); }}
                                        />
                                    </View>
                                )}
                            </>
                        ) : (
                            <View>
                                <Text style={styles.stepTitle}>Enter Agent Names</Text>
                                <Text style={styles.stepSub}>These players will share this device to see their missions.</Text>
                                {localPlayers.map((item, index) => (
                                    <TextInput
                                        key={index}
                                        style={styles.playerInput}
                                        placeholder={`Agent ${index + 1} Name`}
                                        value={item}
                                        onChangeText={(text) => updatePlayerName(text, index)}
                                    />
                                ))}
                                <TouchableOpacity style={styles.addPlayerBtn} onPress={() => setLocalPlayers([...localPlayers, ''])}>
                                    <Ionicons name="add-circle-outline" size={20} color="#666" />
                                    <Text style={styles.addPlayerText}>Add Another Agent</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                </KeyboardAvoidingView>

                <MissionPackModal
                    visible={isPackModalVisible}
                    onClose={() => setPackModalVisible(false)}
                    onSelect={(pack) => setSelectedPack(pack)}
                />
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    headerWrapper: {
        borderBottomWidth: 1, 
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
        zIndex: 10,
    },
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        paddingHorizontal: 15, 
        paddingBottom: 10,
        paddingTop: 10,
        alignItems: 'center',
    },
    touchArea: {
        minWidth: 50,
        minHeight: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
    saveBtn: { color: '#000', fontWeight: '900', fontSize: 16 },
    form: { padding: 25, flex: 1 },
    imagePicker: { width: '100%', height: 180, backgroundColor: '#f5f5f5', borderRadius: 20, marginBottom: 25, overflow: 'hidden', borderWidth: 1, borderColor: '#eee', borderStyle: 'dashed' },
    preview: { width: '100%', height: '100%' },
    imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    placeholderText: { marginTop: 10, color: '#aaa', fontWeight: '500' },
    label: { fontSize: 13, fontWeight: '700', color: '#999', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    input: { width: '100%', backgroundColor: '#f9f9f9', padding: 18, borderRadius: 15, marginBottom: 25, fontSize: 16, fontWeight: '500' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, backgroundColor: '#f9f9f9', padding: 15, borderRadius: 15 },
    rowTitle: { fontSize: 16, fontWeight: '700' },
    rowSub: { fontSize: 12, color: '#888' },
    packSelector: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f9f9f9', padding: 18, borderRadius: 15, marginBottom: 25, alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
    packText: { fontSize: 16, fontWeight: '700', color: '#000' },
    packPlaceholder: { fontSize: 16, color: '#ccc' },
    statsRow: { flexDirection: 'row', gap: 15, marginBottom: 25 },
    statBox: { flex: 1 },
    selectorGrid: { flexDirection: 'row', backgroundColor: '#f9f9f9', borderRadius: 12, padding: 4, justifyContent: 'space-between' },
    selectorItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    selectorItemActive: { backgroundColor: '#000' },
    selectorText: { fontSize: 14, fontWeight: '700', color: '#666' },
    selectorTextActive: { color: '#fff' },
    pickerWrapper: { backgroundColor: '#f9f9f9', borderRadius: 15, overflow: 'hidden', marginBottom: 20 },
    stepTitle: { fontSize: 28, fontWeight: '900', marginBottom: 10 },
    stepSub: { fontSize: 16, color: '#666', marginBottom: 30 },
    playerInput: { backgroundColor: '#f9f9f9', padding: 18, borderRadius: 15, marginBottom: 12, fontSize: 16, fontWeight: '600' },
    addPlayerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
    addPlayerText: { color: '#666', fontWeight: '600' }
});