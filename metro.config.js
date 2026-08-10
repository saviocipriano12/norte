const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native-skia loads CanvasKit (WASM) on web; Metro needs to treat
// .wasm as a servable asset instead of trying to parse it as JS.
config.resolver.assetExts.push('wasm');

module.exports = config;
