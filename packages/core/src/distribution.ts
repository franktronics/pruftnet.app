// Replaced by application builds. Source checkouts use the main channel.
export const releaseChannel = process.env.PRUFTNET_CHANNEL === 'nightly' ? 'nightly' : 'main'
export const releaseVersion = process.env.PRUFTNET_VERSION ?? '0.2.0'
export const releaseName = releaseChannel === 'nightly' ? 'Pruftnet Nightly' : 'Pruftnet'
