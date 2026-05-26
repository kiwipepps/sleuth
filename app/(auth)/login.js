import { useRouter } from 'expo-router';
import LoginScreen from '../../screens/LoginScreen';

export default function LoginRoute() {
  const router = useRouter();
  return <LoginScreen onSignUpLink={() => router.push('/(auth)/signup')} />;
}
