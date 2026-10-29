
const fs = require("fs")
const path = require("path")
const env = require("../config/env")
const { remoteFileExists } = require("./remoteFileExists")

async function resolveMediaUrl(req, dir, filename, noImagePath, externalBaseUrl) {
  if (!filename) return noImagePath

  if (/^https?:\/\//i.test(filename)) {
    return (await remoteFileExists(filename))
      ? filename
      : noImagePath
  }

  const cleanFilename = String(filename).replace(/^\/+/, "")
  const baseUrl = externalBaseUrl.replace(/\/+$/, "")

  const remoteUrl = `${baseUrl}/${dir}/${cleanFilename}`

  const localPath = path.join(
    env.uploadDir,
    dir,
    cleanFilename
  )

  if (fs.existsSync(localPath)) {
    return remoteUrl
  }

  // Check the remote file
  const exists = await remoteFileExists(remoteUrl)

  return exists ? remoteUrl : noImagePath
}

module.exports = { resolveMediaUrl }