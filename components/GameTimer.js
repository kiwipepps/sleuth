import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function GameTimer({ endTime, onExpire }) {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const calculateTime = () => {
            const now = new Date().getTime();
            const end = new Date(endTime).getTime();
            const distance = end - now;

            if (distance <= 0) {
                setTimeLeft("EXPIRED");
                if (onExpire) onExpire();
                return;
            }

            const hours = Math.floor(distance / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    }, [endTime]);

    return (
        <View style={[styles.timerBadge, timeLeft === "EXPIRED" && styles.expiredBadge]}>
            <Ionicons name="time-outline" size={12} color="#fff" />
            <Text style={styles.timerText}>{timeLeft}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    timerBadge: { backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
    expiredBadge: { backgroundColor: 'rgba(255, 59, 48, 0.8)' },
    timerText: { color: '#fff', fontSize: 11, fontWeight: '900' },
});
