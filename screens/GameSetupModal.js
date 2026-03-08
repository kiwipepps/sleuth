import React, { useState } from 'react';
import {
    Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, Image, Switch, Alert, SafeAreaView, KeyboardAvoidingView, Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../supabase';
import MissionPackModal from './MissionPackModal';

export default function GameSetupModal({ visible, onClose, onCreated, userId }) {
    const [step, setStep] = useState(1);
    const [gameName, setGameName] = useState('');
    const [image, setImage] = useState(null);
    const [isLocal, setIsLocal] = useState(false);
    const [missionCount, setMissionCount] = useState('3');
    const [calloutCount, setCalloutCount] = useState('2');
    const [selectedPack, setSelectedPack] = useState(null);
    const [endDate, setEndDate] = useState(new Date());
    const [localPlayers, setLocalPlayers] = useState(['', '']);
    const [loading, setLoading] = useState(false);

    const [showDatePicker, setShowDatePicker] = useState(false);
    const [isPackModalVisible, setPackModalVisible] = useState(false);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.5,
            base64: true,
        });
        if (!result.canceled) setImage(result.assets[0]);
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
            console.error('Image upload failed:', error.message);
            return null;
        }
    };

    const handleNext = () => {
        if (!gameName || !selectedPack) {
            return Alert.alert("Required", "Please name your game and pick a mission pack.");
        }
        if (isLocal) setStep(2);
        else finalizeGame();
    };

    const finalizeGame = async () => {
        setLoading(true);
        try {
            let publicImageUrl = null;
            if (image) {
                publicImageUrl = await uploadCoverImage(image);
            }

            // 1. Create the Game record
            const { data: game, error: gameError } = await supabase.from('games').insert([{
                host_id: userId,
                game_name: gameName,
                cover_image: publicImageUrl,
                is_local: isLocal,
                end_time: endDate.toISOString(),
                pack_id: selectedPack.id,
                mission_limit: parseInt(missionCount),
                callout_limit: parseInt(calloutCount),
                status: isLocal ? 'active' : 'lobby'
            }]).select().single();

            if (gameError) throw gameError;

            if (isLocal) {
                // 2. Insert all local participants
                const participantEntries = localPlayers
                    .filter(name => name.trim() !== '')
                    .map(name => ({ game_id: game.id, manual_name: name }));

                const { data: participants, error: pError } = await supabase
                    .from('game_participants')
                    .insert(participantEntries)
                    .select();

                if (pError) throw pError;

                // 3. Fetch the mission pool
                const { data: missionPool, error: mError } = await supabase
                    .from('mission_library')
                    .select('id')
                    .eq('pack_id', selectedPack.id);

                if (mError || !missionPool || missionPool.length === 0) {
                    throw new Error("No missions found in this pack.");
                }

                // 4. Individual Mission Assignment
                const assignmentPromises = participants.map(participant => {
                    const shuffled = [...missionPool].sort(() => 0.5 - Math.random());
                    const selected = shuffled.slice(0, parseInt(missionCount));

                    const missionEntries = selected.map(m => ({
                        game_id: game.id,
                        participant_id: participant.id,
                        mission_id: m.id,
                        completed: false // FIXED: Corrected column name to match DB
                    }));

                    return supabase.from('user_missions').insert(missionEntries);
                });

                await Promise.all(assignmentPromises);

                onCreated(game.id, 'local-reveal', userId);
            } else {
                // Online Game initial join
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
        setStep(1);
        setGameName('');
        setImage(null);
        setLocalPlayers(['', '']);
        setIsLocal(false);
        onClose();
    };

    const updatePlayerName = (text, index) => {
        const updated = [...localPlayers];
        updated[index] = text;
        setLocalPlayers(updated);
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={step === 1 ? onClose : () => setStep(1)}>
                        <Ionicons name={step === 1 ? "close" : "arrow-back"} size={28} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{step === 1 ? "New Operation" : "Identify Agents"}</Text>
                    <TouchableOpacity onPress={step === 1 ? handleNext : finalizeGame} disabled={loading}>
                        <Text style={styles.saveBtn}>
                            {loading ? "..." : (step === 1 ? (isLocal ? "Next" : "Create") : "Start")}
                        </Text>
                    </TouchableOpacity>
                </View>

                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
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
                                        <TextInput
                                            style={styles.smallInput}
                                            keyboardType="numeric"
                                            value={missionCount}
                                            onChangeText={setMissionCount}
                                        />
                                    </View>
                                    <View style={styles.statBox}>
                                        <Text style={styles.label}>Callouts</Text>
                                        <TextInput
                                            style={styles.smallInput}
                                            keyboardType="numeric"
                                            value={calloutCount}
                                            onChangeText={setCalloutCount}
                                        />
                                    </View>
                                </View>

                                <Text style={styles.label}>Deadline</Text>
                                <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
                                    <Text style={{ fontSize: 16 }}>
                                        {endDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                    </Text>
                                </TouchableOpacity>

                                {showDatePicker && (
                                    <DateTimePicker
                                        value={endDate}
                                        mode="datetime"
                                        display="spinner"
                                        onChange={(e, date) => { setShowDatePicker(false); if (date) setEndDate(date); }}
                                    />
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
                                <View style={{ height: 100 }} />
                            </View>
                        )}
                    </ScrollView>
                </KeyboardAvoidingView>

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
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
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
    smallInput: { backgroundColor: '#f9f9f9', padding: 18, borderRadius: 15, textAlign: 'center', fontSize: 20, fontWeight: '800' },
    stepTitle: { fontSize: 28, fontWeight: '900', marginBottom: 10 },
    stepSub: { fontSize: 16, color: '#666', marginBottom: 30 },
    playerInput: { backgroundColor: '#f9f9f9', padding: 18, borderRadius: 15, marginBottom: 12, fontSize: 16, fontWeight: '600' },
    addPlayerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
    addPlayerText: { color: '#666', fontWeight: '600' }
});