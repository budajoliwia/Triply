import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = width / COLUMN_COUNT;

const MY_POSTS = [
  { id: '1', image: 'https://picsum.photos/seed/10/200/200' },
  { id: '2', image: 'https://picsum.photos/seed/11/200/200' },
  { id: '3', image: 'https://picsum.photos/seed/12/200/200' },
  { id: '4', image: 'https://picsum.photos/seed/13/200/200' },
  { id: '5', image: 'https://picsum.photos/seed/14/200/200' },
];

export default function MyProfileScreen() {
  const renderItem = ({ item }: { item: (typeof MY_POSTS)[0] }) => (
    <View style={styles.gridItem}>
      <Image source={{ uri: item.image }} style={styles.gridImage} />
    </View>
  );

  const renderHeader = () => (
    <View style={styles.profileHeader}>
      <View style={styles.avatarLarge} />
      <Text style={styles.name}>Mój Profil</Text>
      <Text style={styles.bio}>Podróżnik | Fotografia | Kawa</Text>

      <TouchableOpacity style={styles.adminButton} onPress={() => router.push('/admin/moderation')}>
        <Text style={styles.adminButtonText}>Panel Admina (Moderacja)</Text>
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>15</Text>
          <Text style={styles.statLabel}>Posty</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>240</Text>
          <Text style={styles.statLabel}>Obserwujący</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>180</Text>
          <Text style={styles.statLabel}>Obserwowani</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={MY_POSTS}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={COLUMN_COUNT}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  listContent: {
    paddingBottom: 20,
  },
  profileHeader: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 5,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ddd',
    marginBottom: 15,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  bio: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
  },
  adminButton: {
    backgroundColor: '#333',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  adminButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    padding: 1,
  },
  gridImage: {
    flex: 1,
    backgroundColor: '#eee',
  },
});
