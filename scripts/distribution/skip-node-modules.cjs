// electron-builder beforeBuild hook. Vite bundles every runtime package into dist-electron and the
// packaged app excludes node_modules, so dependency collection is skipped: returning false marks
// node_modules as handled externally. Collection would otherwise run `pnpm list --depth Infinity`
// across the whole workspace, which exhausts file handles on Windows.
exports.default = async () => false
