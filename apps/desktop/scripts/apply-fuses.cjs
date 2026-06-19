const { existsSync } = require("node:fs")
const path = require("node:path")

const { flipFuses, FuseV1Options, FuseVersion } = require("@electron/fuses")

const fuseOptions = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function resolveCandidateNames(context) {
  const appInfo = context.packager.appInfo
  const linuxConfig = context.packager.config?.linux

  return unique([
    linuxConfig?.executableName,
    appInfo.productFilename,
    appInfo.productName,
    appInfo.name,
    "pruftnet",
    "Pruftnet",
  ])
}

function resolveElectronBinaryPath(context) {
  const names = resolveCandidateNames(context)
  const candidates = []

  if (context.electronPlatformName === "darwin") {
    for (const appName of names) {
      for (const binaryName of names) {
        candidates.push(path.join(context.appOutDir, `${appName}.app`, "Contents", "MacOS", binaryName))
      }
    }
  } else if (context.electronPlatformName === "win32") {
    for (const name of names) {
      candidates.push(path.join(context.appOutDir, `${name}.exe`))
    }
  } else {
    for (const name of names) {
      candidates.push(path.join(context.appOutDir, name))
    }
  }

  const electronBinaryPath = unique(candidates).find((candidate) => existsSync(candidate))
  if (!electronBinaryPath) {
    throw new Error(
      `Could not find Electron binary to apply fuses. Checked:\n${unique(candidates)
        .map((candidate) => `- ${candidate}`)
        .join("\n")}`,
    )
  }

  return electronBinaryPath
}

function resolveFuseTarget(context) {
  const electronBinaryPath = resolveElectronBinaryPath(context)
  const fuseTargetPath = path.relative(context.appOutDir, electronBinaryPath)

  if (fuseTargetPath.startsWith("..") || path.isAbsolute(fuseTargetPath)) {
    throw new Error(
      `Electron binary must be inside appOutDir to apply fuses. Binary: ${electronBinaryPath}. appOutDir: ${context.appOutDir}`,
    )
  }

  return { electronBinaryPath, fuseTargetPath }
}

module.exports = async function applyFuses(context) {
  const { electronBinaryPath, fuseTargetPath } = resolveFuseTarget(context)
  const previousCwd = process.cwd()

  console.log(`[desktop] Applying Electron fuses to ${electronBinaryPath}`)

  try {
    process.chdir(context.appOutDir)
    await flipFuses(fuseTargetPath, fuseOptions)
  } finally {
    process.chdir(previousCwd)
  }
}
