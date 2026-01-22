import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/context/auth';
import { createPost } from '../../src/services/posts';
import { mapFirestoreErrorToMessage } from '../../src/utils/firestoreErrors';
import { Avatar } from '../../src/components/Avatar';
import { Button } from '../../src/components/Button';
import { SurfaceCard } from '../../src/components/SurfaceCard';
import { colors, hairline, radius, space, typography } from '../../src/theme';

export default function CreateScreen() {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRedirectTimer = useCallback(() => {
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = null;
  }, []);

  const navigateAfterSuccess = useCallback(
    (path: '/(tabs)/feed' | '/(tabs)/my') => {
      clearRedirectTimer();
      setSuccess(false);
      setLoading(false);
      router.replace(path);
    },
    [clearRedirectTimer],
  );

  useEffect(() => {
    if (!success) return;
    // Keep it simple: show a success message briefly, then go back to feed.
    // IMPORTANT: tabs screens stay mounted; clear success/timer to avoid
    // redirecting the user while they're on another tab.
    redirectTimerRef.current = setTimeout(() => {
      navigateAfterSuccess('/(tabs)/feed');
    }, 900);

    return () => {
      clearRedirectTimer();
    };
  }, [success, clearRedirectTimer, navigateAfterSuccess]);

  // If user leaves this tab while success screen is shown, cancel the timer
  // to prevent surprise redirects.
  useFocusEffect(
    useCallback(() => {
      return () => {
        clearRedirectTimer();
        setSuccess(false);
      };
    }, [clearRedirectTimer]),
  );

  const pickImage = async () => {
    try {
      // No permissions request is necessary for launching the image library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1, // Get best quality from picker, we will compress later
      });

      if (!result.canceled) {
        // Resize to max width 1080px and compress to JPEG 80%
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1080 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        setImage(manipResult.uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Błąd', 'Nie udało się wybrać zdjęcia.');
    }
  };

  const handleCreatePost = async () => {
    if (!content.trim() && !image) {
      Alert.alert('Błąd', 'Dodaj treść lub zdjęcie.');
      return;
    }

    if (!user) {
      Alert.alert('Błąd', 'Musisz być zalogowany.');
      return;
    }

    setLoading(true);
    try {
      await createPost({
        userId: user.uid,
        text: content,
        imageUri: image,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuccess(true);
      setContent('');
      setImage(null);
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', mapFirestoreErrorToMessage(error, 'Nie udało się dodać posta.'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <Ionicons name="checkmark-circle" size={76} color={colors.success} />
        <Text style={styles.successText}>Sukces! Post wysłany do moderacji.</Text>
      </SafeAreaView>
    );
  }

  const canPublish = !!user && (!!content.trim() || !!image) && !loading;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nowy wpis</Text>
        <Button label="Opublikuj" onPress={handleCreatePost} loading={loading} disabled={!canPublish} size="sm" />
      </View>

      <ScrollView style={styles.content}>
        <SurfaceCard style={styles.inputContainer}>
          <Avatar size={40} uri={null} />
          <TextInput
            style={styles.input}
            placeholder="Co słychać? Podziel się czymś..."
            multiline
            value={content}
            onChangeText={setContent}
            textAlignVertical="top"
            placeholderTextColor={colors.textTertiary}
          />
        </SurfaceCard>

        {image && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: image }} style={styles.imagePreview} />
            <TouchableOpacity style={styles.removeImageBtn} onPress={() => setImage(null)} disabled={loading}>
              <Ionicons name="close-circle" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        <Button
          label="Dodaj zdjęcie"
          variant="secondary"
          onPress={pickImage}
          disabled={loading}
          left={<Ionicons name="image-outline" size={18} color={colors.primary} />}
          style={styles.addPhotoBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.titleLG,
  },
  content: {
    flex: 1,
    padding: space.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: space.lg,
    padding: space.lg,
    alignItems: 'flex-start',
  },
  input: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    minHeight: 100,
    paddingTop: 6,
    paddingLeft: space.md,
    color: colors.text,
  },
  imagePreviewContainer: {
    marginBottom: space.lg,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: 300,
    borderRadius: radius.lg,
    backgroundColor: colors.skeleton,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
  },
  addPhotoBtn: {
    alignSelf: 'flex-start',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: space['2xl'],
  },
  successText: {
    ...typography.titleLG,
    marginTop: space.lg,
    marginBottom: space.sm,
    textAlign: 'center',
  },
  redirectText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
