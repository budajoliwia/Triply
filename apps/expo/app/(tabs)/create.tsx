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
        <Ionicons name="checkmark-circle" size={80} color="#4CD964" />
        <Text style={styles.successText}>Sukces! Post wysłany do moderacji.</Text>
      </SafeAreaView>
    );
  }

  const canPublish = !!user && (!!content.trim() || !!image) && !loading;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nowy wpis</Text>
        <TouchableOpacity
          style={[styles.postButton, !canPublish && styles.disabledButton]}
          onPress={handleCreatePost}
          disabled={!canPublish}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.postButtonText}>Opublikuj</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.inputContainer}>
          <View style={styles.avatar} />
          <TextInput
            style={styles.input}
            placeholder="Co słychać? Podziel się czymś..."
            multiline
            value={content}
            onChangeText={setContent}
            textAlignVertical="top"
          />
        </View>

        {image && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: image }} style={styles.imagePreview} />
            <TouchableOpacity style={styles.removeImageBtn} onPress={() => setImage(null)} disabled={loading}>
              <Ionicons name="close-circle" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={[styles.addPhotoBtn, loading && styles.addPhotoBtnDisabled]} onPress={pickImage} disabled={loading}>
          <Ionicons name="image-outline" size={24} color="#007AFF" />
          <Text style={styles.addPhotoText}>Dodaj zdjęcie</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  postButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  postButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 15,
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ddd',
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    minHeight: 100,
    paddingTop: 8,
  },
  imagePreviewContainer: {
    marginBottom: 20,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: 300,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    justifyContent: 'center',
  },
  addPhotoText: {
    marginLeft: 10,
    color: '#007AFF',
    fontWeight: '500',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  successText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  redirectText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  addPhotoBtnDisabled: {
    opacity: 0.6,
  },
});
