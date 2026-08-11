import Foundation
import SwiftUI
import StorySittingCore

struct StoryDetailView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showsTimeline = false
    let projectID: String

    var body: some View {
        ZStack {
            EndpaperField()
            if let project = model.project(id: projectID) {
                ScrollView {
                    VStack(spacing: 0) {
                        hero(project)
                        content(project)
                    }
                }
                .ignoresSafeArea(edges: .top)
                .refreshable { await model.refresh() }
                .onAppear { model.selectedProjectID = project.id }
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .preferredColorScheme(.dark)
    }

    private func hero(_ project: StoryProject) -> some View {
        ZStack(alignment: .bottomLeading) {
            StoryMemoryArtwork(project: project)
                .frame(height: 440)
            LinearGradient(
                colors: [.black.opacity(0.1), .clear, .black.opacity(0.85)],
                startPoint: .top,
                endPoint: .bottom
            )
            VStack(alignment: .leading, spacing: 7) {
                Text(project.storyteller.relationship.label)
                    .font(StoryTheme.FontBook.label(13))
                    .foregroundStyle(.white.opacity(0.76))
                Text(project.storyteller.familiarName)
                    .font(StoryTheme.FontBook.display(39, weight: .bold))
                    .tracking(-1.2)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                HStack(spacing: 8) {
                    Label("\(project.chapters.count) stories", systemImage: "book.closed.fill")
                    Text("•")
                    Text(project.title)
                        .lineLimit(1)
                }
                .font(StoryTheme.FontBook.body(13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.82))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 42)
        }
    }

    private func content(_ project: StoryProject) -> some View {
        LazyVStack(alignment: .leading, spacing: 26) {
            currentMoment(project)

            if let call = project.latestCall {
                timelineCard(call)
            } else {
                ConsentPromiseCard(condensed: true)
            }

            questionDeckLink(project)
            results(project)

            if project.canBeginAnotherSitting, !project.calls.isEmpty {
                repeatSitting(project)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 24)
        .padding(.bottom, 52)
        .background(StoryTheme.endpaper)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32))
        .offset(y: -28)
        .padding(.bottom, -28)
    }

    private func currentMoment(_ project: StoryProject) -> some View {
        let step = project.sponsorStep
        return VStack(alignment: .leading, spacing: 17) {
            HStack {
                StatusLozenge(text: readablePosition(step.position), color: step.color)
                Spacer()
                Text("\(stepNumber(step.kind))/6")
                    .font(StoryTheme.FontBook.label(13))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
            ProgressView(value: Double(stepNumber(step.kind)), total: 6)
                .tint(step.color)
                .scaleEffect(x: 1, y: 1.6)
            VStack(alignment: .leading, spacing: 7) {
                Text(step.title)
                    .font(StoryTheme.FontBook.display(29, weight: .bold))
                    .tracking(-0.8)
                    .foregroundStyle(StoryTheme.ink)
                Text(step.detail)
                    .font(StoryTheme.FontBook.body(14))
                    .foregroundStyle(StoryTheme.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            nextActionLink(project)
        }
        .paperCard(padding: 18, tone: StoryTheme.paperBright)
    }

    @ViewBuilder
    private func nextActionLink(_ project: StoryProject) -> some View {
        switch project.sponsorStep.kind {
        case .start, .familyPass, .waiting:
            NavigationLink {
                NextCallView(projectID: project.id)
            } label: {
                FilledActionLabel(
                    title: project.sponsorStep.actionTitle,
                    detail: project.sponsorStep.kind == .start ? "One sitting · no subscription" : nil,
                    symbol: project.sponsorStep.kind == .familyPass ? "square.and.arrow.up" : "arrow.right"
                )
            }
            .buttonStyle(.plain)
        case .preview, .kept:
            if let chapter = project.latestCallChapter {
                NavigationLink {
                    ChapterView(projectID: project.id, chapterID: chapter.id)
                } label: {
                    FilledActionLabel(
                        title: project.sponsorStep.actionTitle,
                        detail: project.sponsorStep.kind == .preview ? "Listen and read before choosing" : "Open the complete result",
                        symbol: project.sponsorStep.kind == .preview ? "play.fill" : "book.closed.fill"
                    )
                }
                .buttonStyle(.plain)
            }
        case .stopped:
            Label("Nothing else will happen automatically.", systemImage: "hand.raised.fill")
                .font(StoryTheme.FontBook.body(13, weight: .semibold))
                .foregroundStyle(StoryTheme.oxblood)
        }
    }

    private func timelineCard(_ call: StoryCall) -> some View {
        DisclosureGroup(isExpanded: $showsTimeline) {
            CallTimelineView(call: call)
                .padding(.top, 18)
        } label: {
            HStack(spacing: 13) {
                Image(systemName: "point.bottomleft.forward.to.point.topright.scurvepath")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(StoryTheme.recorderTeal)
                    .frame(width: 42, height: 42)
                    .background(StoryTheme.sage.opacity(0.32), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("How this sitting works")
                        .font(StoryTheme.FontBook.label(15))
                        .foregroundStyle(StoryTheme.ink)
                    Text("Permission, call, preview, and delivery")
                        .font(StoryTheme.FontBook.body(12))
                        .foregroundStyle(StoryTheme.mutedInk)
                }
            }
        }
        .tint(StoryTheme.recorderTeal)
        .paperCard(padding: 16, tone: StoryTheme.paperBright.opacity(0.9))
    }

    private func questionDeckLink(_ project: StoryProject) -> some View {
        Button {
            model.selectedProjectID = project.id
            model.selectedTab = .questions
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "quote.bubble.fill")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(StoryTheme.recorderDark)
                    .frame(width: 46, height: 46)
                    .background(StoryTheme.butter.opacity(0.55), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("Questions for next time")
                        .font(StoryTheme.FontBook.label(15))
                        .foregroundStyle(StoryTheme.ink)
                    Text("\(project.selectedQuestionCount) saved · add what only your family knows")
                        .font(StoryTheme.FontBook.body(12))
                        .foregroundStyle(StoryTheme.mutedInk)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
            .paperCard(padding: 16, tone: StoryTheme.paperBright.opacity(0.9))
        }
        .buttonStyle(.plain)
    }

    private func results(_ project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Stories")
                    .font(StoryTheme.FontBook.display(25, weight: .bold))
                    .foregroundStyle(StoryTheme.ink)
                Spacer()
                Text("\(project.chapters.count)")
                    .font(StoryTheme.FontBook.label(13))
                    .foregroundStyle(StoryTheme.mutedInk)
            }

            if project.chapters.isEmpty {
                HStack(spacing: 14) {
                    Image(systemName: "waveform.badge.plus")
                        .font(.system(size: 24))
                        .foregroundStyle(StoryTheme.recorderTeal)
                    Text("A private preview will appear here after an authorized sitting.")
                        .font(StoryTheme.FontBook.body(13, weight: .medium))
                        .foregroundStyle(StoryTheme.mutedInk)
                }
                .paperCard(padding: 18, tone: StoryTheme.paperBright)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(project.chapters.sorted { $0.number > $1.number }) { chapter in
                            NavigationLink {
                                ChapterView(projectID: project.id, chapterID: chapter.id)
                            } label: {
                                StoryResultCard(project: project, chapter: chapter)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
            }
        }
    }

    private func repeatSitting(_ project: StoryProject) -> some View {
        NavigationLink {
            NextCallView(projectID: project.id)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "plus")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(StoryTheme.recorderTeal, in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("Sit together again")
                        .font(StoryTheme.FontBook.label(15))
                        .foregroundStyle(StoryTheme.ink)
                    Text("Another deliberate $5 start · a new permission decision")
                        .font(StoryTheme.FontBook.body(12))
                        .foregroundStyle(StoryTheme.mutedInk)
                }
                Spacer()
            }
        }
        .buttonStyle(.plain)
    }

    private func stepNumber(_ kind: SponsorActionKind) -> Int {
        switch kind {
        case .start: return 1
        case .familyPass: return 2
        case .waiting: return 4
        case .preview: return 5
        case .kept: return 6
        case .stopped: return 2
        }
    }

    private func readablePosition(_ position: String) -> String {
        position.lowercased().capitalized.replacingOccurrences(of: " Of ", with: " of ")
    }
}

private struct StoryResultCard: View {
    let project: StoryProject
    let chapter: StoryChapter

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            StoryMemoryArtwork(project: project)
                .frame(width: 245, height: 230)
            LinearGradient(colors: [.clear, .black.opacity(0.86)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 6) {
                Label(chapter.isUnlocked ? "Kept" : "Private preview", systemImage: chapter.isUnlocked ? "checkmark.circle.fill" : "play.circle.fill")
                    .font(StoryTheme.FontBook.label(11))
                    .foregroundStyle(.white.opacity(0.82))
                Text(chapter.title)
                    .font(StoryTheme.FontBook.display(20, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                Text(chapter.audio.durationLabel)
                    .font(StoryTheme.FontBook.body(12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.72))
            }
            .padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}
