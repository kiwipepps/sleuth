import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export default function GameQR({ gameId, gameName, size = 250 }) {
    // We encode a JSON string so the scanner knows it's a Sleuth game
    const qrData = JSON.stringify({ type: 'sleuth-join', id: gameId });

    return (
        <View style={styles.container}>
<View style={styles.qrWrapper}>
                <QRCode
                    value={qrData}
                    size={size}
                    color="black"
                    backgroundColor="white"
                />
            </View>
            <Text style={styles.subtitle}>Scan to Join the Mission</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { alignItems: 'center', padding: 20 },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
    qrWrapper: {
        padding: 20,
        backgroundColor: 'white',
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5
    },
    subtitle: { marginTop: 20, color: '#666', fontStyle: 'italic' }
});