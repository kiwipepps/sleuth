import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import Lobby from '../screens/Lobby';
import { supabase } from '../supabase';

export default function LobbyRoute() {
  const { gameId, hostId } = useLocalSearchParams();
  const router = useRouter();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id));
  }, []);

  // Transition to play when the host starts the game
  useEffect(() => {
    if (!gameId) return;
    const channel = supabase.channel(`game-status-${gameId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
      }, (payload) => {
        if (payload.new.status === 'active') {
          router.replace({ pathname: '/play', params: { gameId } });
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [gameId]);

  if (!userId) return null;

  return (
    <Lobby
      gameId={gameId}
      isHost={userId === hostId}
      userId={userId}
      onBack={() => router.back()}
    />
  );
}
