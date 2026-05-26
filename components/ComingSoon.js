import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ComingSoon({ title, icon = 'construct-outline' }) {
    return (
        <View style={styles.container}>
            <Ionicons name={icon} size={52} color="#ccc" />
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>This feature is coming soon.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fdfdfd', gap: 12 },
    title: { fontSize: 18, fontWeight: '900', color: '#000', letterSpacing: 1, textTransform: 'uppercase' },
    subtitle: { fontSize: 14, color: '#aaa', fontWeight: '500' },
});
