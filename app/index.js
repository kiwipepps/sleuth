import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import GameSetupModal from '../screens/GameSetupModal';
import HomeScreen from '../screens/HomeScreen';
import { supabase } from '../supabase';

export default function HomeRoute() {
  const router = useRouter();
  const [setupVisible, setSetupVisible] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user ?? null));
  }, []);

  const handleJoinGame = (gameId, screen, hostId = null) => {
    if (screen === 'debrief' || screen === 'completed') {
      router.push({ pathname: '/debrief', params: { gameId } });
    } else if (screen === 'play' || screen === 'active') {
      router.push({ pathname: '/play', params: { gameId } });
    } else {
      router.push({ pathname: '/lobby', params: { gameId, hostId: hostId || '' } });
    }
  };

  const handleCreateSuccess = (gameId, nextScreen, hostId) => {
    setSetupVisible(false);
    router.push({ pathname: `/${nextScreen}`, params: { gameId, hostId } });
  };

  return (
    <>
      <HomeScreen
        onCreatePress={() => setSetupVisible(true)}
        onJoinGame={handleJoinGame}
        sessionUser={user}
      />
      <GameSetupModal
        visible={setupVisible}
        userId={user?.id}
        onClose={() => setSetupVisible(false)}
        onCreated={handleCreateSuccess}
      />
    </>
  );
}
