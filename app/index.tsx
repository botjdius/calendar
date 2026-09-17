import { Redirect } from 'expo-router';
import { Loading } from '../src/ui';
import { useStore } from '../src/store';

export default function Index() {
  const { ready, user } = useStore();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/auth" />;
  if (user.role === 'instructor') return <Redirect href="/(instructor)" />;
  return <Redirect href="/(student)" />;
}
