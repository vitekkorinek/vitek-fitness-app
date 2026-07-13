import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function RecipesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(client)/nutrition/favourites' as any);
  }, []);
  return null;
}
