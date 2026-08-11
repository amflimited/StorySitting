import Foundation
import SwiftUI
import StorySittingCore

struct StoryDetailView: View {
    @EnvironmentObject private var model: AppModel
    let projectID: String

    var body: some View {
        ZStack {
            EndpaperField()
            if let project = model.project(id: projectID) {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 25) {
                        projectHeader(project)
                        nextActionPanel(project)

                        if let call = project.latestCall {
                            VStack(alignment: .leading, spacing: 12) {
                                SectionHeading(
                                    eyebrow: "Sitting \(call.sequence) · complete record",
                                    title: "Project timeline"
                                )
                                CallTimelineView(call: call)
                            }
                        } else {
                            ConsentPromiseCard(condensed: true)
                        }

                        questionDeckLink(project)

                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeading(
                                eyebrow: "Made from their voice",
                                title: "Results",
                                trailing: "\(project.chapters.count) TOTAL"
                            )

                            if project.chapters.isEmpty {
                                emptyChapters(project)
                            } else {
                                ForEach(project.chapters.sorted { $0.number > $1.number }) { chapter in
                                    NavigationLink {
                                        ChapterView(projectID: project.id, chapterID: chapter.id)
                                    } label: {
                                        ChapterRow(chapter: chapter)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        if project.canBeginAnotherSitting, !project.calls.isEmpty {
                            repeatSitting(project)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 18)
                    .padding(.bottom, 32)
                }
                .refreshable { await model.refresh() }
                .onAppear { model.selectedProjectID = project.id }
            }
        }
        .navigationTitle("Project")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(StoryTheme.endpaper.opacity(0.98), for: .navigationBar)
    }

    private func projectHeader(_ project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                FamilyPortrait(name: project.storyteller.name, size: 66, seed: project.accentSeed)
                VStack(alignment: .leading, spacing: 4) {
                    Eyebrow(text: project.storyteller.relationship.label)
                    Text(project.storyteller.familiarName)
                        .font(StoryTheme.FontBook.display(33, weight: .medium))
                        .tracking(-0.8)
                        .foregroundStyle(StoryTheme.ink)
                }
            }
            Divider().overlay(StoryTheme.hairline)
            Text(project.title)
                .font(StoryTheme.FontBook.editorial(18, weight: .medium))
                .foregroundStyle(StoryTheme.ink)
            HStack(spacing: 15) {
                Label("Sponsor: \(project.organizerName)", systemImage: "person")
                Label("••• •\(project.storyteller.phoneLastFour)", systemImage: "phone")
            }
            .font(StoryTheme.FontBook.body(10, weight: .semibold))
            .foregroundStyle(StoryTheme.mutedInk)
        }
    }

    private func nextActionPanel(_ project: StoryProject) -> some View {
        let step = project.sponsorStep
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Eyebrow(text: "Next · \(step.position)", color: step.color)
                Spacer()
                StatusLozenge(text: statusLabel(step.kind), color: step.color)
            }
            Text(step.title)
                .font(StoryTheme.FontBook.display(29))
                .foregroundStyle(StoryTheme.ink)
            Text(step.detail)
                .font(StoryTheme.FontBook.body(14))
                .foregroundStyle(StoryTheme.mutedInk)
                .fixedSize(horizontal: false, vertical: true)
            nextActionLink(project)
        }
        .paperCard(padding: 18, tone: StoryTheme.paperBright)
        .overlay(alignment: .leading) {
            Rectangle().fill(step.color).frame(width: 3)
        }
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
                    detail: project.sponsorStep.kind == .start ? "No subscription · storyteller permission still comes first" : nil,
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
                        detail: project.sponsorStep.kind == .preview
                            ? "Representative audio + edited reading preview"
                            : "Full audio, chapter, export, and correction",
                        symbol: project.sponsorStep.kind == .preview ? "play.fill" : "text.book.closed.fill"
                    )
                }
                .buttonStyle(.plain)
            }
        case .stopped:
            HStack(alignment: .top, spacing: 9) {
                Image(systemName: "hand.raised.fill")
                    .foregroundStyle(StoryTheme.oxblood)
                Text("No action is required. The timeline below preserves what happened without turning a no into another prompt.")
                    .font(StoryTheme.FontBook.body(11, weight: .medium))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
    }

    private func statusLabel(_ kind: SponsorActionKind) -> String {
        switch kind {
        case .start: return "Ready"
        case .familyPass: return "Your action"
        case .waiting: return "In progress"
        case .preview: return "Your decision"
        case .kept: return "Complete"
        case .stopped: return "Stopped"
        }
    }

    private func questionDeckLink(_ project: StoryProject) -> some View {
        Button {
            model.selectedProjectID = project.id
            model.selectedTab = .questions
        } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Eyebrow(text: "Family question deck")
                    Text("\(project.selectedQuestionCount) saved for a future sitting")
                        .font(StoryTheme.FontBook.display(19))
                        .foregroundStyle(StoryTheme.ink)
                    Text("Questions guide the conversation; they never replace the storyteller's lead.")
                        .font(StoryTheme.FontBook.body(10))
                        .foregroundStyle(StoryTheme.mutedInk)
                }
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(StoryTheme.recorderTeal)
            }
            .paperCard(padding: 15, tone: StoryTheme.paperBright.opacity(0.72))
        }
        .buttonStyle(.plain)
    }

    private func emptyChapters(_ project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: "No result yet", color: StoryTheme.mutedInk)
            Text("The shelf stays empty until an authorized sitting produces a private preview.")
                .font(StoryTheme.FontBook.editorial(17))
                .foregroundStyle(StoryTheme.ink)
            Text("A $5 Story Start opens the process. It does not buy or guarantee a finished story.")
                .font(StoryTheme.FontBook.body(11))
                .foregroundStyle(StoryTheme.mutedInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 14)
        .overlay(alignment: .top) { Divider().overlay(StoryTheme.hairline) }
        .overlay(alignment: .bottom) { Divider().overlay(StoryTheme.hairline) }
    }

    private func repeatSitting(_ project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            Eyebrow(text: "Only when the family chooses")
            Text("There can be another sitting.")
                .font(StoryTheme.FontBook.display(24))
                .foregroundStyle(StoryTheme.ink)
            Text("Every additional sitting repeats the same safe sequence and begins with another deliberate $5 Story Start. Nothing renews automatically.")
                .font(StoryTheme.FontBook.body(12))
                .foregroundStyle(StoryTheme.mutedInk)
            NavigationLink {
                NextCallView(projectID: project.id)
            } label: {
                FilledActionLabel(
                    title: "Plan another Story Start · $5",
                    detail: "New Family Pass · new permission decision",
                    symbol: "plus"
                )
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 5)
    }
}

private struct ChapterRow: View {
    let chapter: StoryChapter

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text("CHAPTER")
                    .font(StoryTheme.FontBook.folio(7))
                Text(String(format: "%02d", chapter.number))
                    .font(StoryTheme.FontBook.display(24))
            }
            .foregroundStyle(chapter.isUnlocked ? StoryTheme.paperBright : StoryTheme.recorderDark)
            .frame(width: 61, height: 70, alignment: .center)
            .background(chapter.isUnlocked ? StoryTheme.recorderDark : StoryTheme.amberWash)

            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Eyebrow(text: chapter.isUnlocked ? "Kept" : "Private preview", color: chapter.isUnlocked ? StoryTheme.recorderTeal : StoryTheme.emulsionAmber)
                    Spacer()
                    Text(chapter.audio.durationLabel)
                        .font(StoryTheme.FontBook.folio(9))
                        .foregroundStyle(StoryTheme.mutedInk)
                }
                Text(chapter.title)
                    .font(StoryTheme.FontBook.display(19))
                    .foregroundStyle(StoryTheme.ink)
                    .lineLimit(2)
                Text(chapter.dek)
                    .font(StoryTheme.FontBook.body(10))
                    .foregroundStyle(StoryTheme.mutedInk)
                    .lineLimit(2)
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(StoryTheme.recorderTeal)
                .padding(.top, 5)
        }
        .padding(.vertical, 14)
        .overlay(alignment: .top) { Divider().overlay(StoryTheme.hairline) }
    }
}
