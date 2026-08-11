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
                    VStack(spacing: 0) {
                        chapterHero(project: project, chapter: chapter)
                        VStack(alignment: .leading, spacing: 20) {
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
                        .padding(.top, 22)
                        .padding(.bottom, 48)
                        .background(StoryTheme.endpaper)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 32, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 32, style: .continuous))
                        .offset(y: -28)
                        .padding(.bottom, -28)
                    }
                }
                .ignoresSafeArea(edges: .top)
                .onAppear { configurePlayer(chapter) }
                .onChange(of: chapter.isUnlocked) { _, _ in configurePlayer(chapter) }
                .sheet(isPresented: $showingPurchase) {
                    ChapterPurchaseSheet(
                        projectID: projectID,
                        chapterID: chapterID,
                        currentEdition: chapter.resultEdition ?? (chapter.isUnlocked ? .story : nil)
                    )
                        .presentationDetents([.large])
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
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .preferredColorScheme(.dark)
    }

    private func chapterHero(project: StoryProject, chapter: StoryChapter) -> some View {
        ZStack(alignment: .bottomLeading) {
            StoryMemoryArtwork(project: project)
                .frame(height: 440)
            LinearGradient(colors: [.black.opacity(0.08), .clear, .black.opacity(0.88)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 8) {
                Label(chapter.isUnlocked ? "On your shelf" : "Private preview", systemImage: chapter.isUnlocked ? "checkmark.circle.fill" : "play.circle.fill")
                    .font(StoryTheme.FontBook.label(12))
                    .foregroundStyle(.white.opacity(0.82))
                    .padding(.horizontal, 11)
                    .padding(.vertical, 7)
                    .background(.ultraThinMaterial, in: Capsule())
                Text(chapter.title)
                    .font(StoryTheme.FontBook.display(35, weight: .bold))
                    .tracking(-1)
                    .foregroundStyle(.white)
                    .lineLimit(3)
                Text("\(project.storyteller.familiarName) · \(chapter.audio.durationLabel)")
                    .font(StoryTheme.FontBook.body(13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.76))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 44)
        }
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
        HStack(spacing: 5) {
            ForEach(Mode.allCases, id: \.self) { option in
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { mode = option }
                } label: {
                    Label(option.rawValue, systemImage: option == .listen ? "headphones" : "text.book.closed")
                        .font(StoryTheme.FontBook.label(13))
                        .foregroundStyle(mode == option ? StoryTheme.paperBright : StoryTheme.mutedInk)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(mode == option ? StoryTheme.recorderTeal : .clear, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(StoryTheme.paperBright.opacity(0.85), in: Capsule())
        .overlay(Capsule().stroke(StoryTheme.hairline, lineWidth: 0.7))
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
                    Text("This is a representative passage, not a deliberately weak teaser. After listening, choose the $39 Voice, $79 Story, or $149 Heirloom Edition. Upgrade later by paying only the difference.")
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
            Eyebrow(text: "Choose what to keep")
            Text("One source. Three useful depths.")
                .font(StoryTheme.FontBook.display(26))
                .foregroundStyle(StoryTheme.ink)
            ForEach(ResultEdition.allCases, id: \.self) { edition in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(edition.layer).font(StoryTheme.FontBook.folio(8)).foregroundStyle(StoryTheme.emulsionAmber)
                        Text(edition.title).font(StoryTheme.FontBook.label(13)).foregroundStyle(StoryTheme.ink)
                    }
                    Spacer()
                    Text("$\(edition.priceCents / 100)")
                        .font(StoryTheme.FontBook.display(20))
                        .foregroundStyle(StoryTheme.recorderTeal)
                }
                .padding(.vertical, 8)
                .overlay(alignment: .bottom) { Divider().overlay(StoryTheme.hairline) }
            }
            Button { showingPurchase = true } label: {
                FilledActionLabel(
                    title: "Choose a result edition",
                    detail: "From $39 · no subscription · difference-only upgrades",
                    symbol: "lock.open.fill"
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func keptCard(_ chapter: StoryChapter, project: StoryProject) -> some View {
        let edition = chapter.resultEdition ?? .story
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                StatusLozenge(text: edition.title, symbol: "checkmark.seal.fill")
                Spacer()
                ShareLink(item: "\(chapter.title)\n\n\(chapter.fullText ?? chapter.previewText)") {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(StoryTheme.FontBook.label(12))
                }
            }
            Text("The \(edition.layer.lowercased()) layer is saved here for your family.")
                .font(StoryTheme.FontBook.body(13))
                .foregroundStyle(StoryTheme.mutedInk)

            Divider().overlay(StoryTheme.hairline)

            if edition.rank >= ResultEdition.story.rank {
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
            }

            if edition != .heirloom {
                Button { showingPurchase = true } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Add another story layer")
                                .font(StoryTheme.FontBook.label(13))
                                .foregroundStyle(StoryTheme.ink)
                            Text("Pay only the difference from \(edition.title)")
                                .font(StoryTheme.FontBook.body(10))
                                .foregroundStyle(StoryTheme.mutedInk)
                        }
                        Spacer()
                        Image(systemName: "plus").foregroundStyle(StoryTheme.recorderTeal)
                    }
                }
                .buttonStyle(.plain)
            }

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

struct ChapterPurchaseSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var store: StoreService
    let projectID: String
    let chapterID: String
    let currentEdition: ResultEdition?
    @State private var selectedEdition: ResultEdition

    init(projectID: String, chapterID: String, currentEdition: ResultEdition?) {
        self.projectID = projectID
        self.chapterID = chapterID
        self.currentEdition = currentEdition
        let next = ResultEdition.allCases.first(where: { $0.rank > (currentEdition?.rank ?? -1) }) ?? .heirloom
        _selectedEdition = State(initialValue: next)
    }

    var body: some View {
        ZStack {
            EndpaperField()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Capsule()
                        .fill(StoryTheme.hairline)
                        .frame(width: 38, height: 5)
                        .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 7) {
                        Eyebrow(text: currentEdition == nil ? "Choose after preview" : "Upgrade anytime")
                        Text(currentEdition == nil ? "Keep what matters." : "Add another layer.")
                            .font(StoryTheme.FontBook.display(34, weight: .bold))
                            .tracking(-1)
                            .foregroundStyle(StoryTheme.ink)
                        Text("Every option is a one-time purchase. Nothing renews.")
                            .font(StoryTheme.FontBook.body(14))
                            .foregroundStyle(StoryTheme.mutedInk)
                    }

                    editionPicker
                    selectedEditionCard

                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .foregroundStyle(StoryTheme.recorderTeal)
                        Text("Move up later and pay only the difference. Your earlier purchase is never charged twice.")
                            .font(StoryTheme.FontBook.body(12, weight: .medium))
                            .foregroundStyle(StoryTheme.mutedInk)
                    }
                    .paperCard(padding: 14, tone: StoryTheme.sage.opacity(0.22))
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 132)
            }
        }
        .safeAreaInset(edge: .bottom) { purchaseBar }
        .alert("App Store", isPresented: storeErrorBinding) {
            Button("Okay", role: .cancel) { store.lastError = nil }
        } message: { Text(store.lastError ?? "") }
    }

    private var editionPicker: some View {
        HStack(spacing: 8) {
            ForEach(ResultEdition.allCases.filter { $0.rank > (currentEdition?.rank ?? -1) }, id: \.self) { edition in
                Button { withAnimation(.snappy) { selectedEdition = edition } } label: {
                    VStack(spacing: 5) {
                        Image(systemName: editionSymbol(edition))
                            .font(.system(size: 17, weight: .semibold))
                        Text(edition.title.replacingOccurrences(of: " Edition", with: ""))
                            .font(StoryTheme.FontBook.label(12))
                        Text(price(for: edition))
                            .font(StoryTheme.FontBook.body(13, weight: .bold))
                    }
                    .foregroundStyle(selectedEdition == edition ? .white : StoryTheme.ink)
                    .frame(maxWidth: .infinity, minHeight: 92)
                    .background(
                        selectedEdition == edition ? StoryTheme.recorderTeal : StoryTheme.paperBright,
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(selectedEdition == edition ? .clear : StoryTheme.hairline, lineWidth: 0.8)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var selectedEditionCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: editionSymbol(selectedEdition))
                    .font(.system(size: 23, weight: .semibold))
                    .foregroundStyle(StoryTheme.recorderDark)
                    .frame(width: 52, height: 52)
                    .background(StoryTheme.butter.opacity(0.55), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(selectedEdition.title)
                        .font(StoryTheme.FontBook.display(22, weight: .bold))
                        .foregroundStyle(StoryTheme.ink)
                    Text(selectedEdition.layer)
                        .font(StoryTheme.FontBook.body(12, weight: .semibold))
                        .foregroundStyle(StoryTheme.mutedInk)
                }
                Spacer()
                Text(price(for: selectedEdition))
                    .font(StoryTheme.FontBook.display(23, weight: .bold))
                    .foregroundStyle(StoryTheme.recorderTeal)
            }
            Divider().overlay(StoryTheme.hairline)
            VStack(alignment: .leading, spacing: 12) {
                ForEach(selectedEdition.features, id: \.self) { item in feature(item, "checkmark.circle.fill") }
            }
        }
        .paperCard(padding: 18, tone: StoryTheme.paperBright)
    }

    private var purchaseBar: some View {
        VStack(spacing: 9) {
            Button {
                Task { await purchaseSelection() }
            } label: {
                let purchase = StoryPurchase.purchase(to: selectedEdition, from: currentEdition)
                FilledActionLabel(
                    title: store.purchasing == purchase ? "Finishing purchase…" : "Keep \(selectedEdition.title) · \(price(for: selectedEdition))",
                    detail: currentEdition == nil ? "One-time purchase" : "Only the difference",
                    symbol: "checkmark"
                )
            }
            .buttonStyle(.plain)
            .disabled(store.purchasing != nil)
            Text("Purchased through the App Store")
                .font(StoryTheme.FontBook.body(10, weight: .medium))
                .foregroundStyle(StoryTheme.mutedInk)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
    }

    private func purchaseSelection() async {
        guard let purchase = StoryPurchase.purchase(to: selectedEdition, from: currentEdition) else { return }
        guard let intent = await model.createPurchaseIntent(
            PurchaseIntentRequest(purchase: purchase, projectID: projectID, chapterID: chapterID)
        ) else { return }
        guard let proof = await store.purchase(purchase, intent: intent) else { return }
        if await model.fulfillPurchase(proof) {
            await store.finish(transactionID: proof.transactionID)
            dismiss()
        }
    }

    private func price(for edition: ResultEdition) -> String {
        StoryPurchase.purchase(to: edition, from: currentEdition).map { store.displayPrice(for: $0) }
            ?? "$\(edition.priceCents / 100)"
    }

    private func editionSymbol(_ edition: ResultEdition) -> String {
        switch edition {
        case .voice: return "waveform"
        case .story: return "text.book.closed.fill"
        case .heirloom: return "gift.fill"
        }
    }

    private func feature(_ title: String, _ symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(StoryTheme.FontBook.body(13, weight: .semibold))
            .foregroundStyle(StoryTheme.ink)
            .symbolRenderingMode(.hierarchical)
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
