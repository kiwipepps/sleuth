import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, TouchableOpacity, Image, 
    ActivityIndicator, Alert, TextInput, ScrollView, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function ProfileScreen() {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null); 
    const [avatarUrl, setAvatarUrl] = useState(null); 
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);

    // Edit Username State
    const [isEditModalVisible, setEditModalVisible] = useState(false);
    const [newUsername, setNewUsername] = useState('');

    // Friends State
    const [activeTab, setActiveTab] = useState('friends'); 
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [friendsList, setFriendsList] = useState([]);
    const [friendsLoading, setFriendsLoading] = useState(false);

    useEffect(() => {
        fetchUserAndProfile();
    }, []);

    useEffect(() => {
        if (user && activeTab === 'friends') {
            fetchFriends();
        }
    }, [activeTab, user]);

    const fetchUserAndProfile = async () => {
        try {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error) throw error;
            
            if (user) {
                setUser(user);
                const authAvatar = user.user_metadata?.avatar_url || null;
                setAvatarUrl(authAvatar);

                const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
                
                if (profileData) {
                    setProfile(profileData);
                    const finalAvatar = profileData.avatar_url || authAvatar;
                    setAvatarUrl(finalAvatar);
                    
                    if (!profileData.avatar_url && authAvatar) {
                        await supabase.from('profiles').update({ avatar_url: authAvatar }).eq('id', user.id);
                    }
                } else {
                    const fallbackName = user.email.split('@')[0];
                    const { data: newProfile } = await supabase.from('profiles').insert([{ 
                        id: user.id, 
                        username: fallbackName,
                        avatar_url: authAvatar 
                    }]).select().single();
                    setProfile(newProfile);
                }
            }
        } catch (error) {
            console.error("Error fetching profile:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveUsername = async () => {
        const trimmedName = newUsername.trim().toLowerCase();

        if (trimmedName.length < 3 || trimmedName.length > 15) {
            return Alert.alert("Invalid Length", "Username must be between 3 and 15 characters.");
        }

        const validRegex = /^[a-z0-9_]+$/;
        if (!validRegex.test(trimmedName)) {
            return Alert.alert("Invalid Format", "Username can only contain lowercase letters, numbers, and underscores.");
        }

        try {
            const { data: existingUser } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', trimmedName)
                .single();

            if (existingUser && existingUser.id !== user.id) {
                return Alert.alert("Taken", "This username is already in use. Please choose another.");
            }

            const { error } = await supabase.from('profiles').update({ username: trimmedName }).eq('id', user.id);
            if (error) throw error;
            
            setProfile(prev => ({ ...prev, username: trimmedName }));
            setEditModalVisible(false);
            Alert.alert("Success", "Username updated successfully!");
        } catch (err) {
            Alert.alert("Error", "Could not update username.");
        }
    };

    const handlePasswordReset = async () => {
        Alert.alert("Reset Password", `Send a password reset link to ${user.email}?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Send Email", onPress: async () => {
                const { error } = await supabase.auth.resetPasswordForEmail(user.email);
                if (error) Alert.alert("Error", error.message);
                else Alert.alert("Sent!", "Check your email for the reset link.");
            }}
        ]);
    };

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
        });

        if (!result.canceled) uploadAvatar(result.assets[0]);
    };

    const uploadAvatar = async (asset) => {
        setUploading(true);
        try {
            const fileExt = asset.uri.split('.').pop();
            const filePath = `${user.id}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, decode(asset.base64), { contentType: `image/${fileExt}`, upsert: true });
            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
            await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id);

            setAvatarUrl(data.publicUrl);
            setProfile(prev => ({ ...prev, avatar_url: data.publicUrl }));
        } catch (error) {
            Alert.alert("Error", "Could not upload profile picture.");
        } finally {
            setUploading(false);
        }
    };

    const fetchFriends = async () => {
        setFriendsLoading(true);
        try {
            const { data: added } = await supabase.from('friends').select('id, profiles!friends_friend_id_fkey(id, username, first_name, last_name, avatar_url)').eq('user_id', user.id);
            const { data: addedMe } = await supabase.from('friends').select('id, profiles!friends_user_id_fkey(id, username, first_name, last_name, avatar_url)').eq('friend_id', user.id);
            
            const formattedAdded = (added || []).map(f => ({ rowId: f.id, ...f.profiles }));
            const formattedAddedMe = (addedMe || []).map(f => ({ rowId: f.id, ...f.profiles }));
            
            const combined = [...formattedAdded, ...formattedAddedMe];
            const uniqueFriends = Array.from(new Map(combined.map(item => [item.id, item])).values());
            
            setFriendsList(uniqueFriends);
        } catch (err) {
            console.error("Error fetching friends:", err);
        } finally {
            setFriendsLoading(false);
        }
    };

    const handleSearch = async (text) => {
        setSearchQuery(text);
        if (text.length < 2) {
            setSearchResults([]);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, first_name, last_name, avatar_url')
                .ilike('username', `%${text}%`)
                .neq('id', user.id)
                .limit(10);
            
            if (data) setSearchResults(data);
        } catch (err) { console.error(err); }
    };

    const handleAddFriend = async (friendProfileId) => {
        try {
            const { error } = await supabase.from('friends').insert([{ user_id: user.id, friend_id: friendProfileId }]);
            if (error) {
                if (error.code === '23505') Alert.alert("Already Added", "You are already friends with this agent.");
                else throw error;
            } else {
                setSearchQuery('');
                setSearchResults([]);
                setActiveTab('friends');
            }
        } catch (err) { Alert.alert("Error", "Could not add friend."); }
    };

    const handleRemoveFriend = async (friendRowId) => {
        Alert.alert("Remove Friend", "Remove this agent from your network?", [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: async () => {
                const { error } = await supabase.from('friends').delete().eq('id', friendRowId);
                if (!error) setFriendsList(prev => prev.filter(f => f.rowId !== friendRowId));
            }}
        ]);
    };

    const handleSignOut = async () => {
        Alert.alert("Sign Out", "Are you sure you want to log out?", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign Out", style: "destructive", onPress: async () => await supabase.auth.signOut() }
        ]);
    };

    const renderDetailRow = (label, value, onEdit) => (
        <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
            {onEdit && (
                <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
                    <Ionicons name="pencil" size={18} color="#007AFF" />
                </TouchableOpacity>
            )}
        </View>
    );

    const renderFriendCard = (friend, isSearch = false) => {
        const isAdded = isSearch && friendsList.some(f => f.id === friend.id);
        const fullName = friend.first_name || friend.last_name 
            ? `${friend.first_name || ''} ${friend.last_name || ''}`.trim() 
            : 'Unknown Agent';

        return (
            <View key={friend.id} style={styles.friendCard}>
                <View style={styles.friendInfoLeft}>
                    {friend.avatar_url ? (
                        <Image source={{uri: friend.avatar_url}} style={styles.friendAvatarImage} />
                    ) : (
                        <View style={styles.friendAvatarPlaceholder}><Ionicons name="person" size={20} color="#aaa" /></View>
                    )}
                    <View>
                        <Text style={styles.friendUsername}>{friend.username}</Text>
                        <Text style={styles.friendName}>{fullName}</Text>
                    </View>
                </View>

                {!isSearch ? (
                    <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemoveFriend(friend.rowId)}>
                        <Text style={styles.removeBtnText}>Remove</Text>
                    </TouchableOpacity>
                ) : isAdded ? (
                    <View style={styles.removeBtn}><Text style={styles.removeBtnText}>Added</Text></View>
                ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => handleAddFriend(friend.id)}>
                        <Text style={styles.addBtnText}>Add</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    if (loading || !user || !profile) return <View style={styles.center}><ActivityIndicator size="large" color="#000" /></View>;

    return (
        // FIX: Changed root to View.
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
            <ScrollView 
                contentContainerStyle={{ paddingBottom: 100 }} // Added extra bottom padding 
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag" 
                automaticallyAdjustKeyboardInsets={true} // FIX: Magic prop! Automatically shifts content up seamlessly on iOS 16+
            >
                <View style={styles.header}>
                    <TouchableOpacity style={styles.iconBtn}>
                        <Ionicons name="information-circle-outline" size={28} color="#000" />
                    </TouchableOpacity>
                    <Text style={styles.logoText}>sleuth.</Text>
                    <TouchableOpacity style={styles.iconBtn} onPress={handleSignOut}>
                        <Ionicons name="log-out-outline" size={28} color="#ff3b30" />
                    </TouchableOpacity>
                </View>

                <View style={styles.separator} />

                <View style={styles.avatarSection}>
                    <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.avatarContainer}>
                        {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}><Ionicons name="person" size={50} color="#ccc" /></View>
                        )}
                        {uploading && <View style={styles.loadingOverlay}><ActivityIndicator color="#fff" /></View>}
                        <View style={styles.cameraBadge}><Ionicons name="camera" size={18} color="#000" /></View>
                    </TouchableOpacity>
                </View>

                <View style={styles.detailsContainer}>
                    {renderDetailRow("Username:", profile.username, () => { setNewUsername(profile.username); setEditModalVisible(true); })}
                    {renderDetailRow("Email:", user.email, null)} 
                    {renderDetailRow("Password:", "**********", handlePasswordReset)}
                </View>

                <View style={styles.tabsContainer}>
                    <TouchableOpacity style={styles.tabBtn} onPress={() => { setActiveTab('friends'); setSearchQuery(''); }}>
                        <Ionicons name={activeTab === 'friends' ? "people" : "people-outline"} size={26} color={activeTab === 'friends' ? "#000" : "#aaa"} />
                        <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>Friends</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.tabBtn} onPress={() => { setActiveTab('add'); setSearchQuery(''); }}>
                        <Ionicons name={activeTab === 'add' ? "search" : "search-outline"} size={26} color={activeTab === 'add' ? "#000" : "#aaa"} />
                        <Text style={[styles.tabText, activeTab === 'add' && styles.tabTextActive]}>Add Friends</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.separator} />

                <View style={styles.listContainer}>
                    <View style={styles.searchContainer}>
                        <Ionicons name="search" size={20} color="#aaa" />
                        <TextInput 
                            style={styles.searchInput}
                            placeholder={activeTab === 'friends' ? "Search your friends..." : "Search by username..."}
                            placeholderTextColor="#aaa"
                            value={searchQuery}
                            onChangeText={activeTab === 'add' ? handleSearch : setSearchQuery}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>

                    {activeTab === 'friends' ? (
                        friendsLoading ? <ActivityIndicator color="#000" style={{marginTop: 20}} /> :
                        friendsList.filter(f => f.username?.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
                            friendsList.filter(f => f.username?.toLowerCase().includes(searchQuery.toLowerCase())).map(f => renderFriendCard(f, false))
                        ) : (
                            <Text style={styles.emptyText}>No friends found.</Text>
                        )
                    ) : (
                        searchResults.length > 0 ? searchResults.map(r => renderFriendCard(r, true)) : 
                        searchQuery.length > 1 ? <Text style={styles.emptyText}>No users found.</Text> : null
                    )}
                </View>
            </ScrollView>

            {/* EDIT USERNAME MODAL - Keep KAV here since Modals escape normal View hierarchy */}
            <Modal visible={isEditModalVisible} transparent animationType="fade">
                <KeyboardAvoidingView 
                    style={{ flex: 1 }} 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Edit Username</Text>
                            <TextInput 
                                style={styles.modalInput} 
                                value={newUsername} 
                                onChangeText={setNewUsername} 
                                autoCapitalize="none" 
                                autoCorrect={false} 
                                maxLength={15}
                            />
                            <View style={styles.modalActionRow}>
                                <TouchableOpacity style={[styles.modalActionBtn, {backgroundColor: '#eee'}]} onPress={() => setEditModalVisible(false)}>
                                    <Text style={{color: '#000', fontWeight: 'bold'}}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalActionBtn, {backgroundColor: '#007AFF'}]} onPress={handleSaveUsername}>
                                    <Text style={{color: '#fff', fontWeight: 'bold'}}>Save</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
    iconBtn: { padding: 5 },
    logoText: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
    separator: { height: 1, backgroundColor: '#f0f0f0', width: '100%', borderStyle: 'dashed' },
    avatarSection: { alignItems: 'center', marginTop: 30, marginBottom: 20 },
    avatarContainer: { position: 'relative' },
    avatar: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#eee' },
    avatarPlaceholder: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 65, justifyContent: 'center', alignItems: 'center' },
    cameraBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#e0e0e0', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#fff' },
    detailsContainer: { paddingHorizontal: 30, marginBottom: 30 },
    detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    detailLabel: { width: 90, fontSize: 14, color: '#000', fontWeight: '500' },
    detailValue: { flex: 1, fontSize: 14, fontWeight: '800', color: '#000' },
    editBtn: { padding: 5, marginLeft: 10 },
    tabsContainer: { flexDirection: 'row', paddingHorizontal: 30, marginBottom: 15, gap: 30 },
    tabBtn: { alignItems: 'center', gap: 5 },
    tabText: { fontSize: 12, fontWeight: '600', color: '#aaa' },
    tabTextActive: { color: '#000', fontWeight: '800' },
    listContainer: { paddingHorizontal: 20, paddingTop: 20 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 15, height: 45, marginBottom: 20 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: '#000' },
    friendCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    friendInfoLeft: { flexDirection: 'row', alignItems: 'center', gap: 15 },
    friendAvatarImage: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#eee' },
    friendAvatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
    friendUsername: { fontSize: 16, fontWeight: '800', color: '#000' },
    friendName: { fontSize: 13, color: '#666', marginTop: 2 },
    removeBtn: { backgroundColor: '#e0e0e0', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
    removeBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },
    addBtn: { backgroundColor: '#007AFF', paddingVertical: 8, paddingHorizontal: 22, borderRadius: 10 },
    addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
    emptyText: { textAlign: 'center', color: '#aaa', marginTop: 20 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', width: '100%', borderRadius: 24, padding: 25 },
    modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 15 },
    modalInput: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 12, fontSize: 16, marginBottom: 20 },
    modalActionRow: { flexDirection: 'row', gap: 10 },
    modalActionBtn: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center' }
});