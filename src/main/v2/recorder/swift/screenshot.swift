import Cocoa
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

setbuf(stdout, nil)
setbuf(stderr, nil)

enum ScreenshotError: Error {
    case invalidArguments(String)
    case displayNotFound(UInt32)
    case captureFailed(String)
    case saveFailed(String)
}

func emitJSON(_ payload: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else {
        fputs("Failed to encode JSON payload\n", stderr)
        exit(1)
    }
    print(json)
}

func fail(_ message: String, exitCode: Int32 = 1) -> Never {
    fputs("\(message)\n", stderr)
    exit(exitCode)
}

func parseOptions(_ args: [String]) throws -> [String: String] {
    var options: [String: String] = [:]
    var i = 0

    while i < args.count {
        let key = args[i]
        guard key.hasPrefix("--") else {
            throw ScreenshotError.invalidArguments("Unexpected argument: \(key)")
        }
        guard i + 1 < args.count else {
            throw ScreenshotError.invalidArguments("Missing value for option: \(key)")
        }
        options[key] = args[i + 1]
        i += 2
    }

    return options
}

func ensureOutputDirectory(for outputPath: String) throws {
    let outputURL = URL(fileURLWithPath: outputPath)
    let directoryURL = outputURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(
        at: directoryURL,
        withIntermediateDirectories: true
    )
}

func writePNG(_ image: CGImage, to outputPath: String) throws {
    try ensureOutputDirectory(for: outputPath)

    let outputURL = URL(fileURLWithPath: outputPath)
    guard let destination = CGImageDestinationCreateWithURL(
        outputURL as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else {
        throw ScreenshotError.saveFailed("Could not create PNG destination for \(outputPath)")
    }

    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw ScreenshotError.saveFailed("Could not finalize PNG write to \(outputPath)")
    }
}

func resizeIfNeeded(_ image: CGImage, maxDimension: Int?) throws -> CGImage {
    guard let maxDimension, maxDimension > 0 else {
        return image
    }

    let width = image.width
    let height = image.height
    let longestEdge = max(width, height)
    if longestEdge <= maxDimension {
        return image
    }

    let scale = Double(maxDimension) / Double(longestEdge)
    let targetWidth = max(1, Int((Double(width) * scale).rounded()))
    let targetHeight = max(1, Int((Double(height) * scale).rounded()))

    guard let context = CGContext(
        data: nil,
        width: targetWidth,
        height: targetHeight,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        throw ScreenshotError.captureFailed("Could not allocate resize context")
    }

    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))

    guard let resized = context.makeImage() else {
        throw ScreenshotError.captureFailed("Could not generate resized screenshot")
    }

    return resized
}

func resolveDisplayId(_ requestedDisplayId: UInt32?) throws -> CGDirectDisplayID {
    if let requestedDisplayId {
        var displayCount: UInt32 = 0
        CGGetOnlineDisplayList(0, nil, &displayCount)
        var displayIds = Array(repeating: CGDirectDisplayID(), count: Int(displayCount))
        CGGetOnlineDisplayList(displayCount, &displayIds, &displayCount)

        if displayIds.contains(requestedDisplayId) {
            return requestedDisplayId
        }

        throw ScreenshotError.displayNotFound(requestedDisplayId)
    }

    return CGMainDisplayID()
}

func captureScreen(
    outputPath: String,
    requestedDisplayId: UInt32?,
    maxDimension: Int?
) throws -> [String: Any] {
    let displayId = try resolveDisplayId(requestedDisplayId)

    guard let originalImage = CGDisplayCreateImage(displayId) else {
        throw ScreenshotError.captureFailed("Could not capture display \(displayId)")
    }

    let image = try resizeIfNeeded(originalImage, maxDimension: maxDimension)
    try writePNG(image, to: outputPath)

    return [
        "status": "ok",
        "mode": "screen_only",
        "filepath": outputPath,
        "width": image.width,
        "height": image.height,
        "displayId": Int(displayId),
    ]
}

let usage = """
Usage:
  screenshot.swift --output <path> [--display-id <id>] [--max-dimension <px>]
"""

do {
    let args = Array(CommandLine.arguments.dropFirst())
    if args.isEmpty {
        throw ScreenshotError.invalidArguments(usage)
    }

    let options = try parseOptions(args)

    guard let outputPath = options["--output"], !outputPath.isEmpty else {
        throw ScreenshotError.invalidArguments("Missing required --output")
    }

    let requestedDisplayId: UInt32?
    if let displayIdRaw = options["--display-id"] {
        guard let parsed = UInt32(displayIdRaw) else {
            throw ScreenshotError.invalidArguments("Invalid --display-id value: \(displayIdRaw)")
        }
        requestedDisplayId = parsed
    } else {
        requestedDisplayId = nil
    }

    let maxDimension: Int?
    if let maxDimensionRaw = options["--max-dimension"] {
        guard let parsed = Int(maxDimensionRaw), parsed > 0 else {
            throw ScreenshotError.invalidArguments("Invalid --max-dimension value: \(maxDimensionRaw)")
        }
        maxDimension = parsed
    } else {
        maxDimension = nil
    }

    emitJSON(
        try captureScreen(
            outputPath: outputPath,
            requestedDisplayId: requestedDisplayId,
            maxDimension: maxDimension
        )
    )
} catch ScreenshotError.invalidArguments(let message) {
    fail(message, exitCode: 2)
} catch ScreenshotError.displayNotFound(let displayId) {
    fail("Display not found: \(displayId)")
} catch ScreenshotError.captureFailed(let message) {
    fail(message)
} catch ScreenshotError.saveFailed(let message) {
    fail(message)
} catch {
    fail("Unexpected error: \(error)")
}
