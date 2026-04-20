import { View, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { ScreenContainer, Typography, Button } from '@/components';
import { Spacing } from '@/constants';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <ScreenContainer>
        <View style={styles.content}>
          <Typography variant="h1" style={styles.title}>
            Page Not Found
          </Typography>
          <Typography variant="body" secondary style={styles.subtitle}>
            This screen doesn't exist.
          </Typography>
          <Link href="/" asChild>
            <Button title="Go Home" size="lg" fullWidth style={styles.button} />
          </Link>
        </View>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenH,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    alignSelf: 'stretch',
  },
});
