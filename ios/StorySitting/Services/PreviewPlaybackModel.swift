import Foundation
import Combine

@MainActor
final class PreviewPlaybackModel: ObservableObject {
    @Published private(set) var elapsed: Double = 0
    @Published private(set) var isPlaying = false
    private(set) var duration: Double
    private var playbackTask: Task<Void, Never>?

    init(duration: Double = 45) {
        self.duration = max(1, duration)
    }

    deinit { playbackTask?.cancel() }

    var progress: Double { min(1, elapsed / duration) }

    func configure(duration: Double) {
        let next = max(1, duration)
        guard next != self.duration else { return }
        pause()
        self.duration = next
        elapsed = 0
    }

    func toggle() {
        isPlaying ? pause() : play()
    }

    func restart() {
        elapsed = 0
        play()
    }

    func pause() {
        isPlaying = false
        playbackTask?.cancel()
        playbackTask = nil
    }

    private func play() {
        if elapsed >= duration { elapsed = 0 }
        isPlaying = true
        playbackTask?.cancel()
        playbackTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 200_000_000)
                guard let self, self.isPlaying else { return }
                self.elapsed = min(self.duration, self.elapsed + 0.2)
                if self.elapsed >= self.duration {
                    self.pause()
                    return
                }
            }
        }
    }
}
