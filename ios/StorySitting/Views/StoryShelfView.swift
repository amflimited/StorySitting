import SwiftUI
import StorySittingCore

struct StoryShelfView: View {
    @EnvironmentObject private var model: AppModel

    private var featuredProject: StoryProject? {
        model.projects.first(where: { $0.sponsorStep.kind != .start }) ?? model.projects.first
    }

    var body: some View {
        ZStack {
            EndpaperField()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 26) {
                    topBar
                    welcome

                    if let featuredProject {
                        NavigationLink {
                            StoryDetailView(projectID: featuredProject.id)
                        } label: {
                            ContinueStoryCard(project: featuredProject)
                        }
                        .buttonStyle(.plain)
                        .simultaneousGesture(TapGesture().onEnded {
                            model.selectedProjectID = featuredProject.id
                        })
                    }

                    peopleSection
                    promiseStrip
                }
                .padding(.horizontal, 18)
                .padding(.top, 10)
                .padding(.bottom, 42)
            }
            .refreshable { await model.refresh() }
        }
        .navigationBarHidden(true)
    }

    private var topBar: some View {
        HStack {
            StoryMark(compact: true)
            Spacer()
            Button { model.selectedTab = .family } label: {
                Text(model.organizer?.name.first.map(String.init) ?? "M")
                    .font(StoryTheme.FontBook.label(15))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(StoryTheme.recorderTeal, in: Circle())
            }
            .accessibilityLabel("Open family account")
        }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Good to see you, \(model.organizer?.name.components(separatedBy: " ").first ?? "there").")
                .font(StoryTheme.FontBook.body(15, weight: .medium))
                .foregroundStyle(StoryTheme.mutedInk)
            Text("Keep their voice close.")
                .font(StoryTheme.FontBook.display(36, weight: .bold))
                .tracking(-1.2)
                .foregroundStyle(StoryTheme.ink)
        }
        .accessibilityElement(children: .combine)
    }

    private var peopleSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Your people")
                    .font(StoryTheme.FontBook.display(25, weight: .bold))
                    .foregroundStyle(StoryTheme.ink)
                Spacer()
                Text("\(model.projects.count) projects")
                    .font(StoryTheme.FontBook.body(13, weight: .semibold))
                    .foregroundStyle(StoryTheme.mutedInk)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(model.projects) { project in
                        NavigationLink {
                            StoryDetailView(projectID: project.id)
                        } label: {
                            PersonStoryCard(project: project)
                        }
                        .buttonStyle(.plain)
                        .simultaneousGesture(TapGesture().onEnded {
                            model.selectedProjectID = project.id
                        })
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, 0, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
        }
    }

    private var promiseStrip: some View {
        HStack(spacing: 13) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(StoryTheme.recorderTeal)
                .frame(width: 44, height: 44)
                .background(StoryTheme.sage.opacity(0.35), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text("Their story. Their permission.")
                    .font(StoryTheme.FontBook.label(15))
                    .foregroundStyle(StoryTheme.ink)
                Text("You can sponsor a sitting. Only they can say yes to it.")
                    .font(StoryTheme.FontBook.body(12))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard(padding: 16, tone: StoryTheme.paperBright.opacity(0.9))
    }
}

private struct ContinueStoryCard: View {
    let project: StoryProject

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            StoryMemoryArtwork(project: project)
                .frame(height: 380)
            LinearGradient(
                colors: [.clear, .black.opacity(0.1), .black.opacity(0.9)],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label(project.sponsorStep.position.replacingOccurrences(of: "STEP ", with: "Step "), systemImage: "waveform")
                        .font(StoryTheme.FontBook.label(12))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 7)
                        .background(.ultraThinMaterial, in: Capsule())
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(.white.opacity(0.18), in: Circle())
                }
                Text(project.storyteller.familiarName)
                    .font(StoryTheme.FontBook.body(14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.82))
                Text(project.sponsorStep.title)
                    .font(StoryTheme.FontBook.display(31, weight: .bold))
                    .tracking(-0.8)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Text(project.sponsorStep.actionTitle)
                    .font(StoryTheme.FontBook.label(15))
                    .foregroundStyle(StoryTheme.recorderDark)
                    .padding(.horizontal, 16)
                    .frame(height: 48)
                    .background(.white, in: Capsule())
            }
            .padding(20)
        }
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: StoryTheme.ink.opacity(0.18), radius: 24, y: 14)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(project.storyteller.familiarName). \(project.sponsorStep.title)")
        .accessibilityHint(project.sponsorStep.actionTitle)
    }
}

private struct PersonStoryCard: View {
    let project: StoryProject

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            StoryMemoryArtwork(project: project)
                .frame(width: 175, height: 112)
                .overlay(alignment: .topTrailing) {
                    Text("\(project.completedChapterCount)")
                        .font(StoryTheme.FontBook.label(11))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(.black.opacity(0.45), in: Circle())
                        .padding(10)
                }
            VStack(alignment: .leading, spacing: 4) {
                Text(project.storyteller.familiarName)
                    .font(StoryTheme.FontBook.label(16))
                    .foregroundStyle(StoryTheme.ink)
                    .lineLimit(1)
                Text(shortStatus(project.sponsorStep.kind))
                    .font(StoryTheme.FontBook.body(12, weight: .medium))
                    .foregroundStyle(project.sponsorStep.color)
                    .lineLimit(1)
            }
            .padding(14)
        }
        .frame(width: 175)
        .background(StoryTheme.paperBright, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: StoryTheme.ink.opacity(0.08), radius: 12, y: 7)
    }

    private func shortStatus(_ kind: SponsorActionKind) -> String {
        switch kind {
        case .start: return "Ready to begin"
        case .familyPass: return "Pass ready to share"
        case .waiting: return "StorySitting is working"
        case .preview: return "Preview ready"
        case .kept: return "Saved to your shelf"
        case .stopped: return "Stopped"
        }
    }
}

struct StoryMemoryArtwork: View {
    let project: StoryProject

    var body: some View {
        Image(project.id.lowercased().contains("leo") ? "LeoMemory" : "EvelynMemory")
            .resizable()
            .scaledToFill()
            .accessibilityHidden(true)
            .clipped()
    }
}
