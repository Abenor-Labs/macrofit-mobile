import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

/**
 * Getting a meal photo off the device and into something `/api/analyze-photo` can read.
 *
 * Deliberately free of React and of the store: this is the file-and-permissions half of the
 * flow, and keeping it callable from a plain function is what lets the chat screen stay a
 * screen rather than becoming a media pipeline.
 */

/** A photo ready to send: a local URI to show, and the JPEG bytes to upload. */
export interface CapturedPhoto {
  uri: string
  base64: string
}

export type PhotoSource = 'camera' | 'library'

/**
 * Capture outcomes worth telling apart.
 *
 * A cancel is not an error and must not leave anything on screen; a denial is not an error
 * either, but it needs an explanation, because nothing visibly happens and the user is owed
 * the reason. Only a genuine failure throws.
 */
export type CaptureResult =
  | { status: 'ok'; photo: CapturedPhoto }
  | { status: 'canceled' }
  | { status: 'denied' }

/**
 * Longest edge of the image actually uploaded.
 *
 * A 12 MP phone photo is ~4 MB, which is ~5.5 MB once base64 inflates it by a third — and
 * `/api/analyze-photo` runs on an edge function that gives the model 18 seconds total
 * (see its VISION_TIMEOUT_MS note). Sending the original spends that budget on upload and
 * gets a 504 instead of a meal. 1024px is well inside what Qwen2.5-VL reads from, and the
 * result lands around 150-300 KB.
 */
const MAX_EDGE = 1024

/** Enough compression to matter, short of the artifacts that blur a nutrition label. */
const COMPRESS = 0.7

/*
  `quality: 1` on purpose. This file is re-encoded at COMPRESS a moment later, and
  compressing twice only spends detail the model could have used. The full-quality file is
  a cache entry the OS reclaims.
*/
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsMultipleSelection: false,
  quality: 1,
  exif: false,
}

/**
 * Shrinks and re-encodes the picked asset, returning the bytes to upload.
 *
 * Resizes on the longer edge so a portrait photo is bounded by its height rather than being
 * left 1024 wide and 1365 tall. `resize` with one dimension keeps the aspect ratio, so the
 * other is computed for us. An image already inside the bound is only re-encoded.
 */
const downscale = async (asset: ImagePicker.ImagePickerAsset): Promise<CapturedPhoto> => {
  const context = ImageManipulator.manipulate(asset.uri)

  if (Math.max(asset.width, asset.height) > MAX_EDGE) {
    context.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE })
  }

  const image = await context.renderAsync()
  const saved = await image.saveAsync({
    base64: true,
    compress: COMPRESS,
    format: SaveFormat.JPEG,
  })

  // `base64` is optional in the type because the save option is; we just asked for it.
  if (typeof saved.base64 !== 'string' || saved.base64.length === 0) {
    throw new Error('Could not read the photo after resizing it.')
  }

  return { uri: saved.uri, base64: saved.base64 }
}

/**
 * Opens the camera or the photo library and returns an upload-ready photo.
 *
 * ON PERMISSIONS: the camera is asked for explicitly, because launching it without the grant
 * fails silently on both platforms. The library is not. Modern expo-image-picker hands off to
 * the system photo picker (PHPicker on iOS, the Android photo picker), which returns the one
 * chosen image without the app ever holding library access — so prompting for it would be a
 * dialog that buys nothing and that a user can only get wrong.
 *
 * Throws only if the resize or encode fails. Cancel and denial come back as statuses.
 */
export const capturePhoto = async (source: PhotoSource): Promise<CaptureResult> => {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return { status: 'denied' }
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS)

  // `canceled` is the documented flag; the empty-assets check covers the same intent for a
  // picker that returns success with nothing selected.
  if (result.canceled) return { status: 'canceled' }
  const asset = result.assets[0]
  if (asset === undefined) return { status: 'canceled' }

  return { status: 'ok', photo: await downscale(asset) }
}
