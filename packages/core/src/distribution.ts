// Replaced by application builds. Source checkouts use the main channel.
export const releaseChannel = process.env.PRUFTNET_CHANNEL === 'nightly' ? 'nightly' : 'main'
export const releaseVersion = process.env.PRUFTNET_VERSION ?? '0.2.1'
export const releaseName = releaseChannel === 'nightly' ? 'Pruftnet Nightly' : 'Pruftnet'
// Must match command in scripts/distribution/common.mjs.
export const releaseCommand = releaseChannel === 'nightly' ? 'pruftnet-nightly' : 'pruftnet'
// Must match appId in scripts/distribution/common.mjs: Windows groups taskbar entries by it.
export const releaseAppId =
    releaseChannel === 'nightly' ? 'app.pruftnet.desktop.nightly' : 'app.pruftnet.desktop'
/** Suffix of channel-specific packaging assets, such as `icon-nightly.png`. */
export const releaseAssetSuffix = releaseChannel === 'nightly' ? '-nightly' : ''
