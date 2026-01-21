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
import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useAuth } from '../../src/context/auth';
import { createPost } from '../../src/services/posts';

export default function CreateScreen() {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [redirectSeconds, setRedirectSeconds] = useState(2);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!success) return;
    setRedirectSeconds(2);

    const tick = () => {
      setRedirectSeconds((s) => {
        const next = s - 1;
        if (next <= 0) {
          router.replace('/(tabs)/feed');
          return 0;
        }
        return next;
      });
      redirectTimerRef.current = setTimeout(tick, 1000);
    };

    redirectTimerRef.current = setTimeout(tick, 1000);

    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    };
  }, [success]);

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
      setSuccess(true);
      setContent('');
      setImage(null);
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', 'Nie udało się dodać posta.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <Ionicons name="checkmark-circle" size={80} color="#4CD964" />
        <Text style={styles.successText}>Wysłano do moderacji</Text>
        <Text style={styles.redirectText}>Twój post jest widoczny w profilu w zakładce „Oczekujące”.</Text>
        <View style={styles.successActionsRow}>
          <TouchableOpacity
            style={[styles.secondaryButton]}
            onPress={() => router.replace('/(tabs)/my')}
          >
            <Text style={styles.secondaryButtonText}>Mój profil</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton]}
            onPress={() => router.replace('/(tabs)/feed')}
          >
            <Text style={styles.primaryButtonText}>Przejdź do feed</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.redirectRow}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.redirectCountdownText}>
            Przekierowanie do feed za {redirectSeconds}s…
          </Text>
        </View>
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
  successActionsRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    minWidth: 130,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    minWidth: 110,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#333',
    fontWeight: '700',
  },
  redirectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  redirectCountdownText: {
    marginLeft: 8,
    color: '#666',
    fontSize: 13,
  },
  addPhotoBtnDisabled: {
    opacity: 0.6,
  },
});
