import AsyncStorage from '@react-native-async-storage/async-storage'
import { getStoreEpoch } from '@/store/useStore'

/*
  The on-disk half of AuthProvider's ownership model. See the note above these keys' use in
  AuthProvider.tsx for what each one means; they live here so that code running without
  AuthProvider mounted — a home-screen widget's background task — can take part in it.
*/
export const STORE_OWNER_KEY = 'macrofit-store-owner'
export const LOADED_KEY = 'macrofit-loaded-owner'
export const UNSYNCED_KEY = 'macrofit-unsynced-owner'

/** A publish licence is only valid for the account AND the store contents it was cut for. */
export const licenceFor = (epoch: string, userId: string) => `${epoch}:${userId}`

/**
 * Record an edit made while AuthProvider was not running, so the next launch publishes it.
 *
 * Without this, the launch that follows reads the account from the server and hydrates over
 * the local store, and the edit is silently replaced by the server's older copy. The rule is
 * AuthProvider's `markUnsynced`: a licence is only cut once this device has read the owner's
 * account, because only then does the local store descend from the server's.
 *
 * A device with no owner (a guest) has nothing to publish to and gets no licence; its store
 * is the only copy, which the edit has already reached.
 */
export const licenceLocalEdit = async (): Promise<void> => {
  const stored = await AsyncStorage.multiGet([STORE_OWNER_KEY, LOADED_KEY])
  const valueFor = (key: string) => stored.find(([k]) => k === key)?.[1] ?? null
  const owner = valueFor(STORE_OWNER_KEY)
  if (!owner || valueFor(LOADED_KEY) !== owner) return
  await AsyncStorage.setItem(UNSYNCED_KEY, licenceFor(await getStoreEpoch(), owner))
}
