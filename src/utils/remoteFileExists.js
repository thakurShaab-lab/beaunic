
async function remoteFileExists(url, timeoutMs = 5000) {
    if (!url) return false

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        let response = await fetch(url, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "follow",
        })

        if (response.ok) {
            const contentType =
                response.headers.get("content-type") || ""

            if (contentType.toLowerCase().startsWith("image/")) {
                return true
            }
        }

        response = await fetch(url, {
            method: "GET",
            headers: { Range: "bytes=0-0" },
            signal: controller.signal,
            redirect: "follow",
        })

        const contentType =
            response.headers.get("content-type") || ""

        return (
            response.ok &&
            contentType.toLowerCase().startsWith("image/")
        )
    } catch (error) {
        return false
    } finally {
        clearTimeout(timer)
    }
}

module.exports = { remoteFileExists }