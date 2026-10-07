import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  query,
  orderBy,
  updateDoc
} from 'firebase/firestore';
import { db } from '../../firebase';
import { OrderRecord } from '../types';

const COLLECTION_NAME = 'nota_orders';

/**
 * Real-time subscription to permanent Firestore orders collection.
 * Keeps orders in sync across all devices, page reloads, and server restarts.
 */
export function subscribeToFirestoreOrders(
  onUpdate: (orders: OrderRecord[]) => void,
  onError?: (error: any) => void
): () => void {
  try {
    const ordersCol = collection(db, COLLECTION_NAME);
    const q = query(ordersCol, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const orders: OrderRecord[] = [];
        snapshot.forEach((docSnap) => {
          orders.push(docSnap.data() as OrderRecord);
        });
        onUpdate(orders);
      },
      (err) => {
        console.warn('Firestore subscription warning (fallback to local cache):', err);
        onError?.(err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Could not initialize Firestore orders listener:', err);
    onError?.(err);
    return () => {};
  }
}

/**
 * Persists an order permanently to Cloud Firestore.
 */
export async function saveOrderToFirestore(order: OrderRecord): Promise<boolean> {
  try {
    const docRef = doc(db, COLLECTION_NAME, order.orderId);
    // Sanitize any undefined properties to null for Firestore compatibility
    const cleanData = JSON.parse(JSON.stringify(order));
    await setDoc(docRef, cleanData, { merge: true });
    return true;
  } catch (err) {
    console.warn('Failed to save order to Firestore:', err);
    return false;
  }
}

/**
 * Updates specific fields of an order in Firestore.
 */
export async function updateOrderInFirestore(
  orderId: string,
  updates: Partial<OrderRecord>
): Promise<boolean> {
  try {
    const docRef = doc(db, COLLECTION_NAME, orderId);
    const cleanData = JSON.parse(JSON.stringify(updates));
    await updateDoc(docRef, cleanData);
    return true;
  } catch (err) {
    console.warn('Failed to update order in Firestore:', err);
    return false;
  }
}

/**
 * Permanently deletes an order from Cloud Firestore (Admin only).
 */
export async function deleteOrderFromFirestore(orderId: string): Promise<boolean> {
  try {
    const docRef = doc(db, COLLECTION_NAME, orderId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.warn('Failed to delete order from Firestore:', err);
    return false;
  }
}

/**
 * Seed initial sample orders into Firestore if the collection is currently empty.
 */
export async function seedOrdersIfEmpty(sampleOrders: OrderRecord[]): Promise<void> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    if (snapshot.empty && sampleOrders.length > 0) {
      for (const order of sampleOrders) {
        await saveOrderToFirestore(order);
      }
    }
  } catch (e) {
    console.warn('Notice on seeding initial Firestore orders:', e);
  }
}
