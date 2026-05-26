import { useLocalSearchParams, useRouter } from 'expo-router';
import LocalRevealScreen from '../screens/LocalRevealScreen';

export default function LocalRevealRoute() {
  const { gameId } = useLocalSearchParams();
  const router = useRouter();
  return (
    <LocalRevealScreen
      gameId={gameId}
      onFinish={() => router.replace({ pathname: '/play', params: { gameId } })}
    />
  );
}
