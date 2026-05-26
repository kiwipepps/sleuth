import { useRouter } from 'expo-router';
import SignUpScreen from '../../screens/SignUpScreen';

export default function SignUpRoute() {
  const router = useRouter();
  return <SignUpScreen onLoginLink={() => router.push('/(auth)/login')} />;
}
