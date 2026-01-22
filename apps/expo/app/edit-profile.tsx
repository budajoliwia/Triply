import {
  View,
  Text,
  StyleSheet,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UserDoc } from '@triply/shared/src/models';
import { useAuth } from '../src/context/auth';
import { db } from '../src/firebase/client';
import { Avatar } from '../src/components/Avatar';
import { resolveAvatarUrl, updateMyProfile } from '../src/services/users';
import { mapFirestoreErrorToMessage } from '../src/utils/firestoreErrors';
import { Button } from '../src/components/Button';
import { colors, hairline, radius, space, typography } from '../src/theme';

const BIO_MAX = 160;

export default function EditProfileScreen() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);

  const remaining = useMemo(() => BIO_MAX - bio.length, [bio.length]);

  useEffect(() => {
    if (!user?.uid) return;

    const ref = doc(db, 'users', user.uid);
    let active = true;
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (!active) return;
        setLoading(false);
        if (!snap.exists()) return;

        const data = snap.data() as UserDoc;
        setUsername(typeof data.username === 'string' ? data.username : null);
        setBio(typeof data.bio === 'string' ? data.bio : '');

        // Only show remote avatar if user hasn't picked a new one locally
        if (!avatarLocalUri) {
          const url = await resolveAvatarUrl(data.avatarPath);
          if (!active) return;
          setAvatarUrl(url);
        }
      },
      (e) => {
        console.warn('EditProfile onSnapshot error:', e);
        setLoading(false);
        Alert.alert('Błąd', 'Nie udało się załadować profilu.');
      },
    );

    return () => {
      active = false;
      unsub();
    };
  }, [user?.uid, avatarLocalUri]);

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (result.canceled) return;

      // Resize to max side 512px and compress to JPEG ~80%
      const manipResult = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );

      setAvatarLocalUri(manipResult.uri);
    } catch (e) {
      console.error('Error picking avatar:', e);
      Alert.alert('Błąd', 'Nie udało się wybrać zdjęcia.');
    }
  };

  const onSave = async () => {
    if (!user?.uid) {
      Alert.alert('Błąd', 'Musisz być zalogowany.');
      return;
    }

    if (bio.length > BIO_MAX) {
      Alert.alert('Błąd', `Bio może mieć maksymalnie ${BIO_MAX} znaków.`);
      return;
    }

    setSaving(true);
    try {
      const avatarUploaded = !!avatarLocalUri;
      await updateMyProfile({
        userId: user.uid,
        bio,
        avatarLocalUri,
      });

      Alert.alert('Sukces', 'Profil zapisany.');

      // Ensure avatar refresh when overwriting the same Storage path
      if (avatarUploaded) {
        router.replace({ pathname: '/(tabs)/my', params: { refreshAvatar: String(Date.now()) } });
      } else {
        router.back();
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      console.error('Failed to save profile:', code, e);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(e, 'Nie udało się zapisać profilu.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Edytuj profil',
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          headerTitleStyle: { ...typography.titleLG },
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          style={styles.content}
        >
          <View style={styles.avatarSection}>
            <Avatar size={96} uri={avatarLocalUri || avatarUrl} />
            <Button label="Zmień zdjęcie" variant="secondary" size="sm" onPress={pickAvatar} disabled={saving} style={{ marginTop: space.md }} />
            <Text style={styles.usernameLabel}>{username ? `@${username}` : ''}</Text>
          </View>

          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text style={styles.label}>Bio</Text>
              <Text style={[styles.counter, remaining < 0 && styles.counterOver]}>
                {bio.length}/{BIO_MAX}
              </Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Napisz coś o sobie (opcjonalnie)"
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
              multiline
              editable={!saving}
              textAlignVertical="top"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <Button label="Zapisz" onPress={onSave} loading={saving} disabled={saving || remaining < 0} style={styles.saveButton} />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: space.lg,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: space.md,
  },
  usernameLabel: {
    marginTop: space.md,
    ...typography.meta,
    color: colors.textSecondary,
  },
  field: {
    marginTop: space.lg,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  label: {
    ...typography.meta,
    color: colors.text,
  },
  counter: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  counterOver: {
    color: colors.danger,
  },
  input: {
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    minHeight: 120,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
  },
  saveButton: {
    marginTop: space.xl,
  },
});


