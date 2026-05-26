import { useLocalSearchParams, useRouter } from 'expo-router';
import DebriefScreen from '../screens/DebriefScreen';

export default function DebriefRoute() {
  const { gameId } = useLocalSearchParams();
  const router = useRouter();
  return <DebriefScreen gameId={gameId} onBack={() => router.back()} />;
}
