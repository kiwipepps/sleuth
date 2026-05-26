import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import PlayScreen from '../screens/PlayScreen';
import { supabase } from '../supabase';

export default function PlayRoute() {
  const { gameId } = useLocalSearchParams();
  const router = useRouter();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id));
  }, []);

  if (!userId) return null;

  return (
    <PlayScreen
      gameId={gameId}
      userId={userId}
      onBack={() => router.back()}
    />
  );
}
