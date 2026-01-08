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
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useAuth } from '../../src/context/auth';
import { createPost } from '../../src/services/posts';

export default function CreateScreen() {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    // No permissions request is necessary for launching the image library
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8, // Compression as requested
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
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
      Alert.alert('Sukces', 'Twój post oczekuje na zatwierdzenie przez administratora.', [
        {
          text: 'OK',
          onPress: () => {
            setContent('');
            setImage(null);
            router.push('/(tabs)/feed');
          },
        },
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('Błąd', 'Nie udało się dodać posta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nowy wpis</Text>
        <TouchableOpacity
          style={[styles.postButton, loading && styles.disabledButton]}
          onPress={handleCreatePost}
          disabled={loading}
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
            <TouchableOpacity style={styles.removeImageBtn} onPress={() => setImage(null)}>
              <Ionicons name="close-circle" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.addPhotoBtn} onPress={pickImage}>
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
});
