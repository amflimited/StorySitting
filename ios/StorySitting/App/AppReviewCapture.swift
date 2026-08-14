#if DEBUG
import AVFoundation
import CoreMedia
import ReplayKit

final class AppReviewCapture: @unchecked Sendable {
    static let shared = AppReviewCapture()
    private let queue = DispatchQueue(label: "app-review-capture")
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var first: CMTime?
    private var last: CMTime?
    private var stopping = false
    private init() {}

    func startIfRequested() {
        let env = ProcessInfo.processInfo.environment
        guard let rawName = env["APP_REVIEW_CAPTURE_NAME"], !rawName.isEmpty else { return }
        let name = rawName.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "-", options: .regularExpression)
        let duration = max(5, min(Double(env["APP_REVIEW_CAPTURE_DURATION"] ?? "24") ?? 24, 60))
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let directory = documents.appending(path: "review-evidence", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let output = directory.appending(path: "\(name).mp4", directoryHint: .notDirectory)
        try? FileManager.default.removeItem(at: output)
        let recorder = RPScreenRecorder.shared()
        recorder.isMicrophoneEnabled = false
        recorder.startCapture { [weak self] sample, type, error in
            guard error == nil, type == .video else { return }
            self?.append(sample, to: output)
        } completionHandler: { [weak self] error in
            guard error == nil else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + duration) { self?.stop() }
        }
    }

    private func append(_ sample: CMSampleBuffer, to output: URL) {
        queue.async { [weak self] in
            guard let self, !stopping else { return }
            let time = CMSampleBufferGetPresentationTimeStamp(sample)
            if writer == nil {
                guard let format = CMSampleBufferGetFormatDescription(sample) else { return }
                let size = CMVideoFormatDescriptionGetDimensions(format)
                guard let newWriter = try? AVAssetWriter(outputURL: output, fileType: .mp4) else { return }
                let newInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
                    AVVideoCodecKey: AVVideoCodecType.h264,
                    AVVideoWidthKey: Int(size.width),
                    AVVideoHeightKey: Int(size.height),
                    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 4_000_000],
                ])
                newInput.expectsMediaDataInRealTime = true
                guard newWriter.canAdd(newInput) else { return }
                newWriter.add(newInput)
                guard newWriter.startWriting() else { return }
                newWriter.startSession(atSourceTime: time)
                writer = newWriter
                input = newInput
                first = time
            }
            guard let input, input.isReadyForMoreMediaData, input.append(sample) else { return }
            last = time
        }
    }

    private func stop() {
        guard !stopping else { return }
        stopping = true
        RPScreenRecorder.shared().stopCapture { [weak self] _ in
            self?.queue.async { [weak self] in
                guard let self else { return }
                guard let writer = self.writer, let input = self.input else { return }
                input.markAsFinished()
                if let first = self.first, let last = self.last, last > first {
                    writer.endSession(atSourceTime: last)
                }
                writer.finishWriting {}
            }
        }
    }
}
#endif
