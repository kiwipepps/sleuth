import React, { useState, useRef } from 'react';
import { 
    StyleSheet, View, Text, Modal, TouchableOpacity, 
    FlatList, Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'Welcome to Sleuth',
        description: 'A real-world game of secret missions and social deduction. Trust no one, and act natural.',
        icon: 'search-outline'
    },
    {
        id: '2',
        title: 'Form an Operation',
        description: 'Launch a Local operation to play on a single shared device, or go Online to recruit agents directly from your friends list or via QR scan.',
        icon: 'qr-code-outline'
    },
    {
        id: '3', 
        title: 'Set the Parameters',
        description: 'Select an intelligence pack, determine the number of objectives per agent, and establish a strict deadline. Once the rules are locked in, the operation begins.',
        icon: 'options-outline'
    },
    {
        id: '4',
        title: 'Top Secret Missions',
        description: 'Once the game starts, you will receive secret missions. You must complete them in plain sight without raising suspicion.',
        icon: 'mail-unread-outline'
    },
    {
        id: '5',
        title: 'Catch & Call Out',
        description: 'Notice someone acting weird? Call them out! If you catch them performing a mission, they fail it. If you get caught, your mission is compromised.',
        icon: 'eye-outline'
    },
    {
        id: '6',
        title: 'How to Win',
        description: 'The agent who completes the most missions before the operation timer runs out wins. Good luck!',
        icon: 'trophy-outline'
    }
];

export default function TutorialModal({ visible, onClose }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const flatListRef = useRef(null);
    const insets = useSafeAreaInsets(); // <-- NEW: Grabs the exact device notch height

    const handleScroll = (event) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const index = event.nativeEvent.contentOffset.x / slideSize;
        setCurrentIndex(Math.round(index));
    };

    const nextSlide = () => {
        if (currentIndex < SLIDES.length - 1) {
            flatListRef.current.scrollToIndex({ index: currentIndex + 1 });
        } else {
            onClose();
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.slide}>
            <Ionicons name={item.icon} size={120} color="#000" style={styles.icon} />
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={styles.container}>
                {/* Close Button - Dynamically pushed down below the notch! */}
                <TouchableOpacity 
                    style={[styles.skipButton, { top: Math.max(insets.top, 20) + 10 }]} 
                    onPress={onClose}
                >
                    <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>

                <FlatList
                    data={SLIDES}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={handleScroll}
                    ref={flatListRef}
                    bounces={false}
                />

                {/* Pagination Dots */}
                <View style={[styles.pagination, { paddingBottom: 10 }]}>
                    {SLIDES.map((_, index) => (
                        <View 
                            key={index} 
                            style={[styles.dot, currentIndex === index && styles.activeDot]} 
                        />
                    ))}
                </View>

                {/* Next / Start Button */}
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
                    <TouchableOpacity style={styles.button} onPress={nextSlide}>
                        <Text style={styles.buttonText}>
                            {currentIndex === SLIDES.length - 1 ? "Start Mission" : "Next"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    skipButton: { position: 'absolute', right: 20, zIndex: 10, padding: 10 },
    skipText: { fontSize: 16, color: '#888', fontWeight: 'bold' },
    slide: { width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    icon: { marginBottom: 40 },
    title: { fontSize: 28, fontWeight: '900', color: '#000', marginBottom: 15, textAlign: 'center' },
    description: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24 },
    pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ccc', marginHorizontal: 5 },
    activeDot: { backgroundColor: '#000', width: 20 },
    footer: { paddingHorizontal: 30 },
    button: { backgroundColor: '#000', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});