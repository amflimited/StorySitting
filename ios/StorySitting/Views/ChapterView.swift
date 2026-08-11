import Foundation
import SwiftUI
import StorySittingCore

struct ChapterView: View {
    private enum Mode: String, CaseIterable { case listen = "Listen", read = "Read" }

    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var store: StoreService
    @StateObject private var player = PreviewPlaybackModel()
    @State private var mode: Mode = .listen
    @State private var showingPurchase = false
    @State private var showingCorrection = false
    let projectID: String
    let chapterID: String

    var body: some View {
        ZStack {
            EndpaperField()
            if let project = model.project(id: projectID),
               let chapter = project.chapters.first(where: { $0.id == chapterID }) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        chapterCover(chapter, storyteller: project.storyteller.familiarName)
                        modePicker

                        if mode == .listen {
                            listeningRoom(chapter)
                        } else {
                            readingRoom(chapter)
                        }

                        if chapter.isUnlocked {
                            keptCard(chapter, project: project)
                        } else {
                            unlockCard(chapter)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 18)
                    .padding(.bottom, 32)
                }
                .onAppear { configurePlayer(chapter) }
                .onChange(of: chapter.isUnlocked) { _, _ in configurePlayer(chapter) }
                .sheet(isPresented: $showingPurchase) {
                    ChapterPurchaseSheet(projectID: projectID, chapterID: chapterID)
                        .presentationDetents([.medium, .large])
                        .presentationDragIndicator(.visible)
                }
                .sheet(isPresented: $showingCorrection) {
                    CorrectionNoteSheet(
                        project: project,
                        chapter: chapter
                    )
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                }
            }
        }
        .navigationTitle("Chapter")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(StoryTheme.endpaper.opacity(0.94), for: .navigationBar)
    }

    private func chapterCover(_ chapter: StoryChapter, storyteller: String) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                StatusLozenge(
                    text: chapter.isUnlocked ? "On your shelf" : "Representative preview",
                    color: chapter.isUnlocked ? StoryTheme.recorderTeal : StoryTheme.emulsionAmber,
                    symbol: chapter.isUnlocked ? "checkmark" : "play.fill"
                )
                Spacer()
                Text("CHAPTER " + String(format: "%02d", chapter.number))
                    .font(StoryTheme.FontBook.folio(10))
                    .foregroundStyle(StoryTheme.recorderTeal)
            }
            Text(chapter.title)
                .font(StoryTheme.FontBook.display(39, weight: .medium))
                .tracking(-1.1)
                .foregroundStyle(StoryTheme.ink)
            Text(chapter.dek)
                .font(StoryTheme.FontBook.editorial(18))
                .foregroundStyle(StoryTheme.mutedInk)
                .lineSpacing(3)
            HStack {
                Label(storyteller, systemImage: "person.wave.2")
                Spacer()
                Label(chapter.audio.durationLabel, systemImage: "waveform")
            }
            .font(StoryTheme.FontBook.body(11, weight: .semibold))
            .foregroundStyle(StoryTheme.recorderTeal)
        }
        .paperCard(padding: 21, tone: StoryTheme.paperBright)
    }

    private var modePicker: some View {
        HStack(spacing: 6) {
            ForEach(Mode.allCases, id: \.self) { option in
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { mode = option }
                } label: {
                    Label(option.rawValue, systemImage: option == .listen ? "headphones" : "text.book.closed")
                        .font(StoryTheme.FontBook.label(13))
                        .foregroundStyle(mode == option ? StoryTheme.paperBright : StoryTheme.mutedInk)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(mode == option ? StoryTheme.recorderTeal : .clear)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(StoryTheme.paperBright.opacity(0.62))
        .overlay(Rectangle().stroke(StoryTheme.hairline, lineWidth: 0.7))
    }

    private func listeningRoom(_ chapter: StoryChapter) -> some View {
        Group {
            if chapter.audio.audioURL == nil {
                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow(text: "Audio unavailable", color: StoryTheme.mutedInk)
                    Text("This recording is not ready to play.")
                        .font(StoryTheme.FontBook.display(21))
                        .foregroundStyle(StoryTheme.ink)
                    Text("Open Read to review the representative passage now. Playback appears only after a valid recording file is attached.")
                        .font(StoryTheme.FontBook.body(12))
                        .foregroundStyle(StoryTheme.mutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                VStack(spacing: 20) {
                    HStack(spacing: 17) {
                        Button { player.toggle() } label: {
                            Circle()
                                .fill(StoryTheme.recorderTeal)
                                .frame(width: 58, height: 58)
                                .overlay {
                                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                                        .font(.system(size: 18, weight: .bold))
                                        .foregroundStyle(StoryTheme.paperBright)
                                        .offset(x: player.isPlaying ? 0 : 2)
                                }
                        }
                        .accessibilityLabel(player.isPlaying ? "Pause" : "Play")

                        VStack(alignment: .leading, spacing: 7) {
                            WaveformView(progress: player.progress)
                                .frame(height: 44)
                            HStack {
                                Text(clock(player.elapsed))
                                Spacer()
                                Text(chapter.isUnlocked ? chapter.audio.durationLabel : chapter.audio.previewLabel + " preview")
                            }
                            .font(StoryTheme.FontBook.folio(9))
                            .foregroundStyle(StoryTheme.mutedInk)
                        }
                    }
                }
            }

            if !chapter.isUnlocked {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "checkmark.seal")
                    Text("This is a representative passage, not a deliberately weak teaser. The optional $79 purchase buys the complete recording, full chapter, portable family files, and one factual correction pass.")
                }
                .font(StoryTheme.FontBook.body(11, weight: .semibold))
                .foregroundStyle(StoryTheme.recorderTeal)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard(tone: StoryTheme.paperBright.opacity(0.86))
    }

    private func readingRoom(_ chapter: StoryChapter) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("“\(chapter.pullQuote)”")
                .font(StoryTheme.FontBook.display(25, weight: .medium))
                .foregroundStyle(StoryTheme.recorderTeal)
                .lineSpacing(3)
            Rectangle()
                .fill(StoryTheme.emulsionAmber)
                .frame(width: 46, height: 3)
            Text(chapter.readableText)
                .font(StoryTheme.FontBook.editorial(18))
                .foregroundStyle(StoryTheme.ink)
                .lineSpacing(7)
                .textSelection(.enabled)
            if !chapter.isUnlocked {
                HStack(spacing: 7) {
                    Image(systemName: "lock.fill")
                    Text("Preview ends here")
                }
                .font(StoryTheme.FontBook.folio(9))
                .foregroundStyle(StoryTheme.emulsionAmber)
            }
        }
        .paperCard(padding: 21, tone: StoryTheme.paperBright.opacity(0.88))
    }

    private func unlockCard(_ chapter: StoryChapter) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            PurchaseExplanation(
                purchase: .keepResult,
                price: store.displayPrice(for: .keepResult)
            )
            Button { showingPurchase = true } label: {
                FilledActionLabel(
                    title: "Unlock & keep this result · \(store.displayPrice(for: .keepResult))",
                    detail: "Optional after preview · full audio + edited story",
                    symbol: "lock.open.fill"
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func keptCard(_ chapter: StoryChapter, project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                StatusLozenge(text: "Yours to keep", symbol: "checkmark.seal.fill")
                Spacer()
                ShareLink(item: "\(chapter.title)\n\n\(chapter.fullText ?? chapter.previewText)") {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(StoryTheme.FontBook.label(12))
                }
            }
            Text("The full recording and edited chapter are saved here for your family.")
                .font(StoryTheme.FontBook.body(13))
                .foregroundStyle(StoryTheme.mutedInk)

            Divider().overlay(StoryTheme.hairline)

            Button { showingCorrection = true } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Request the included factual correction pass")
                            .font(StoryTheme.FontBook.label(13))
                            .foregroundStyle(StoryTheme.ink)
                        Text("Names, dates, privacy, or a meaning we got wrong")
                            .font(StoryTheme.FontBook.body(10))
                            .foregroundStyle(StoryTheme.mutedInk)
                    }
                    Spacer()
                    Image(systemName: "pencil.line")
                        .foregroundStyle(StoryTheme.recorderTeal)
                }
            }
            .buttonStyle(.plain)

            if project.canBeginAnotherSitting {
                NavigationLink {
                    NextCallView(projectID: projectID)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Start another sitting · $5")
                                .font(StoryTheme.FontBook.label(13))
                                .foregroundStyle(StoryTheme.ink)
                            Text("A new Family Pass and a new permission decision")
                                .font(StoryTheme.FontBook.body(10))
                                .foregroundStyle(StoryTheme.mutedInk)
                        }
                        Spacer()
                        Image(systemName: "arrow.right")
                            .foregroundStyle(StoryTheme.recorderTeal)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .paperCard(tone: StoryTheme.sage.opacity(0.18))
    }

    private func configurePlayer(_ chapter: StoryChapter) {
        player.configure(duration: Double(chapter.isUnlocked ? chapter.audio.durationSeconds : chapter.audio.previewSeconds))
        if chapter.audio.audioURL == nil { mode = .read }
    }

    private func clock(_ seconds: Double) -> String {
        let whole = max(0, Int(seconds))
        return String(format: "%d:%02d", whole / 60, whole % 60)
    }
}

private struct ChapterPurchaseSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var store: StoreService
    let projectID: String
    let chapterID: String

    var body: some View {
        ZStack {
            EndpaperField()
            VStack(alignment: .leading, spacing: 20) {
                Capsule().fill(StoryTheme.hairline).frame(width: 38, height: 4).frame(maxWidth: .infinity)
                Eyebrow(text: "The result, not a promise")
                Text("Keep this story in the family.")
                    .font(StoryTheme.FontBook.display(34, weight: .medium))
                    .foregroundStyle(StoryTheme.ink)
                PurchaseExplanation(
                    purchase: .keepResult,
                    price: store.displayPrice(for: .keepResult)
                )
                VStack(alignment: .leading, spacing: 9) {
                    feature("Full original sitting audio", "waveform")
                    feature("Complete transcript + edited chapter", "text.book.closed.fill")
                    feature("Portable private family copy", "square.and.arrow.down")
                    feature("One factual correction pass", "pencil.line")
                }
                Spacer()
                Button {
                    Task {
                        guard let intent = await model.createPurchaseIntent(
                            PurchaseIntentRequest(
                                purchase: .keepResult,
                                projectID: projectID,
                                chapterID: chapterID
                            )
                        ) else { return }
                        guard let proof = await store.purchase(.keepResult, intent: intent) else { return }
                        if await model.fulfillPurchase(proof) {
                            await store.finish(transactionID: proof.transactionID)
                            dismiss()
                        }
                    }
                } label: {
                    FilledActionLabel(
                        title: store.purchasing == .keepResult ? "Finishing purchase…" : "Unlock & keep · \(store.displayPrice(for: .keepResult))",
                        detail: "Optional one-time purchase for this result",
                        symbol: "checkmark"
                    )
                }
                .buttonStyle(.plain)
                .disabled(store.purchasing != nil)
                Text("You previewed first. There is no subscription, and keeping this result is optional.")
                    .font(StoryTheme.FontBook.body(10, weight: .semibold))
                    .foregroundStyle(StoryTheme.mutedInk)
                    .frame(maxWidth: .infinity)
            }
            .padding(20)
        }
        .alert("App Store", isPresented: storeErrorBinding) {
            Button("Okay", role: .cancel) { store.lastError = nil }
        } message: { Text(store.lastError ?? "") }
    }

    private func feature(_ title: String, _ symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(StoryTheme.FontBook.body(13, weight: .semibold))
            .foregroundStyle(StoryTheme.ink)
    }

    private var storeErrorBinding: Binding<Bool> {
        Binding(get: { store.lastError != nil }, set: { if !$0 { store.lastError = nil } })
    }
}

private struct CorrectionNoteSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    let project: StoryProject
    let chapter: StoryChapter

    var body: some View {
        ZStack {
            EndpaperField()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Capsule().fill(StoryTheme.hairline).frame(width: 38, height: 4).frame(maxWidth: .infinity)
                    Eyebrow(text: "Included with this kept result")
                    Text("What fact should we correct?")
                        .font(StoryTheme.FontBook.display(32, weight: .medium))
                        .foregroundStyle(StoryTheme.ink)
                    Text("Use this pass for a name, date, place, privacy request, transcription error, or wording that changed the storyteller's meaning. It is not a request to invent or polish a memory.")
                        .font(StoryTheme.FontBook.body(13))
                        .foregroundStyle(StoryTheme.mutedInk)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(alignment: .leading, spacing: 7) {
                        Text("CHAPTER")
                            .font(StoryTheme.FontBook.folio(8))
                            .foregroundStyle(StoryTheme.mutedInk)
                        Text(chapter.title)
                            .font(StoryTheme.FontBook.editorial(17, weight: .medium))
                            .foregroundStyle(StoryTheme.ink)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 12)
                    .overlay(alignment: .top) { Divider().overlay(StoryTheme.hairline) }
                    .overlay(alignment: .bottom) { Divider().overlay(StoryTheme.hairline) }

                    TextEditor(text: $note)
                        .font(StoryTheme.FontBook.body(15))
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 140)
                        .padding(12)
                        .background(StoryTheme.paperBright)
                        .overlay(Rectangle().stroke(StoryTheme.hairline, lineWidth: 0.8))
                        .accessibilityLabel("Correction details")

                    if let correctionEmailURL {
                        Link(destination: correctionEmailURL) {
                            FilledActionLabel(
                                title: "Email correction to StorySitting",
                                detail: "Opens a addressed draft for you to review",
                                symbol: "envelope.fill"
                            )
                        }
                        .disabled(cleanNote.count < 5)
                        .opacity(cleanNote.count < 5 ? 0.42 : 1)
                    }

                    Text("The app opens an email draft instead of claiming a correction was submitted. Your result stays unchanged until StorySitting reviews and returns the corrected edition.")
                        .font(StoryTheme.FontBook.body(10))
                        .foregroundStyle(StoryTheme.mutedInk)

                    Button("Cancel") { dismiss() }
                        .font(StoryTheme.FontBook.label(12))
                        .foregroundStyle(StoryTheme.recorderTeal)
                        .frame(maxWidth: .infinity)
                }
                .padding(20)
            }
        }
    }

    private var cleanNote: String {
        note.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var correctionEmailURL: URL? {
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = "adam@onesmallprompt.com"
        components.queryItems = [
            URLQueryItem(name: "subject", value: "StorySitting correction · \(project.storyteller.familiarName) · Chapter \(chapter.number)"),
            URLQueryItem(
                name: "body",
                value: "Project: \(project.id)\nChapter: \(chapter.id)\n\nRequested factual correction:\n\(cleanNote)"
            )
        ]
        return components.url
    }
}
