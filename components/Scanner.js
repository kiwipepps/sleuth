import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

export default function Scanner({ onScan, onCancel }) {
    const [permission, requestPermission] = useCameraPermissions();

    if (!permission) return <View />;
    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.text}>We need camera access to join the game.</Text>
                <TouchableOpacity style={styles.button} onPress={requestPermission}>
                    <Text style={styles.buttonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={styles.camera}
                onBarcodeScanned={({ data }) => {
                    try {
                        const parsedData = JSON.parse(data);
                        if (parsedData.type === 'sleuth-join') onScan(parsedData.id);
                    } catch (e) {
                        // Not a Sleuth QR code
                    }
                }}
            />
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
    camera: { flex: 0.8 },
    text: { color: '#fff', textAlign: 'center', fontSize: 18, marginBottom: 20 },
    button: { backgroundColor: '#fff', padding: 15, borderRadius: 10, alignSelf: 'center' },
    buttonText: { color: '#000', fontWeight: 'bold' },
    cancelButton: { marginTop: 20, alignSelf: 'center' }
});