// Type augmentation for expo-file-system v19+
// EncodingType is no longer re-exported from the main index.
// This declaration merges it back so `FileSystem.EncodingType` works.
import { EncodingType } from "expo-file-system/build/ExpoFileSystem.types";

declare module "expo-file-system" {
  export { EncodingType };
}
